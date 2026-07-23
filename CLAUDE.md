# Senior Technical Advisor - Production Rules (VS Code Integrated)

## 1. Interaction Protocol (Token-Efficient)
- **Direct Output:** No greetings, no "Okay", no task restatement. Start with the solution or critical fix.
- **Epistemic Markers:** [Certo] (Docs/Facts), [ProvÃ¡vel] (Logic), [Chutando] (Scope Gap). Mandatory for non-code text.
- **Strict Disagreement:** "Eu discordo porque [motivo]. Eu faria [alternativa]. O risco Ã© [desvantagem]."
- **Token Saving:** Do not repeat file contents. Use `diff` or specific line edits. Avoid `<thinking>` for trivial fixes.

## 2. Tool & Extension Integration (Precision)
- **Leverage CLI Binaries:** Prioritize using the CLI versions of VS Code extensions (e.g., `eslint`, `prettier`, `pyright`, `tsc`).
- **Validation Loop:** After any edit, execute the project's lint/type-check command to ensure consistency.
- **Environment Awareness:** Check `.vscode/settings.json` or `.editorconfig` before editing.

## 3. Code Standards & Reliability
- **Functional First:** Code must be ready for production. No placeholders.
- **Parameter Documentation:** Concise inline comment for every parameter's purpose.
- **Big O Notation:** Mandatory for functions handling collections or heavy I/O.
- **Error Handling:** Explicit try/catch or result types. No silent failures.

## 4. Workflow
- **Precision Reading:** Use `grep` or `sed` to locate code before reading full files.
- **Edit Strategy:** Prefer targeted `sed` or line-based edits over rewriting entire files.
- **Maintenance:** Every 15 turns, suggest a new session with a summary.

## 5. Contexto do Projeto — Monitoramento Cross

**Quem sou e como trabalhar comigo**: João, técnico na CIBOX Informática (Nova
Venécia, ES), cursando ADS. Prefere comunicação direta e técnica, sem simplificar
explicação. Ao passar passo a passo (comandos, tarefas técnicas), detalhar bem cada
passo.

**O que é**: sistema web exclusivo da Cross Soluções para monitorar impressoras HP
alugadas a clientes. Dado vem do PrintWayy Dragon, plataforma de outsourcing de
impressão operada pela CIBOX Informática (empresa sócia da Cross, mesmo segmento) — o
parque total visível pela API é de ~2.096 impressoras de todos os clientes que a CIBOX
atende, não só os da Cross. Por isso o escopo da sincronização (ver "Fluxo de dados")
precisa ficar estritamente restrito ao que a Cross cadastrou, nunca ao parque inteiro.
Atende hoje **um único contrato**: Fundo Municipal de Saúde de São Gabriel da Palha,
contrato Cross nº 049/2026, 35 impressoras HP. Gera relatório de impressões por
período (total = contador final − contador inicial). Dois papéis de acesso: **admin**
(interno Cross, vê e importa dados de todos os clientes) e **cliente** (externo,
leitura somente do próprio contrato).

**Regras não-negociáveis** — nunca violar, mesmo que pareça conveniente para um fix rápido:
- **Zero menção a "CIBOX"** em qualquer lugar — código, texto de UI, commit, nome de
  arquivo, comentário, nome de repositório. (Já vazou uma vez em comentário de código,
  commit `4856a0f` — corrigido, mas é o tipo de erro que não pode se repetir.)
- **Isolamento entre clientes é feito por RLS no Postgres** (`is_admin()` e
  `cliente_do_usuario()` em `supabase/migrations/0001_init.sql`), nunca por filtro no
  front-end. Um `if (role === 'cliente')` escondendo dados na UI não é isolamento — é
  decoração. Se um dado não pode vazar, a policy do banco é que garante isso.
- **`printers.cliente` é dado nosso, nunca da API.** Definido pelo admin da Cross no
  cadastro (hoje: import de planilha), porque é ele que a RLS compara contra
  `profiles.cliente_associado`. O `customer.name` que a API do PrintWayy devolve não
  tem garantia nenhuma de bater com esse texto — é dado de um sistema de terceiro, sob
  controle da CIBOX, não da Cross. `printwayy-sync` nunca deve escrever esse campo
  (já causou um bug real, ver "Fluxo de dados").
- **`service_role key` e `PRINTWAYY_API_KEY` nunca aparecem em código de front-end**
  nem em arquivo commitado. A primeira só existe dentro das Edge Functions
  (`manage-users`, `printwayy-sync`, injetada automaticamente pelo Supabase) ou em
  comandos pontuais de terminal para bootstrap manual (ver `README.md`). A segunda só
  existe como secret de `printwayy-sync` — nunca em variável `VITE_*`.
- **Sem `localStorage`/`sessionStorage` para dado de negócio** (impressoras, leituras,
  relatórios). Tudo vive no Supabase — sessão de auth é a única coisa que o SDK do
  Supabase guarda no browser, e isso é gerenciado pela própria lib, não por nós.
