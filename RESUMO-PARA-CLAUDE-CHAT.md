# Monitoramento Cross — resumo do projeto para continuar em outra conversa

Contexto completo do que foi construído até agora, pra colar no início de uma conversa
nova (Claude Chat ou outra sessão do Claude Code) e já ter o pano de fundo sem precisar
reexplicar tudo.

## O que é o sistema

Ferramenta interna da Cross Soluções para substituir um protótipo React validado
(usado só pra provar a lógica) por uma versão de produção real. Monitora o parque de
impressoras alugado a clientes: importa relatórios do PrintWayy (contadores de página e
status de comunicação), guarda histórico de leituras e gera relatório de impressões por
período (PDF, Excel, CSV). Dois papéis de acesso:

- **Admin** (interno Cross): vê e importa dados de todos os clientes, gerencia contas de
  usuário (criar/excluir/trocar senha).
- **Cliente** (externo): acesso somente-leitura ao próprio contrato — não vê nada de
  outros clientes.

## Regras não-negociáveis (nunca flexibilizar)

- **Zero menção a "CIBOX"** em qualquer lugar do produto — código, UI, commit, nome de
  arquivo. CIBOX é o concorrente cujo formato de relatório serviu de referência; não
  pode aparecer no produto da Cross.
- **Isolamento entre clientes é feito por RLS no Postgres** (Row Level Security do
  Supabase), nunca por filtro no front-end. Um cliente logado nunca deve conseguir ver
  dado de outro, mesmo manipulando a requisição — a garantia é no banco.
- **A `service_role key` do Supabase nunca aparece em código de front-end** nem em
  arquivo commitado. Só existe dentro de uma Edge Function (injetada automaticamente) ou
  em comandos pontuais de terminal para bootstrap manual.
- **Sem `localStorage`/`sessionStorage` para dado de negócio** (impressoras, leituras,
  relatórios). Tudo vive no Supabase.
- **Todo texto de interface em português do Brasil.**

## Stack

Vite + React (JavaScript puro, sem TypeScript no front) + Tailwind CSS v4 + Supabase
(Postgres + Auth + Edge Functions em Deno) + recharts (gráficos) + papaparse/xlsx
(leitura de planilha) + lucide-react (ícones). Deploy: build estático publicado no
HostGator (hospedagem compartilhada, sem Node no servidor).

## Estrutura de pastas

```
src/
  lib/              lógica de negócio pura, sem JSX
    mapping.js        heurística de reconhecimento de colunas da planilha importada +
                       detecção automática da linha de cabeçalho real (o export do
                       PrintWayy traz logo/título/dados do cliente antes das colunas)
    importPrinters.js transforma linhas mapeadas em payload de printers/readings
    db.js              leitura/escrita em printers/readings via Supabase
    printerStats.js    deriva status (online/offline/sem-dados/sem-monitoramento) e KPIs
    report.js          matemática do relatório por período (total = contador final -
                       contador inicial) — validada contra relatório real: 52.494
                       páginas no período 28/04-27/05/2026
    reportExport.js    exportação CSV/Excel/PDF
    auth.js / users.js login por usuário (e-mail sintético user@cross.local) e gestão
                       de contas (via Edge Function)
    theme.js           paleta de cores da marca
  pages/            Login, Painel (dashboard + import), Relatorio, Usuarios (só admin)
  components/       AppShell, PrinterDetailModal, gráficos, StatusDot, etc.
supabase/
  migrations/       schema do banco (numerado, aplicado via SQL Editor)
  functions/manage-users/  Edge Function: criar/excluir/trocar senha de usuário
                            (única peça com acesso à service_role key)
```

## Lógica de negócio importante

- **Mapeamento de colunas**: a planilha do PrintWayy não tem nome de coluna fixo nem
  linha de cabeçalho previsível (tem preâmbulo com logo/título antes). O sistema
  escaneia as primeiras linhas procurando qual bate com termos conhecidos
  (`guessMapping`/`findHeaderRowIndex`) e sugere o mapeamento, mas o admin sempre
  confirma manualmente antes de importar.
