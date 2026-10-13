import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import 'leaflet/dist/leaflet.css';
import { AuthProvider } from './contexts/AuthContext';
import { lazy, Suspense, useEffect, useState } from 'react';

const AdminPage = lazy(() => import('./components/admin/AdminPage'));
const SharedRoutePage = lazy(() => import('./components/SharedRoutePage'));

function AppEntry() {
  const [route, setRoute] = useState(() => ({ path: window.location.pathname, hash: window.location.hash }));
  useEffect(() => {
    const refresh = () => setRoute({ path: window.location.pathname, hash: window.location.hash });
    window.addEventListener('hashchange', refresh);
    window.addEventListener('popstate', refresh);
    return () => { window.removeEventListener('hashchange', refresh); window.removeEventListener('popstate', refresh); };
  }, []);
  if (route.path.replace(/\/+$/, '') === '/admin') return <Suspense fallback={<p className="p-5">Carregando painel...</p>}><AdminPage /></Suspense>;
  if (route.hash.startsWith('#roteiro=')) return <Suspense fallback={<p className="p-5">Carregando roteiro...</p>}><SharedRoutePage /></Suspense>;
  return <App />;
}

createRoot(document.getElementById('root')!).render(<AuthProvider><AppEntry /></AuthProvider>);
