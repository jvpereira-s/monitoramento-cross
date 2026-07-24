# Monitoramento Cross

Ferramenta interna da Cross Soluções para monitorar o parque de impressoras alugado a
clientes: importa relatórios do PrintWayy Dragon, mantém histórico de leituras de
contador e gera relatório de impressões por período (PDF, Excel, CSV), com login de
administrador (Cross) e de cliente (acesso somente-leitura ao próprio contrato).

Stack: Vite + React, Tailwind CSS v4, Supabase (Postgres + Auth + Edge Functions),
recharts, papaparse, xlsx. Deploy: build estático publicado no HostGator.

Este guia assume que você **não programou o projeto** — cada passo diz exatamente onde
clicar/rodar.

## 1. Rodar localmente

Pré-requisito: Node.js 20+.

```bash
npm install
cp .env.example .env
```

Abra o `.env` e preencha com os dados do seu projeto Supabase (Project Settings → API):

```
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...   # chave pública/anon — nunca a secret/service_role
```

```bash
npm run dev
```

## 2. Banco de dados (Supabase)

No painel do Supabase → **SQL Editor** → New query, rode os arquivos de
[supabase/migrations/](supabase/migrations/) **em ordem** (0001, depois 0002), cada um
em uma consulta separada:

- `0001_init.sql` — tabelas `profiles`, `printers`, `readings` + Row Level Security
  (isolamento entre clientes é garantido aqui, no banco — não no código do front-end).
- `0002_username.sql` — adiciona login por usuário (em vez de e-mail).

## 3. Criar o primeiro administrador

O app só permite criar novos usuários pela tela **Usuários** (Fase 6), mas essa tela
exige que já exista um admin logado — então o primeiro precisa ser criado manualmente,
uma única vez. Inserir direto em `auth.users` via SQL é frágil (a estrutura interna muda
entre versões do Supabase), então use a Admin API do próprio Supabase:

Em Project Settings → API, pegue a **service_role key** (nunca commitar, nunca colar em
código do front-end). Rode:

```bash
curl -X POST "https://SEU-PROJETO.supabase.co/auth/v1/admin/users" \
  -H "apikey: SUA_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer SUA_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@cross.local","password":"UMA_SENHA_FORTE","email_confirm":true}'
```

A resposta traz um `"id"` (UUID). Com esse id, insira o perfil correspondente (esse
insert também precisa da service_role key, porque bypassa o RLS — é o único jeito de
criar o primeiro admin sem já ter um admin):

```bash
curl -X POST "https://SEU-PROJETO.supabase.co/rest/v1/profiles" \
  -H "apikey: SUA_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer SUA_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"id":"O_UUID_RETORNADO","role":"admin","username":"admin","cliente_associado":null}'
```

Pronto — login no app com usuário `admin` e a senha que você definiu. Troque a senha
pela própria tela de Usuários assim que puder.

## 4. Edge Function `manage-users`

Responsável por criar, excluir e trocar senha de usuários (usa a service_role key
internamente — ela nunca aparece no front-end).

No painel do Supabase → **Edge Functions** → Deploy a new function → nome exatamente
`manage-users` → cole o conteúdo de
[supabase/functions/manage-users/index.ts](supabase/functions/manage-users/index.ts) →
implantar.

Atenção: se o navegador tiver tradução automática ativada (Google Tradutor / tradução
do Chrome), **desative-a nessa página antes de colar** — ela traduz até palavras-chave
do código (`if`→`se`, `.from()`→`.de()`), quebrando a função. Confirme que o código
colado continua em inglês antes de implantar.

Não é preciso configurar nenhum secret: `SUPABASE_URL`, `SUPABASE_ANON_KEY` e
`SUPABASE_SERVICE_ROLE_KEY` já ficam disponíveis automaticamente em toda Edge Function.

## 5. Deploy no HostGator

O app é um SPA estático (sem servidor Node) — hospedagem compartilhada comum resolve.
`vite.config.js` usa `base: './'` de propósito: o build funciona tanto publicado na
raiz do domínio quanto numa subpasta, sem precisar reconfigurar nada.

