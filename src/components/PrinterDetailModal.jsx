import { useMemo, useState } from 'react';
import { X, FileText, Download } from 'lucide-react';
import StatusDot from './StatusDot';
import { computeReportRows, computeReportTotals, formatDateTimeBR } from '../lib/report';
import { exportReportCSV, exportReportExcel, exportReportPDF } from '../lib/reportExport';
import { MUTED, LINE, INK, ACTION } from '../lib/theme';

function defaultStart() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

export default function PrinterDetailModal({ printer, readings, isAdmin, onClose }) {
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState(null);

  const history = useMemo(() => (
    readings
      .filter((r) => r.printer_id === printer.id)
      .slice()
      .sort((a, b) => (a.data < b.data ? 1 : -1))
      .slice(0, 10)
  ), [readings, printer.id]);

  // Reaproveita o cálculo do relatório de cliente, só que com uma lista de impressoras
  // contendo essa única impressora — a mesma matemática validada, sem duplicar lógica.
  const reportRows = useMemo(
    () => computeReportRows([printer], readings, printer.cliente, start, end),
    [printer, readings, start, end]
  );
  const reportTotals = useMemo(() => computeReportTotals(reportRows), [reportRows]);

  function handlePDF() {
    const result = exportReportPDF(reportRows, reportTotals, printer.cliente, start, end, isAdmin);
    if (!result.success) setError(result.error);
  }

  async function handleExcel() {
    try {
      await exportReportExcel(reportRows, reportTotals, printer.cliente, start, end, isAdmin);
    } catch {
      setError('Não consegui gerar o Excel. Tente novamente.');
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(17,17,17,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: 12, padding: 24, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <StatusDot status={printer.comm} />
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: INK }}>{printer.modelo || printer.id}</div>
              <div className="mono" style={{ fontSize: 12, color: MUTED }}>{printer.id}</div>
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED }}>
            <X size={18} />
          </button>
        </div>

        {error && (
          <div style={{ background: '#FBEAE8', border: '1px solid #E8B4AC', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12.5, color: '#7A281E' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', fontSize: 13, marginBottom: 18 }}>
          <div><span style={{ color: MUTED }}>Local:</span> {printer.local || '—'}</div>
          <div><span style={{ color: MUTED }}>Departamento:</span> {printer.departamento || '—'}</div>
          {isAdmin && <div><span style={{ color: MUTED }}>Cliente:</span> {printer.cliente}</div>}
          <div><span style={{ color: MUTED }}>Conexão:</span> {printer.conexao || '—'}</div>
          <div><span style={{ color: MUTED }}>IP:</span> <span className="mono">{printer.ip || '—'}</span></div>
          <div>
            {/* Último contato da IMPRESSORA com o PrintWayy (lastCommunication), não a data
                da última sincronização da Cross. Antes mostrava a data da última leitura
                gravada pelo sync, que é sempre "hoje" mesmo pra impressora parada há meses. */}
            <span style={{ color: MUTED }}>Última comunicação com o PrintWayy:</span>{' '}
            <span className="mono">
              {printer.situacao_printwayy === 'fora-do-contrato'
                ? 'Fora do contrato no PrintWayy (contador congelado)'
                : printer.situacao_printwayy === 'nao-encontrada'
                  ? 'Sem cadastro no PrintWayy (contador manual)'
                  : formatDateTimeBR(printer.ultimaComunicacao ?? printer.ultima_comunicacao)}
            </span>
          </div>
          <div>
            <span style={{ color: MUTED }}>Contador atual:</span>{' '}
            <span className="mono">{printer.contador !== null ? printer.contador.toLocaleString('pt-BR') : '—'}</span>
          </div>
        </div>

        {history.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 6 }}>Últimas leituras</div>
            <table className="cx-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead><tr><th>Data</th><th style={{ textAlign: 'right' }}>Contador P&B</th></tr></thead>
              <tbody>
                {history.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{r.data}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>
                      {r.contador_pb !== null && r.contador_pb !== undefined ? r.contador_pb.toLocaleString('pt-BR') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ borderTop: `1px solid ${LINE}`, paddingTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 8 }}>Relatório deste equipamento</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end', marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11.5, color: MUTED, display: 'block', marginBottom: 4 }}>De</label>
              <input type="date" className="cx-input" value={start} onChange={(e) => setStart(e.target.value)} style={{ fontSize: 12.5, padding: '6px 8px' }} />
            </div>
            <div>
              <label style={{ fontSize: 11.5, color: MUTED, display: 'block', marginBottom: 4 }}>Até</label>
              <input type="date" className="cx-input" value={end} onChange={(e) => setEnd(e.target.value)} style={{ fontSize: 12.5, padding: '6px 8px' }} />
            </div>
            <div style={{ fontSize: 12.5, color: MUTED }}>
              Total no período: <strong className="mono" style={{ color: INK }}>{reportTotals.pb.toLocaleString('pt-BR')}</strong>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="cx-btn" onClick={handlePDF}
              style={{ background: ACTION, color: '#fff', padding: '7px 12px', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}>
              <FileText size={13} /> PDF
            </button>
            <button type="button" className="cx-btn" onClick={handleExcel}
              style={{ background: '#fff', border: `1px solid ${LINE}`, padding: '7px 12px', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Download size={13} /> Excel
            </button>
            <button type="button" className="cx-btn" onClick={() => exportReportCSV(reportRows, reportTotals, printer.cliente, start, end, isAdmin)}
              style={{ background: '#fff', border: `1px solid ${LINE}`, padding: '7px 12px', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Download size={13} /> CSV
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
