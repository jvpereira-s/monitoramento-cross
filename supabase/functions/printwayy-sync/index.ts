import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
// Cliente com service_role, sem tipos gerados do schema (o projeto não gera). Sem o
// `any` explícito, o genérico do supabase-js resolve as tabelas como `never`.
// deno-lint-ignore no-explicit-any
type AdminClient = SupabaseClient<any, any, any>;
// Decisões puras (a quem pertence uma impressora nova, como virar linha de printers/
// readings) ficam em discovery.ts, testadas por vitest. Aqui fica só o I/O: API do
// PrintWayy e Postgres.
import {
  type CustomerConfig,
  type ObservedCustomer,
  type PrintwayyPrinter,
  type RegisteredPrinter,
  type ResolvedPrinter,
  type SkippedCustomer,
  type CounterEntry,
  classifyPrinter,
  findSimilarSerials,
  fechamentoPendente,
  learnMappings,
  observeCustomers,
  pickActive,
  planDiscovery,
  selectNewPrinters,
  todayInBrazil,
  toFechamentoRow,
  toPrinterRow,
  toReadingRow,
  toSituacaoRow,
} from './discovery.ts';

// SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY são injetadas
// automaticamente pelo Supabase em toda Edge Function — não precisam ser configuradas.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
// Secret próprio desta função — configurar manualmente via `supabase secrets set
// PRINTWAYY_API_KEY=...` ou pelo Dashboard. Nunca uma variável VITE_*: essas são
// embutidas no bundle do front-end e ficariam públicas.
const PRINTWAYY_API_KEY = Deno.env.get('PRINTWAYY_API_KEY');

const PRINTWAYY_BASE = 'https://api.printwayy.com/devices/v1';
const COUNTERS_CONCURRENCY = 4; // ver justificativa no README, seção "Sincronização automática"
const FETCH_TIMEOUT_MS = 15000;
const PAGE_SIZE = 100; // usado só na descoberta de impressora nova (ver fetchCustomerPrinters)
const MAX_PAGES = 200; // proteção defensiva contra loop infinito, não um limite real esperado
const INSPECT_MAX_SERIALS = 10; // teto da ação de diagnóstico, pra caber no timeout da função

interface PrintersPage {
  count: number;
  data: PrintwayyPrinter[];
}

interface DiscoveryOutcome {
  discovered: string[]; // seriais cadastrados nesta execução
  readings: number; // leituras gravadas pra eles
  skipped: SkippedCustomer[];
  errors: Array<{ serialNumber: string; message: string }>;
}

class PrintwayyApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

// Defensivo: o schema da API documenta `errors` minúsculo, mas um exemplo de resposta
// da própria doc veio com `Errors` maiúsculo — checa os dois.
function extractApiErrors(body: unknown): string {
  if (body && typeof body === 'object') {
    const list = (body as Record<string, unknown>).errors ?? (body as Record<string, unknown>).Errors;
    if (Array.isArray(list) && list.length) return list.join('; ');
  }
  return 'erro desconhecido';
}

