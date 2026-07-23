import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

const STATUS_TEXT_OFFLINE = 'Sem comunicação (PrintWayy)';
const STATUS_TEXT_ONLINE = 'Comunicando (PrintWayy)';
// notMonitored/unknown caem no bucket "offline" existente (decisão do produto — sem
// bucket visual novo). countManual/inDealer ficam de fora do Set e caem no branch
// "online" por omissão. Reaproveitado também em pickActive() abaixo, pra escolher o
// registro "vivo" quando a busca por serial devolve mais de um resultado.
const OFFLINE_API_STATUSES = new Set(['offline', 'notMonitored', 'unknown']);
const CONEXAO_MAP: Record<string, string> = { usb: 'USB', network: 'Rede' };

interface PrintwayyPrinter {
  id: string; // UUID do PrintWayy — usado só pra chamar /counters
  type: 'usb' | 'network' | 'unknown';
  serialNumber: string; // == nossa printers.id
  status: string;
  model?: string;
  ipAddress?: string;
  installationPoint?: string;
  observation?: string;
  // Não usado pra decidir o campo `cliente` — esse é dado nosso, definido pelo admin
  // no cadastro (ver fetchRegisteredPrinters). customer.name é da PrintWayy e não tem
  // garantia de bater com o texto que profiles.cliente_associado usa pra RLS.
  customer: { id: string; name: string } | null;
  location: { department?: string; address?: unknown } | null;
}

interface CounterEntry {
  type: string;
  dateOfCapture: string;
  totalCount: number;
}

