// O status de comunicação chega por dois caminhos com vocabulário diferente: o sync da
// API grava "Sem comunicação (PrintWayy)"/"Comunicando (PrintWayy)", e um relatório de
// status exportado em planilha pode trazer "offline", "falha de comunicação",
// "desligada". Um regex só cobre os dois.
const OFFLINE_STATUS_RE = /sem comunica|offline|no\s?comm|falha|desligad/i;

export function isOfflineStatus(status) {
  return !!status && OFFLINE_STATUS_RE.test(status);
}

function daysUntilNow(isoDate) {
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / 86400000);
}

// Data da primeira leitura da sequência consecutiva, no fim do histórico, em que
// `condicao` é verdadeira. Serve pra "desde quando está assim" — parada de comunicar ou
// com contador travado em zero. Para no primeiro dia que quebra a sequência, então não
// varre o histórico inteiro.
// Big O: O(leituras da sequência atual), não O(histórico).
function findSinceWhen(list, condicao) {
  let since = null;
  for (let i = list.length - 1; i >= 0; i--) {
    if (!condicao(list[i])) break;
    since = list[i].data;
  }
  return since;
}

// Só leitura com status explícito conta como "sem comunicação" — as importadas de
// planilha vêm com status nulo, e tratar "sem status" como "estava comunicando"
// inventaria um dado que não temos. Na prática o valor não retrocede além da primeira
// sincronização pela API, que é quando passou a existir registro de status dia a dia.
const estaOffline = (r) => isOfflineStatus(r.status);
const contadorZerado = (r) => r.contador_pb === 0;

// Big O: O(impressoras + leituras) — uma passada para agrupar leituras por impressora
// (readings pode chegar a alguns milhares de linhas num parque de dezenas de equipamentos
// com histórico de meses) e outra sobre o cadastro de impressoras.
export function computePrinterStats(printers, readings, commThreshold) {
  const byPrinter = {};
  readings.forEach((r) => {
    (byPrinter[r.printer_id] = byPrinter[r.printer_id] || []).push(r);
  });

  return printers
    // Removida do contrato (troca/devolução): sai do painel. O histórico continua no
    // banco e no relatório de períodos anteriores à saída (ver computeReportRows).
    .filter((printer) => !printer.removida_em)
    .map((printer) => {
      const list = (byPrinter[printer.id] || []).slice().sort((a, b) => (a.data > b.data ? 1 : -1));
      const last = list[list.length - 1];
      const withCounter = list.filter((r) => r.contador_pb !== null && r.contador_pb !== undefined);
      const lastC = withCounter[withCounter.length - 1];
      const daysSince = last ? daysUntilNow(last.data) : null;

      let comm = 'sem-dados';
      if (last) {
        if (last.status) {
          comm = isOfflineStatus(last.status) ? 'offline' : 'online';
        } else if (daysSince !== null) {
          comm = daysSince > commThreshold ? 'offline' : 'online';
        }
      }
      // Contador zerado é sinal de que o PrintWayy não está recebendo leitura de página
      // real dessa impressora — mesmo "comunicando" (pingando), não está monitorando.
      // Não vale pra quem já está offline: aí o contador parado é consequência da falta
      // de comunicação, não um problema separado, e "sem comunicação" é o diagnóstico
      // acionável (era o contrário antes, e escondia impressora parada no bucket errado).
      if (comm !== 'offline' && lastC && lastC.contador_pb === 0) {
        comm = 'sem-monitoramento';
      }
      // A situação na PrintWayy (gravada pelo sync) manda sobre o status da leitura:
      // fora do contrato = não comunica mais NESTE contrato (o contador está congelado);
      // não encontrada = equipamento sem monitoramento, contador lançado à mão.
      if (printer.situacao_printwayy === 'fora-do-contrato') comm = 'offline';
      else if (printer.situacao_printwayy === 'nao-encontrada') comm = 'sem-monitoramento';

      // "Parada há N dias" conta a partir do último contato da impressora com o PrintWayy
      // (lastCommunication), igual à tela do PrintWayy. Sem esse dado (impressora ainda
      // não sincronizada depois da migration 0006, ou importada de planilha), cai na
      // sequência de leituras offline, que não volta antes da primeira sincronização.
      const ultimaComunicacao = printer.ultima_comunicacao || null;
      const offlineSince = comm === 'offline'
        ? (ultimaComunicacao || findSinceWhen(list, estaOffline))
        : null;
      // Contador zerado só é medido sobre leituras que trazem contador — uma leitura sem
      // contador no meio não significa que a impressora voltou a registrar página.
      const zeroSince = comm === 'sem-monitoramento' ? findSinceWhen(withCounter, contadorZerado) : null;

      return {
        ...printer,
        lastReading: last,
        contador: lastC ? lastC.contador_pb : null,
        daysSince,
        comm,
        ultimaComunicacao,
        // Dias desde o último contato com o PrintWayy, que alimenta a coluna "Última
        // comunicação" do painel e o CSV. Não é `daysSince`, que conta desde a última
        // leitura gravada pelo NOSSO sync e é sempre ~0 numa impressora parada há meses.
        diasSemComunicar: ultimaComunicacao ? daysUntilNow(ultimaComunicacao) : null,
        offlineSince,
        offlineDays: offlineSince ? daysUntilNow(offlineSince) : null,
        zeroSince,
        zeroDays: zeroSince ? daysUntilNow(zeroSince) : null,
      };
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
  const latestDate = new Date(latest);
  const daysAgo = Math.floor((Date.now() - latestDate.getTime()) / 86400000);
  // Fixado em America/Sao_Paulo (não o fuso do navegador) pra bater com o horário do
  // cron (07h-18h BRT, ver CLAUDE.md) mesmo se alguém abrir o painel de outro fuso.
  const time = latestDate.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  return { date: latest.slice(0, 10), time, daysAgo };
}

// Quem não respondeu na última sincronização. Ordena da parada há mais tempo pra mais
// recente; com o sync rodando de hora em hora o normal é várias empatarem no mesmo dia,
// então desempata pelo ponto físico — sem isso a lista trocava de ordem a cada refresh.
export function computeOfflineList(stats) {
  return stats
    .filter((p) => p.comm === 'offline')
    .sort((a, b) => (b.offlineDays || 0) - (a.offlineDays || 0)
      || (a.local || a.id).localeCompare(b.local || b.id));
}

// Comunica mas não registra página (contador travado em zero). Mesma ordenação da lista
// de offline: mais tempo no estado primeiro, desempate por ponto físico pra não embaralhar
// a cada refresh.
export function computeSemMonitoramentoList(stats) {
  return stats
    .filter((p) => p.comm === 'sem-monitoramento')
    .sort((a, b) => (b.zeroDays || 0) - (a.zeroDays || 0)
      || (a.local || a.id).localeCompare(b.local || b.id));
}

export function computeConexaoData(stats) {
  const counts = {};
  stats.forEach((p) => {
    const key = p.conexao || 'Não informado';
    counts[key] = (counts[key] || 0) + 1;
  });
  return Object.entries(counts).map(([name, value]) => ({ name, value }));
}