async function printwayyFetch(path: string): Promise<unknown> {
  const res = await fetch(`${PRINTWAYY_BASE}${path}`, {
    headers: { 'printwayy-key': PRINTWAYY_API_KEY! },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new PrintwayyApiError(extractApiErrors(await safeJson(res)), res.status);
  return res.json();
}

// Resolve UM serial cadastrado por nós pro registro correspondente na PrintWayy.
// Substitui o fetchAllPrinters() antigo (paginava milhares de impressoras que não
// pertencem ao parque da Cross) — agora só busca quem a Cross realmente cadastrou.
// [Suposição não testada] Assumindo que o envelope de resposta é o mesmo {count, data}
// documentado pra /printers paginado — só foi confirmado nesse formato pra listagem
// completa, não especificamente filtrado por serial-number. Vale conferir na primeira
// chamada real.
async function fetchPrinterBySerial(serial: string): Promise<PrintwayyPrinter[]> {
  const res = (await printwayyFetch(`/printers?serial-number=${encodeURIComponent(serial)}`)) as PrintersPage;
  return res.data ?? [];
}

async function fetchPrintersPage(skip: number, customerId: string | null): Promise<PrintersPage> {
  const filter = customerId ? `&customer-id=${encodeURIComponent(customerId)}` : '';
  return (await printwayyFetch(`/printers?top=${PAGE_SIZE}&skip=${skip}${filter}`)) as PrintersPage;
}

// Lista as impressoras que a PrintWayy diz pertencer a UM customer — a fonte da
// descoberta de equipamento novo. Só é chamada pra customer que o nosso próprio cadastro
// já vinculou a um cliente (ver planDiscovery); nunca vira "importar o parque inteiro".
//
// Tenta primeiro o filtro no servidor (`?customer-id=`). Não há confirmação de que a API
// suporta esse parâmetro — o único filtro documentado/testado é `serial-number` — então o
// código detecta as duas formas de ele não funcionar: rejeição explícita (4xx) e a mais
// traiçoeira, aceitar e ignorar, devolvendo o parque inteiro. Nos dois casos reinicia
// varrendo tudo e filtrando aqui, o que dá o mesmo resultado correto — só caro.
// Big O: O(páginas do customer) no caminho bom (1 página hoje), O(páginas do parque
// inteiro) no fallback (~21 hoje, 100 por página).
async function fetchCustomerPrinters(customerId: string): Promise<PrintwayyPrinter[]> {
  const isMine = (p: PrintwayyPrinter) => p.customer?.id === customerId;
  let found: PrintwayyPrinter[] = [];
  let filter: string | null = customerId; // null = varredura do parque inteiro
  let skip = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    let res: PrintersPage;
    try {
      res = await fetchPrintersPage(skip, filter);
    } catch (e) {
      // 4xx com o filtro ligado = parâmetro desconhecido. Recomeça sem ele. 5xx e erro de
      // rede sobem e abortam a descoberta: lista parcial do parque levaria a "essa
      // impressora não existe mais lá", conclusão que não temos como sustentar.
      if (filter && e instanceof PrintwayyApiError && e.status < 500) {
        filter = null;
        skip = 0;
        found = [];
        continue;
      }
      throw e;
    }
    const data = res.data ?? [];
    // Duas formas de o filtro não ter funcionado, ambas sem erro HTTP:
    // (a) veio gente de outro customer = parâmetro ignorado;
    // (b) veio vazio de primeira = parâmetro tratado como "não bate com nada". Vazio aqui
    //     é impossível de verdade — só perguntamos por customer onde uma impressora
    //     NOSSA já foi encontrada — então isso é sintoma, não resposta. Sem esta linha o
    //     caso (b) viraria um "nenhuma impressora nova" silencioso, exatamente o
    //     problema que a descoberta existe pra resolver.
    const filtroFalhou = filter && (page === 0 ? !data.length || !data.every(isMine) : !data.every(isMine));
    if (filtroFalhou) {
      filter = null;
      skip = 0;
      found = [];
      continue;
    }
    found = [...found, ...data.filter(isMine)];
    skip += PAGE_SIZE;
    if (!data.length || skip >= (res.count ?? 0)) break;
  }
  return found;
}

// Sem `date`: contador atual. Com `date` (AAAA-MM-DD): última captura até aquela data,
// que é o número do relatório oficial de fechamento (ver toFechamentoRow).
async function fetchCounters(printwayyId: string, date?: string): Promise<CounterEntry[]> {
  const query = date ? `?date=${encodeURIComponent(date)}` : '';
  return (await printwayyFetch(`/printers/${printwayyId}/counters${query}`)) as CounterEntry[];
}

// Pool de workers simples, sem dependência externa — limita quantas chamadas ficam em
// voo ao mesmo tempo (o PrintWayy documenta "travas de segurança" contra abuso sem
// especificar um número; melhor ficar conservador).
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// Escopo da atualização de contadores = o que já está cadastrado em `printers` (via
// importação de planilha, cadastro manual do admin ou descoberta automática), nunca o
// parque inteiro da PrintWayy.
//
// Paginado: o PostgREST corta a resposta no teto de linhas do projeto (padrão 1000) sem
// sinalizar nada — devolveria as primeiras 1000 impressoras e o sync deixaria as demais
// sem atualizar, silenciosamente. Hoje são dezenas, mas a descoberta automática cadastra
// sozinha, então o número cresce sem ninguém apertar botão.
// Devolve TODAS as linhas, inclusive as removidas do contrato (`removida_em`): o
// chamador filtra pra sincronizar e usa a lista completa pra descoberta não recadastrar
// equipamento que o admin tirou do contrato.
// Big O: O(cadastradas / página) requisições.
const DB_PAGE_SIZE = 1000;
interface RegisteredRow extends RegisteredPrinter {
  removida_em: string | null;
}
async function fetchRegisteredPrinters(adminClient: AdminClient): Promise<RegisteredRow[]> {
  const pages: RegisteredRow[][] = [];
  let from = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await adminClient
      .from('printers')
      .select('id, cliente, removida_em')
      .order('id', { ascending: true })
      .range(from, from + DB_PAGE_SIZE - 1);
    if (error) throw new Error(`Falha ao ler impressoras cadastradas: ${error.message}`);
    const rows = (data ?? []) as RegisteredRow[];
    if (!rows.length) break;
    pages.push(rows);
    from += rows.length;
  }
  return pages.flat();
}

