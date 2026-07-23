# Manutenção — Monitoramento Cross

Guia para manter o sistema sem precisar reexplicar o projeto do zero toda vez. Escrito
para quem sabe mexer em código, mas não decorou este projeto específico.

Regra geral: **alteração de código é segura e reversível** — o Git guarda todo o
histórico, e se algo der errado dá pra voltar. **Alteração no banco de dados com dado
real de cliente é o ponto onde dá pra errar de verdade** — trate com mais cuidado e
sempre com backup antes (seção 5).

## 1. Rodar o projeto localmente

Pré-requisito: Node.js 20+.

```bash
npm install
cp .env.example .env
```

Preencha o `.env` com os dados do projeto Supabase (Project Settings → API no painel
do Supabase):

```
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```

Nunca coloque a `service_role key` aqui — só a `anon`/`publishable`. Detalhes de por
quê em `CLAUDE.md`, seção "Regras não-negociáveis".

```bash
npm run dev
```

Abre em `http://127.0.0.1:5173` (se `localhost` não conectar, é IPv6 vs IPv4 — use o IP
`127.0.0.1` direto).

## 2. Fazer uma alteração simples e publicar

Vale para: mudar um texto, uma cor, adicionar/remover uma coluna do relatório, ajustar
um cálculo, etc.

1. Edite o arquivo relevante (veja a estrutura de pastas em `CLAUDE.md`, seção 5, se
   não souber onde procurar).
2. Teste em `npm run dev` (seção 1) — confira no navegador que ficou como esperado.
3. Rode o lint antes de publicar:
   ```bash
   npx oxlint src
   npm run build
   ```
   Os dois precisam terminar sem erro. `npm run build` também pega erros que o dev
   server às vezes deixa passar.
4. Se estiver satisfeito, versione:
   ```bash
   git add -A
   git commit -m "descrição curta da mudança"
   ```
5. Publique no HostGator:
   ```bash
   npm run build
   ```
   Envie o **conteúdo** de `dist/` (não a pasta em si) para `public_html/` (ou a
   subpasta configurada) via File Manager ou FTP do cPanel. Ative "Show Hidden Files"
   antes — o `dist/.htaccess` é oculto e precisa ir junto.

   **Diferente de Vercel/Netlify: não existe deploy automático aqui.** Todo `git push`
   fica só no histórico local/GitHub — o site só atualiza quando você repete o upload
   manual do passo 5. Não esqueça esse passo depois de um commit, ou o ar-vivo fica
   desatualizado.

## 3. Adicionar um novo cliente

1. Logado como admin, vá em **Usuários** → preencha Usuário, Senha, Papel = "Cliente",
   e **Cliente associado**.
2. O valor de "Cliente associado" precisa bater **exatamente** (mesmas
   maiúsculas/minúsculas, sem espaço a mais) com o nome de cliente que vai aparecer na
   coluna "Cliente" das impressoras desse contrato. Se não bater, o RLS não libera
   nenhum dado pra esse usuário — ele loga e vê tudo vazio, sem erro nenhum aparente.
   Antes de criar a conta, confira o nome exato no filtro de cliente do Painel (como
   admin) — se o cliente já tem impressoras importadas, o nome certo já está ali na
   lista.
3. Os dados desse cliente entram pela importação normal (botão **Importar** no Painel,
   só admin vê): na tela de mapeamento de colunas, o campo "Cliente (nome curto, não o
   contrato)" precisa apontar pra a coluna da planilha com esse nome — ou, se a
   planilha não tiver essa coluna, o import cai no cliente padrão
   (`DEFAULT_CLIENT` em `src/lib/importPrinters.js`), o que quase certamente **não** é
   o cliente novo. Confira esse campo sempre que importar dado de um cliente diferente
   do padrão.

A sincronização automática via API (seção 6) **não muda nada disso** — ela nunca
escreve a coluna "Cliente", só atualiza contador/metadata de impressoras que já
passaram por este cadastro. Ou seja: um cliente novo sempre entra por aqui (planilha)
primeiro; a API só mantém os dados desse cliente atualizados depois.

