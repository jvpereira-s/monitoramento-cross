// Decisões puras da sincronização com o PrintWayy — separadas do index.ts, que cuida do
// I/O (fetch na API, escrita no Postgres). Dois motivos: aqui mora a parte perigosa
// (decidir a qual `cliente` uma impressora nova pertence — errar significa mostrar dado
// de um contrato na tela de outro) e, sem Deno nem rede no caminho, o vitest consegue
// testar essa parte de verdade (ver discovery.test.ts, nesta mesma pasta).

export const STATUS_TEXT_OFFLINE = 'Sem comunicação (PrintWayy)';
export const STATUS_TEXT_ONLINE = 'Comunicando (PrintWayy)';
// notMonitored/unknown caem no bucket "offline" existente (decisão do produto — sem
// bucket visual novo). countManual/inDealer ficam de fora do Set e caem no branch
// "online" por omissão. Reaproveitado também em pickActive(), pra escolher o registro
// "vivo" quando a busca por serial devolve mais de um resultado.
export const OFFLINE_API_STATUSES = new Set(['offline', 'notMonitored', 'unknown']);
export const CONEXAO_MAP: Record<string, string> = { usb: 'USB', network: 'Rede' };

export interface PrintwayyPrinter {
  id: string; // UUID do PrintWayy — usado só pra chamar /counters
  type: 'usb' | 'network' | 'unknown';
  serialNumber: string; // == nossa printers.id
  status: string;
  model?: string;
  ipAddress?: string;
  installationPoint?: string;
  observation?: string;
  // Último contato da impressora com o PrintWayy (ISO 8601, UTC). Confirmado na API real
  // em 08/10/2026 — é o "Última comunicação" que a tela do PrintWayy mostra, e é o que a
  // Cross mostra (nunca o horário do nosso sync).
  lastCommunication?: string | null;
  // Não usado pra decidir o campo `cliente` — esse é dado nosso, definido pelo admin no
  // cadastro. `customer.id` é usado, sim, mas só como chave de agrupamento: quem diz a
  // qual cliente ele corresponde é o nosso cadastro (ver observeCustomers).
  customer: { id: string; name: string } | null;
  location: { department?: string; address?: unknown } | null;
}

export interface CounterEntry {
  type: string;
  dateOfCapture: string;
  totalCount: number;
}

// Impressora já cadastrada em `printers` por nós — é essa lista (não o parque da
// PrintWayy) que define o escopo de quem entra na sincronização de contadores.
export interface RegisteredPrinter {
  id: string; // serial number, nossa PK
  cliente: string;
}

// Onde a impressora está na PrintWayy em relação ao contrato (coluna
// printers.situacao_printwayy, migration 0006).
export type SituacaoPrintwayy = 'contrato' | 'fora-do-contrato' | 'nao-encontrada';

// Resultado da resolução de UMA impressora cadastrada contra a API (fase 1 do sync).
export interface ResolvedPrinter {
  reg: RegisteredPrinter;
  printer: PrintwayyPrinter | null;
  reading: ReadingRow | null;
  error: string | null;
  situacao?: SituacaoPrintwayy;
}

export interface PrinterRow {
  id: string;
  cliente: string;
  modelo: string | null;
  ip: string | null;
  conexao: string | null;
  ultima_comunicacao: string | null;
  situacao_printwayy: SituacaoPrintwayy;
  updated_at: string;
}

// Linha mínima pra impressora fora do contrato: só registra a situação. Modelo, IP e
// última comunicação ficam no último valor do contrato. O que a PrintWayy mostra agora é
// a instalação em OUTRO cliente, e o cliente do nosso contrato lê `printers` via RLS.
export interface PrinterSituacaoRow {
  id: string;
  cliente: string;
  situacao_printwayy: SituacaoPrintwayy;
  updated_at: string;
}

// Leitura de fechamento: contador histórico da PrintWayy numa data de corte. Sem
// `status` de propósito: o upsert não sobrescreve o status já gravado naquele dia.
export interface FechamentoRow {
  printer_id: string;
  data: string;
  contador_pb: number | null;
  contador_color: number | null;
  imported_at: string;
}

