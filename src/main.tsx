import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import 'leaflet/dist/leaflet.css';
import { AuthProvider } from './contexts/AuthContext';
import { lazy, Suspense } from 'react';

const AdminPage = lazy(() => import('./components/admin/AdminPage'));
const SharedRoutePage = lazy(() => import('./components/SharedRoutePage'));

createRoot(document.getElementById('root')!).render(<AuthProvider>{window.location.pathname.replace(/\/+$/, '') === '/admin' ? <Suspense fallback={<p className="p-5">Carregando painel...</p>}><AdminPage /></Suspense> : window.location.hash.startsWith('#roteiro=') ? <Suspense fallback={<p className="p-5">Carregando roteiro...</p>}><SharedRoutePage /></Suspense> : <App />}</AuthProvider>);
