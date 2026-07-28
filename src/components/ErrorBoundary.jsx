import { Component } from 'react';
import { AlertTriangle } from 'lucide-react';
import { INK, MUTED, DANGER, LINE } from '../lib/theme';

// Precisa ser classe: componentDidCatch/getDerivedStateFromError não têm equivalente em
// hooks (limitação do React, não escolha de estilo). Sem isso, qualquer exceção durante o
// render derruba a árvore inteira e o usuário vê página em branco, sem mensagem nenhuma —
// aconteceu de verdade em desenvolvimento e num sistema que o cliente acessa sozinho é
// pior ainda: ele não tem como saber se o problema é dele, da internet ou nosso.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Único canal de diagnóstico disponível: não há serviço de log de erro contratado, e o
    // console do navegador é onde o suporte vai olhar quando o cliente relatar a tela.
    console.error('Erro não tratado na interface:', error, info?.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, background: '#FAFAF8',
      }}>
        <div style={{
          maxWidth: 520, width: '100%', background: '#fff', border: `1px solid ${LINE}`,
          borderRadius: 12, padding: '32px 28px', textAlign: 'center',
        }}>
          <AlertTriangle size={32} color={DANGER} />
          <h1 style={{ fontSize: 17, fontWeight: 600, color: INK, margin: '14px 0 6px' }}>
            Algo deu errado ao montar esta tela
          </h1>
          <p style={{ fontSize: 13.5, color: MUTED, lineHeight: 1.6, margin: 0 }}>
            Seus dados estão salvos — a falha é só na exibição. Recarregue a página; se
            continuar acontecendo, avise o suporte informando a mensagem abaixo.
          </p>

          <button type="button" className="cx-btn" onClick={this.handleReload}
            style={{ background: INK, color: '#fff', padding: '9px 20px', fontSize: 13.5, marginTop: 18 }}>
            Recarregar página
          </button>

          <details style={{ marginTop: 20, textAlign: 'left' }}>
            <summary style={{ fontSize: 12, color: MUTED, cursor: 'pointer' }}>Detalhes técnicos</summary>
            <pre className="mono" style={{
              fontSize: 11, color: DANGER, background: '#FEF5F4', border: `1px solid ${LINE}`,
              borderRadius: 6, padding: 10, marginTop: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {this.state.error?.message || String(this.state.error)}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
