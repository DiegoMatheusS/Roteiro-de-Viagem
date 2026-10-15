import { convoyService } from '../services/convoyService';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { fuelApi,FuelApiError } from '../services/fuelApi';
import type { FuelUser } from '../types/fuel';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { GoogleSignInButton } from '../components/GoogleSignInButton';

const AuthContext = createContext<{ user: FuelUser | null; loading: boolean; promptLogin: () => void; logout: () => Promise<void>; clearSession: () => void }>({ user: null, loading: true, promptLogin: () => {}, logout: async () => {}, clearSession: () => {} });
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const [user, setUser] = useState<FuelUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  useModalScrollLock(open);
  const [register, setRegister] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const remember=(value:FuelUser|null)=>{if(value)localStorage.setItem('rdv_auth_cache_v1',JSON.stringify({user:value,until:Date.now()+7*86400000}));else localStorage.removeItem('rdv_auth_cache_v1');setUser(value);};
  useEffect(()=>{
    let disposed=false;
    const load=async()=>{try{const result=await fuelApi<{user:FuelUser|null}>('/auth/me');if(!disposed)remember(result.user);}catch(error){if(disposed)return;if(error instanceof FuelApiError&&error.status<500)return;try{const cached=JSON.parse(localStorage.getItem('rdv_auth_cache_v1')||'null');if(cached?.until>Date.now()&&typeof cached.user?.id==='string'&&typeof cached.user?.displayName==='string')setUser({...cached.user,role:'user'});}catch{}}finally{if(!disposed)setLoading(false);}};
    void load();const resume=()=>{if(!document.hidden)void load();};window.addEventListener('online',resume);document.addEventListener('visibilitychange',resume);
    return()=>{disposed=true;window.removeEventListener('online',resume);document.removeEventListener('visibilitychange',resume);};
  },[]);
  const logout = async () => { await convoyService.stopSharing(); await fuelApi('/auth/logout', { method: 'POST', body: '{}' }); remember(null); };
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (register && !adminOnly && form.get('password') !== form.get('confirmPassword')) {
      setError('As senhas não coincidem. Digite a mesma senha nos dois campos.');
      return;
    }
    form.delete('confirmPassword');
    setBusy(true); setError('');
    try {
      const result = await fuelApi<{ user: FuelUser }>(register && !adminOnly ? '/auth/register' : '/auth/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(form)) });
      remember(result.user); setOpen(false);
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  };
  const googleSignIn = async (credential: string) => {
    if (busy || adminOnly) return;
    setBusy(true); setError('');
    try {
      const result = await fuelApi<{ user: FuelUser }>('/auth/google', { method: 'POST', body: JSON.stringify({ credential }) });
      remember(result.user); setOpen(false);
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  };
  return <AuthContext.Provider value={{ user, loading, promptLogin: () => { setError(''); setOpen(true); }, logout, clearSession: () => remember(null) }}>
    {children}
    {open && <div className="fixed inset-0 z-90 bg-slate-900/60 p-4 flex items-center justify-center" role="dialog" aria-modal="true" aria-label={adminOnly ? "Acesso administrativo" : "Conta do viajante"}>
      <form onSubmit={submit} className="w-full max-w-sm max-h-[calc(100dvh-2rem)] overflow-y-auto bg-white rounded-3xl p-6 space-y-4 shadow-xl">
        <div className="flex justify-between items-center gap-2"><div className="flex items-center gap-2"><img src="/roteiro-logo.png" alt="" className="w-9 h-9 object-contain" /><h2 className="font-bold">{adminOnly ? 'Entrar no painel administrativo' : register ? 'Criar conta' : 'Entrar para contribuir'}</h2></div><button type="button" aria-label="Fechar login" onClick={() => setOpen(false)}>✕</button></div>
        <p className="text-xs text-slate-500">{adminOnly ? 'Acesso exclusivo a administradores previamente autorizados.' : 'Sua conta identifica contribuições e confirmações de preços.'}</p>
        {register && !adminOnly && <label className="block text-xs font-semibold">Nome de exibição<input name="displayName" required minLength={2} maxLength={50} className="mt-1 w-full border rounded-xl p-3" autoComplete="name" /></label>}
        <label className="block text-xs font-semibold">E-mail<input name="email" type="email" required className="mt-1 w-full border rounded-xl p-3" autoComplete="email" /></label>
        <label className="block text-xs font-semibold">Senha<input name="password" type="password" required minLength={register && !adminOnly ? 10 : 1} maxLength={128} className="mt-1 w-full border rounded-xl p-3" autoComplete={register && !adminOnly ? 'new-password' : 'current-password'} /></label>
        {register && !adminOnly && <label className="block text-xs font-semibold">Repetir senha<input name="confirmPassword" type="password" required minLength={10} maxLength={128} className="mt-1 w-full border rounded-xl p-3" autoComplete="new-password" /></label>}
        {!adminOnly && <GoogleSignInButton disabled={busy} onCredential={googleSignIn} onError={message => setError(message)} />}
        {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
        <button disabled={busy} className="w-full bg-emerald-600 text-white font-bold rounded-xl p-3 disabled:opacity-50">{busy ? 'Aguarde...' : adminOnly ? 'Entrar no painel' : register ? 'Criar minha conta' : 'Entrar'}</button>
        {!adminOnly && <button type="button" onClick={() => { setRegister(!register); setError(''); }} className="text-xs font-semibold text-emerald-700">{register ? 'Já tenho conta' : 'Ainda não tenho conta'}</button>}
      </form>
    </div>}
  </AuthContext.Provider>;
}