- **Todo texto de interface em português do Brasil.**
- **Campo `contractName` da API do PrintWayy nunca deve ser exibido ao cliente** — o
  número correto do contrato é fixo, configurado manualmente (`049/2026` pro contrato
  atual), não o que a API devolve.
- **Contas de infraestrutura** (Supabase, HostGator, GitHub) estão sob identidade
  pessoal de João (`jvpereira-s`), não da Cross — decisão consciente, sem plano de
  migração; não sugerir "migrar pra conta da empresa" como se fosse pendência.

**Estrutura de pastas**:
- `src/lib/` — lógica de negócio pura, sem JSX, testável isoladamente:
  - `mapping.js` — heurística de reconhecimento de colunas da planilha importada
    (`guessMapping`) e detecção automática da linha de cabeçalho real
    (`findHeaderRowIndex`/`rowsFromSheet`), porque o export do PrintWayy traz
    logo/título/dados do cliente antes da linha de colunas.
  - `importPrinters.js` — transforma linhas da planilha já mapeadas em payload de
    `printers`/`readings` prontos para gravar.
  - `db.js` — leitura/escrita em `printers`/`readings` via Supabase (RLS decide o que
    cada usuário vê; não há filtro de cliente aqui de propósito).
  - `printerStats.js` — deriva status (online/offline/sem-dados/sem-monitoramento),
    KPIs e listas agregadas a partir de `printers` + `readings`.
  - `report.js` — matemática do relatório por período (`computeReportRows`), validada
    contra relatório real do PrintWayy (52.494 páginas, período 28/04–27/05/2026).
  - `reportExport.js` — exportação CSV/Excel/PDF do relatório.
  - `auth.js` / `users.js` — login por usuário (e-mail sintético `user@cross.local`) e
    operações privilegiadas de conta (via Edge Function `manage-users`).
  - `printwayySync.js` — dispara a sincronização via API do PrintWayy (Edge Function
    `printwayy-sync`), chamada pelo botão "Sincronizar agora" no Painel.
  - `theme.js` — paleta de cores da marca.
- `src/pages/` — telas completas: `Login`, `Painel` (dashboard + import), `Relatorio`,
  `Usuarios` (gestão de contas, só admin).
- `src/components/` — peças reutilizáveis de UI (`AppShell`, `PrinterDetailModal`,
  `RegisterPrinterModal`, `Globe` (globo 3D da tela de login), gráficos, etc.), sem
  lógica de negócio própria — chamam as funções de `src/lib/`.
- `supabase/migrations/` — schema do banco, aplicado manualmente via SQL Editor, em
  ordem numérica. Mudança de schema = nova migration numerada, nunca editar uma já
  aplicada em produção.
- `supabase/functions/manage-users/` — Edge Function (Deno) para criar/excluir/trocar
  senha de usuário; é a única peça do sistema com acesso à `service_role key`.
- `supabase/functions/printwayy-sync/` — Edge Function (Deno) que busca impressoras e
  contadores na API REST do PrintWayy e grava em `printers`/`readings`; única peça com
  acesso à `PRINTWAYY_API_KEY`. Disparada por Cron Job diário (Dashboard do Supabase)
  e pelo botão "Sincronizar agora" no Painel.

**Fluxo de dados** — duas vias que convivem, mesmo destino: (1) planilha do PrintWayy
→ tela de mapeamento de colunas (`Painel`) → `buildImportPayload` → `saveImport` —
bootstrap inicial, cadastra as impressoras de um cliente pela primeira vez; (2) API
REST do PrintWayy → Edge Function `printwayy-sync` (agendada ou manual) — via
definitiva/contínua. É o cadastro feito pela via (1) — não o parque inteiro visível
pela API — que define o escopo da via (2): `printwayy-sync` lê `select id, cliente
from printers`, resolve cada serial via `GET /printers?serial-number=X`, busca o
contador de cada um, e faz upsert só de metadata (`modelo`/`ip`/`local`/`conexao`) +
`readings`, nunca de `cliente`. **Bug real já corrigido** (commit `4856a0f`): a versão
inicial paginava o parque inteiro visível pela API key (~2.096 impressoras de outros
clientes da CIBOX) e escrevia `cliente = customer.name` direto da API — trazia dado
fora do escopo da Cross e podia quebrar a RLS do cliente silenciosamente se o texto
não batesse com `profiles.cliente_associado`. `computePrinterStats`/
`computeReportRows` derivam tudo que a UI mostra a partir de `printers`+`readings` sem
saber (nem precisar saber) qual via originou uma linha. Nenhum dado de negócio fica
fora do Supabase.