## 4. Alterar o banco de dados com segurança

Qualquer mudança de schema (nova coluna, nova tabela, nova constraint, nova policy de
RLS) = um novo arquivo em `supabase/migrations/`, numerado em sequência
(`0003_algo.sql`, `0004_outra_coisa.sql`...). **Nunca edite um arquivo de migration já
aplicado em produção** — mesmo que pareça mais simples; se o schema já rodou, editar o
arquivo antigo só faz o histórico mentir sobre o que o banco realmente é hoje.

Antes de rodar qualquer migration (ou qualquer SQL manual) contra o banco de produção:

1. **Faça o backup primeiro** (seção 5). Sem exceção, mesmo para mudança que parece
   trivial — o custo do backup é baixo, o custo de perder dado de cliente não é.
2. Leia o SQL inteiro antes de rodar. Prefira mudanças aditivas (`ADD COLUMN` que
   aceita nulo) a destrutivas (`DROP COLUMN`, `DROP TABLE`, `ALTER ... NOT NULL` numa
   tabela com dado existente que pode violar a constraint). Exemplo real do padrão
   "destrutivo mas necessário" já neste projeto: `0003_readings_unique_constraint.sql`
   apaga leituras duplicadas antes de criar uma unique constraint (que exige dado sem
   violação pra ser criada) — backup antes, sem exceção, mesmo com o `IF EXISTS`/
   filtro cuidadosos no SQL.
3. Rode no **SQL Editor** do painel do Supabase, em uma migration por vez. Se algo
   der erro no meio, pare e resolva antes de continuar — não tem transação automática
   entre migrations diferentes.
4. Se não tiver certeza do impacto de um SQL específico, peça pro Claude Code revisar
   antes de rodar (cole o SQL e pergunte o que ele muda e o que pode dar errado).

## 5. Backup do banco

Faça isso **antes** de qualquer alteração de schema, antes de rodar SQL manual em
produção (como o `truncate` usado pra limpar dado de teste), e periodicamente mesmo sem
mudança planejada (dado de cliente sendo importado toda semana merece backup próprio).

### Opção rápida — exportar as tabelas de negócio em CSV

Não cobre schema nem usuários de login, só serve pra recuperar dado de impressora/leitura
se algo for apagado por engano. Suficiente para o dia a dia:

1. Painel do Supabase → **Table Editor**.
2. Para cada tabela (`profiles`, `printers`, `readings`): abra a tabela → menu (`...`)
   → **Export data** → CSV. Guarde os três arquivos com a data no nome (ex:
   `readings-2026-07-21.csv`).

### Opção completa — backup real do banco (`pg_dump`)

Cobre schema, RLS policies e todo o dado. Use antes de migration ou de qualquer SQL
destrutivo.

Pré-requisito: `pg_dump` instalado (vem com o PostgreSQL — se não tiver, instale o
cliente do Postgres; no Windows, `winget install PostgreSQL.PostgreSQL` ou baixe em
postgresql.org).

1. Painel do Supabase → **Project Settings → Database → Connection string** → aba
   **URI**, escolha a conexão **direta** (não a "connection pooling" — `pg_dump`
   precisa da direta). Copie a string, algo como:
   ```
   postgresql://postgres:[SUA-SENHA]@db.tgwxhiymjasxlmoqpyph.supabase.co:5432/postgres
   ```
   `[SUA-SENHA]` é a senha do banco Postgres — **diferente** da anon key e da
   service_role key. Se não souber qual é, tem opção de resetar ali mesmo em
   **Database → Reset database password**.
2. Rode o backup:
   ```bash
   pg_dump "postgresql://postgres:SUA-SENHA@db.tgwxhiymjasxlmoqpyph.supabase.co:5432/postgres" \
     -F c -f backup-$(date +%Y-%m-%d).dump
   ```