async function loadCustomerConfig(adminClient: AdminClient): Promise<Map<string, CustomerConfig>> {
  const { data, error } = await adminClient
    .from('printwayy_customers')
    .select('printwayy_customer_id, cliente, auto_registrar');
  if (error) throw new Error(`Falha ao ler o vínculo de clientes: ${error.message}`);
  return new Map(((data ?? []) as CustomerConfig[]).map((c) => [c.printwayy_customer_id, c]));
}

// Grava só vínculo NOVO (ver learnMappings) e devolve a tabela atualizada. Nunca altera
// linha existente: o vínculo de um cliente já configurado é decisão do admin.
async function learnCustomerMap(
  adminClient: AdminClient,
  resolved: ResolvedPrinter[],
  config: Map<string, CustomerConfig>,
): Promise<Map<string, CustomerConfig>> {
  const rows = learnMappings(resolved, config);
  if (!rows.length) return config;
  const { error } = await adminClient
    .from('printwayy_customers')
    .upsert(rows, { onConflict: 'printwayy_customer_id', ignoreDuplicates: true });
  if (error) throw new Error(`Falha ao gravar o vínculo de clientes: ${error.message}`);
  return loadCustomerConfig(adminClient);
}

// Resolve cada serial cadastrado pro registro da PrintWayy, sem contador ainda: a
// classificação contrato/fora depende do vínculo, que pode ser aprendido a partir desta
// mesma lista (cliente novo, primeira sincronização).
// Big O: O(cadastradas) chamadas, COUNTERS_CONCURRENCY em paralelo.
async function resolveRegistered(registered: RegisteredPrinter[]) {
  let notFound = 0;
  let ambiguous = 0;
  const resolved: ResolvedPrinter[] = await mapWithConcurrency(registered, COUNTERS_CONCURRENCY, async (reg) => {
    try {
      const matches = await fetchPrinterBySerial(reg.id);
      if (!matches.length) {
        notFound++;
        // Não é erro: há equipamento do contrato sem monitoramento na PrintWayy, com
        // contador lançado manualmente (situacao 'nao-encontrada'). Conta em notFound.
        return { reg, printer: null, reading: null, error: null, situacao: 'nao-encontrada' as const };
      }
      if (matches.length > 1) ambiguous++;
      return { reg, printer: pickActive(matches), reading: null, error: null };
    } catch (e) {
      const message = e instanceof PrintwayyApiError ? e.message : e instanceof Error ? e.message : String(e);
      return { reg, printer: null, reading: null, error: message };
    }
  });
  return { resolved, notFound, ambiguous };
}

// Grava a leitura de fechamento (contador histórico na data de corte) das impressoras do
// contrato. Usada pelo sync normal, dentro da janela de fechamentoPendente, e pela ação
// `fechamento`, que reprocessa datas passadas.
// Big O: O(impressoras do contrato × datas) chamadas.
async function writeFechamentos(
  adminClient: AdminClient,
  contrato: ResolvedPrinter[],
  dates: string[],
) {
  const errors: Array<{ serialNumber: string; message: string }> = [];
  const rows = [];
  for (const date of dates) {
    const batch = await mapWithConcurrency(contrato, COUNTERS_CONCURRENCY, async (r) => {
      try {
        return toFechamentoRow(r.printer!, await fetchCounters(r.printer!.id, date), date);
      } catch (e) {
        errors.push({ serialNumber: r.reg.id, message: `fechamento ${date}: ${e instanceof Error ? e.message : String(e)}` });
        return null;
      }
    });
    rows.push(...batch.filter((b) => b !== null));
  }
  if (rows.length) {
    const { error } = await adminClient
      .from('readings')
      .upsert(rows, { onConflict: 'printer_id,data', ignoreDuplicates: false });
    if (error) throw new Error(`Falha ao gravar leituras de fechamento: ${error.message}`);
  }
  return { rows, errors };
}

