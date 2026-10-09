import { lazy, Suspense, useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import CrossMark from '../components/CrossMark';
import { signInWithUsername } from '../lib/auth';
import { INK, MUTED, DANGER, NAVY, ACTION } from '../lib/theme';

// Carregado sob demanda: three.js + d3-geo são a maior dependência do projeto e servem
// só pra este enfeite. Com lazy, quem abre o sistema no celular (onde o globo nem
// aparece) não baixa nada disso, e no desktop ele entra depois da tela de login já
// utilizável — o formulário nunca espera pelo WebGL.
const Globe = lazy(() => import('../components/Globe'));

// Mesmo breakpoint de src/index.css (.cx-login-side { display: none }) — evita
// inicializar WebGL/three.js e buscar o GeoJSON à toa quando o painel marinho nem
// aparece na tela (mobile).
const SHOW_GLOBE_QUERY = '(min-width: 761px)';

// Fora do componente de propósito: são objetos literais, e o useEffect do Globe
// depende deles por referência. Se ficassem inline no JSX, cada re-render do Login
// (cada tecla digitada nos campos) criaria um objeto novo, o Globe interpretaria
// como "prop mudou" e destruiria/recriaria o WebGL inteiro — era por isso que o
// globo sumia (e provavelmente boa parte do travamento) toda vez que alguém digitava.
const GLOBE_DOTS = { color: '#ffffff', size: 4, density: 6, allDots: false };
const GLOBE_MARKERS = { markers: [], color: '#ffffff', size: 30 };

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showGlobe, setShowGlobe] = useState(
    () => window.matchMedia(SHOW_GLOBE_QUERY).matches
  );

  useEffect(() => {
    const mq = window.matchMedia(SHOW_GLOBE_QUERY);
    const onChange = (e) => setShowGlobe(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await signInWithUsername(username, password);
      if (!result.success) setError(result.error);
    } catch {
      setError('Erro inesperado ao entrar. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter') submit();
  }

  // Mesmo desenho da tela de acesso da equipe (site/suporte/index.html) e do site
  // institucional: formulário à esquerda, painel marinho à direita, IBM Plex Sans,
  // botão de ação em ACTION. Ver src/lib/theme.js.
  return (
    <div style={{ minHeight: '100vh', display: 'flex' }}>
      <main style={{ flex: '1 1 420px', display: 'flex', flexDirection: 'column', padding: 24, background: '#fff' }}>
        <a href="/" className="cx-voltar">← crosssolucoes.com.br</a>
        <div style={{ width: '100%', maxWidth: 340, margin: 'auto', padding: '32px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 40 }}>
            <CrossMark size={44} />
            <div style={{ lineHeight: 1.15 }}>
              <div style={{ fontWeight: 600, fontSize: 17, color: INK }}>Cross Soluções</div>
              <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2 }}>Monitoramento de impressões</div>
            </div>
          </div>
          <h1 style={{ fontWeight: 600, fontSize: 26, letterSpacing: '-0.015em', color: INK, margin: '0 0 6px' }}>
            Entrar no painel
          </h1>
          <div style={{ fontSize: 14.5, color: MUTED, marginBottom: 28 }}>
            Use o usuário e a senha fornecidos pela Cross.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label htmlFor="login-usuario" style={{ fontSize: 14, fontWeight: 600, color: INK, display: 'block', marginBottom: 6 }}>Usuário</label>
              <input id="login-usuario" className="cx-input" style={{ width: '100%', minHeight: 46, fontSize: 15 }} placeholder="seu.usuario" value={username} autoFocus
                autoComplete="username" onKeyDown={onKeyDown} onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div>
              <label htmlFor="login-senha" style={{ fontSize: 14, fontWeight: 600, color: INK, display: 'block', marginBottom: 6 }}>Senha</label>
              <input id="login-senha" className="cx-input" style={{ width: '100%', minHeight: 46, fontSize: 15 }} type="password" placeholder="••••••••" value={password}
                autoComplete="current-password" onKeyDown={onKeyDown} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && (
              <div role="alert" style={{ fontSize: 13.5, color: DANGER, display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={14} /> {error}
              </div>
            )}
            <button type="button" onClick={submit} disabled={busy} className="cx-btn"
              style={{ background: ACTION, color: '#fff', minHeight: 46, fontSize: 15, marginTop: 6 }}>
              {busy ? 'Entrando...' : 'Entrar'}
            </button>
          </div>
          <div style={{ marginTop: 32, paddingTop: 18, borderTop: '1px solid #DDE2E9', fontSize: 13.5, color: MUTED }}>
            Problema com equipamento? <a href="/chamados/" style={{ color: ACTION, fontWeight: 600 }}>Abrir chamado</a>
          </div>
        </div>
      </main>
      <aside className="cx-login-side" aria-label="Sobre o monitoramento" style={{ flex: '1 1 480px', background: NAVY, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 48, color: '#C9D2DE', position: 'relative' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 30, letterSpacing: '-0.015em', lineHeight: 1.2, color: '#fff', maxWidth: 380 }}>
            Monitoramento de impressões
          </div>
          <div style={{ marginTop: 14, fontSize: 15.5, lineHeight: 1.6, maxWidth: 400 }}>
            Situação das impressoras do contrato e relatório de páginas por período, com
            exportação em PDF, Excel e CSV.
          </div>
        </div>
        <div style={{ width: '100%', maxWidth: 300, aspectRatio: '1', alignSelf: 'center' }}>
          {showGlobe && (
            // fallback null: é decoração. Um "carregando" no lugar do globo chamaria mais
            // atenção pra ausência dele do que a ausência em si.
            <Suspense fallback={null}>
              <Globe
                dots={GLOBE_DOTS}
                fill="dots"
                oceanColor="rgba(0,0,0,0)"
                outlineColor="#ffffff"
                outlineWidth={1}
                showGrid={false}
                markerConfig={GLOBE_MARKERS}
                speed={1}
                scale={8}
                detail={4}
              />
            </Suspense>
          )}
        </div>
        <div style={{ fontSize: 13 }}>
          © 2026 Cross Soluções · CNPJ 65.404.622/0001-20
        </div>
      </aside>
    </div>
  );
}
