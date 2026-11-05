import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { db } from './client';
Notifications.setNotificationHandler({handleNotification: async () => ({shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true})});
export async function enablePush(userId: string) {
 if (!Device.isDevice) throw new Error('Teste as notificações em um celular físico com build de desenvolvimento.');
 const projectId = Constants.easConfig?.projectId || Constants.expoConfig?.extra?.eas?.projectId;
 if (!projectId) throw new Error('Configure o projectId do EAS antes de ativar as notificações.');
 if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('agendamentos', {name:'Agendamentos', importance:Notifications.AndroidImportance.MAX, sound:'default'});
 let { status } = await Notifications.getPermissionsAsync();
 if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
 if (status !== 'granted') throw new Error('Permita notificações nas configurações do celular para receber os avisos.');
 const { data: token } = await Notifications.getExpoPushTokenAsync({projectId});
 const { error } = await db.from('push_tokens').upsert({token,user_id:userId});
 if (error) throw error;
 await SecureStore.setItemAsync('owner-push-token',token);
 return token;
}
export async function removeDevicePush(){
 const token=await SecureStore.getItemAsync('owner-push-token');
 if(token){const {error}=await db.from('push_tokens').delete().eq('token',token);if(error)throw error;await SecureStore.deleteItemAsync('owner-push-token');}
}