// Cadastra impressora que apareceu no PrintWayy dentro de um contrato que já é nosso —
// é o que faz uma adição feita lá aparecer aqui sozinha.
// Escopo: só customers observados NESTA execução com vínculo único (ver planDiscovery).
// Se nenhuma impressora do contrato resolveu (API fora do ar, por exemplo), não há
// observação e nada é criado — melhor não cadastrar do que cadastrar com `cliente`
// chutado a partir de mapa velho.
async function discoverNewPrinters(
  adminClient: AdminClient,
  observed: Map<string, ObservedCustomer>,
  config: Map<string, CustomerConfig>,
  registeredIds: Set<string>,
  today: string,
): Promise<DiscoveryOutcome> {
  const { eligible, skipped } = planDiscovery(observed, config);
  const discovered: string[] = [];
  const errors: DiscoveryOutcome['errors'] = [];
  let readingsWritten = 0;

  for (const { customerId, cliente, label } of eligible) {
    try {
      const novas = selectNewPrinters(await fetchCustomerPrinters(customerId), registeredIds);
      if (!novas.length) continue;

      // ignoreDuplicates = INSERT ... ON CONFLICT DO NOTHING: a descoberta só CRIA linha,
      // nunca sobrescreve uma existente — nem numa corrida com outra execução do sync.
      // `local` e `departamento` nascem vazios de propósito: são dado nosso, o admin
      // preenche depois (botão "Impressora" do Painel, com o mesmo serial).
      const { error: insertError } = await adminClient
        .from('printers')
        .upsert(novas.map((p) => toPrinterRow(p, cliente)), { onConflict: 'id', ignoreDuplicates: true });
      if (insertError) throw new Error(insertError.message);

      // Primeira leitura já nesta execução: sem ela a impressora nova ficaria "sem dados"
      // no painel até o próximo sync.
      const readings = await mapWithConcurrency(novas, COUNTERS_CONCURRENCY, async (p) => {
        try {
          return toReadingRow(p, await fetchCounters(p.id), today);
        } catch (e) {
          errors.push({ serialNumber: p.serialNumber.trim(), message: e instanceof Error ? e.message : String(e) });
          return null;
        }
      });
      const payload = readings.filter((r) => r !== null);
      if (payload.length) {
        const { error } = await adminClient
          .from('readings')
          .upsert(payload, { onConflict: 'printer_id,data', ignoreDuplicates: false });
        if (error) throw new Error(error.message);
        readingsWritten += payload.length;
      }
      discovered.push(...novas.map((p) => p.serialNumber.trim()));
    } catch (e) {
      errors.push({ serialNumber: `contrato ${label}`, message: e instanceof Error ? e.message : String(e) });
    }
  }

  return { discovered, readings: readingsWritten, skipped, errors };
}

// Etapa comum ao sync e à ação `fechamento`: cadastro ativo → registro na PrintWayy →
// vínculo (aprende se faltar) → situação de cada impressora.
async function prepare(adminClient: AdminClient) {
  const all = await fetchRegisteredPrinters(adminClient);
  // Removida do contrato = fora do escopo do sync (o histórico fica no banco).
  const registered = all.filter((r) => !r.removida_em);
  const { resolved, notFound, ambiguous } = await resolveRegistered(registered);
  const config = await learnCustomerMap(adminClient, resolved, await loadCustomerConfig(adminClient));
  for (const r of resolved) {
    if (r.printer) r.situacao = classifyPrinter(r.printer, r.reg, config);
  }
  return { all, registered, resolved, config, notFound, ambiguous };
}

