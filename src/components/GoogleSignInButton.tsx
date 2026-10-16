import { useEffect, useRef, useState } from 'react';
import { fuelApi } from '../services/fuelApi';
import { isNativeApp, TravelNative } from '../services/nativeApp';

type GoogleAuthResponse = { credential?: string };
type GoogleWindow = Window & {
  google?: { accounts?: { id?: {
    initialize: (options: { client_id: string; callback: (data: GoogleAuthResponse) => void; auto_select: boolean }) => void;
    renderButton: (container: HTMLElement, options: Record<string, string | number>) => void;
  } } }
};

let scriptPromise: Promise<void> | null = null;
function loadGoogleScript(): Promise<void> {
  const sdk = window as GoogleWindow;
  if (sdk.google?.accounts?.id) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('O login do Google não pôde ser carregado.'));
    document.head.appendChild(script);
  }).catch(error => { scriptPromise = null; throw error; });
  return scriptPromise;
}

export function GoogleSignInButton({ onCredential, onError, disabled = false }: {
  onCredential: (credential: string) => void; onError: (message: string) => void; disabled?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const onCredentialRef = useRef(onCredential);
  const onErrorRef = useRef(onError);
  const [enabled, setEnabled] = useState(false);
  const [nativeClientId,setNativeClientId] = useState<string|null>(null);
  const [nativeBusy,setNativeBusy] = useState(false);
  const [configMessage,setConfigMessage] = useState('');
  onCredentialRef.current = onCredential;
  onErrorRef.current = onError;

  useEffect(() => {
    if (isNativeApp()) {
      let cancelled=false;
      void fuelApi<{googleClientId?:string|null}>('/public-config')
        .then(config=>{
          if(cancelled)return;
          if(config.googleClientId)setNativeClientId(config.googleClientId);
          else setConfigMessage('Login Google indisponível: configurar GOOGLE_CLIENT_ID no servidor.');
        })
        .catch(()=>{if(!cancelled)setConfigMessage('Não foi possível consultar o login Google. Tente novamente.');});
      return ()=>{cancelled=true;};
    }
    let cancelled = false;
    void (async () => {
      try {
        const config = await fuelApi<{ googleClientId?: string | null }>('/public-config');
        if (!config.googleClientId || cancelled) return;
        await loadGoogleScript();
        const google = (window as GoogleWindow).google?.accounts?.id;
        if (!google || cancelled || !container.current) throw new Error('O botão do Google não está disponível.');
        google.initialize({
          client_id: config.googleClientId,
          auto_select: false,
          callback: value => {
            if (cancelled) return;
            if (!value.credential) { onErrorRef.current('Não foi possível receber a autenticação do Google.'); return; }
            onCredentialRef.current(value.credential);
          }
        });
        google.renderButton(container.current, { theme: 'outline', size: 'large', type: 'standard', text: 'continue_with', width: 288 });
        setEnabled(true);
      } catch (error) { if (!cancelled) onErrorRef.current((error as Error).message); }
    })();
    return () => { cancelled = true; };
  }, []);

  if (isNativeApp()) return <div className="flex flex-col items-center gap-2 w-full">
    <button type="button" aria-label="Continuar com Google" disabled={disabled || nativeBusy || !nativeClientId}
      onClick={()=>{if(!nativeClientId)return;setNativeBusy(true);
        void TravelNative.signInGoogle({clientId:nativeClientId}).then(({credential})=>onCredentialRef.current(credential))
          .catch(error=>onErrorRef.current((error as Error).message))
          .finally(()=>setNativeBusy(false));
      }}
      className="flex items-center justify-center gap-3 w-full min-h-12 bg-white border border-slate-200 rounded-2xl text-[15px] font-semibold text-slate-800 shadow-sm active:scale-[.98] transition-transform disabled:opacity-60">
      <span aria-hidden="true" className="font-bold text-blue-600 text-[19px]">G</span>
      {nativeBusy?'Entrando com Google...':'Continuar com Google'}
    </button>
    {configMessage && <p role="status" className="text-xs text-slate-500 text-center">{configMessage}</p>}
  </div>;
  return <div className="flex flex-col items-center gap-2">
    <div ref={container} aria-label="Continuar com Google" className={disabled ? 'pointer-events-none opacity-50' : ''} />
    {enabled && <p className="text-[11px] text-slate-500">Use sua conta Google para entrar ou criar seu cadastro.</p>}
  </div>;
}
