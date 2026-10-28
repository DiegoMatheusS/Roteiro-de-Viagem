import {useCallback, useRef,useState} from 'react';
import {Geolocation as NativeGeolocation} from '@capacitor/geolocation';
import {getCurrentDeviceLocation} from '../services/locationService';
import {isNativeApp, TravelNative} from '../services/nativeApp';

const webPermissionHelp = 'Se o navegador já bloqueou o GPS, clique no ícone ao lado do endereço do site, abra as permissões do site e altere Localização para Permitir. Volte ao Rolê e toque em Permitir localização. O navegador não permite reabrir automaticamente uma permissão que já foi bloqueada.';
const nativePermissionHelp = 'Nas configurações do aplicativo, permita Localização precisa (durante o uso). Volte ao Rolê e toque novamente em Permitir localização.';

function denied(error: unknown): boolean {
  const message = String((error as {message?:string})?.message || '');
  const code = (error as {code?:number|string})?.code;
  return code === 1 || /permission|denied|permiss[aã]o|negad|n[aã]o permitid[ao]|acesso.*localiza|not authorized/i.test(message);
}

/** Executa sob o clique do usuário: pede GPS ou abre as configurações quando já bloqueado. */
export function useGpsPermissionAction(retry: () => void,acquire:()=>Promise<unknown>=getCurrentDeviceLocation) {
  const [requesting, setRequesting] = useState(false);
  const [help, setHelp] = useState('');
  const busy=useRef(false);

  const request = useCallback(async (): Promise<boolean> => {
    if (busy.current) return false;
    busy.current=true;
    setRequesting(true);
    setHelp('');
    try {
      if (isNativeApp()) {
        const current = await NativeGeolocation.checkPermissions();
        if (current.location !== 'granted') {
          const granted = await NativeGeolocation.requestPermissions({permissions:['location']});
          if (granted.location !== 'granted') {
            await TravelNative.openDeviceSettings({section:'app'});
            setHelp(nativePermissionHelp);
            return false;
          }
        }
      }
      await acquire();
      retry();
      return true;
    } catch (error) {
      if (isNativeApp() && denied(error)) {
        try {
          await TravelNative.openDeviceSettings({section:'app'});
          setHelp(nativePermissionHelp);
        } catch {
          setHelp(nativePermissionHelp);
        }
      } else if (!isNativeApp() && denied(error)) {
        setHelp(webPermissionHelp);
      } else {
        setHelp((error as Error)?.message || 'Não foi possível acessar o GPS. Verifique a conexão e tente novamente.');
      }
      return false;
    } finally {
      busy.current=false;
      setRequesting(false);
    }
  }, [retry,acquire]);
  return {request, requesting, help};
}
