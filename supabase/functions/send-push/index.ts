// Invoked by a database webhook immediately after notification INSERT, and optionally by cron for retries.
import { createClient } from 'npm:@supabase/supabase-js@2';
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const secret = Deno.env.get('PUSH_WEBHOOK_SECRET');
Deno.serve(async req => {
 if (!secret || req.headers.get('x-webhook-secret') !== secret) return new Response('Unauthorized',{status:401});
 if(req.method!=='POST')return new Response('Method not allowed',{status:405});
 try {
  const body=await req.json();
  await db.from('push_deliveries').update({state:'retry',updated_at:new Date().toISOString()}).eq('state','sending').lt('updated_at',new Date(Date.now()-5*60000).toISOString());
  let query=db.from('notifications').select('id,body,created_at').order('created_at',{ascending:false}).limit(100);
  if(body.record?.id)query=query.eq('id',body.record.id);
  else query=query.gte('created_at',new Date(Date.now()-24*3600*1000).toISOString());
  const {data:notes,error}=await query;if(error)throw error;
  const {data:owners,error:ownerError}=await db.from('admins').select('user_id');if(ownerError)throw ownerError;
  if(!owners?.length)return Response.json({sent:0,reason:'no_admin'});
  const {data:tokens,error:tokenError}=await db.from('push_tokens').select('token').in('user_id',owners.map(x=>x.user_id));if(tokenError)throw tokenError;
  let sent=0;
  for(const note of notes||[])for(const {token} of tokens||[]){
   await db.from('push_deliveries').upsert({notification_id:note.id,token},{onConflict:'notification_id,token',ignoreDuplicates:true});
   // Atomic claim prevents concurrent webhook/cron requests from sending the same ticket twice.
   const {data:claimed,error:claimError}=await db.from('push_deliveries').update({state:'sending',updated_at:new Date().toISOString()}).eq('notification_id',note.id).eq('token',token).in('state',['pending','retry']).select();
   if(claimError)throw claimError;if(!claimed?.length)continue;
   const headers:Record<string,string>={'Content-Type':'application/json'};
   if(Deno.env.get('EXPO_ACCESS_TOKEN'))headers.Authorization=`Bearer ${Deno.env.get('EXPO_ACCESS_TOKEN')}`;
   try{
    const response=await fetch('https://exp.host/--/api/v2/push/send',{method:'POST',headers,signal:AbortSignal.timeout(15000),body:JSON.stringify({to:token,sound:'default',title:'Novo agendamento ✂',body:note.body,channelId:'agendamentos',data:{notificationId:note.id},priority:'high'})});
    if(!response.ok)throw new Error('Expo HTTP '+response.status);
    const result=await response.json();const ticket=result.data;
    if(ticket?.status!=='ok'){
     const reason=ticket?.details?.error||'unknown';
     if(reason==='DeviceNotRegistered')await db.from('push_tokens').delete().eq('token',token);
     await db.from('push_deliveries').update({state:reason==='MessageRateExceeded'?'retry':'error',error:reason,updated_at:new Date().toISOString()}).eq('notification_id',note.id).eq('token',token);
    }else{await db.from('push_deliveries').update({state:'accepted',ticket_id:ticket.id,updated_at:new Date().toISOString()}).eq('notification_id',note.id).eq('token',token);sent++;}
   }catch(e){await db.from('push_deliveries').update({state:'retry',error:String(e),updated_at:new Date().toISOString()}).eq('notification_id',note.id).eq('token',token);}
  }
  // Reconcile tickets after 15 minutes. Acceptance by Expo is not proof of delivery to a device.
  const {data:pending}=await db.from('push_deliveries').select('*').eq('state','accepted').lt('updated_at',new Date(Date.now()-15*60000).toISOString()).limit(1000);
  if(pending?.length){
   const headers:Record<string,string>={'Content-Type':'application/json'};
   if(Deno.env.get('EXPO_ACCESS_TOKEN'))headers.Authorization=`Bearer ${Deno.env.get('EXPO_ACCESS_TOKEN')}`;
   const res=await fetch('https://exp.host/--/api/v2/push/getReceipts',{method:'POST',headers,signal:AbortSignal.timeout(15000),body:JSON.stringify({ids:pending.map(x=>x.ticket_id)})});
   if(res.ok){const result=await res.json();for(const item of pending){const receipt=result.data?.[item.ticket_id];if(!receipt)continue;if(receipt.details?.error==='DeviceNotRegistered')await db.from('push_tokens').delete().eq('token',item.token);await db.from('push_deliveries').update({state:receipt.status==='ok'?'delivered':'error',error:receipt.details?.error||null,updated_at:new Date().toISOString()}).eq('notification_id',item.notification_id).eq('token',item.token);}}
  }
  return Response.json({sent});
 }catch(e){console.error('Push dispatch failed',e instanceof Error?e.message:'unknown');return new Response('Dispatch failed',{status:500});}
});
