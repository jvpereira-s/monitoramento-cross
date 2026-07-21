import { useEffect, useMemo, useState } from 'react';
import { FileText, Download, HelpCircle, AlertTriangle, X } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import AppShell from '../components/AppShell';
import CrossMark from '../components/CrossMark';
import { fetchPrinters, fetchReadings } from '../lib/db';
import { computeReportRows, computeReportTotals, computeDailyTrend, formatDateBR } from '../lib/report';
import { computeLastSync } from '../lib/printerStats';
import { exportReportCSV, exportReportExcel, exportReportPDF } from '../lib/reportExport';
import { ORANGE, MUTED, LINE } from '../lib/theme';

function defaultStart() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

export default function Relatorio({ profile, isAdmin, onNavigate, onLogout }) {
  const [loading, setLoading] = useState(true);
  const [printers, setPrinters] = useState([]);
  const [readings, setReadings] = useState([]);
  const [error, setError] = useState(null);

  const [reportClient, setReportClient] = useState('');
  const [reportStart, setReportStart] = useState(defaultStart);
  const [reportEnd, setReportEnd] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [printersRes, readingsRes] = await Promise.all([fetchPrinters(), fetchReadings()]);
      if (!printersRes.success) { setError(printersRes.error); setLoading(false); return; }
      if (!readingsRes.success) { setError(readingsRes.error); setLoading(false); return; }
      setPrinters(printersRes.printers);
      setReadings(readingsRes.readings);
      setLoading(false);
    })();
  }, []);

  const realClients = useMemo(() => {
    const set = new Set(printers.map((p) => p.cliente).filter(Boolean));
    return Array.from(set);
  }, [printers]);

  const effectiveReportClient = reportClient || (isAdmin ? realClients[0] : profile.cliente_associado) || '';

  const reportRows = useMemo(
    () => computeReportRows(printers, readings, effectiveReportClient, reportStart, reportEnd),
    [printers, readings, effectiveReportClient, reportStart, reportEnd]
  );
  const reportTotals = useMemo(() => computeReportTotals(reportRows), [reportRows]);
  const reportHasAnyData = reportRows.some((r) => r.hasData && (r.totalPB !== null || r.totalColor !== null));
  const dailyTrend = useMemo(
    () => computeDailyTrend(reportRows, readings, reportStart, reportEnd),
    [reportRows, readings, reportStart, reportEnd]
  );
  const lastSync = useMemo(() => computeLastSync(printers, readings), [printers, readings]);

  function handleExportPDF() {
    const result = exportReportPDF(reportRows, reportTotals, effectiveReportClient, reportStart, reportEnd);
    if (!result.success) setError(result.error);
  }

  const title = isAdmin ? 'Relatório de Impressões' : `Painel do cliente — ${profile.cliente_associado}`;

  return (
    <AppShell profile={profile} isAdmin={isAdmin} view="relatorio" onViewChange={onNavigate} onLogout={onLogout}
      lastSync={lastSync} title={title}>

      {error && (
        <div className="no-print" style={{ background: '#FBEAE8', border: '1px solid #E8B4AC', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#7A281E', display: 'flex', justifyContent: 'space-between' }}>
          <span><AlertTriangle size={14} style={{ verticalAlign: -2, marginRight: 6 }} />{error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7A281E' }}><X size={14} /></button>
        </div>
      )}

      {loading ? (
        <div style={{ padding: '56px 0', textAlign: 'center', color: MUTED, fontSize: 13.5 }}>Carregando...</div>
      ) : (
        <div>
          <div className="no-print" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end', marginBottom: 18 }}>
            {isAdmin && (
              <div>
                <label style={{ fontSize: 12, color: MUTED, display: 'block', marginBottom: 4 }}>Cliente</label>
                <select className="cx-input" value={effectiveReportClient} onChange={(e) => setReportClient(e.target.value)}>
                  {realClients.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
            <div>
              <label style={{ fontSize: 12, color: MUTED, display: 'block', marginBottom: 4 }}>De</label>
              <input type="date" className="cx-input" value={reportStart} onChange={(e) => setReportStart(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: MUTED, display: 'block', marginBottom: 4 }}>Até</label>
              <input type="date" className="cx-input" value={reportEnd} onChange={(e) => setReportEnd(e.target.value)} />
            </div>
            <button className="cx-btn" onClick={handleExportPDF}
              style={{ background: ORANGE, color: '#fff', padding: '9px 16px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
              <FileText size={14} /> PDF (com logo e cabeçalho)
            </button>
            <button className="cx-btn" onClick={() => exportReportExcel(reportRows, reportTotals, effectiveReportClient, reportEnd)}
              style={{ background: '#fff', border: `1px solid ${LINE}`, padding: '9px 14px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Download size={14} /> Excel
            </button>
            <button className="cx-btn" onClick={() => exportReportCSV(reportRows, reportTotals, effectiveReportClient, reportEnd)}
              style={{ background: '#fff', border: `1px solid ${LINE}`, padding: '9px 14px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Download size={14} /> CSV
            </button>
          </div>

          {!effectiveReportClient ? (
            <div style={{ background: '#fff', border: '1px dashed #C7CCC3', borderRadius: 12, padding: '50px 24px', textAlign: 'center', color: MUTED, fontSize: 13.5 }}>
              Nenhum cliente com impressoras cadastradas ainda.
            </div>
          ) : (
            <div id="relatorio-print-area" style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 10, padding: 32 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 18, marginBottom: 20, borderBottom: `3px solid ${ORANGE}`, flexWrap: 'wrap', gap: 16 }}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                  <CrossMark size={54} />
                  <div>
                    <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 17, letterSpacing: '0.03em' }}>CROSS SOLUÇÕES</div>
                    <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>Inovações contínuas na computação e na prestação de serviços</div>
                    <div style={{ fontSize: 11, color: MUTED }}>CNPJ 65.404.622/0001-20 · Inscrição Estadual 084.818.99-9</div>
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontSize: 11, color: MUTED, lineHeight: 1.7 }}>
                  <div>Av. Raphael Barbosa Brhaim, 847</div>
                  <div>Guriri Norte, São Mateus – ES</div>
                  <div>(27) 99693-8793 · crosssolucoes@outlook.com</div>
                </div>
              </div>

              <div style={{ textAlign: 'center', marginBottom: 22 }}>
                <h2 style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 20, margin: '0 0 4px' }}>
                  Relatório de Impressões
                </h2>
                <div style={{ fontSize: 13, color: MUTED }}>
                  Período de {formatDateBR(reportStart)} a {formatDateBR(reportEnd)}
                </div>
              </div>

              <div style={{ background: '#FAFAF9', border: `1px solid ${LINE}`, borderRadius: 8, padding: '12px 16px', marginBottom: 22, fontSize: 13, display: 'flex', flexWrap: 'wrap', gap: '4px 32px' }}>
                <div><strong>Cliente:</strong> {effectiveReportClient}</div>
                <div><strong>Equipamentos:</strong> {reportRows.length}</div>
                <div><strong>Gerado em:</strong> {new Date().toLocaleDateString('pt-BR')}</div>
              </div>

              {!reportHasAnyData && (
                <div className="no-print" style={{ background: '#FFF7EA', border: '1px solid #F0DBAE', borderRadius: 8, padding: '10px 14px', marginBottom: 18, fontSize: 12.5 }}>
                  <HelpCircle size={13} style={{ verticalAlign: -2, marginRight: 6 }} />
                  Nenhuma leitura de contador neste período ainda — a tabela mostra o cadastro, mas o total fica vazio até a primeira importação com contador.
                </div>
              )}

              <table className="cx-table" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 22 }}>
                <thead>
                  <tr style={{ background: '#FAFAF9' }}>
                    <th style={{ width: 40, textAlign: 'right' }}>#</th>
                    <th>Impressora</th>
                    <th>Número de série</th>
                    <th>Localização</th>
                    <th style={{ textAlign: 'right' }}>Total de impressões</th>
                  </tr>
                </thead>
                <tbody>
                  {reportRows.map((r, i) => (
                    <tr key={r.id}>
                      <td className="mono" style={{ textAlign: 'right', color: MUTED }}>{i + 1}</td>
                      <td>{r.modelo || '—'}</td>
                      <td className="mono">{r.id}</td>
                      <td>{r.local || '—'}</td>
                      <td className="mono" style={{ textAlign: 'right', fontWeight: 600 }}>
                        {r.totalPB !== null ? r.totalPB.toLocaleString('pt-BR') : '—'}
                      </td>
                    </tr>
                  ))}
                  <tr style={{ background: '#FCE9D8' }}>
                    <td colSpan={4} style={{ fontWeight: 700, textAlign: 'right' }}>Total geral de impressões</td>
                    <td className="mono" style={{ textAlign: 'right', fontWeight: 700, color: '#C25F09' }}>
                      {reportTotals.pb.toLocaleString('pt-BR')}
                    </td>
                  </tr>
                </tbody>
              </table>

              {dailyTrend.length > 0 && (
                <div className="no-print">
                  <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8, color: MUTED }}>Total de páginas por dia</div>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={dailyTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
                      <XAxis dataKey="date" fontSize={11} stroke={MUTED} />
                      <YAxis fontSize={11} stroke={MUTED} />
                      <Tooltip />
                      <Bar dataKey="total" fill={ORANGE} radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div style={{ marginTop: 28, paddingTop: 14, borderTop: `1px solid ${LINE}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10.5, color: MUTED, flexWrap: 'wrap', gap: 8 }}>
                <span>CROSS Soluções · Monitoramento de impressão · Documento gerado automaticamente</span>
                <span>crosssolucoes@outlook.com · (27) 99693-8793</span>
              </div>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
