import { useEffect, useState, type PropsWithChildren } from 'react';
import { Capacitor } from '@capacitor/core';
import { StartupMap } from './StartupMap';
import { fuelApi } from '../services/fuelApi';
import { TravelNative } from '../services/nativeApp';
import { isAndroidChannel, isAndroidVersionCode, parseAndroidUpdatePolicy, type AndroidUpdatePolicy } from '../services/androidUpdatePolicy';

async function checkUpdate(): Promise<AndroidUpdatePolicy | null> {
  const build = await TravelNative.installedAndroidBuild();
  if (!isAndroidChannel(build.channel) || !isAndroidVersionCode(build.versionCode)) return null;
  const cacheKey = `rdv_android_update_${build.channel}`;
  let rule: AndroidUpdatePolicy | null = null;
  try {
    rule = parseAndroidUpdatePolicy(JSON.parse(localStorage.getItem(cacheKey) ?? 'null'));
  } catch {
    // Optional cache. The online check still runs when storage is unavailable.
  }
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      fuelApi<{ update: unknown }>(`/android/update?channel=${build.channel}`),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Tempo de verificação excedido.')), 2000);
      })
    ]);
    const parsed = parseAndroidUpdatePolicy(result.update);
    if (result.update === null || parsed) {
      rule = parsed;
      try {
        if (rule) localStorage.setItem(cacheKey, JSON.stringify(rule));
        else localStorage.removeItem(cacheKey);
      } catch {
        // The policy already applies to this launch.
      }
    }
  } catch {
    // Keep the last confirmed rule through an offline launch or API failure.
  } finally {
    clearTimeout(timeout);
  }
  return rule && build.versionCode < rule.minVersionCode ? rule : null;
}

function NativeUpdateGate({ children }: PropsWithChildren) {
  const [required, setRequired] = useState<AndroidUpdatePolicy | null>();
  const [checking, setChecking] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    checkUpdate().catch(() => null).then(update => {
      if (!active) return;
      setRequired(update);
      setChecking(false);
    });
    return () => { active = false; };
  }, [attempt]);
  if (required === undefined) return <StartupMap />;
  if (required === null) return children;
  return <main className="grid min-h-[100dvh] place-items-center bg-white px-6 text-center text-slate-900"
    aria-labelledby="android-update-title">
    <div className="w-full max-w-xs">
      <img src="/ruavo-logo.png" alt="RUAVO" width={96} height={96} className="mx-auto mb-6" />
      <h1 id="android-update-title" className="text-2xl font-bold">Atualização obrigatória</h1>
      <p className="mt-3 text-slate-600">Atualize o RUAVO para continuar.</p>
      <button type="button" className="mt-7 min-h-12 w-full rounded-xl bg-blue-700 px-5 text-base font-semibold text-white"
        onClick={() => {
          setError('');
          void TravelNative.openAndroidUpdate({ url: required.downloadUrl }).catch(error => setError(error.message));
        }}>Atualizar agora</button>
      <button type="button" className="mt-3 min-h-11 w-full rounded-xl px-5 font-medium text-blue-800 disabled:opacity-60"
        disabled={checking} onClick={() => {
          setError('');
          setChecking(true);
          setAttempt(value => value + 1);
        }}>{checking ? 'Verificando…' : 'Verificar novamente'}</button>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    </div>
  </main>;
}

export function AndroidUpdateGate({ children }: PropsWithChildren) {
  return Capacitor.getPlatform() === 'android' ? <NativeUpdateGate>{children}</NativeUpdateGate> : children;
}
