import { INK, MUTED, LINE } from '../lib/theme';

// Lista de impressoras com problema (sem comunicação, sem monitoramento de páginas).
// Existe como componente próprio porque as duas listas do Painel são idênticas em
// estrutura e só mudam cor, título e o texto do estado — antes eram dois blocos JSX
// duplicados, cada um com sua própria barrinha de "há quantos dias".
//
// Identifica o equipamento em vez de desenhar barra comparativa: com a sincronização de
// hora em hora, todas as impressoras num mesmo estado tendem a entrar nele no mesmo dia,
// então a barra ficava sempre do mesmo tamanho e não informava nada. O que o técnico
// precisa pra agir é qual máquina é, onde fica e como conectar.
export default function PrinterIssueList({
  title,           // título da seção
  subtitle,        // linha de contexto abaixo do título
  items,           // impressoras já filtradas e ordenadas
  total,           // total do parque no escopo, pro contador "N de M"
  accent,          // cor do estado (vermelho = parada, laranja = sem monitorar)
  background,      // fundo da linha, tom claro do accent
  label,           // (printer) => texto do estado, ex: "Parada há 3 dias"
  emptyMessage,    // texto quando não há nenhuma nesse estado
  emptyColor,      // cor do texto de lista vazia
  onSelect,        // abre o histórico da impressora clicada
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 10, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: MUTED }}>{title}</div>
          {items.length > 0 && (
            <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: accent }}>
              {items.length} de {total}
            </span>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: '#9CA3AF', margin: '4px 0 10px' }}>{subtitle}</div>

        {items.length === 0 ? (
          <div style={{ padding: '30px 0', textAlign: 'center', color: emptyColor, fontSize: 13.5 }}>
            {emptyMessage}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {items.map((p) => (
              <div key={p.id} onClick={() => onSelect(p)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', cursor: 'pointer',
                  padding: '8px 10px', background, borderRadius: 8,
                  border: `1px solid ${LINE}`, borderLeft: `3px solid ${accent}`,
                }}>
                <div style={{ flex: '2 1 190px', minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                    title={p.departamento ? `${p.local || p.id} — ${p.departamento}` : p.local || p.id}>
                    {p.local || p.id}
                  </div>
                  <div className="mono" style={{ fontSize: 10.5, color: MUTED }}>{p.id}</div>
                </div>
                <div style={{ flex: '1 1 140px', minWidth: 0, fontSize: 11.5, color: MUTED, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.modelo || 'Modelo não informado'}
                </div>
                <div className="mono" style={{ flex: '0 1 110px', fontSize: 11.5, color: MUTED }}>{p.ip || '—'}</div>
                <div style={{ flex: '0 0 44px', fontSize: 11, color: MUTED }}>{p.conexao || '—'}</div>
                <div style={{ flex: '0 0 120px', textAlign: 'right', fontSize: 11.5, fontWeight: 600, color: accent }}>
                  {label(p)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