// Grava situação/metadata em `printers`. Duas chamadas com payload de chaves uniformes:
// o upsert em lote do supabase-js usa a união das chaves e preencheria com NULL a
// coluna ausente numa linha. Isso apagaria a última comunicação das impressoras fora do
// contrato.
async function writePrinterRows(adminClient: AdminClient, resolved: ResolvedPrinter[]) {
  const contrato = resolved.filter((r) => r.situacao === 'contrato').map((r) => toPrinterRow(r.printer!, r.reg.cliente));
  const outras = resolved
    .filter((r) => r.situacao && r.situacao !== 'contrato')
    .map((r) => toSituacaoRow(r.reg, r.situacao!));
  for (const payload of [contrato, outras]) {
    if (!payload.length) continue;
    const { error } = await adminClient.from('printers').upsert(payload, { onConflict: 'id' });
    if (error) throw new Error(`Falha ao atualizar impressoras: ${error.message}`);
  }
}

async function runSync(adminClient: AdminClient) {
  const { all, registered, resolved, config, notFound, ambiguous } = await prepare(adminClient);
  if (!registered.length) {
    return {
      success: true,
      totalRegistered: 0,
      notFoundInPrintwayy: 0,
      ambiguous: 0,
      synced: 0,
      discovered: 0,
      discoveredSerials: [] as string[],
      discoverySkipped: [] as SkippedCustomer[],
      failed: 0,
      errors: [] as Array<{ serialNumber: string; message: string }>,
      // A descoberta automática se apoia no cadastro pra saber a qual cliente uma
      // impressora nova pertence — com o cadastro vazio ela não tem de onde partir.
      message: 'Nenhuma impressora cadastrada — cadastre ao menos uma (planilha ou manual) antes de sincronizar.',
    };
  }

  const today = todayInBrazil();

  // Fase 1 — contador atual SÓ das impressoras do contrato. Fora do contrato (movida na
  // PrintWayy pra outro customer/estoque) fica sem leitura nova: o contador congela no
  // último valor do contrato, como no relatório oficial.
  // Big O: O(impressoras do contrato) chamadas de /counters.
  const contrato = resolved.filter((r) => r.situacao === 'contrato');
  await mapWithConcurrency(contrato, COUNTERS_CONCURRENCY, async (r) => {
    try {
      r.reading = toReadingRow(r.printer!, await fetchCounters(r.printer!.id), today);
    } catch (e) {
      r.error = e instanceof Error ? e.message : String(e);
    }
  });

  await writePrinterRows(adminClient, resolved);

  const readingsPayload = resolved.filter((r) => r.reading).map((r) => r.reading!);
  if (readingsPayload.length) {
    const { error } = await adminClient
      .from('readings')
      .upsert(readingsPayload, { onConflict: 'printer_id,data', ignoreDuplicates: false });
    if (error) throw new Error(`Falha ao gravar leituras: ${error.message}`);
  }

  // Fase 1b — leitura de fechamento (dia de corte do contrato), regravada a cada execução
  // dentro da janela pra absorver captura atrasada. Roda DEPOIS da leitura atual porque,
  // no próprio dia de corte, as duas caem na mesma linha (printer_id, data) e o valor
  // histórico é o que vale.
  const fechamento = fechamentoPendente(today);
  let fechamentoErrors: Array<{ serialNumber: string; message: string }> = [];
  let fechamentoGravadas = 0;
  if (fechamento) {
    const out = await writeFechamentos(adminClient, contrato.filter((r) => !r.error), [fechamento]);
    fechamentoErrors = out.errors;
    fechamentoGravadas = out.rows.length;
  }

  // Fase 2 — impressora que existe no PrintWayy mas ainda não no nosso cadastro. Isolada
  // em try/catch: a atualização de contadores acima já foi gravada e não pode ser perdida
  // porque a descoberta falhou. Só observa customer de impressora DO CONTRATO: uma
  // impressora movida pra outra prefeitura não pode abrir a porta pro parque de lá.
  let discovery: DiscoveryOutcome = { discovered: [], readings: 0, skipped: [], errors: [] };
  try {
    const registeredIds = new Set(all.map((r) => r.id.trim()));
    discovery = await discoverNewPrinters(adminClient, observeCustomers(contrato), config, registeredIds, today);
  } catch (e) {
    discovery = {
      ...discovery,
      errors: [{ serialNumber: 'descoberta de impressoras novas', message: e instanceof Error ? e.message : String(e) }],
    };
  }

  const errors = resolved.filter((r) => r.error).map((r) => ({ serialNumber: r.reg.id, message: r.error! }));
  return {
    success: true,
    totalRegistered: registered.length,
    notFoundInPrintwayy: notFound,
    ambiguous,
    synced: readingsPayload.length + discovery.readings,
    // Seriais congelados por estarem fora do contrato na PrintWayy — o admin precisa
    // saber, porque normalmente significa troca/remanejamento de equipamento.
    foraDoContrato: resolved.filter((r) => r.situacao === 'fora-do-contrato').map((r) => r.reg.id),
    fechamento: fechamento ? { data: fechamento, gravadas: fechamentoGravadas } : null,
    discovered: discovery.discovered.length,
    discoveredSerials: discovery.discovered,
    discoverySkipped: discovery.skipped,
    failed: errors.length + discovery.errors.length + fechamentoErrors.length,
    errors: [...errors, ...fechamentoErrors, ...discovery.errors],
  };
}

