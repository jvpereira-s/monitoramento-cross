export function formatDateBR(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// Big O: O(impressoras do cliente × leituras por impressora) — para cada impressora do
// contrato, filtra o próprio histórico em duas passadas (leituras <= início, leituras <=
// fim) para achar a leitura de fronteira de cada ponta do período. Validado contra o PDF
// real do PrintWayy: bate exatamente (total geral 52.494 páginas no período 28/04–27/05/2026).
export function computeReportRows(printers, readings, client, start, end) {
  if (!client) return [];
  const printersOfClient = printers.filter((p) => p.cliente === client);
  const byPrinter = {};
  readings.forEach((r) => {
    (byPrinter[r.printer_id] = byPrinter[r.printer_id] || []).push(r);
  });

  return printersOfClient
    .map((p) => {
      const list = (byPrinter[p.id] || []).slice().sort((a, b) => (a.data > b.data ? 1 : -1));
      const beforeStart = list.filter((r) => r.data <= start);
      const beforeEnd = list.filter((r) => r.data <= end);
      const iniReading = beforeStart.length ? beforeStart[beforeStart.length - 1] : (beforeEnd.length ? beforeEnd[0] : null);
      const finReading = beforeEnd.length ? beforeEnd[beforeEnd.length - 1] : null;

      const iniPB = iniReading && iniReading.contador_pb != null ? iniReading.contador_pb : null;
      const finPB = finReading && finReading.contador_pb != null ? finReading.contador_pb : null;
      const iniColor = iniReading && iniReading.contador_color != null ? iniReading.contador_color : null;
      const finColor = finReading && finReading.contador_color != null ? finReading.contador_color : null;

      const totalPB = (finPB !== null && iniPB !== null) ? Math.max(0, finPB - iniPB) : null;
      const totalColor = (finColor !== null && iniColor !== null) ? Math.max(0, finColor - iniColor) : null;

      return { ...p, iniPB, finPB, totalPB, iniColor, finColor, totalColor, hasData: !!finReading };
    })
    .sort((a, b) => (a.local || a.id).localeCompare(b.local || b.id));
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
