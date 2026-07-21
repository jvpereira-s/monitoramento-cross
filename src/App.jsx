import { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient';
import { fetchOwnProfile, signOut } from './lib/auth';
import Login from './pages/Login';
import Painel from './pages/Painel';
import Relatorio from './pages/Relatorio';
import Usuarios from './pages/Usuarios';
import { MUTED } from './lib/theme';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState(null);
  const [topView, setTopView] = useState('dashboard');

  async function loadProfile() {
    const result = await fetchOwnProfile();
    if (!result.success) {
      setProfileError(result.error);
      setProfile(null);
      return;
    }
    setProfileError(null);
    setProfile(result.profile);
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) await loadProfile();
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      if (newSession) await loadProfile();
      else setProfile(null);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    await signOut();
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ color: MUTED }}>
        Carregando...
      </div>
    );
  }

  if (!session) {
    return <Login />;
  }

  if (profileError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3" style={{ color: MUTED }}>
        <p>Não consegui carregar seu perfil: {profileError}</p>
        <button type="button" className="cx-btn" style={{ background: '#111111', color: '#fff', padding: '8px 16px' }} onClick={handleLogout}>
          Sair
        </button>
      </div>
    );
  }

  // Login recém-feito: a sessão já chegou via onAuthStateChange, mas o fetch do perfil
  // (assíncrono, disparado no mesmo handler) ainda não voltou. Sem essa guarda, o render
  // seguinte tenta ler profile.role com profile ainda null e quebra a árvore inteira.
  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ color: MUTED }}>
        Carregando...
      </div>
    );
  }

  const isAdmin = profile.role === 'admin';
  const pageProps = { profile, isAdmin, onNavigate: setTopView, onLogout: handleLogout };

  if (topView === 'relatorio') return <Relatorio {...pageProps} />;
  if (isAdmin && topView === 'usuarios') return <Usuarios {...pageProps} />;
  return <Painel {...pageProps} />;
}
