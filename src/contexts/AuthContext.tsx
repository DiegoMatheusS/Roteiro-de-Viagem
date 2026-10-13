import React, { createContext, useContext, useEffect, useState } from 'react';
import { fuelApi } from '../services/fuelApi';
import type { FuelUser } from '../types/fuel';
import { useModalScrollLock } from '../hooks/useModalScrollLock';

const AuthContext = createContext<{ user: FuelUser | null; promptLogin: () => void; logout: () => Promise<void> }>({ user: null, promptLogin: () => {}, logout: async () => {} });
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<FuelUser | null>(null);
  const [open, setOpen] = useState(false);
  useModalScrollLock(open);
  const [register, setRegister] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { fuelApi<{ user: FuelUser | null }>('/auth/me').then(result => setUser(result.user)).catch(() => {}); }, []);
  const logout = async () => { await fuelApi('/auth/logout', { method: 'POST', body: '{}' }); setUser(null); };
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setError('');
    try {
      const result = await fuelApi<{ user: FuelUser }>(register ? '/auth/register' : '/auth/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(form)) });
      setUser(result.user); setOpen(false);
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  };
  return <AuthContext.Provider value={{ user, promptLogin: () => { setError(''); setOpen(true); }, logout }}>
    {children}
    {open && <div className="fixed inset-0 z-90 bg-slate-900/60 p-4 flex items-center justify-center" role="dialog" aria-modal="true" aria-label="Conta do viajante">
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-3xl p-6 space-y-4 shadow-xl">
        <div className="flex justify-between items-center"><h2 className="font-bold">{register ? 'Criar conta' : 'Entrar para contribuir'}</h2><button type="button" aria-label="Fechar login" onClick={() => setOpen(false)}>✕</button></div>
        <p className="text-xs text-slate-500">Sua conta identifica contribuições e confirmações de preços.</p>
        {register && <label className="block text-xs font-semibold">Nome de exibição<input name="displayName" required minLength={2} maxLength={50} className="mt-1 w-full border rounded-xl p-3" autoComplete="name" /></label>}
        <label className="block text-xs font-semibold">E-mail<input name="email" type="email" required className="mt-1 w-full border rounded-xl p-3" autoComplete="email" /></label>
        <label className="block text-xs font-semibold">Senha<input name="password" type="password" required minLength={register ? 10 : 1} maxLength={128} className="mt-1 w-full border rounded-xl p-3" autoComplete={register ? 'new-password' : 'current-password'} /></label>
        {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
        <button disabled={busy} className="w-full bg-emerald-600 text-white font-bold rounded-xl p-3 disabled:opacity-50">{busy ? 'Aguarde...' : register ? 'Criar minha conta' : 'Entrar'}</button>
        <button type="button" onClick={() => { setRegister(!register); setError(''); }} className="text-xs font-semibold text-emerald-700">{register ? 'Já tenho conta' : 'Ainda não tenho conta'}</button>
      </form>
    </div>}
  </AuthContext.Provider>;
}
