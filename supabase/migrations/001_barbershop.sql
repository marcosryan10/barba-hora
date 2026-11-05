create extension if not exists btree_gist;

create table public.profiles (
 id uuid primary key references auth.users on delete cascade,
 name text not null check(length(trim(name)) between 2 and 100),
 phone text not null default ''
);
create table public.admins (user_id uuid primary key references auth.users on delete cascade);
create function public.is_admin() returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from admins where user_id=auth.uid()) $$;
create table public.services (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name)>1),
 price_cents integer not null check(price_cents>=0), duration integer not null check(duration between 15 and 240 and duration%15=0), active boolean not null default true
);
insert into public.services(name,price_cents,duration) values
 ('Corte clássico',4500,30),('Degradê',5500,45),('Barba',3000,30),('Corte + barba',7500,60);
create table public.hours (
 weekday integer primary key check(weekday between 0 and 6), opens time not null, closes time not null,
 active boolean not null default true, check(closes>opens)
);
insert into public.hours select n,'09:00'::time,'19:00'::time,n<>0 from generate_series(0,6) n;
create table public.blocks (
 id uuid primary key default gen_random_uuid(), starts_at timestamptz not null, ends_at timestamptz not null,
 reason text not null default 'Indisponível', check(ends_at>starts_at)
);
create table public.appointments (
 id uuid primary key default gen_random_uuid(), client_id uuid not null references public.profiles,
 service_id uuid not null references public.services, service_name text not null,
 price_cents integer not null, duration integer not null,
 starts_at timestamptz not null, ends_at timestamptz not null,
 status text not null default 'confirmed' check(status in ('confirmed','completed','cancelled')),
 created_at timestamptz not null default now(), check(ends_at>starts_at),
 exclude using gist(tstzrange(starts_at,ends_at,'[)') with &&) where (status <> 'cancelled')
);
create table public.notifications (
 id uuid primary key default gen_random_uuid(), appointment_id uuid not null unique references public.appointments,
 body text not null, created_at timestamptz not null default now(), read_at timestamptz
);
create table public.push_tokens (
 token text primary key check(token ~ '^(ExponentPushToken|ExpoPushToken)\[.+\]$'),
 user_id uuid not null references auth.users on delete cascade, created_at timestamptz not null default now()
);
create table public.push_deliveries (
 notification_id uuid not null references public.notifications on delete cascade,
 token text not null, ticket_id text, state text not null default 'pending',
 error text, updated_at timestamptz not null default now(), primary key(notification_id,token)
);

create function public.on_signup() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into profiles(id,name,phone) values(new.id,left(coalesce(nullif(trim(new.raw_user_meta_data->>'name'),''),'Cliente'),100),left(coalesce(new.raw_user_meta_data->>'phone',''),30));
 return new;
end $$;
create trigger profile_on_signup after insert on auth.users for each row execute function public.on_signup();

alter table public.profiles enable row level security;
alter table public.admins enable row level security;
alter table public.services enable row level security;
alter table public.hours enable row level security;
alter table public.blocks enable row level security;
alter table public.appointments enable row level security;
alter table public.notifications enable row level security;
alter table public.push_tokens enable row level security;
alter table public.push_deliveries enable row level security;
create policy profile_read on public.profiles for select to authenticated using(id=auth.uid() or public.is_admin());
create policy profile_edit on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy own_admin on public.admins for select to authenticated using(user_id=auth.uid());
create policy services_read on public.services for select to authenticated using(active or public.is_admin());
create policy services_manage on public.services for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy hours_read on public.hours for select to authenticated using(true);
create policy hours_manage on public.hours for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy blocks_manage on public.blocks for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy appointment_read on public.appointments for select to authenticated using(client_id=auth.uid() or public.is_admin());
create policy notification_read on public.notifications for select to authenticated using(public.is_admin());
create policy notification_update on public.notifications for update to authenticated using(public.is_admin()) with check(public.is_admin());
create policy token_read on public.push_tokens for select to authenticated using(user_id=auth.uid());
create policy token_delete on public.push_tokens for delete to authenticated using(user_id=auth.uid());
create policy token_insert on public.push_tokens for insert to authenticated with check(user_id=auth.uid() and public.is_admin());
create policy token_update on public.push_tokens for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid() and public.is_admin());
grant select,update on public.profiles to authenticated;
grant select,insert,update,delete on public.services,public.hours,public.blocks,public.push_tokens to authenticated;
grant select on public.notifications to authenticated;
-- Appointments are mutated through RPC only. No client may insert or alter snapshot prices/status directly.
revoke all on public.appointments,public.admins,public.push_deliveries from anon,authenticated;
grant select on public.appointments,public.admins to authenticated;
revoke update on public.notifications from authenticated;
grant update(read_at) on public.notifications to authenticated;

