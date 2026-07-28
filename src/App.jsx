import { lazy, Suspense, useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient';
import { fetchOwnProfile, signOut } from './lib/auth';
import { MUTED } from './lib/theme';

// Uma tela por chunk. Sem isso, quem só abre o login baixa junto os gráficos (recharts) e
// as telas de painel/relatório/usuários que talvez nem visite — e o cliente, que nunca vê
// a tela de Usuários, baixava ela do mesmo jeito.
const Login = lazy(() => import('./pages/Login'));
const Painel = lazy(() => import('./pages/Painel'));
const Relatorio = lazy(() => import('./pages/Relatorio'));
const Usuarios = lazy(() => import('./pages/Usuarios'));

function Carregando() {
  return (
    <div className="flex min-h-screen items-center justify-center" style={{ color: MUTED }}>
      Carregando...
    </div>
  );
}

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

  if (loading) return <Carregando />;

  if (!session) {
    return (
      <Suspense fallback={<Carregando />}>
        <Login />
      </Suspense>
    );
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
  if (!profile) return <Carregando />;

  const isAdmin = profile.role === 'admin';
  const pageProps = { profile, isAdmin, onNavigate: setTopView, onLogout: handleLogout };

  return (
    <Suspense fallback={<Carregando />}>
      {topView === 'relatorio' ? <Relatorio {...pageProps} />
        : isAdmin && topView === 'usuarios' ? <Usuarios {...pageProps} />
          : <Painel {...pageProps} />}
    </Suspense>
  );
}
