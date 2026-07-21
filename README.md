# Monitoramento Cross

Ferramenta interna da Cross Soluções para monitorar o parque de impressoras alugado a
clientes: importa relatórios do PrintWayy Dragon, mantém histórico de leituras de
contador e gera relatório de impressões por período (PDF, Excel, CSV), com login de
administrador (Cross) e de cliente (acesso somente-leitura ao próprio contrato).

Stack: Vite + React, Tailwind CSS v4, Supabase (Postgres + Auth + Edge Functions),
recharts, papaparse, xlsx. Deploy: Vercel.

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

## 5. Deploy no Vercel

1. Suba este repositório para o GitHub (numa conta/organização da Cross, sem qualquer
   referência a outras empresas no nome).
2. No Vercel: **Add New → Project** → importe o repositório. Framework detectado
   automaticamente (Vite).
3. Em **Environment Variables**, adicione:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

   (são públicas por natureza — ficam expostas no bundle do navegador de qualquer app
   Supabase; o que protege os dados é o RLS do banco, não o segredo dessas variáveis.)
4. Deploy. Build command e output directory são os padrões do Vite (`vite build` /
   `dist`), não precisa mexer.

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
