import { useEffect, useMemo, useState } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import {
  Upload, AlertTriangle, Search, Settings, FileSpreadsheet, X, RefreshCw, Download, ShieldCheck, Plus,
} from 'lucide-react';
import AppShell from '../components/AppShell';
import MiniDonut from '../components/MiniDonut';
import StatusDot from '../components/StatusDot';
import PrinterDetailModal from '../components/PrinterDetailModal';
import RegisterPrinterModal from '../components/RegisterPrinterModal';
import { fetchPrinters, fetchReadings, saveImport } from '../lib/db';
import { guessMapping, rowsFromSheet, FIELDS } from '../lib/mapping';
import { buildImportPayload } from '../lib/importPrinters';
import { syncPrintwayy } from '../lib/printwayySync';
import {
  computePrinterStats, computeKpis, computeLastSync, computeOfflineList, computeSemMonitoramentoList,
  computeConexaoData,
} from '../lib/printerStats';
import { ORANGE, ORANGE_DEEP, TEAL, INK, MUTED, DANGER, LINE } from '../lib/theme';

export default function Painel({ profile, isAdmin, onNavigate, onLogout }) {
  const [loading, setLoading] = useState(true);
  const [printers, setPrinters] = useState([]);
  const [readings, setReadings] = useState([]);
  const [error, setError] = useState(null);

  const [view, setView] = useState('dashboard');
  const [rawRows, setRawRows] = useState(null);
  const [rawHeaders, setRawHeaders] = useState([]);
  const [mapping, setMapping] = useState({});
  const [manualDate, setManualDate] = useState('');
  const [manualDateIni, setManualDateIni] = useState('');
  const [importing, setImporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState(null);

  const [search, setSearch] = useState('');
  const [clientFilter, setClientFilter] = useState('todos');
  const [commThreshold, setCommThreshold] = useState(7);
  const [showSettings, setShowSettings] = useState(false);
  const [sortBy, setSortBy] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [selectedPrinter, setSelectedPrinter] = useState(null);
  const [showRegisterModal, setShowRegisterModal] = useState(false);

  async function loadData() {
    setLoading(true);
    const [printersRes, readingsRes] = await Promise.all([fetchPrinters(), fetchReadings()]);
    if (!printersRes.success) { setError(printersRes.error); setLoading(false); return; }
    if (!readingsRes.success) { setError(readingsRes.error); setLoading(false); return; }
    setPrinters(printersRes.printers);
    setReadings(readingsRes.readings);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  const stats = useMemo(() => computePrinterStats(printers, readings, commThreshold), [printers, readings, commThreshold]);
  const hasData = printers.length > 0;

  const clients = useMemo(() => {
    const set = new Set(stats.map((p) => p.cliente).filter(Boolean));
    return ['todos', ...Array.from(set)];
  }, [stats]);

  // Filtro de cliente (admin) vale pra tudo — KPIs, gráficos e tabela — não só a tabela.
  // Em "todos" (padrão), volta a somar o parque inteiro.
  const scopedStats = useMemo(() => (
    isAdmin && clientFilter !== 'todos' ? stats.filter((p) => p.cliente === clientFilter) : stats
  ), [stats, isAdmin, clientFilter]);

  const kpis = useMemo(() => computeKpis(scopedStats), [scopedStats]);
  const hasCounters = useMemo(() => scopedStats.some((p) => p.contador !== null), [scopedStats]);
  const lastSync = useMemo(() => computeLastSync(stats, readings), [stats, readings]);
  const offlineList = useMemo(() => computeOfflineList(scopedStats), [scopedStats]);
  const semMonitoramentoList = useMemo(() => computeSemMonitoramentoList(scopedStats), [scopedStats]);
  const conexaoData = useMemo(() => computeConexaoData(scopedStats), [scopedStats]);

  const commPieData = [
    { name: 'Comunicando', value: kpis.online, color: TEAL },
    { name: 'Sem comunicação', value: kpis.offline, color: DANGER },
    { name: 'Sem monitoramento de páginas', value: kpis.semMonitoramento, color: ORANGE },
    { name: 'Sem dados ainda', value: kpis.semDados, color: '#9CA3AF' },
  ].filter((d) => d.value > 0);

  const filtered = scopedStats.filter((p) => {
    const s = search.toLowerCase();
    return !s
      || p.id.toLowerCase().includes(s)
      || (p.ip || '').toLowerCase().includes(s)
      || (p.modelo || '').toLowerCase().includes(s)
      || (p.local || '').toLowerCase().includes(s);
  });

  function toggleSort(key) {
    if (sortBy === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(key); setSortDir('asc'); }
  }

  const sorted = useMemo(() => {
    if (!sortBy) return filtered;
    const arr = [...filtered];
    arr.sort((a, b) => {
      let av, bv;
      if (sortBy === 'local') { av = (a.local || a.id).toLowerCase(); bv = (b.local || b.id).toLowerCase(); }
      else if (sortBy === 'comm') { av = a.comm; bv = b.comm; }
      else if (sortBy === 'dias') { av = a.daysSince ?? -1; bv = b.daysSince ?? -1; }
      else { av = a.id; bv = b.id; }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filtered, sortBy, sortDir]);

  function exportCSV() {
    const headers = ['Local', 'Modelo', 'Conexao', 'IP', ...(isAdmin ? ['Cliente'] : []), 'Status', 'UltimaComunicacao', 'DiasSemComunicar', ...(hasCounters ? ['Contador'] : [])];
    const rows = sorted.map((p) => [
      p.local || p.id, p.modelo || '', p.conexao || '', p.ip || '',
      ...(isAdmin ? [p.cliente || ''] : []),
      p.comm, p.lastReading ? p.lastReading.data : '', p.daysSince ?? '',
      ...(hasCounters ? [p.contador ?? ''] : []),
    ]);
    const escape = (v) => {
      const s = String(v ?? '');
      return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const BOM = String.fromCharCode(0xfeff);
    const csv = BOM + [headers, ...rows].map((r) => r.map(escape).join(';')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `impressoras-cross-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleFileSelect(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    e.target.value = '';
    setError(null);
    const isCsv = file.name.toLowerCase().endsWith('.csv');
    if (isCsv) {
      // header:false — o relatório do PrintWayy traz logo/título/dados do cliente antes
      // da linha real de colunas, então lemos tudo como array bruto e deixamos
      // rowsFromSheet() achar onde o cabeçalho de verdade está.
      Papa.parse(file, {
        header: false,
        skipEmptyLines: true,
        complete: (results) => {
          const { headers, rows } = rowsFromSheet(results.data);
          if (!headers.length) { setError('Não encontrei cabeçalhos no CSV.'); return; }
          setRawHeaders(headers);
          setRawRows(rows);
          setMapping(guessMapping(headers));
          setView('mapping');
        },
        error: () => setError('Não consegui ler o CSV. Verifique o arquivo.'),
      });
    } else {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const wb = XLSX.read(evt.target.result, { type: 'binary', cellDates: true });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const rawArray = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
          const { headers, rows } = rowsFromSheet(rawArray);
          if (!headers.length) { setError('A planilha parece estar vazia.'); return; }
          setRawHeaders(headers);
          setRawRows(rows);
          setMapping(guessMapping(headers));
          setView('mapping');
        } catch {
          setError('Não consegui ler essa planilha. Verifique o formato (.xlsx ou .csv).');
        }
      };
      reader.readAsBinaryString(file);
    }
  }

  async function confirmMapping() {
    const result = buildImportPayload({ rawRows, mapping, manualDate, manualDateIni });
    if (!result.success) { setError(result.error); return; }
    setImporting(true);
    const saved = await saveImport(result.printers, result.readings);
    setImporting(false);
    if (!saved.success) { setError(`Falha ao gravar a importação: ${saved.error}`); return; }
    setError(null);
    setRawRows(null);
    setRawHeaders([]);
    setManualDate('');
    setManualDateIni('');
    setView('dashboard');
    await loadData();
  }

  function cancelMapping() {
    setView('dashboard');
    setRawRows(null);
    setRawHeaders([]);
    setManualDate('');
    setManualDateIni('');
  }

  async function handleSync() {
    setSyncing(true);
    setError(null);
    setSyncMessage(null);
    const result = await syncPrintwayy();
    setSyncing(false);
    if (!result.success) { setError(`Falha ao sincronizar: ${result.error}`); return; }
    if (result.message) { setSyncMessage(result.message); return; }
    const parts = [`${result.synced} impressora(s) atualizada(s)`];
    if (result.failed) parts.push(`${result.failed} com erro`);
    if (result.notFoundInPrintwayy) parts.push(`${result.notFoundInPrintwayy} não encontrada(s) no PrintWayy`);
    if (result.ambiguous) parts.push(`${result.ambiguous} com serial duplicado no PrintWayy`);
    setSyncMessage(`Sincronização concluída: ${parts.join(', ')}.`);
    await loadData();
  }

  const title = isAdmin ? 'Painel' : `Painel do cliente — ${profile.cliente_associado}`;

  const topbarExtra = isAdmin ? (
    <>
      <button className="cx-btn cx-topbar-btn" onClick={() => setShowSettings((s) => !s)}
        style={{ padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
        <Settings size={14} /> Ajustes
      </button>
      <button className="cx-btn" onClick={handleSync} disabled={syncing}
        style={{ background: TEAL, color: '#fff', padding: '7px 13px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
        <RefreshCw size={14} /> {syncing ? 'Sincronizando...' : 'Sincronizar agora'}
      </button>
      <label className="cx-btn" style={{ background: ORANGE, color: '#fff', padding: '7px 13px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, cursor: 'pointer' }}>
        <Upload size={14} /> Importar
        <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFileSelect} style={{ display: 'none' }} />
      </label>
      <button className="cx-btn cx-topbar-btn" onClick={() => setShowRegisterModal(true)}
        style={{ padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
        <Plus size={14} /> Impressora
      </button>
    </>
  ) : null;

  return (
    <>
    <AppShell profile={profile} isAdmin={isAdmin} view={view} onViewChange={onNavigate} onLogout={onLogout}
      lastSync={lastSync} title={title} topbarExtra={topbarExtra}>

      {error && (
        <div className="no-print" style={{ background: '#FBEAE8', border: '1px solid #E8B4AC', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#7A281E', display: 'flex', justifyContent: 'space-between' }}>
          <span><AlertTriangle size={14} style={{ verticalAlign: -2, marginRight: 6 }} />{error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7A281E' }}><X size={14} /></button>
        </div>
      )}

      {syncMessage && (
        <div className="no-print" style={{ background: '#E7F3F0', border: '1px solid #BFE0D8', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#1F5C4F', display: 'flex', justifyContent: 'space-between' }}>
          <span><RefreshCw size={14} style={{ verticalAlign: -2, marginRight: 6 }} />{syncMessage}</span>
          <button onClick={() => setSyncMessage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1F5C4F' }}><X size={14} /></button>
        </div>
      )}

      {isAdmin && showSettings && (
        <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 8, padding: 16, marginBottom: 18, fontSize: 13 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            Considerar "sem comunicação" após
            <input type="number" min={1} value={commThreshold}
              onChange={(e) => setCommThreshold(Math.max(1, Number(e.target.value) || 1))}
              className="cx-input mono" style={{ width: 56, padding: '4px 8px' }} />
            dias sem nova leitura (só quando a planilha não traz status pronto).
          </label>
        </div>
      )}

      {loading && (
        <div style={{ padding: '56px 0', textAlign: 'center', color: MUTED, fontSize: 13.5 }}>Carregando...</div>
      )}

      {!loading && isAdmin && !hasData && view === 'dashboard' && (
        <div style={{ background: '#fff', border: '1px dashed #C7CCC3', borderRadius: 12, padding: '56px 24px', textAlign: 'center' }}>
          <FileSpreadsheet size={32} color="#9CA3AF" />
          <p style={{ marginTop: 12, fontSize: 14, color: MUTED }}>
            Nenhum dado ainda. Clique em "Sincronizar agora" para importar automaticamente da
            API do PrintWayy, ou exporte a planilha do PrintWayy filtrada para a Cross e importe aqui —<br />
            o mapeamento de colunas é feito no próximo passo.
          </p>
        </div>
      )}

      {!loading && isAdmin && view === 'mapping' && rawRows && (
        <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 10, padding: 20, marginBottom: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginTop: 0 }}>Mapear colunas da planilha</h2>
          <p style={{ fontSize: 13, color: MUTED, marginTop: -4 }}>
            {rawRows.length} linha(s) encontradas. Confirme qual coluna corresponde a cada campo.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginTop: 12 }}>
            {FIELDS.map((f) => (
              <div key={f.key}>
                <label style={{ fontSize: 12, color: MUTED, display: 'block', marginBottom: 4 }}>
                  {f.label}{f.required && <span style={{ color: DANGER }}> *</span>}
                </label>
                <select className="cx-input" style={{ width: '100%' }} value={mapping[f.key] || ''}
                  onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value || undefined }))}>
                  <option value="">— não usar —</option>
                  {rawHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>

          {!mapping.dataLeitura && (
            <div style={{ marginTop: 16, padding: 12, background: '#FFF7EA', border: '1px solid #F0DBAE', borderRadius: 8, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {(mapping.contadorPBIni || mapping.contadorColorIni) && (
                <div>
                  <label style={{ fontSize: 12.5, color: INK, display: 'block', marginBottom: 6, fontWeight: 600 }}>
                    Data de início do período <span style={{ color: DANGER }}>*</span>
                  </label>
                  <input type="date" className="cx-input" style={{ width: 200 }} value={manualDateIni}
                    onChange={(e) => setManualDateIni(e.target.value)} />
                  <div style={{ fontSize: 11.5, color: MUTED, marginTop: 6, maxWidth: 320 }}>
                    Use a data que aparece no título do relatório do PrintWayy (ex: "28/04/2026 a 27/05/2026") — não é a data de hoje nem a data da importação.
                  </div>
                </div>
              )}
              <div>
                <label style={{ fontSize: 12.5, color: INK, display: 'block', marginBottom: 6, fontWeight: 600 }}>
                  {(mapping.contadorPBIni || mapping.contadorColorIni) ? 'Data de fim do período' : 'Data desta leitura'}
                </label>
                <input type="date" className="cx-input" style={{ width: 200 }} value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)} />
                <div style={{ fontSize: 11.5, color: MUTED, marginTop: 6, maxWidth: 320 }}>
                  {(mapping.contadorPBIni || mapping.contadorColorIni)
                    ? 'A outra data do título do relatório. Vazio = usa a data de hoje (normalmente errado aqui).'
                    : 'Vazio = usa a data de hoje.'}
                </div>
              </div>
            </div>
          )}

          <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
            <button className="cx-btn" onClick={confirmMapping} disabled={importing}
              style={{ background: TEAL, color: '#fff', padding: '9px 16px', fontSize: 13.5 }}>
              {importing ? 'Importando...' : 'Confirmar e importar'}
            </button>
            <button className="cx-btn" onClick={cancelMapping} disabled={importing}
              style={{ background: '#fff', border: `1px solid ${LINE}`, padding: '9px 16px', fontSize: 13.5 }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {!loading && view === 'dashboard' && hasData && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
            <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: MUTED }}>Impressoras</div>
              <div className="mono" style={{ fontSize: 26, fontWeight: 600, color: INK, marginTop: 4 }}>{kpis.total}</div>
            </div>

            <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 10, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: MUTED }}>Comunicação</div>
                <div className="mono" style={{ fontSize: 22, fontWeight: 600, color: INK, marginTop: 4 }}>{kpis.online}/{kpis.total}</div>
              </div>
              <MiniDonut data={commPieData} />
            </div>

            <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 10, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: MUTED }}>Tipo de conexão</div>
                <div style={{ fontSize: 11, color: MUTED, marginTop: 4, lineHeight: 1.6 }}>
                  {conexaoData.map((c) => <div key={c.name}>{c.name}: <strong className="mono" style={{ color: INK }}>{c.value}</strong></div>)}
                </div>
              </div>
              <MiniDonut data={conexaoData.map((c, i) => ({ ...c, color: [TEAL, ORANGE, '#9CA3AF'][i % 3] }))} />
            </div>

            <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: MUTED }}>
                Sem monitoramento
              </div>
              <div className="mono" style={{ fontSize: 26, fontWeight: 600, color: ORANGE_DEEP, marginTop: 4 }}>
                {kpis.semMonitoramento}
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 4, color: MUTED }}>Impressoras sem comunicação — há quanto tempo</div>
              <div style={{ fontSize: 11.5, color: '#9CA3AF', marginBottom: 10 }}>
                Ordenadas da mais tempo parada para a mais recente. Conexão USB depende do PC host ligado.
              </div>
              {offlineList.length === 0 ? (
                <div style={{ padding: '30px 0', textAlign: 'center', color: TEAL, fontSize: 13.5 }}>Todas comunicando. Nenhuma parada.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {offlineList.map((p) => {
                    const maxDays = offlineList[0].daysSince || 1;
                    const pct = Math.max(6, Math.round(((p.daysSince || 0) / maxDays) * 100));
                    return (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                        <div style={{ width: 220, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={p.local}>
                          {p.local || p.id}
                        </div>
                        <div style={{ flex: 1, background: '#F5F0EE', borderRadius: 4, height: 16, position: 'relative' }}>
                          <div style={{ width: pct + '%', background: DANGER, height: '100%', borderRadius: 4, opacity: 0.85 }} />
                        </div>
                        <div className="mono" style={{ width: 62, textAlign: 'right', color: DANGER }}>{p.daysSince}d</div>
                        <div style={{ width: 44, fontSize: 10.5, color: MUTED }}>{p.conexao}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {semMonitoramentoList.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 10, padding: 16 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 4, color: MUTED }}>Impressoras sem monitoramento de páginas</div>
                <div style={{ fontSize: 11.5, color: '#9CA3AF', marginBottom: 10 }}>
                  Contador zerado — o PrintWayy não está recebendo leitura de páginas dessas impressoras, mesmo comunicando.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {semMonitoramentoList.map((p) => {
                    const maxDays = semMonitoramentoList[0].daysSince || 1;
                    const pct = Math.max(6, Math.round(((p.daysSince || 0) / maxDays) * 100));
                    return (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                        <div style={{ width: 220, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={p.local}>
                          {p.local || p.id}
                        </div>
                        <div style={{ flex: 1, background: '#FDECD9', borderRadius: 4, height: 16, position: 'relative' }}>
                          <div style={{ width: pct + '%', background: ORANGE, height: '100%', borderRadius: 4, opacity: 0.85 }} />
                        </div>
                        <div className="mono" style={{ width: 62, textAlign: 'right', color: ORANGE }}>{p.daysSince}d</div>
                        <div style={{ width: 44, fontSize: 10.5, color: MUTED }}>{p.conexao}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: '1 1 220px' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: '#9CA3AF' }} />
              <input className="cx-input" style={{ width: '100%', paddingLeft: 30 }} placeholder="Buscar por nome, IP ou modelo..."
                value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            {isAdmin && (
              <select className="cx-input" value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
                {clients.map((c) => <option key={c} value={c}>{c === 'todos' ? 'Todos os clientes' : c}</option>)}
              </select>
            )}
            <span style={{ fontSize: 12.5, color: MUTED }}>{filtered.length} de {kpis.total}</span>
            <button className="cx-btn" onClick={exportCSV}
              style={{ background: '#fff', border: `1px solid ${LINE}`, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <Download size={14} /> Exportar CSV
            </button>
          </div>

          <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 10, overflow: 'hidden' }}>
            <table className="cx-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('comm')}>
                    Status {sortBy === 'comm' && (sortDir === 'asc' ? '▲' : '▼')}
                  </th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('local')}>
                    Local {sortBy === 'local' && (sortDir === 'asc' ? '▲' : '▼')}
                  </th>
                  <th>Modelo</th><th>Conexão</th><th>IP</th>
                  {isAdmin && <th>Cliente</th>}
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('dias')}>
                    Última comunicação {sortBy === 'dias' && (sortDir === 'asc' ? '▲' : '▼')}
                  </th>
                  {hasCounters && <th>Contador</th>}
                </tr>
              </thead>
              <tbody>
                {sorted.map((p) => (
                  <tr key={p.id} onClick={() => setSelectedPrinter(p)} style={{ cursor: 'pointer' }}>
                    <td><StatusDot status={p.comm} /></td>
                    <td style={{ fontWeight: 600, maxWidth: 220, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={p.local}>
                      {p.local || p.id}
                    </td>
                    <td>{p.modelo || '—'}</td>
                    <td>{p.conexao || '—'}</td>
                    <td className="mono">{p.ip || '—'}</td>
                    {isAdmin && <td>{p.cliente}</td>}
                    <td className="mono" style={{ color: p.comm === 'offline' ? DANGER : p.comm === 'sem-monitoramento' ? ORANGE : 'inherit' }}>
                      {p.lastReading ? `${p.lastReading.data} (${p.daysSince}d)` : '—'}
                    </td>
                    {hasCounters && <td className="mono">{p.contador !== null ? p.contador.toLocaleString('pt-BR') : '—'}</td>}
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9CA3AF', padding: 24 }}>
                    Nenhuma impressora encontrada com esse filtro.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          {!hasCounters && (
            <div style={{ marginTop: 14, fontSize: 12, color: '#9CA3AF', display: 'flex', alignItems: 'center', gap: 6 }}>
              <RefreshCw size={12} />
              Este import não traz contador de páginas — a ferramenta está mostrando comunicação e inventário. Para consumo de páginas, exporte do PrintWayy um relatório que inclua a contagem.
            </div>
          )}
        </>
      )}

      {!loading && !isAdmin && !hasData && (
        <div style={{ background: '#fff', border: '1px dashed #C7CCC3', borderRadius: 12, padding: '56px 24px', textAlign: 'center' }}>
          <ShieldCheck size={32} color="#9CA3AF" />
          <p style={{ marginTop: 12, fontSize: 14, color: MUTED }}>Ainda não há dados importados para o seu contrato.</p>
        </div>
      )}

      <div className="no-print" style={{ marginTop: 32, paddingTop: 18, borderTop: `1px solid ${LINE}` }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 28px', fontSize: 12.5, color: INK, fontWeight: 600, marginBottom: 8 }}>
          <span>📞 (27) 99693-8793</span>
          <span>✉️ crosssolucoes@outlook.com</span>
          <span>📍 Av. Raphael Barbosa Brhaim, 847, Guriri Norte, São Mateus – ES | CEP: 29946-610</span>
        </div>
        <div style={{ fontSize: 11, color: MUTED }}>
          CROSS Soluções – CNPJ: 65.404.622/0001-20 | Inscrição Estadual: 084.818.99-9
        </div>
      </div>
    </AppShell>

    {selectedPrinter && (
      <PrinterDetailModal
        printer={selectedPrinter}
        readings={readings}
        isAdmin={isAdmin}
        onClose={() => setSelectedPrinter(null)}
      />
    )}

    {showRegisterModal && (
      <RegisterPrinterModal
        existingPrinters={printers}
        knownClients={clients.filter((c) => c !== 'todos')}
        onClose={() => setShowRegisterModal(false)}
        onSaved={async (id) => {
          setShowRegisterModal(false);
          setSyncMessage(`Impressora ${id} cadastrada.`);
          await loadData();
        }}
      />
    )}
    </>
  );
}