// Ação `fechamento`: reprocessa leituras de fechamento de datas passadas (backfill ou
// correção). Mesmo escopo do sync: só impressora ativa e dentro do contrato.
// Devolve o valor gravado por serial e data, pra conferência contra o relatório oficial.
async function runFechamento(adminClient: AdminClient, dates: string[]) {
  const { resolved } = await prepare(adminClient);
  await writePrinterRows(adminClient, resolved);
  const contrato = resolved.filter((r) => r.situacao === 'contrato');
  const { rows, errors } = await writeFechamentos(adminClient, contrato, dates);
  return {
    success: true,
    dates,
    gravadas: rows.length,
    leituras: rows.map((r) => ({ serial: r.printer_id, data: r.data, contador_pb: r.contador_pb })),
    foraDoContrato: resolved.filter((r) => r.situacao === 'fora-do-contrato').map((r) => r.reg.id),
    naoEncontradas: resolved.filter((r) => r.situacao === 'nao-encontrada').map((r) => r.reg.id),
    errors,
  };
}

// Ação `similar` (diagnóstico, somente leitura): procura seriais PARECIDOS com os
// informados no parque inteiro visível pela API key, porque a busca da API só acha serial
// exato. É a única leitura do parque inteiro no sistema, e é consciente: nada é gravado
// e a resposta traz só os candidatos parecidos, nunca a lista do parque.
// `serials`: seriais procurados; `maxDist`: tolerância em edições (padrão 2, máximo 3).
// Big O: O(páginas do parque) chamadas (~21 de 100) + findSimilarSerials em memória.
async function runSimilar(serials: string[], maxDist: number) {
  const fleet: PrintwayyPrinter[] = [];
  let total = 0;
  for (let page = 0, skip = 0; page < MAX_PAGES; page++, skip += PAGE_SIZE) {
    const res = await fetchPrintersPage(skip, null);
    const data = res.data ?? [];
    total = res.count ?? total;
    fleet.push(...data);
    if (!data.length || skip + PAGE_SIZE >= total) break;
  }
  const bySerial = new Map(fleet.map((p) => [p.serialNumber?.trim(), p]));
  const matches = findSimilarSerials(serials, fleet.map((p) => p.serialNumber ?? ''), maxDist);
  return {
    parqueLido: fleet.length,
    parqueInformadoPelaApi: total,
    resultado: Object.fromEntries(Object.entries(matches).map(([alvo, lista]) => [alvo, lista.map((m) => {
      const p = bySerial.get(m.serialNumber);
      return {
        ...m,
        cliente: p?.customer?.name ?? null,
        status: p?.status ?? null,
        ultimaComunicacao: p?.lastCommunication ?? null,
        modelo: p?.model ?? null,
        observacao: p?.observation ?? null,
        pc: p?.installationPoint ?? null,
        ip: p?.ipAddress || null,
      };
    })])),
  };
}