export interface ReadingRow {
  printer_id: string;
  data: string;
  contador_pb: number | null;
  contador_color: number | null;
  status: string;
  imported_at: string;
}

// O que o cadastro atual revela sobre um customer da PrintWayy: quais `cliente` nossos
// aparecem nas impressoras que pertencem a ele (idealmente exatamente um) e como a
// PrintWayy o chama (rótulo administrativo, nunca exibido a cliente).
export interface ObservedCustomer {
  clientes: Set<string>;
  name: string | null;
}

// Linha de public.printwayy_customers.
export interface CustomerConfig {
  printwayy_customer_id: string;
  cliente: string;
  auto_registrar: boolean;
}

export interface SkippedCustomer {
  customer: string;
  code: 'ambiguo' | 'desligado';
  reason: string;
}

export interface DiscoveryPlan {
  eligible: Array<{ customerId: string; cliente: string; label: string }>;
  skipped: SkippedCustomer[];
}

// Quando a busca por serial devolve mais de um registro (cenário de reset de contador
// documentado no MANUTENCAO.md, seção 5: PrintWayy mantém o registro antigo desativado
// junto do novo pro mesmo serial), prefere o que não estiver com status de desativação.
// Best-effort: só visto na documentação, não confirmado contra um caso real de duplicata
// ainda — se nenhum "vivo" for encontrado, cai no primeiro item mesmo assim.
export function pickActive(candidates: PrintwayyPrinter[]): PrintwayyPrinter {
  return candidates.find((c) => !OFFLINE_API_STATUSES.has(c.status)) ?? candidates[0];
}

// `cliente` vem do nosso próprio cadastro, nunca do customer.name da PrintWayy — e
// precisa estar presente no payload (Postgres valida a constraint not null da linha
// candidata em INSERT ... ON CONFLICT DO UPDATE antes mesmo de checar se vai conflitar;
// omitir a coluna quebra mesmo quando a intenção é só atualizar). Passar o valor já
// existente de volta é o jeito de satisfazer a constraint sem de fato mudar o dado.
//
// `local` e `departamento` também propositalmente fora do payload — mas por um motivo
// diferente de `cliente`: as duas são nullable, então omitir a chave não esbarra no
// problema do not null acima, só faz o upsert não tocar nelas mesmo (comportamento que
// queremos). `local` é o ponto físico exato (ex: "ESF São Sebastião", "Recepção") e
// `departamento` é a unidade administrativa (ex: "Secretaria Municipal de Saúde") —
// ambos dado nosso, mantidos pelo admin, sem equivalente confiável na API:
// `installationPoint` é o nome técnico da máquina ligada à impressora (ex:
// "PC-RECEPCAO01"), não o nome do local/setor pro usuário. Escrever isso por cima do
// dado real já causou confusão uma vez.
export function toPrinterRow(p: PrintwayyPrinter, cliente: string, now = new Date()): PrinterRow {
  return {
    id: p.serialNumber.trim(),
    cliente,
    modelo: p.model || null,
    ip: p.ipAddress || null,
    conexao: CONEXAO_MAP[p.type] || null,
    ultima_comunicacao: p.lastCommunication || null,
    situacao_printwayy: 'contrato',
    updated_at: now.toISOString(),
  };
}

export function toSituacaoRow(reg: RegisteredPrinter, situacao: SituacaoPrintwayy, now = new Date()): PrinterSituacaoRow {
  return { id: reg.id, cliente: reg.cliente, situacao_printwayy: situacao, updated_at: now.toISOString() };
}

// A3 (a3BlackAndWhite/a3Color) e os demais tipos (scan, colorLevelXCoverage) ficam de
// fora do total por decisão do produto, porque não há impressora A3 no parque hoje. O
// relatório oficial do contrato também conta só blackAndWhite (conferido contra a API em
// 08/10/2026: 36 de 36 bateram usando só esse tipo).
function pickCounters(counters: CounterEntry[]) {
  return {
    contador_pb: counters.find((c) => c.type === 'blackAndWhite')?.totalCount ?? null,
    contador_color: counters.find((c) => c.type === 'color')?.totalCount ?? null,
  };
}