create function public.available_slots(p_service uuid,p_day date) returns table(starts_at timestamptz)
language plpgsql security definer set search_path=public as $$
declare s services; h hours;
begin
 if auth.uid() is null then raise exception 'Faça login'; end if;
 if p_day < (now() at time zone 'America/Sao_Paulo')::date or p_day > (now() at time zone 'America/Sao_Paulo')::date+60 then return; end if;
 select * into s from services where id=p_service and active;
 select * into h from hours where weekday=extract(dow from p_day) and active;
 if s.id is null or h.weekday is null then return; end if;
 return query select t from generate_series((p_day+h.opens) at time zone 'America/Sao_Paulo',
 (p_day+h.closes) at time zone 'America/Sao_Paulo'-make_interval(mins=>s.duration), interval '15 minutes') t
 where t>now() and not exists(select 1 from appointments a where a.status<>'cancelled' and tstzrange(a.starts_at,a.ends_at,'[)') && tstzrange(t,t+make_interval(mins=>s.duration),'[)'))
 and not exists(select 1 from blocks b where tstzrange(b.starts_at,b.ends_at,'[)') && tstzrange(t,t+make_interval(mins=>s.duration),'[)'));
end $$;

create function public.book(p_service uuid,p_start timestamptz,p_expected_price integer default null,p_expected_duration integer default null) returns uuid
language plpgsql security definer set search_path=public as $$
declare s services; a uuid; n text;
begin
 if auth.uid() is null then raise exception 'Faça login'; end if;
 -- Shared lock serializes booking and schedule administration for the single chair.
 perform pg_advisory_xact_lock(754129);
 select * into s from services where id=p_service and active;
 if s.id is null then raise exception 'Serviço indisponível'; end if;
 if (p_expected_price is not null and s.price_cents<>p_expected_price) or (p_expected_duration is not null and s.duration<>p_expected_duration) then
 raise exception 'O serviço foi atualizado. Volte à lista de serviços para conferir valor e duração.'; end if;
 if not exists(select 1 from available_slots(p_service,(p_start at time zone 'America/Sao_Paulo')::date) x where x.starts_at=p_start) then
 raise exception 'Horário indisponível. Escolha outro horário.'; end if;
 select name into n from profiles where id=auth.uid();
 insert into appointments(client_id,service_id,service_name,price_cents,duration,starts_at,ends_at)
 values(auth.uid(),s.id,s.name,s.price_cents,s.duration,p_start,p_start+make_interval(mins=>s.duration)) returning id into a;
 insert into notifications(appointment_id,body) values(a,format('Novo agendamento: %s, dia %s às %s • %s',n,
 to_char(p_start at time zone 'America/Sao_Paulo','DD/MM/YYYY'),to_char(p_start at time zone 'America/Sao_Paulo','HH24:MI'),s.name));
 return a;
end $$;
create function public.change_status(p_id uuid,p_status text) returns void
language plpgsql security definer set search_path=public as $$
declare a appointments;
begin
 perform pg_advisory_xact_lock(754129);
 select * into a from appointments where id=p_id for update;
 if a.id is null or auth.uid() is null or (a.client_id<>auth.uid() and not is_admin()) then raise exception 'Acesso negado'; end if;
 if a.status<>'confirmed' then raise exception 'Agendamento já encerrado'; end if;
 if p_status not in ('cancelled','completed') then raise exception 'Status inválido'; end if;
 if not is_admin() and (p_status<>'cancelled' or a.starts_at<=now()) then raise exception 'Não é possível alterar esse agendamento'; end if;
 if p_status='completed' and a.starts_at>now() then raise exception 'Atendimento ainda não começou'; end if;
 update appointments set status=p_status where id=p_id;
end $$;
-- All modifications of operating hours / blocks / services serialize with booking.
create function public.schedule_lock() returns trigger language plpgsql set search_path=public as $$
begin perform pg_advisory_xact_lock(754129); return null; end $$;
create trigger lock_hours before insert or update or delete on public.hours for each statement execute function public.schedule_lock();
create trigger lock_blocks before insert or update or delete on public.blocks for each statement execute function public.schedule_lock();
create trigger lock_services before insert or update or delete on public.services for each statement execute function public.schedule_lock();
revoke all on function public.book(uuid,timestamptz,integer,integer),public.available_slots(uuid,date),public.change_status(uuid,text),public.is_admin() from public;
grant execute on function public.book(uuid,timestamptz,integer,integer),public.available_slots(uuid,date),public.change_status(uuid,text),public.is_admin() to authenticated;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.appointments;
-- Set REPLICA IDENTITY for predictable updates, with RLS still applied to reads.
alter table public.appointments replica identity full;
