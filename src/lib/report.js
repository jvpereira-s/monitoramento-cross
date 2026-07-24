export function formatDateBR(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toISODate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

// Presets de período pro seletor de datas do relatório — mês e trimestre, atual e
// anterior. Mês/trimestre "atual" usa o mês/trimestre calendário inteiro (não só até
// hoje): como computeReportRows já limita a leitura mais recente <= data final, pedir
// o mês cheio dá o mesmo resultado que pedir só até hoje, sem precisar de caso especial.
export function currentMonthRange(today = new Date()) {
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return { start: toISODate(start), end: toISODate(end) };
}

export function previousMonthRange(today = new Date()) {
  const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const end = new Date(today.getFullYear(), today.getMonth(), 0);
  return { start: toISODate(start), end: toISODate(end) };
}

export function currentQuarterRange(today = new Date()) {
  const quarter = Math.floor(today.getMonth() / 3);
  const start = new Date(today.getFullYear(), quarter * 3, 1);
  const end = new Date(today.getFullYear(), quarter * 3 + 3, 0);
  return { start: toISODate(start), end: toISODate(end) };
}

export function previousQuarterRange(today = new Date()) {
  const quarter = Math.floor(today.getMonth() / 3) - 1;
  const year = quarter < 0 ? today.getFullYear() - 1 : today.getFullYear();
  const normalizedQuarter = quarter < 0 ? 3 : quarter;
  const start = new Date(year, normalizedQuarter * 3, 1);
  const end = new Date(year, normalizedQuarter * 3 + 3, 0);
  return { start: toISODate(start), end: toISODate(end) };
}

function groupByPrinter(readings) {
  const byPrinter = {};
  readings.forEach((r) => {
    (byPrinter[r.printer_id] = byPrinter[r.printer_id] || []).push(r);
  });
  return byPrinter;
}

// Acha a leitura de fronteira em cada ponta do período (duas passadas sobre o histórico
// já ordenado de uma impressora) e deriva o total do período por diferença de contador.
// Isolado de computeReportRows/computeMonthlyTotals porque os dois precisam do mesmo
// cálculo, só que agregado de formas diferentes (por impressora vs. somado no parque).
function periodCounters(list, start, end) {
  const beforeStart = list.filter((r) => r.data <= start);
  const beforeEnd = list.filter((r) => r.data <= end);
  const iniReading = beforeStart.length ? beforeStart[beforeStart.length - 1] : (beforeEnd.length ? beforeEnd[0] : null);
  const finReading = beforeEnd.length ? beforeEnd[beforeEnd.length - 1] : null;

  const iniPB = iniReading && iniReading.contador_pb != null ? iniReading.contador_pb : null;
  const finPB = finReading && finReading.contador_pb != null ? finReading.contador_pb : null;
  const iniColor = iniReading && iniReading.contador_color != null ? iniReading.contador_color : null;
  const finColor = finReading && finReading.contador_color != null ? finReading.contador_color : null;

  return {
    iniPB, finPB, iniColor, finColor,
    totalPB: (finPB !== null && iniPB !== null) ? Math.max(0, finPB - iniPB) : null,
    totalColor: (finColor !== null && iniColor !== null) ? Math.max(0, finColor - iniColor) : null,
    hasData: !!finReading,
  };
}

// Big O: O(impressoras do cliente × leituras por impressora) — para cada impressora do
// contrato, filtra o próprio histórico em duas passadas (leituras <= início, leituras <=
// fim) para achar a leitura de fronteira de cada ponta do período. Validado contra o PDF
// real do PrintWayy: bate exatamente (total geral 52.494 páginas no período 28/04–27/05/2026).
export function computeReportRows(printers, readings, client, start, end) {
  if (!client) return [];
  const printersOfClient = printers.filter((p) => p.cliente === client);
  const byPrinter = groupByPrinter(readings);

  return printersOfClient
    .map((p) => {
      const list = (byPrinter[p.id] || []).slice().sort((a, b) => (a.data > b.data ? 1 : -1));
      return { ...p, ...periodCounters(list, start, end) };
    })
    .sort((a, b) => (a.local || a.id).localeCompare(b.local || b.id));
}

// Soma o total de páginas do parque informado (já filtrado por cliente, se for o caso)
// pro mês passado (fechado) e pro mês corrente (em andamento) — alimenta os cards
// "Páginas mês passado"/"Páginas este mês" do Painel.
export function computeMonthlyTotals(printers, readings, today = new Date()) {
  const prev = previousMonthRange(today);
  const curr = currentMonthRange(today);
  const byPrinter = groupByPrinter(readings);

  return printers.reduce((acc, p) => {
    const list = (byPrinter[p.id] || []).slice().sort((a, b) => (a.data > b.data ? 1 : -1));
    acc.lastMonth += periodCounters(list, prev.start, prev.end).totalPB || 0;
    acc.currentMonth += periodCounters(list, curr.start, curr.end).totalPB || 0;
    return acc;
  }, { lastMonth: 0, currentMonth: 0 });
}

function printerTotalThisMonth(p, byPrinter, start, end) {
  const list = (byPrinter[p.id] || []).slice().sort((a, b) => (a.data > b.data ? 1 : -1));
  return periodCounters(list, start, end).totalPB || 0;
}

// Ranking "maior consumo" pro gráfico do Painel — top 8 impressoras por páginas no mês
// corrente. Substitui o antigo computeTopConsumo (removido junto do "Delta período":
// comparava só as duas últimas leituras de cada impressora, sem recorte de data real,
// podendo ser um dia ou um trimestre de diferença sem indicação nenhuma na tela). Esta
// versão usa o mesmo cálculo de fronteira do mês corrente que os cards "Páginas mês
// passado/este mês" já usam — período real, não ambíguo.
export function computeTopConsumo(printers, readings, today = new Date()) {
  const { start, end } = currentMonthRange(today);
  const byPrinter = groupByPrinter(readings);
  return printers
    .map((p) => ({ id: p.id, paginas: printerTotalThisMonth(p, byPrinter, start, end) }))
    .filter((p) => p.paginas > 0)
    .sort((a, b) => b.paginas - a.paginas)
    .slice(0, 8)
    .map((p) => ({ name: p.id.length > 14 ? p.id.slice(0, 13) + '…' : p.id, paginas: p.paginas }));
}

// Mesma ideia do computeTopConsumo, mas agrupado por cliente em vez de por impressora —
// usado na visão "todos os clientes", onde listar equipamento por S/N não faz sentido.
export function computeTopClientes(printers, readings, today = new Date()) {
  const { start, end } = currentMonthRange(today);
  const byPrinter = groupByPrinter(readings);
  const totals = {};
  printers.forEach((p) => {
    const paginas = printerTotalThisMonth(p, byPrinter, start, end);
    if (paginas > 0) totals[p.cliente] = (totals[p.cliente] || 0) + paginas;
  });
  return Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, paginas]) => ({ name, paginas }));
}

