import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'br.com.roteirodeviagem.app', appName: 'Roteiro de Viagem', webDir: 'dist',
  plugins: { TravelNative: { apiOrigin: process.env.RDV_API_URL || '' } },
  android: { allowMixedContent: false },
};
export default config;