3. Guarde o arquivo `.dump` gerado fora da máquina local (Google Drive, e-mail pra
   você mesmo, etc.) — se o objetivo é proteção contra desastre, backup só no mesmo
   PC não protege de muita coisa.

Para restaurar, se precisar (uso raro — normalmente só em caso de perda de dado real):
```bash
pg_restore -d "postgresql://postgres:SUA-SENHA@db.tgwxhiymjasxlmoqpyph.supabase.co:5432/postgres" backup-2026-07-21.dump
```
Restaurar por cima de um banco com dado novo desde o backup **sobrescreve** esse dado
novo — confirme que é isso mesmo que você quer antes de rodar.

### Se o plano do Supabase incluir backups automáticos

Em **Database → Backups** no painel, projetos em planos pagos do Supabase mostram
backups diários já feitos automaticamente, com opção de restauração por lá mesmo. Vale
conferir se essa tela existe e tem dado no seu projeto — se sim, é uma camada extra de
segurança além do `pg_dump` manual, não um substituto (o manual você controla o
timing, o automático só ajuda dentro da janela de retenção do plano).

## 6. Sincronização automática (API do PrintWayy)

Além do botão **Importar** (planilha), o Painel pode puxar dados direto da API do
PrintWayy: automaticamente todo dia via **Cron Job** agendado no Supabase, ou a
qualquer momento pelo botão **Sincronizar agora** (admin). As duas vias — API e
planilha — gravam nas mesmas tabelas, então o import manual continua funcionando
normalmente como plano B se a API ou a chave tiverem algum problema. Setup completo
(secret, deploy da função, cron) está em `README.md`, seção 6.

- **Onde mora o token**: só como secret da Edge Function `printwayy-sync`
  (`PRINTWAYY_API_KEY`), nunca em arquivo do repositório. Pra trocar o token (ex.: se
  ele for revogado no PrintWayy), rode de novo `supabase secrets set
  PRINTWAYY_API_KEY=NOVO_TOKEN` — não precisa reimplantar a função.
- **Como saber se o cron rodou**: painel do Supabase → **Cron Jobs** → histórico de
  execuções da `printwayy-sync-diario` (mostra status e horário de cada run). Pra ver
  o que aconteceu dentro da função (quantas impressoras, quais falharam), **Edge
  Functions → printwayy-sync → Logs**.
- **Se a sincronização começar a falhar**: confira, nesta ordem, (1) se o token ainda
  é válido no PrintWayy (Configurações → Integração), (2) os logs da função pra ver a
  mensagem de erro exata, (3) a resposta do botão "Sincronizar agora" — se
  `notFoundInPrintwayy` > 0, o número de série cadastrado em `printers` não existe (ou
  mudou) na PrintWayy; se `ambiguous` > 0, mais de um registro na PrintWayy bate com o
  mesmo serial (cenário de reset de contador — a função já tenta escolher o "vivo"
  automaticamente, mas vale conferir manualmente na PrintWayy se a lista for grande).
  Import manual continua disponível como fallback enquanto o problema não é resolvido.
- **Autenticação da chamada agendada (cron)**: use sempre a `service_role` no formato
  novo (`sb_secret_...`), não a legada (JWT `eyJ...`) — a legada recebe 401 da própria
  função. Ver `npx supabase projects api-keys --reveal` (campo `type: "secret"`).

## Resumo do que nunca fazer

- Editar migration já aplicada em produção.
- Rodar SQL destrutivo em produção sem backup antes.
- Colar `service_role key` em qualquer arquivo do repositório.
- Reimplementar isolamento de cliente na UI em vez de confiar no RLS.
- Publicar (fazer commit) mudança que quebrou `npm run build` ou `npx oxlint src`.
- Colocar `PRINTWAYY_API_KEY` em variável `VITE_` ou em qualquer arquivo do
  repositório — só como secret da Edge Function `printwayy-sync`.
