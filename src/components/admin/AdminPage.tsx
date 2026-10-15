import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { fuelApi } from '../../services/fuelApi';
import { TollQueue } from './TollQueue';
import { FuelQueue } from './FuelQueue';
import { PlacesManager } from './PlacesManager';
import { ReviewManager, UsersManager } from './CommunityManager';
import { PasswordSettings } from './PasswordSettings';
import { EmailSettings } from './EmailSettings';

const tabs = [ ['tolls', 'Pedágios'], ['fuel', 'Preços de combustíveis'], ['places', 'Estabelecimentos'], ['users', 'Usuários'], ['comments', 'Comentários'], ['reports', 'Denúncias'], ['audit', 'Histórico de ações'], ['settings', 'Configurações'] ] as const;
export default function AdminPage({ standalone = false }: { standalone?: boolean }) {
  const appUrl = standalone ? (import.meta.env.VITE_PUBLIC_APP_URL || '') : '/';
  const auth = useAuth();
  const [tab, setTab] = useState<typeof tabs[number][0]>('fuel');
  const [counts, setCounts] = useState<Record<string, number>>({}), [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const refresh = () => { fuelApi<Record<string, number>>('/admin/summary').then(setCounts).catch(error => setError(error.message)); };
  useEffect(() => { if (auth.user?.role === 'admin') refresh(); }, [auth.user?.id]);
  return <div className="min-h-screen bg-slate-50 text-slate-900 font-sans"><header className="bg-white border-b"><div className="max-w-7xl mx-auto px-5 py-5 flex flex-wrap gap-4 justify-between items-center"><div>{appUrl ? <a href={appUrl} className="text-sm font-bold text-emerald-700">Roteiro de Viagem</a> : <span className="text-sm font-bold text-emerald-700">Roteiro de Viagem</span>}<h1 className="text-2xl font-bold mt-1">Painel administrativo</h1></div><div className="flex items-center gap-4 text-sm">{appUrl && <a href={appUrl} className="text-slate-600">{standalone ? "Abrir aplicativo" : "Voltar ao aplicativo"}</a>}{auth.user && <button onClick={() => auth.logout().catch(error => setError(error.message))}>Sair</button>}</div></div></header>
    {auth.loading ? <p className="max-w-7xl mx-auto p-5">Verificando acesso...</p> : auth.user?.role !== 'admin' ? <section className="max-w-lg mx-auto my-12 bg-white border rounded-3xl p-7 space-y-4"><h2 className="text-lg font-bold">Acesso exclusivo do administrador</h2><p className="text-sm text-slate-600">Entre com uma conta autorizada para gerenciar o aplicativo.</p>{notice && <p role="status" className="text-sm text-emerald-800 bg-emerald-50 rounded-xl p-3">{notice}</p>}{!auth.user && <button onClick={auth.promptLogin} className="bg-emerald-600 text-white rounded-xl p-3 font-bold">Entrar como administrador</button>}{auth.user && <p className="text-sm text-rose-700">Sua conta não tem permissão para acessar este painel.</p>}</section> : <main className="max-w-7xl mx-auto p-5 md:p-8 space-y-6">
      <div className="flex flex-wrap gap-3 text-sm"><span className="bg-white border rounded-xl px-4 py-3">{counts.tolls || 0} tarifas de pedágio pendentes</span><span className="bg-white border rounded-xl px-4 py-3">{counts.photos || 0} fotos pendentes</span><span className="bg-white border rounded-xl px-4 py-3">{counts.prices || 0} preços pendentes</span><span className="bg-white border rounded-xl px-4 py-3">{counts.comments || 0} comentários pendentes</span><span className="bg-white border rounded-xl px-4 py-3">{counts.reports || 0} denúncias abertas</span></div>
      <nav aria-label="Seções administrativas" className="flex flex-wrap gap-2 border-b pb-4">{tabs.map(([id, title]) => <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => { setTab(id); setError(''); }} className={`rounded-xl px-4 py-3 text-sm font-semibold ${tab === id ? 'bg-emerald-600 text-white' : 'bg-white border text-slate-600'}`}>{title}</button>)}</nav>
      {error && <p role="alert" className="bg-rose-50 text-rose-700 p-3 rounded-xl text-sm">{error}</p>}
      {tab === 'tolls' && <TollQueue onChange={refresh} />}{tab === 'fuel' && <FuelQueue onChange={refresh} />}{tab === 'places' && <PlacesManager onChange={refresh} />}{tab === 'users' && <UsersManager onChange={refresh} />}{['comments', 'reports', 'audit'].includes(tab) && <ReviewManager section={tab as 'comments' | 'reports' | 'audit'} onChange={refresh} />}{tab === 'settings' && <><PasswordSettings onPasswordChanged={message => { setNotice(message); auth.clearSession(); }} /><EmailSettings onEmailChanged={message => { setNotice(message); auth.clearSession(); }} /></>}
    </main>}
  </div>;
}