**Stack**: Vite + React (JS puro, sem TypeScript no front), Tailwind CSS v4, Supabase
(Postgres + Auth + Edge Functions), recharts, papaparse, xlsx, three + d3-geo (globo 3D
decorativo da tela de login, `src/components/Globe.jsx`). Deploy: build estático
(`npm run build` → `dist/`) publicado no HostGator via upload manual (cPanel/FTP) — ver
`README.md` seção de deploy e `MANUTENCAO.md`.

**Números de referência — contrato Saúde São Gabriel da Palha** (validar a importação
da planilha contra isso — pendência 3 abaixo, ainda não conferido contra o sistema):
- 35 impressoras no contrato.
- 124.358 páginas no período 02/05/2026–23/07/2026 (arquivo trimestral direto do
  PrintWayy, número confiável pra esse intervalo).
- Mensal, já corrigido pra fronteiras não-sobrepostas: maio 49.309, junho 49.729,
  julho (parcial) 30.228 — soma ≈ 124.371 (resíduo de 13 páginas é ruído aceitável).
- Pontos de leitura a importar: 02/05, 01/06, 01/07, 23/07 (contador de cada
  impressora em cada uma dessas datas — não o delta já calculado).

**API do PrintWayy — schema confirmado**:
- Header `printwayy-key: <token>` (não é `Authorization: Bearer`).
- Base: `https://api.printwayy.com/devices/v1`.
- `GET /printers?serial-number=X` resolve um serial pro registro da PrintWayy (campo
  `id` — GUID interno, usado só pra chamar `/counters`).
- `GET /printers/{id}/counters` — sem `date`, devolve o valor atual; com `date=`,
  devolve leitura histórica (confirmado, mas só um caso testado — conferir mais casos
  antes de confiar 100% na precisão de `dateOfCapture`).

**Pendências** (23/07/2026), nesta ordem — atualizar/riscar conforme for resolvendo:
1. ~~Deploy da função `printwayy-sync`~~ — feito (23/07/2026, via CLI: `npm install -D
   supabase`, `supabase login`/`link`/`functions deploy --use-api --no-verify-jwt`).
   `verify_jwt: false` confirmado, `manage-users` continua `true`.
2. ~~Conferir front-end por `totalFromApi`/`skippedNoCustomer`~~ — feito, `Painel.jsx`
   já usa os nomes novos (`totalRegistered`/`notFoundInPrintwayy`/`ambiguous`).
3. **Rodar a importação da planilha de São Gabriel** (35 impressoras, contrato
   049/2026) — `cliente` deve ficar exatamente `Saúde São Gabriel da Palha` (bate com
   `profiles.cliente_associado`). Popula `printers`, que é o escopo que o sync usa.
   **Bloqueado**: precisa do arquivo da planilha, que só existe com o usuário.
4. **Rodar "Sincronizar agora" e conferir a resposta** — esperado `synced: 35`,
   `errors: []`, `notFoundInPrintwayy: 0`. Depende de 3.
5. ~~Construir formulário de cadastro manual de impressora~~ — feito
   (`RegisterPrinterModal.jsx`, botão "Impressora" no Painel). Serial + cliente
   obrigatórios, resto opcional; datalist com clientes já conhecidos pra reduzir erro
   de digitação no campo cliente (RLS depende de bater exato); avisa se o serial já
   existe antes de sobrescrever. Reaproveita `saveImport` (mesma função do import de
   planilha), sem leitura ainda — só cadastro.
6. **UI de relatório com seleção de datas**: intervalo customizado livre + presets de
   mês/trimestre — ainda não iniciado.
7. **Testar isolamento RLS logando como cliente** — confirmar que só aparecem as 35
   impressoras de São Gabriel. Depende de 3.
8. **Deploy HostGator + HTTPS** — build, subir, ativar SSL (AutoSSL no cPanel). Ação
   manual do usuário (upload/cPanel), fora do alcance do Claude Code neste ambiente.
9. ~~Confirmar regeneração do token do PrintWayy~~ — usuário forneceu um token novo
   (23/07/2026), configurado como secret. Assumindo que é o token regenerado (não o
   exposto) — não verificável remotamente, mas é o que foi informado.

**Cron job `printwayy-sync-diario`**: configurado e validado ponta a ponta em
23/07/2026 — não via Dashboard, via SQL direto (Management API do Supabase, com o
access token pessoal do usuário como bearer, nunca persistido em arquivo). Sequência
rodada: `create extension pg_cron`, `create extension pg_net`, a service_role (formato
novo) guardada em `vault.create_secret(...)` (nunca em texto puro em SQL — só a chave
do Vault, `printwayy_sync_service_key`, é referenciada), depois `cron.schedule(...)`
chamando `net.http_post(...)` pra `printwayy-sync` às 11:00 UTC / 08:00 BRT todo dia.
Teste manual do `net.http_post` (mesmo payload do cron) confirmado com `status_code:
200` em `net._http_response`. Pra alterar/consultar: SQL Editor do Supabase,
`select * from cron.job;` e `select * from net._http_response order by id desc;`.