// A impressora pertence ao contrato só se o customer dela na PrintWayy for um customer
// que a tabela de vínculo liga ao MESMO `cliente` do nosso cadastro. Um equipamento
// movido na PrintWayy para outro customer (outra prefeitura, por exemplo) ou para o
// estoque (`inDealer`, customer nulo) sai do contrato. Continuar lendo o contador dele
// somaria no nosso cliente o que outro cliente imprimiu. Já aconteceu com dois
// seriais em 2026: o relatório oficial congelava o contador e o sistema não.
// Big O: O(1).
export function classifyPrinter(
  p: PrintwayyPrinter,
  reg: RegisteredPrinter,
  config: Map<string, CustomerConfig>,
): SituacaoPrintwayy {
  const customerId = p.customer?.id;
  if (!customerId) return 'fora-do-contrato';
  return config.get(customerId)?.cliente === reg.cliente ? 'contrato' : 'fora-do-contrato';
}

// Contador histórico (`/counters?date=D`) vira a leitura do dia D. A PrintWayy devolve a
// última captura até D, e é esse o número do relatório oficial. Conferido em 08/10/2026:
// 36 de 36 impressoras do contrato bateram em 02/09 e 02/10. A leitura "ao vivo" das
// 18h não basta: impressora USB manda captura atrasada, e uma delas apareceu 4 páginas
// abaixo do relatório.
export function toFechamentoRow(
  p: PrintwayyPrinter,
  counters: CounterEntry[],
  date: string,
  now = new Date(),
): FechamentoRow {
  return { printer_id: p.serialNumber.trim(), data: date, ...pickCounters(counters), imported_at: now.toISOString() };
}

// Dia do mês em que o contrato fecha (contador inicial/final do relatório oficial).
// Contrato 049/2026: sempre dia 02. Mesmo valor de DIA_FECHAMENTO em src/lib/report.js.
export const DIA_FECHAMENTO = 2;
// Por quantos dias depois do fechamento o sync ainda regrava a leitura dele. Captura de
// impressora USB chega atrasada, então o valor de D só fica definitivo dias depois.
export const JANELA_FECHAMENTO_DIAS = 7;

// Data de fechamento que ainda pode mudar hoje, ou null fora da janela.
// `today` em AAAA-MM-DD (calendário de Brasília, ver todayInBrazil).
// Big O: O(1).
export function fechamentoPendente(
  today: string,
  dia = DIA_FECHAMENTO,
  janela = JANELA_FECHAMENTO_DIAS,
): string | null {
  const [y, m, d] = today.split('-').map(Number);
  const todayUtc = Date.UTC(y, m - 1, d);
  // Fechamento deste mês, ou do anterior se hoje ainda é antes do dia de corte.
  const corte = d >= dia ? Date.UTC(y, m - 1, dia) : Date.UTC(y, m - 2, dia);
  const diff = Math.round((todayUtc - corte) / 86400000);
  if (diff < 0 || diff > janela) return null;
  return new Date(corte).toISOString().slice(0, 10);
}

export function toReadingRow(
  p: PrintwayyPrinter,
  counters: CounterEntry[],
  today: string,
  now = new Date(),
): ReadingRow {
  return {
    printer_id: p.serialNumber.trim(),
    data: today,
    ...pickCounters(counters),
    status: OFFLINE_API_STATUSES.has(p.status) ? STATUS_TEXT_OFFLINE : STATUS_TEXT_ONLINE,
    // Precisa estar no payload: o upsert é ON CONFLICT (printer_id, data) DO UPDATE e,
    // como o sync grava sempre a MESMA data (hoje), toda sync depois da primeira do dia
    // cai no UPDATE. Sem `imported_at` aqui, o timestamp ficava congelado no horário do
    // primeiro sync do dia (o default now() só vale no INSERT), e a badge "Atualizado
    // às HH:MMh" (max(imported_at) em computeLastSync) travava no 07h do primeiro cron.
    imported_at: now.toISOString(),
  };
}

