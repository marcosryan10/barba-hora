import 'react-native-url-polyfill/auto';
import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';

export const configured = !!process.env.EXPO_PUBLIC_SUPABASE_URL && !!process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
// Supabase sessions can exceed a single SecureStore value; chunk them into small entries.
const storage = {
 async getItem(key: string) {
  const count = Number(await SecureStore.getItemAsync(key + '.count'));
  if (!count) return null;
  const parts = await Promise.all(Array.from({ length: count }, (_, i) => SecureStore.getItemAsync(`${key}.${i}`)));
  return parts.some(x => x === null) ? null : parts.join('');
 },
 async setItem(key: string, value: string) {
  await storage.removeItem(key);
  const chunks = value.match(/.{1,500}/gs) || [];
  for (let i = 0; i < chunks.length; i++) await SecureStore.setItemAsync(`${key}.${i}`, chunks[i]);
  await SecureStore.setItemAsync(key + '.count', String(chunks.length));
 },
 async removeItem(key: string) {
  const count = Number(await SecureStore.getItemAsync(key + '.count'));
  for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(`${key}.${i}`);
  await SecureStore.deleteItemAsync(key + '.count');
 }
};
export const db = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://example.supabase.co', process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'not-configured', {
 auth: { storage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false }
});
AppState.addEventListener('change', state => state === 'active' ? db.auth.startAutoRefresh() : db.auth.stopAutoRefresh());
export type Service = { id: string; name: string; price_cents: number; duration: number; active: boolean };
export type Appointment = { id: string; client_id: string; service_name: string; price_cents: number; starts_at: string; status: string; profiles?: { name: string; phone: string } };
export const money = (n: number) => (n / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const dayKey = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
export const dateLabel = (s: string) => new Date(s.length === 10 ? s + 'T12:00:00-03:00' : s).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'short' });
export const timeLabel = (s: string) => new Date(s).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
export const days = Array.from({ length: 30 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return dayKey(d); });
