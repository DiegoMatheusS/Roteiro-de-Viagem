import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import 'leaflet/dist/leaflet.css';
import { AuthProvider } from './contexts/AuthContext';
import { lazy, Suspense, useEffect, useState } from 'react';

const SharedRoutePage = lazy(() => import('./components/SharedRoutePage'));

function AppEntry() {
  const [route, setRoute] = useState(() => ({ path: window.location.pathname, hash: window.location.hash }));
  useEffect(() => {
    const refresh = () => setRoute({ path: window.location.pathname, hash: window.location.hash });
    window.addEventListener('hashchange', refresh);
    window.addEventListener('popstate', refresh);
    return () => { window.removeEventListener('hashchange', refresh); window.removeEventListener('popstate', refresh); };
  }, []);
  // A administração está em um site separado; nunca carregar o painel no app público.
  if (/^\/admin(?:\/|$)/i.test(route.path)) return <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6"><p className="text-slate-700">Página não encontrada.</p></main>;
  if (route.hash.startsWith('#roteiro=')) return <Suspense fallback={<p className="p-5">Carregando roteiro...</p>}><SharedRoutePage /></Suspense>;
  return <App />;
}

createRoot(document.getElementById('root')!).render(<AuthProvider><AppEntry /></AuthProvider>);