// Captura uma chamada da API sem lançar: o diagnóstico quer ver também o erro (status +
// corpo), porque "a API recusa esse parâmetro" é informação, não falha.
async function rawCall(path: string): Promise<{ path: string; status: number; body: unknown }> {
  try {
    const res = await fetch(`${PRINTWAYY_BASE}${path}`, {
      headers: { 'printwayy-key': PRINTWAYY_API_KEY! },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    return { path, status: res.status, body: await safeJson(res) };
  } catch (e) {
    return { path, status: 0, body: e instanceof Error ? e.message : String(e) };
  }
}

// Diagnóstico somente-leitura: devolve o JSON BRUTO que a PrintWayy tem pra cada serial
// (todos os registros do serial, detalhe, contador atual e contador histórico em cada
// data pedida). Existe pra descobrir campos que a API não documenta publicamente
// (última comunicação, congelamento, fechamento) a partir do dado real — não grava nada.
// `serials`: seriais a inspecionar (máx. INSPECT_MAX_SERIALS); `dates`: datas AAAA-MM-DD
// pro parâmetro `date=` de /counters.
// Big O: O(serials × (registros do serial × (2 + datas))) chamadas, sequenciais.
async function runInspect(serials: string[], dates: string[]) {
  const out = [];
  for (const serial of serials.slice(0, INSPECT_MAX_SERIALS)) {
    const search = await rawCall(`/printers?serial-number=${encodeURIComponent(serial)}`);
    const records = ((search.body as PrintersPage | null)?.data ?? []) as PrintwayyPrinter[];
    const detail = [];
    for (const rec of records) {
      const calls = [await rawCall(`/printers/${rec.id}`), await rawCall(`/printers/${rec.id}/counters`)];
      for (const d of dates) calls.push(await rawCall(`/printers/${rec.id}/counters?date=${encodeURIComponent(d)}`));
      detail.push({ printwayyId: rec.id, calls });
    }
    out.push({ serial, search, detail });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() });
  if (req.method !== 'POST') return json({ error: 'Método não suportado.' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();

  let callerLabel: string;
  if (bearer && bearer === SERVICE_ROLE_KEY) {
    // Chamada de sistema (cron agendado no Dashboard): a única forma de provar isso
    // sem JWT de usuário é apresentar a própria service_role key como bearer. Só quem
    // já tem a key (o Cron Job configurado no Dashboard, nunca commitada) passa por
    // aqui — e quem já tem a service_role key já teria acesso irrestrito ao banco de
    // qualquer forma, então isso não abre nenhum privilégio novo.
    callerLabel = 'sistema (cron)';
  } else {
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !user) return json({ error: 'Não autenticado.' }, 401);

    const { data: callerProfile, error: profileErr } = await callerClient
      .from('profiles')
      .select('role, username')
      .eq('id', user.id)
      .single();
    if (profileErr || callerProfile?.role !== 'admin') {
      return json({ error: 'Só administradores podem sincronizar.' }, 403);
    }
    callerLabel = callerProfile.username;
  }

  if (!PRINTWAYY_API_KEY) return json({ error: 'PRINTWAYY_API_KEY não configurada nesta função.' }, 500);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // Corpo vazio (ex: chamada do cron sem body) é aceitável, cai no action default.
  }
  const action = (body.action as string) || 'sync';

  if (action === 'inspect') {
    const serials = Array.isArray(body.serials) ? body.serials.map(String) : [];
    const dates = Array.isArray(body.dates) ? body.dates.map(String).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)) : [];
    if (!serials.length) return json({ error: 'Informe ao menos um serial em `serials`.' }, 400);
    return json({ inspect: await runInspect(serials, dates), triggeredBy: callerLabel });
  }
  if (action === 'similar') {
    const serials = Array.isArray(body.serials) ? body.serials.map(String).slice(0, INSPECT_MAX_SERIALS) : [];
    if (!serials.length) return json({ error: 'Informe ao menos um serial em `serials`.' }, 400);
    const maxDist = Math.min(3, Math.max(0, Number(body.maxDist ?? 2) || 0));
    try {
      return json({ ...(await runSimilar(serials, maxDist)), triggeredBy: callerLabel });
    } catch (e) {
      return json({ error: `Falha na busca: ${e instanceof Error ? e.message : String(e)}` }, 502);
    }
  }
  if (action !== 'sync' && action !== 'fechamento') return json({ error: 'Ação desconhecida.' }, 400);

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  try {
    if (action === 'fechamento') {
      const dates = Array.isArray(body.dates) ? body.dates.map(String).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)) : [];
      if (!dates.length) return json({ error: 'Informe as datas de fechamento em `dates` (AAAA-MM-DD).' }, 400);
      return json({ ...(await runFechamento(adminClient, dates)), triggeredBy: callerLabel });
    }
    const result = await runSync(adminClient);
    return json({ ...result, triggeredBy: callerLabel });
  } catch (e) {
    const status = e instanceof PrintwayyApiError && e.status < 500 ? 400 : 502;
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: `Falha ao sincronizar com o PrintWayy: ${message}` }, status);
  }
});
