import type { CapacitorConfig } from '@capacitor/cli';
import {apiOrigin} from './scripts/android-config.mjs';
const config: CapacitorConfig = {
  appId: 'br.com.roteirodeviagem.app', appName: 'Roteiro de Viagem', webDir: 'dist',
  plugins: { TravelNative: { apiOrigin: apiOrigin(process.env.RDV_API_URL,false) } },
  android: { allowMixedContent: false },
};
export default config;