export function computeReportTotals(reportRows) {
  return reportRows.reduce((acc, r) => ({
    pb: acc.pb + (r.totalPB || 0),
    color: acc.color + (r.totalColor || 0),
  }), { pb: 0, color: 0 });
}

// Big O: O(leituras dentro do período) — uma passada por impressora do relatório sobre seu
// próprio histórico já filtrado ao período, somando o delta dia a dia (alimenta o gráfico
// "páginas por dia").
export function computeDailyTrend(reportRows, readings, start, end) {
  const byPrinter = {};
  readings.forEach((r) => {
    (byPrinter[r.printer_id] = byPrinter[r.printer_id] || []).push(r);
  });
  const byDate = {};
  reportRows.forEach((p) => {
    const list = (byPrinter[p.id] || []).slice().sort((a, b) => (a.data > b.data ? 1 : -1))
      .filter((r) => r.data >= start && r.data <= end);
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1];
      const cur = list[i];
      const dPB = (cur.contador_pb != null && prev.contador_pb != null) ? Math.max(0, cur.contador_pb - prev.contador_pb) : 0;
      const dColor = (cur.contador_color != null && prev.contador_color != null) ? Math.max(0, cur.contador_color - prev.contador_color) : 0;
      byDate[cur.data] = (byDate[cur.data] || 0) + dPB + dColor;
    }
  });
  return Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, total]) => ({ date: formatDateBR(date), total }));
}
