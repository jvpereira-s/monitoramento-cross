import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import CrossMark from '../components/CrossMark';
import CrossEmblem from '../components/CrossEmblem';
import Globe from '../components/Globe';
import { signInWithUsername } from '../lib/auth';
import { ORANGE, TEAL, INK, MUTED, DANGER } from '../lib/theme';

// Mesmo breakpoint de src/index.css (.cx-login-side { display: none }) — evita
// inicializar WebGL/three.js e buscar o GeoJSON à toa quando o painel laranja nem
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

  return (
    <div style={{ minHeight: '100vh', display: 'flex' }}>
      <div style={{ flex: '1 1 420px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#fff' }}>
        <div style={{ width: '100%', maxWidth: 320 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 36 }}>
            <CrossMark size={42} />
            <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 14, letterSpacing: '0.08em', color: INK }}>
              CROSS SOLUÇÕES
            </div>
          </div>
          <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 22, color: INK, marginBottom: 4 }}>
            Entrar no painel
          </div>
          <div style={{ fontSize: 13, color: MUTED, marginBottom: 26 }}>
            Monitoramento de impressoras. Preencha os campos abaixo.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input className="cx-input" placeholder="Usuário" value={username} autoFocus
              onKeyDown={onKeyDown} onChange={(e) => setUsername(e.target.value)} />
            <input className="cx-input" type="password" placeholder="Senha" value={password}
              onKeyDown={onKeyDown} onChange={(e) => setPassword(e.target.value)} />
            {error && (
              <div style={{ fontSize: 12.5, color: DANGER, display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={13} /> {error}
              </div>
            )}
            <button type="button" onClick={submit} disabled={busy} className="cx-btn"
              style={{ background: TEAL, color: '#fff', padding: '12px 0', fontSize: 14.5, marginTop: 6 }}>
              {busy ? 'Entrando...' : 'Entrar'}
            </button>
          </div>
        </div>
      </div>
      <div className="cx-login-side" style={{ flex: '1 1 480px', background: ORANGE, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, color: '#fff', position: 'relative' }}>
        <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 22, textAlign: 'center', maxWidth: 340, lineHeight: 1.35, marginBottom: 28 }}>
          Visibilidade completa do parque de impressão.
        </div>
        <div style={{ position: 'relative', width: '100%', maxWidth: 280, aspectRatio: '1' }}>
          {showGlobe && (
            <Globe
              dots={GLOBE_DOTS}
              fill="dots"
              oceanColor="rgba(0,0,0,0)"
              outlineColor="#ffffff"
              outlineWidth={1}
              showGrid={false}
              markerConfig={GLOBE_MARKERS}
              speed={0}
              scale={8}
              detail={4}
            />
          )}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <CrossEmblem size={84} />
          </div>
        </div>
      </div>
    </div>
  );
}
