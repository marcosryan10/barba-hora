import React, { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Pressable, ScrollView, View, Text, ActivityIndicator } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import type { Session } from '@supabase/supabase-js';
import { db, configured } from './src/client';
import { Auth, Account } from './src/Account';
import { Booking } from './src/Booking';
import { Appointments, Notices } from './src/Agenda';
import { Management } from './src/Management';
import { removeDevicePush } from './src/push';
import { s, Card, Heading, Tag } from './src/ui';

export default function App() { return <SafeAreaProvider><StatusBar style="light"/><Main/></SafeAreaProvider>; }
function Main() {
 const [session,setSession]=useState<Session|null>(null),[ready,setReady]=useState(false),[admin,setAdmin]=useState(false);
 const [tab,setTab]=useState('agendar'),[notice,setNotice]=useState(''),[unread,setUnread]=useState(0),[refresh,setRefresh]=useState(0);
 const currentUser=useRef<string|undefined>(undefined);
 useEffect(()=>{ if(!configured){setReady(true);return;} db.auth.getSession().then(({data,error})=>{if(error)setNotice(error.message);setSession(data.session);setReady(true);}); const {data}=db.auth.onAuthStateChange((_e,v)=>{if(currentUser.current!==v?.user.id){setAdmin(false);setTab('agendar');currentUser.current=v?.user.id;}setSession(v);}); return ()=>data.subscription.unsubscribe(); },[]);
 useEffect(()=>{if(!session)return; let active=true; db.rpc('is_admin').then(({data,error})=>{if(!active)return;if(error)setNotice(error.message);setAdmin(!!data);if(data)setTab('agenda');});return()=>{active=false;};},[session?.user.id]);
 useEffect(()=>{
  if(!admin||!session)return;
  const count=()=>{db.from('notifications').select('*',{count:'exact',head:true}).is('read_at',null).then(({count})=>setUnread(count||0));};count();
  const channel=db.channel('owner-notifications').on('postgres_changes',{event:'INSERT',schema:'public',table:'notifications'},p=>{setNotice(p.new.body);count();setRefresh(n=>n+1);}).subscribe();
  const state=AppState.addEventListener('change',v=>{if(v==='active'){count();setRefresh(n=>n+1);}});
  return()=>{void db.removeChannel(channel);state.remove();};
 },[admin,session?.user.id]);
 useEffect(()=>{
  if(!admin)return;
  const open=()=>{setTab('avisos');setRefresh(n=>n+1);};
  const listener=Notifications.addNotificationResponseReceivedListener(open);
  void Notifications.getLastNotificationResponseAsync().then(r=>{if(r){open();void Notifications.clearLastNotificationResponseAsync();}});
  return()=>listener.remove();
 },[admin]);
 async function logout(){try{await removeDevicePush();const {error}=await db.auth.signOut();if(error)throw error;setAdmin(false);setNotice('');}catch(e:any){Alert.alert('Não foi possível sair',e.message);}}
 if(!ready)return <SafeAreaView style={s.screen}><ActivityIndicator color="#E9B778"/></SafeAreaView>;
 if(!configured)return <SafeAreaView style={s.screen}><ScrollView contentContainerStyle={s.content}><Tag text="ANDROID + iOS"/><Text style={s.brand}>BARBA & HORA</Text><Heading title={'Seu próximo corte.\nNa hora certa.'} subtitle="Aplicativo nativo de agendamento para sua barbearia."/><Card><Text style={s.h2}>Vamos conectar a barbearia</Text><Text style={s.body}>A conexão com a barbearia ainda precisa ser ativada pelo responsável para liberar os serviços, o cadastro e os agendamentos.</Text><Text style={s.muted}>Esta versão de teste abre sem o Expo Go. Para usar a agenda, será necessário instalar uma versão atualizada após a configuração.</Text></Card></ScrollView></SafeAreaView>;
 if(!session)return <Auth/>;
 const tabs=admin?[['agenda','Agenda'],['gestao','Gestão'],['avisos',`Avisos${unread?' · '+unread:''}`],['conta','Conta']]:[['agendar','Agendar'],['reservas','Meus horários'],['conta','Conta']];
 return <SafeAreaView style={s.screen} edges={['top','bottom']}>
  <View style={s.header}><View><Text style={s.brand}>✂ BARBA & HORA</Text><Text style={s.eyebrow}>{admin?'PAINEL DA BARBEARIA':'SEU ESTILO. SEU HORÁRIO.'}</Text></View></View>
  {!!notice&&<Pressable accessibilityRole="button" accessibilityLabel="Fechar aviso" style={s.banner} onPress={()=>setNotice('')}><Text style={s.bannerText}>{notice}  ×</Text></Pressable>}
  <View style={{flex:1}}>
   {tab==='agendar'&&<Booking onBooked={()=>{setTab('reservas');setRefresh(n=>n+1);}}/>}
   {(tab==='reservas'||tab==='agenda')&&<Appointments admin={admin} refresh={refresh}/>}
   {tab==='gestao'&&admin&&<Management/>}
   {tab==='avisos'&&admin&&<Notices refresh={refresh} onRead={()=>setUnread(0)}/>}
   {tab==='conta'&&<Account session={session} admin={admin} onLogout={logout} onPush={()=>{}}/>}
  </View>
  <View style={s.tabs}>{tabs.map(([key,label])=><Pressable key={key} accessibilityRole="tab" accessibilityState={{selected:tab===key}} onPress={()=>setTab(key)} style={[s.tab,tab===key&&s.tabActive]}><Text style={[s.tabText,tab===key&&{color:'#E9B778'}]}>{label}</Text></Pressable>)}</View>
 </SafeAreaView>;
}
