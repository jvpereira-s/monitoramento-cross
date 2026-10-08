export function formatDateBR(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// Timestamp ISO (UTC) → "dd/mm/aaaa às hh:mm" no fuso de Brasília, fixo, para não
// depender do fuso do navegador. Usado na última comunicação com o PrintWayy.
export function formatDateTimeBR(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const opts = { timeZone: 'America/Sao_Paulo' };
  const date = d.toLocaleDateString('pt-BR', { ...opts, day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = d.toLocaleTimeString('pt-BR', { ...opts, hour: '2-digit', minute: '2-digit' });
  return `${date} às ${time}`;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toISODate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

// Dia do mês em que o contrato fecha. Contrato 049/2026: SEMPRE dia 02. O relatório
// oficial de "SETEMBRO/2026" é contador(02/10) − contador(02/09). Mesmo valor de
// DIA_FECHAMENTO em supabase/functions/printwayy-sync/discovery.ts, que grava a leitura
// histórica desse dia direto da PrintWayy.
export const DIA_FECHAMENTO = 2;

// Presets de período do seletor do relatório: mês e trimestre de FATURAMENTO, atual e
// anterior. O mês MM é o ciclo [02/MM, 02/MM+1].
//
// O fim é o dia de corte do ciclo SEGUINTE, não o último dia do ciclo, porque o contador
// é lido em snapshots: o consumo de setembro é contador(02/10) − contador(02/09). Com fim
// em 01/10, computeReportRows pegaria a leitura errada de fechamento. A fronteira 02/10
// fecha setembro e abre outubro ao mesmo tempo, sem contar duas vezes (é diferença de
// contadores).
//
// No ciclo em andamento o fim fica no futuro. Não tem problema: computeReportRows usa a
// leitura mais recente até a data final, que dá o mesmo resultado de "até hoje".
function cutDate(year, monthIndex) {
  return new Date(year, monthIndex, DIA_FECHAMENTO);
}

// Mês (índice JS, pode ser negativo/>11 — Date normaliza) em que começa o ciclo de hoje.
function currentCycleMonth(today) {
  return today.getDate() >= DIA_FECHAMENTO ? today.getMonth() : today.getMonth() - 1;
}

function range(year, startMonth, months) {
  return { start: toISODate(cutDate(year, startMonth)), end: toISODate(cutDate(year, startMonth + months)) };
}

export function currentMonthRange(today = new Date()) {
  return range(today.getFullYear(), currentCycleMonth(today), 1);
}

export function previousMonthRange(today = new Date()) {
  return range(today.getFullYear(), currentCycleMonth(today) - 1, 1);
}

// Trimestre de faturamento: ciclos de jan–mar, abr–jun, jul–set, out–dez.
// Math.floor com mês negativo (ciclo de dezembro visto em 01/01) cai no trimestre -1, e
// o Date normaliza para out/ano anterior.
export function currentQuarterRange(today = new Date()) {
  return range(today.getFullYear(), Math.floor(currentCycleMonth(today) / 3) * 3, 3);
}

export function previousQuarterRange(today = new Date()) {
  return range(today.getFullYear(), Math.floor(currentCycleMonth(today) / 3) * 3 - 3, 3);
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
  // Removida do contrato (troca/devolução) ainda conta em períodos que começam antes da
  // saída, porque o histórico vale. Em período posterior ela não aparece, do mesmo jeito
  // que o relatório oficial lista só os equipamentos ativos no ciclo.
  const printersOfClient = printers.filter((p) => p.cliente === client && (!p.removida_em || p.removida_em > start));
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

function printerTotalInRange(p, byPrinter, start, end) {
  const list = (byPrinter[p.id] || []).slice().sort((a, b) => (a.data > b.data ? 1 : -1));
  return periodCounters(list, start, end).totalPB || 0;
}

// Ranking "maior consumo" pro gráfico do Painel — top 8 impressoras por páginas no mês
// ANTERIOR (fechado), não no corrente: o mês em andamento é parcial e o mês fechado é o
// número de referência (faturamento). Usa o mesmo cálculo de fronteira do card "Páginas
// mês passado" (previousMonthRange, que já captura o snapshot de fechamento no 1º dia do
// mês seguinte) — período real, não ambíguo.
export function computeTopConsumo(printers, readings, today = new Date()) {
  const { start, end } = previousMonthRange(today);
  const byPrinter = groupByPrinter(readings);
  return printers
    .map((p) => ({ id: p.id, paginas: printerTotalInRange(p, byPrinter, start, end) }))
    .filter((p) => p.paginas > 0)
    .sort((a, b) => b.paginas - a.paginas)
    .slice(0, 8)
    .map((p) => ({ name: p.id.length > 14 ? p.id.slice(0, 13) + '…' : p.id, paginas: p.paginas }));
}

// Mesma ideia do computeTopConsumo (mês anterior fechado), mas agrupado por cliente em
// vez de por impressora — usado na visão "todos os clientes", onde listar equipamento
// por S/N não faz sentido.
export function computeTopClientes(printers, readings, today = new Date()) {
  const { start, end } = previousMonthRange(today);
  const byPrinter = groupByPrinter(readings);
  const totals = {};
  printers.forEach((p) => {
    const paginas = printerTotalInRange(p, byPrinter, start, end);
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
