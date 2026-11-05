import type { ExpoConfig } from 'expo/config';
const config:ExpoConfig={
 name:'Barba & Hora',slug:'barba-hora',version:'1.0.0',orientation:'portrait',userInterfaceStyle:'dark',scheme:'barbahora',
 ios:{supportsTablet:true,bundleIdentifier:'com.suabarbearia.barbahora',infoPlist:{ITSAppUsesNonExemptEncryption:false}},
 android:{package:'com.suabarbearia.barbahora',...(process.env.GOOGLE_SERVICES_JSON?{googleServicesFile:process.env.GOOGLE_SERVICES_JSON}:{})},
 plugins:[['expo-notifications',{color:'#E9B778',defaultChannel:'agendamentos'}],'expo-secure-store'],
 extra:{...(process.env.EAS_PROJECT_ID?{eas:{projectId:process.env.EAS_PROJECT_ID}}:{})}
};
export default config;
