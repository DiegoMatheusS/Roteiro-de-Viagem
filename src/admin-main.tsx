import { createRoot } from 'react-dom/client';
import { AuthProvider } from './contexts/AuthContext';
import AdminPage from './components/admin/AdminPage';
import './index.css';

// Entrada exclusiva do painel. Nao importa o app publico ou a navegacao de viagens.
createRoot(document.getElementById('root')!).render(
  <AuthProvider adminOnly>
    <AdminPage standalone />
  </AuthProvider>
);