// Data em calendário de Brasília, não UTC — importante porque o botão "Sincronizar
// agora" pode ser clicado a qualquer hora do dia (não só no horário fixo do cron).
// Calcular em UTC faria uma leitura entre ~21h e 23h59 (horário de Brasília) cair na
// data de amanhã. formatToParts em vez de parsear .format() evita depender do
// separador exato que a locale devolve.
export function todayInBrazil(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

// Aprende o vínculo customer↔cliente a partir do cadastro que JÁ existe: cada impressora
// nossa resolvida na API diz a qual customer da PrintWayy pertence, e o `cliente` dela é
// dado nosso. O par sai sempre desse cruzamento — `customer.name` nunca entra na decisão,
// só acompanha como rótulo pro admin identificar a linha.
// Big O: O(impressoras cadastradas).
export function observeCustomers(results: ResolvedPrinter[]): Map<string, ObservedCustomer> {
  const observed = new Map<string, ObservedCustomer>();
  for (const r of results) {
    const customer = r.printer?.customer;
    if (!customer?.id) continue;
    const entry = observed.get(customer.id) ?? { clientes: new Set<string>(), name: customer.name ?? null };
    entry.clientes.add(r.reg.cliente);
    observed.set(customer.id, entry);
  }
  return observed;
}

// Linhas NOVAS pra gravar em printwayy_customers. O vínculo só é aprendido pra `cliente`
// que ainda não tem nenhum, e só pelo customer que tem a MAIORIA ESTRITA das
// impressoras daquele cliente resolvidas nesta execução.
//
// A regra antiga ("todo customer observado vira vínculo do cliente da impressora") foi
// contaminada em produção: uma impressora movida na PrintWayy para outra prefeitura
// ensinou "essa prefeitura também é do Fundo". Três customers alheios ficaram ligados ao
// mesmo cliente, e com o cadastro automático ligado o sync importaria o parque deles. Uma
// impressora isolada não vence a maioria, e um cliente já vinculado nunca ganha segundo
// customer sozinho: isso é decisão do admin, por SQL.
// `auto_registrar` fica fora do payload de propósito: é o switch do admin (DEFAULT false).
// Big O: O(impressoras resolvidas).
export function learnMappings(
  results: ResolvedPrinter[],
  config: Map<string, CustomerConfig>,
  now = new Date(),
) {
  const clientesVinculados = new Set([...config.values()].map((c) => c.cliente));
  const porCliente = new Map<string, { total: number; customers: Map<string, { n: number; name: string | null }> }>();
  for (const r of results) {
    if (!r.printer || clientesVinculados.has(r.reg.cliente)) continue;
    const entry = porCliente.get(r.reg.cliente) ?? { total: 0, customers: new Map() };
    entry.total++;
    const id = r.printer.customer?.id;
    if (id) {
      const c = entry.customers.get(id) ?? { n: 0, name: r.printer.customer?.name ?? null };
      c.n++;
      entry.customers.set(id, c);
    }
    porCliente.set(r.reg.cliente, entry);
  }

  const rows = [];
  for (const [cliente, { total, customers }] of porCliente) {
    for (const [id, { n, name }] of customers) {
      if (n * 2 > total) {
        rows.push({ printwayy_customer_id: id, cliente, printwayy_customer_name: name, updated_at: now.toISOString() });
      }
    }
  }
  return rows;
}

// Decide de quais contratos o sync pode cadastrar impressora nova. Conservador por
// desenho: na dúvida, não cadastra e relata — uma impressora que demora a aparecer é um
// aborrecimento, uma impressora no contrato errado é vazamento de dado entre clientes.
export function planDiscovery(
  observed: Map<string, ObservedCustomer>,
  config: Map<string, CustomerConfig>,
): DiscoveryPlan {
  const eligible: DiscoveryPlan['eligible'] = [];
  const skipped: SkippedCustomer[] = [];

  for (const [customerId, info] of observed) {
    const label = info.name ?? customerId;
    if (info.clientes.size !== 1) {
      skipped.push({
        customer: label,
        code: 'ambiguo',
        reason: `vinculado a ${info.clientes.size} clientes diferentes no cadastro`,
      });
      continue;
    }
    if (config.get(customerId)?.auto_registrar === false) {
      skipped.push({ customer: label, code: 'desligado', reason: 'cadastro automático desligado' });
      continue;
    }
    eligible.push({ customerId, cliente: [...info.clientes][0], label });
  }
  return { eligible, skipped };
}

// Mesmo cenário de serial duplicado que pickActive() resolve na sincronização normal
// (registro antigo desativado convivendo com o novo após reset de contador) — aqui ele
// importa mais: sem isso a descoberta tentaria cadastrar o mesmo serial duas vezes na
// mesma execução.
export function dedupeBySerial(list: PrintwayyPrinter[]): PrintwayyPrinter[] {
  const bySerial = new Map<string, PrintwayyPrinter[]>();
  for (const p of list) {
    const serial = p.serialNumber?.trim();
    if (!serial) continue;
    bySerial.set(serial, [...(bySerial.get(serial) ?? []), p]);
  }
  return [...bySerial.values()].map(pickActive);
}

// O que a PrintWayy tem naquele contrato e nós ainda não temos. Comparação por serial
// trimado dos dois lados — `printers.id` é o serial, e espaço sobrando na planilha de
// origem já apareceu antes.
export function selectNewPrinters(
  doContrato: PrintwayyPrinter[],
  registeredIds: Set<string>,
): PrintwayyPrinter[] {
  return dedupeBySerial(doContrato).filter((p) => !registeredIds.has(p.serialNumber.trim()));
}

// Caracteres que se confundem ao ler a etiqueta do equipamento (ou uma imagem dela).
// Cada grupo vira um único caractere canônico antes da comparação.
const CONFUSAVEIS: Record<string, string> = {
  O: '0', D: '0', Q: '0', B: '8', G: '6', S: '5', Z: '2', I: '1', L: '1',
};

export function normalizeSerial(s: string): string {
  return s.trim().toUpperCase().split('').map((c) => CONFUSAVEIS[c] ?? c).join('');
}

// Distância de edição (inserção, remoção, troca de 1 caractere).
// Big O: O(|a| × |b|) tempo, O(|b|) memória. Seriais têm ~10 caracteres.
export function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export interface SimilarMatch {
  serialNumber: string;
  distancia: number; // edições entre os seriais como estão escritos
  distanciaConfusaveis: number; // edições depois de igualar 0/O/D, 8/B, 6/G, 5/S, 2/Z, 1/I/L
}

// Para cada serial procurado, os seriais do parque a até `maxDist` edições (direto ou
// depois de igualar caracteres confusáveis), do mais parecido para o menos.
// Existe porque a busca da API só acha serial EXATO: um dígito lido errado na etiqueta
// vira "não encontrado", mesmo com o equipamento cadastrado.
// Big O: O(procurados × parque × |serial|²). Hoje são ~2 × 2.100 × 100, irrelevante.
export function findSimilarSerials(
  targets: string[], // seriais procurados
  fleet: string[], // seriais do parque visível pela API
  maxDist = 2, // tolerância em edições
  limit = 10, // máximo de candidatos por serial procurado
): Record<string, SimilarMatch[]> {
  const out: Record<string, SimilarMatch[]> = {};
  for (const t of targets) {
    const tRaw = t.trim().toUpperCase();
    const tNorm = normalizeSerial(t);
    out[t] = [...new Set(fleet.map((s) => s.trim()).filter(Boolean))]
      .map((s) => ({
        serialNumber: s,
        distancia: levenshtein(tRaw, s.toUpperCase()),
        distanciaConfusaveis: levenshtein(tNorm, normalizeSerial(s)),
      }))
      .filter((m) => Math.min(m.distancia, m.distanciaConfusaveis) <= maxDist)
      .sort((a, b) => Math.min(a.distancia, a.distanciaConfusaveis) - Math.min(b.distancia, b.distanciaConfusaveis)
        || a.distancia - b.distancia)
      .slice(0, limit);
  }
  return out;
}