// Impressora já cadastrada em `printers` por nós — é essa lista (não o parque da
// PrintWayy) que define o escopo de quem entra na sincronização.
interface RegisteredPrinter {
  id: string; // serial number, nossa PK
  cliente: string;
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
// pertencem ao parque da Cross) — agora só busca quem a Cross realmente cadastrou,
// nunca o parque inteiro visível pela API key.
// [Suposição não testada] Assumindo que o envelope de resposta é o mesmo {count, data}
// documentado pra /printers paginado — só foi confirmado nesse formato pra listagem
// completa, não especificamente filtrado por serial-number. Vale conferir na primeira
// chamada real.
async function fetchPrinterBySerial(serial: string): Promise<PrintwayyPrinter[]> {
  const res = (await printwayyFetch(`/printers?serial-number=${encodeURIComponent(serial)}`)) as {
    count: number;
    data: PrintwayyPrinter[];
  };
  return res.data ?? [];
}

async function fetchCounters(printwayyId: string): Promise<CounterEntry[]> {
  return (await printwayyFetch(`/printers/${printwayyId}/counters`)) as CounterEntry[];
}

// Quando a busca por serial devolve mais de um registro (cenário de reset de contador
// documentado no MANUTENCAO.md, seção 5: PrintWayy mantém o registro antigo desativado
// junto do novo pro mesmo serial), prefere o que não estiver com status de desativação.
// Best-effort: só visto na documentação, não confirmado contra um caso real de duplicata
// ainda — se nenhum "vivo" for encontrado, cai no primeiro item mesmo assim.
function pickActive(candidates: PrintwayyPrinter[]): PrintwayyPrinter {
  return candidates.find((c) => !OFFLINE_API_STATUSES.has(c.status)) ?? candidates[0];
}

// Data em calendário de Brasília, não UTC — importante porque o botão "Sincronizar
// agora" pode ser clicado a qualquer hora do dia (não só no horário fixo do cron).
// Calcular em UTC faria uma leitura entre ~21h e 23h59 (horário de Brasília) cair na
// data de amanhã. formatToParts em vez de parsear .format() evita depender do
// separador exato que a locale devolve.
function todayInBrazil(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
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

// `cliente` vem do nosso próprio cadastro (fetchRegisteredPrinters), nunca do
// customer.name da PrintWayy — precisa estar presente no payload (Postgres valida a
// constraint not null da linha candidata em INSERT ... ON CONFLICT DO UPDATE antes
// mesmo de checar se vai conflitar; omitir a coluna quebra mesmo quando a intenção é
// só atualizar). Passar o valor já existente de volta é o jeito de satisfazer a
// constraint sem de fato mudar o dado.
function toPrinterRow(p: PrintwayyPrinter, cliente: string) {
  return {
    id: p.serialNumber.trim(),
    cliente,
    modelo: p.model || null,
    ip: p.ipAddress || null,
    local: p.installationPoint || p.observation || p.location?.department || null,
    conexao: CONEXAO_MAP[p.type] || null,
    updated_at: new Date().toISOString(),
  };
}

function toReadingRow(p: PrintwayyPrinter, counters: CounterEntry[], today: string) {
  // A3 (a3BlackAndWhite/a3Color) e os demais tipos (scan, colorLevelXCoverage) ficam
  // de fora do total por decisão do produto — sem impressora A3 no parque hoje.
  const pb = counters.find((c) => c.type === 'blackAndWhite')?.totalCount ?? null;
  const color = counters.find((c) => c.type === 'color')?.totalCount ?? null;
  const statusText = OFFLINE_API_STATUSES.has(p.status) ? STATUS_TEXT_OFFLINE : STATUS_TEXT_ONLINE;
  return {
    printer_id: p.serialNumber.trim(),
    data: today,
    contador_pb: pb,
    contador_color: color,
    status: statusText,
  };
}

// Escopo da sincronização = o que já está cadastrado em `printers` (via importação de
// planilha ou cadastro manual do admin), nunca o parque inteiro da PrintWayy. É essa
// lista que define quais clientes/impressoras a Cross realmente gerencia.
async function fetchRegisteredPrinters(adminClient: ReturnType<typeof createClient>): Promise<RegisteredPrinter[]> {
  const { data, error } = await adminClient.from('printers').select('id, cliente');
  if (error) throw new Error(`Falha ao ler impressoras cadastradas: ${error.message}`);
  return data ?? [];
}

async function runSync(adminClient: ReturnType<typeof createClient>) {
  const registered = await fetchRegisteredPrinters(adminClient);
  if (!registered.length) {
    return {
      success: true,
      totalRegistered: 0,
      notFoundInPrintwayy: 0,
      ambiguous: 0,
      synced: 0,
      failed: 0,
      errors: [] as Array<{ serialNumber: string; message: string }>,
      message: 'Nenhuma impressora cadastrada — cadastre ao menos uma (planilha ou manual) antes de sincronizar.',
    };
  }

  const today = todayInBrazil();
  let notFoundInPrintwayy = 0;
  let ambiguous = 0;

  // Big O: O(impressoras cadastradas por nós) chamadas de resolução por serial +
  // O(mesma quantidade) chamadas de /counters — cresce só com o que a Cross gerencia,
  // nunca com o tamanho do parque total visível pela API key (era O(parque inteiro)
  // antes).
  // Cada impressora isolada em try/catch: uma falha não derruba a sincronização das
  // outras.
  const results = await mapWithConcurrency(registered, COUNTERS_CONCURRENCY, async (reg) => {
    try {
      const matches = await fetchPrinterBySerial(reg.id);
      if (!matches.length) {
        notFoundInPrintwayy++;
        return { reg, printer: null as PrintwayyPrinter | null, reading: null, error: 'Serial não encontrado no PrintWayy.' };
      }
      if (matches.length > 1) ambiguous++;
      const printer = pickActive(matches);
      const counters = await fetchCounters(printer.id);
      return { reg, printer, reading: toReadingRow(printer, counters, today), error: null as string | null };
    } catch (e) {
      const message = e instanceof PrintwayyApiError ? e.message : e instanceof Error ? e.message : String(e);
      return { reg, printer: null as PrintwayyPrinter | null, reading: null, error: message };
    }
  });

  // Atualiza só metadata (modelo/ip/local/conexao) das linhas que já existem — nunca
  // insere linha nova aqui (quem cria linha nova em `printers` é a importação de
  // planilha ou um cadastro manual do admin, nunca o sync). `cliente` não entra no
  // payload, então o upsert não toca essa coluna.
  const printersPayload = results.filter((r) => r.printer).map((r) => toPrinterRow(r.printer!, r.reg.cliente));
  if (printersPayload.length) {
    const { error } = await adminClient.from('printers').upsert(printersPayload, { onConflict: 'id' });
    if (error) throw new Error(`Falha ao atualizar impressoras: ${error.message}`);
  }

  const readingsPayload = results.filter((r) => r.reading).map((r) => r.reading!);
  if (readingsPayload.length) {
    const { error } = await adminClient
      .from('readings')
      .upsert(readingsPayload, { onConflict: 'printer_id,data', ignoreDuplicates: false });
    if (error) throw new Error(`Falha ao gravar leituras: ${error.message}`);
  }

  const errors = results.filter((r) => r.error).map((r) => ({ serialNumber: r.reg.id, message: r.error! }));
  return {
    success: true,
    totalRegistered: registered.length,
    notFoundInPrintwayy,
    ambiguous,
    synced: readingsPayload.length,
    failed: errors.length,
    errors,
  };
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
  if (action !== 'sync') return json({ error: 'Ação desconhecida.' }, 400);

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  try {
    const result = await runSync(adminClient);
    return json({ ...result, triggeredBy: callerLabel });
  } catch (e) {
    const status = e instanceof PrintwayyApiError && e.status < 500 ? 400 : 502;
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: `Falha ao sincronizar com o PrintWayy: ${message}` }, status);
  }
});
