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

**O que é**: ferramenta de monitoramento de impressoras da Cross Soluções. Importa
relatórios do PrintWayy (contadores de página e status de comunicação por impressora) e
gera relatório de impressões por período (total = contador final − contador inicial).
Dois papéis de acesso: **admin** (interno Cross, vê e importa dados de todos os
clientes) e **cliente** (externo, leitura somente do próprio contrato).

**Regras não-negociáveis** — nunca violar, mesmo que pareça conveniente para um fix rápido:
- **Zero menção a "CIBOX"** em qualquer lugar — código, texto de UI, commit, nome de
  arquivo, comentário. (CIBOX é o concorrente cujo relatório serviu de referência de
  formato; não pode aparecer no produto da Cross de forma nenhuma.)
- **Isolamento entre clientes é feito por RLS no Postgres** (`is_admin()` e
  `cliente_do_usuario()` em `supabase/migrations/0001_init.sql`), nunca por filtro no
  front-end. Um `if (role === 'cliente')` escondendo dados na UI não é isolamento — é
  decoração. Se um dado não pode vazar, a policy do banco é que garante isso.
- **A `service_role key` nunca aparece em código de front-end** nem em arquivo
  commitado. Ela só existe dentro da Edge Function `manage-users` (injetada
  automaticamente pelo Supabase) ou em comandos pontuais de terminal para bootstrap
  manual (ver `README.md`).
- **A `PRINTWAYY_API_KEY` segue a mesma regra da `service_role key`**: nunca em
  código de front-end, nunca em variável `VITE_*`, nunca commitada. Só existe como
  secret da Edge Function `printwayy-sync` (ver `README.md` seção 6).
- **Sem `localStorage`/`sessionStorage` para dado de negócio** (impressoras, leituras,
  relatórios). Tudo vive no Supabase — sessão de auth é a única coisa que o SDK do
  Supabase guarda no browser, e isso é gerenciado pela própria lib, não por nós.
- **Todo texto de interface em português do Brasil.**

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
  gráficos, etc.), sem lógica de negócio própria — chamam as funções de `src/lib/`.
- `supabase/migrations/` — schema do banco, aplicado manualmente via SQL Editor, em
  ordem numérica. Mudança de schema = nova migration numerada, nunca editar uma já
  aplicada em produção.
- `supabase/functions/manage-users/` — Edge Function (Deno) para criar/excluir/trocar
  senha de usuário; é a única peça do sistema com acesso à `service_role key`.
- `supabase/functions/printwayy-sync/` — Edge Function (Deno) que busca impressoras e
  contadores na API REST do PrintWayy e grava em `printers`/`readings`; única peça com
  acesso à `PRINTWAYY_API_KEY`. Disparada por Cron Job diário (Dashboard do Supabase)
  e pelo botão "Sincronizar agora" no Painel.

**Fluxo de dados** — duas vias, mesmo destino: (1) planilha do PrintWayy → tela de
mapeamento de colunas (`Painel`) → `buildImportPayload` → `saveImport`; (2) API REST
do PrintWayy → Edge Function `printwayy-sync` (agendada ou manual). As duas gravam em
`printers` (upsert por nº de série) e `readings` (upsert por impressora+data) no mesmo
formato — `computePrinterStats`/`computeReportRows` derivam tudo que a UI mostra a
partir dessas duas tabelas sem saber (nem precisar saber) qual via originou uma linha.
Nenhum dado de negócio fica fora do Supabase.

**Stack**: Vite + React (JS puro, sem TypeScript no front), Tailwind CSS v4, Supabase
(Postgres + Auth + Edge Functions), recharts, papaparse, xlsx. Deploy: build estático
(`npm run build` → `dist/`) publicado no HostGator via upload manual (cPanel/FTP) — ver
`README.md` seção de deploy e `MANUTENCAO.md`.