1. Gere o build com o `.env` de produção já preenchido (seção 1 deste guia):
   ```bash
   npm run build
   ```
   Isso cria `dist/` com tudo que precisa ser publicado. As variáveis
   `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` ficam embutidas no JS gerado — são
   públicas por natureza (o que protege os dados é o RLS do banco, não o segredo dessas
   variáveis).
2. No cPanel do HostGator (File Manager ou FTP), envie o **conteúdo** de `dist/` (não a
   pasta em si) para `public_html/` (ou a subpasta escolhida).
   **Atenção**: `dist/.htaccess` é um arquivo oculto (gzip + cache dos assets) — ative
   "Show Hidden Files" no File Manager/FTP antes de enviar, senão ele fica pra trás.
3. Confirme que o domínio tem **SSL/HTTPS ativo** (AutoSSL grátis do cPanel) antes de
   liberar acesso a clientes — o login manda usuário/senha pela rede.
4. Cada nova alteração de código exige repetir os passos 1–2 (não há deploy automático
   por git nesse tipo de hospedagem). Detalhado em `MANUTENCAO.md`.

## 6. Sincronização automática via API do PrintWayy

Além da importação manual de planilha (que continua funcionando normalmente como
fallback e é quem faz o cadastro inicial de cada impressora), o Painel pode atualizar
os dados direto da API REST do PrintWayy Dragon — automaticamente todo dia, e a
qualquer momento pelo botão **Sincronizar agora** (admin). É a planilha que decide
**quais** impressoras existem e de qual cliente são; a API só atualiza contador e
metadata (modelo/IP/local/conexão) de quem **já está cadastrado** — nunca cadastra
impressora nova nem sobrescreve o campo "Cliente" (ver regra em `CLAUDE.md`, seção 5).

1. **Configure o secret da API** (nunca em `.env`, nunca em variável `VITE_*` — essas
   são embutidas no bundle público do front-end):
   ```bash
   npx supabase secrets set PRINTWAYY_API_KEY=SEU_TOKEN_DO_PRINTWAYY
   ```
   O token é gerado em PrintWayy → Configurações → Integração → Gerar token (exige
   usuário administrador no PrintWayy).
2. **Implante a Edge Function** `printwayy-sync`. Duas opções:
   - **CLI (recomendado)** — evita o risco de tradução automática do navegador
     estragar o código colado (problema real da opção Dashboard, seção 4):
     ```bash
     npm install -D supabase
     npx supabase login              # abre o navegador, autentica
     npx supabase link --project-ref SEU_PROJECT_REF   # em Project Settings → General
     npx supabase functions deploy printwayy-sync --use-api --no-verify-jwt
     ```
     `--use-api` evita exigir Docker Desktop rodando. `--no-verify-jwt` já resolve o
     passo 3 abaixo nesse mesmo comando.
   - **Dashboard** — Edge Functions → Deploy a new function → nome exatamente
     `printwayy-sync` → cole o conteúdo de
     [supabase/functions/printwayy-sync/index.ts](supabase/functions/printwayy-sync/index.ts)
     → implantar. Mesmo cuidado da seção 4 com tradução automática do navegador —
     confirme que o código colado continua em inglês/TypeScript antes de implantar.
3. **Desligue "Enforce JWT Verification" só para esta função** — já incluído no
   comando da CLI acima (`--no-verify-jwt`); se implantou pelo Dashboard, faça em Edge
   Functions → `printwayy-sync` → Settings. Necessário porque a chave deste projeto já
   está no formato novo do Supabase (`sb_publishable_.../sb_secret_...`) — não é mais
   um JWT, então o cron (próximo passo) seria rejeitado pelo gateway antes de chegar no
   código. A função já valida o chamador sozinha (sessão de admin, ou a própria
   service_role key para a chamada agendada), então desligar o check genérico da
   plataforma não abre brecha nenhuma.
