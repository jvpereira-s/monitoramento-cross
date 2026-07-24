// Big O: O(impressoras + leituras) — uma passada para agrupar leituras por impressora
// (readings pode chegar a alguns milhares de linhas num parque de dezenas de equipamentos
// com histórico de meses) e outra sobre o cadastro de impressoras.
export function computePrinterStats(printers, readings, commThreshold) {
  const byPrinter = {};
  readings.forEach((r) => {
    (byPrinter[r.printer_id] = byPrinter[r.printer_id] || []).push(r);
  });

  return printers
    .map((printer) => {
      const list = (byPrinter[printer.id] || []).slice().sort((a, b) => (a.data > b.data ? 1 : -1));
      const last = list[list.length - 1];
      const withCounter = list.filter((r) => r.contador_pb !== null && r.contador_pb !== undefined);
      const lastC = withCounter[withCounter.length - 1];
      const daysSince = last ? Math.floor((Date.now() - new Date(last.data).getTime()) / 86400000) : null;

      let comm = 'sem-dados';
      if (last) {
        if (last.status) {
          comm = /sem comunica|offline|no\s?comm|falha|desligad/i.test(last.status) ? 'offline' : 'online';
        } else if (daysSince !== null) {
          comm = daysSince > commThreshold ? 'offline' : 'online';
        }
      }
      // Contador zerado é sinal de que o PrintWayy não está recebendo leitura de página
      // real dessa impressora — mesmo "comunicando" (pingando), não está monitorando.
      if (lastC && lastC.contador_pb === 0) {
        comm = 'sem-monitoramento';
      }

      return { ...printer, lastReading: last, contador: lastC ? lastC.contador_pb : null, daysSince, comm };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function computeKpis(stats) {
  const total = stats.length;
  const online = stats.filter((p) => p.comm === 'online').length;
  const offline = stats.filter((p) => p.comm === 'offline').length;
  const semMonitoramento = stats.filter((p) => p.comm === 'sem-monitoramento').length;
  const semDados = stats.filter((p) => p.comm === 'sem-dados').length;
  return { total, online, offline, semMonitoramento, semDados };
}

export function computeLastSync(stats, readings) {
  const relevantIds = new Set(stats.map((p) => p.id));
  const dates = readings
    .filter((r) => relevantIds.has(r.printer_id) && r.imported_at)
    .map((r) => r.imported_at);
  if (!dates.length) return null;
  const latest = dates.sort().slice(-1)[0];
  const daysAgo = Math.floor((Date.now() - new Date(latest).getTime()) / 86400000);
  return { date: latest.slice(0, 10), daysAgo };
}

export function computeOfflineList(stats) {
  return stats.filter((p) => p.comm === 'offline').sort((a, b) => (b.daysSince || 0) - (a.daysSince || 0));
}

export function computeSemMonitoramentoList(stats) {
  return stats.filter((p) => p.comm === 'sem-monitoramento').sort((a, b) => (b.daysSince || 0) - (a.daysSince || 0));
}

export function computeConexaoData(stats) {
  const counts = {};
  stats.forEach((p) => {
    const key = p.conexao || 'Não informado';
    counts[key] = (counts[key] || 0) + 1;
  });
  return Object.entries(counts).map(([name, value]) => ({ name, value }));
}