- **Cálculo do relatório**: para cada impressora do cliente, pega a leitura mais
  recente ≤ data de início e a mais recente ≤ data de fim do período; total = fim -
  início. Importado tanto por planilha "de período" (contador início + fim na mesma
  linha) quanto por leituras soltas ao longo do tempo.
- **Status da impressora**: `online`/`offline` vem do texto de status da planilha (se
  tiver) ou de dias sem nova leitura (configurável, padrão 7 dias). `sem-dados` = nunca
  importado. `sem-monitoramento` = contador de página zerado (a impressora está
  "pingando" mas o PrintWayy não está recebendo contagem real de páginas dela) — esse
  status sobrepõe os outros e tem card dedicado no Painel.
- **Login**: por usuário (não e-mail), resolvido pra um e-mail sintético
  `<usuario>@cross.local` internamente, porque o Supabase Auth exige e-mail.

## O que foi construído (histórico)

Sistema completo em 7 fases: Scaffold → Banco (schema + RLS) → Auth (login por
usuário) → Painel/Importação → Relatório (3 formatos de export) → Usuários (CRUD
completo, edge function) → Deploy. Depois disso, uma sessão longa de testes reais com
o admin, corrigindo bugs encontrados ao vivo e adicionando ajustes pedidos:

- Fix de race condition que deixava a tela em branco depois do login.
- Fix de bug de RLS que quebrava o carregamento do próprio perfil do admin.
- Suporte a relatórios reais do PrintWayy com preâmbulo antes do cabeçalho (mapeamento
  vinha vazio sem isso).
- Filtro de cliente no Painel passou a valer pra KPIs/gráficos, não só a tabela.
- Gráfico "clientes que mais imprimem" (visão agregada quando "todos os clientes" está
  selecionado).
- Modal de detalhe por impressora (clicável na tabela), com exportação de relatório
  escopada só àquele equipamento.
- Status "sem monitoramento de páginas" (contador zerado) como classificação própria,
  com card dedicado no Painel.
- Favicon trocado do padrão do Vite pro logo da Cross.
- Preparação para deploy no HostGator: `vite.config.js` com `base: './'` (funciona na
  raiz do domínio ou em subpasta sem reconfigurar), fix de um bug de resolução de URL
  do logo no PDF que só apareceria em subpasta, `.htaccess` com gzip + cache dos
  assets com hash.
- Criados `CLAUDE.md` (contexto do projeto pra sessões futuras do Claude Code) e
  `MANUTENCAO.md` (guia de manutenção: rodar local, publicar, adicionar cliente,
  alterar banco com segurança, backup do banco).

## Estado atual / pendências

- **Deploy**: decidido ir de HostGator (hospedagem compartilhada, upload manual do
  build — sem deploy automático por git). Clientes começam a acessar a partir de
  23/07/2026. SSL/HTTPS do domínio precisa estar confirmado antes disso (não verificável
  remotamente).
- **Dados de teste**: ainda não foi rodado o `truncate` pra limpar os dados de teste
  do banco antes do go-live, nem a reimportação com as datas corretas do período
  (28/04 e 27/05/2026) — isso precisa acontecer antes de divulgar o link pros clientes.
- **Teste ponta a ponta**: login → import → total de 52.494 batendo → exports (PDF/
  Excel/CSV) → CRUD de usuário → isolamento por RLS logado como cliente — ainda não
  foi feito de forma completa e confirmada.
- **Git**: repositório local só, sem remote configurado (o push que falhou antes era
  por isso — nunca chegou a existir um remote). Só existem 2 commits: o scaffold
  inicial completo, e um commit recente só com a documentação (`CLAUDE.md`,
  `MANUTENCAO.md`, `README.md`). Todo o resto do trabalho da sessão de testes (fixes,
  favicon, modal de detalhe, prep pro HostGator) está **modificado mas não
  commitado** — decisão pendente do usuário sobre commitar isso.