4. **Configure a sincronização agendada.** Neste projeto já está feito (23/07/2026) —
   pulei o Dashboard e rodei direto por SQL, porque assim o token nunca passa por um
   formulário/tela intermediária:
   ```sql
   create extension if not exists pg_cron;
   create extension if not exists pg_net;

   -- guarda a service_role (formato novo, sb_secret_...) no Vault — nunca em texto
   -- puro no comando do cron abaixo
   select vault.create_secret(
     'SUA_SERVICE_ROLE_KEY_NOVO_FORMATO',
     'printwayy_sync_service_key',
     'service_role usada pelo cron do printwayy-sync'
   );

   select cron.schedule(
     'printwayy-sync-comercial',
     '0 10-21 * * *', -- 10:00-21:00 UTC = 07:00-18:00 BRT, de hora em hora (12x/dia)
     $$
     select net.http_post(
       url := 'https://SEU-PROJETO.supabase.co/functions/v1/printwayy-sync',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'printwayy_sync_service_key')
       ),
       body := '{"action":"sync"}'::jsonb,
       timeout_milliseconds := 60000
     ) as request_id;
     $$
   );
   ```
   Rode isso no **SQL Editor** do Dashboard (ou via Management API, como foi feito
   aqui). Confirmar: `select * from cron.job;` (deve aparecer `active: true`) e, depois
   de qualquer execução, `select * from net._http_response order by id desc limit 5;`
   pra ver o `status_code` da última chamada.

   **Pra mudar a frequência** depois: `select cron.unschedule('printwayy-sync-comercial');`
   e rode o `cron.schedule(...)` de novo com outro nome/horário — o comando referencia
   o mesmo secret do Vault, não precisa recriar o `vault.create_secret`. Sintaxe de
   `hora-hora`: `0 H1-H2 * * *` roda no minuto 0 de cada hora entre H1 e H2 (UTC,
   inclusive dos dois lados); ajuste H1/H2 subtraindo 3 do horário de Brasília
   desejado.

   **Alternativa sem SQL**: Dashboard → Cron Jobs → New cron job → HTTP Request, mesma
   URL/Schedule/Body, header `Authorization: Bearer SUA_SERVICE_ROLE_KEY_NOVO_FORMATO`
   direto (sem Vault) — mais simples, mas a chave fica visível em texto puro pra quem
   tiver acesso à configuração do cron job no Dashboard.

   **Atenção**: use a `service_role` no formato **novo** (`sb_secret_...`), não a
   legada (JWT começando com `eyJ...`) — testado na prática (23/07/2026): a legada
   recebe 401 da própria função, porque `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`
   dentro da Edge Function resolve pro valor novo nesse projeto. Pra ver o valor:
   `npx supabase projects api-keys --project-ref SEU_PROJECT_REF --reveal` (campo
   `type: "secret"`) ou Dashboard → Project Settings → API Keys.

**Escopo da sincronização**: só impressoras já cadastradas em `printers` (via
importação de planilha, seção 2, ou cadastro manual futuro) entram na sincronização —
a função lê o cadastro, resolve cada número de série na API do PrintWayy
(`GET /printers?serial-number=X`) e atualiza. Uma impressora com serial não encontrado
na API aparece em `notFoundInPrintwayy` na resposta; nunca é criada nem removida por
essa via. O campo "Cliente" nunca vem da API — é sempre o que foi definido no cadastro,
porque é ele que a RLS usa pra isolar os dados por contrato (`profiles.cliente_associado`
precisa bater exatamente com esse valor).

## Segurança — o que nunca fazer neste projeto

- Nunca colar a `service_role key` em código de front-end, `.env` commitado, ou em
  qualquer arquivo do repositório. Ela só existe: (a) em comandos pontuais de terminal
  para bootstrap manual (seção 3), ou (b) dentro da Edge Function, injetada
  automaticamente pelo Supabase.
- Nunca reimplementar isolamento de cliente no front-end (tipo `if (role === 'cliente')
  filtra os dados`). O RLS já garante isso no banco; duplicar a regra no código é
  redundante e, se ficar dessincronizado, vira brecha de segurança.
- Sem `localStorage`/`sessionStorage` para dados de negócio (impressoras, leituras,
  relatórios). Tudo vive no Supabase.

## Nota sobre a dependência `xlsx`

O `npm audit` acusa uma vulnerabilidade *high* (prototype pollution / ReDoS) na
biblioteca `xlsx` (SheetJS), sem correção publicada no registro npm — a SheetJS parou de
publicar patches lá. O parsing só roda em arquivos que o admin da Cross importa
manualmente (não é uma superfície exposta a usuários externos), então o risco prático é
baixo. Se quiser eliminar o aviso, dá pra trocar pela build mais recente direto do site
da SheetJS (https://sheetjs.com).
