# Site institucional — crosssolucoes.com.br

HTML estático, sem build. Espelha o `public_html/` do HostGator, **menos** o que não é deste
diretório:

| No servidor | Origem |
|---|---|
| `/` (`index.html`), `/robots.txt`, `/sitemap.xml` | `site/` |
| `/assets/css`, `/assets/js`, `/assets/img`, `/assets/fontes/plex*` | `site/assets/` |
| `/chamados/index.html`, `/chamados/chamado.js` | `site/chamados/` |
| `/chamados/enviar.php` + configuração | **só no servidor** — não versionado aqui, não mexer |
| `/suporte/index.html` (tela de acesso da equipe) | `site/suporte/` |
| `/suporte/` (resto: a instalação do GLPI) | **só no servidor** — não mexer |
| `/monitoramento/` | `dist/` deste repositório (`npm run build`) |
| `/.htaccess` da raiz, `/cross-logo.png`, `/assets/cross-logo.png`, `/assets/fontes/fontes.css`, `/assets/marcas/` | antigos, ficam no servidor (o GLPI e páginas antigas podem apontar para eles) |

Redesenho de 09/10/2026: identidade única (marinho `#0E2240`, cinza, laranja Cross como
acento, IBM Plex Sans) no site, em `/chamados/`, na tela do GLPI e no sistema de
monitoramento (`src/lib/theme.js`, `src/index.css`).

## Contratos que não podem mudar

- **`/chamados/`** posta `FormData` para `./enviar.php` com `nome`, `email`, `telefone`,
  `municipio`, `orgao`, `setor`, `solicitacao` e a armadilha `empresa`. Resposta JSON:
  `{ok, ticket_id}` no sucesso, `{ok:false, error, campos[]}` no 422. Os `maxlength` repetem
  os limites do servidor (120/180/40/120/180/120/5000).
- **`/suporte/index.html`** vive dentro da pasta do GLPI e é servida também na raiz de
  `suporte.crosssolucoes.com.br`. O `<base href="/suporte/">`, os `id`/`name` do formulário
  (`form-login`, `usuario`/`login_name`, `senha`/`login_password`, `erro`, `erro-texto`,
  `botao-entrar`) e o `<script>` inteiro (token CSRF via `_glpi-login`, POST em
  `front/login.php`) são os da versão anterior, sem alteração. Ao editar, mexa só na marcação
  e no estilo.
- O subdomínio `suporte.` enxerga o mesmo `public_html`, então `/assets/...` funciona nos dois
  endereços. Na tela do GLPI, o link para o site é absoluto (`https://www.…`): no subdomínio
  a raiz `/` é a própria tela do GLPI.

## Cache

O HTML aponta para `site.css`, `menu.js`, `plex.css` e `chamado.js` com `?v=AAAAMMDD`. Ao
alterar qualquer um deles, suba o número **nas três páginas** (`index.html`,
`chamados/index.html`, `suporte/index.html`) — sem isso, quem já visitou fica com a cópia velha.

## Imagens

`assets/img/` — geradas a partir dos originais (recorte, WebP q74, sem EXIF). **Imagens
ilustrativas de banco livre, não fotos de trabalho da Cross**; cada página diz isso na
legenda. Trocar por fotos reais assim que existirem, com **outro nome de arquivo**.

| Arquivo | Original | Licença |
|---|---|---|
| `painel-multifuncional-*.webp`, `compartilhar.jpg` | https://www.pexels.com/photo/electronic-device-with-screen-17235421/ | Pexels (uso comercial livre) |
| `escritorio-multifuncional*-*.webp` | https://www.pexels.com/photo/person-using-a-photocopier-9301887/ | Pexels |
| `digitalizacao-*.webp` | https://images.unsplash.com/photo-1775163035702-06e47ba88857 (a mesma que `/chamados/` já usava por link externo) | Unsplash (uso comercial livre) |
| `cross-emblema-*.png`, `favicon-*.png`, `apple-touch-icon.png` | `cross-logo.png` (o emblema da Cross), recortado e reduzido | marca da Cross |

Fonte: IBM Plex Sans variável (400–700), subsets latin e latin-ext, SIL Open Font License.

## Conteúdo

Todo texto saiu de fato já registrado: dados da empresa (CNPJ, IE, endereço, telefone,
e-mail, lema) do site e dos relatórios anteriores; serviços das categorias reais de
atendimento da Cross no GLPI (impressora, computador e notebook, tablet); recursos do
monitoramento do que o sistema faz. **Não acrescentar** cliente, número, certificação,
prazo de atendimento ou horário sem confirmação.

## Publicar

Upload por FTP com TLS (ver `MANUTENCAO.md`, mesma rotina do `/monitoramento/`):

1. Backup do que vai ser substituído: `/index.html`, `/chamados/index.html`,
   `/suporte/index.html` e `/monitoramento/index.html`.
2. Primeiro os arquivos novos (`assets/css`, `assets/js`, `assets/img`, `assets/fontes/plex*`,
   `chamados/chamado.js`, `robots.txt`, `sitemap.xml`, `monitoramento/assets/`), conferindo os
   tamanhos.
3. Por último os HTML: `chamados/index.html`, `suporte/index.html`,
   `monitoramento/index.html` e, por fim, `/index.html`.
4. Nunca apagar nada no servidor nesse processo. O rollback é subir de volta os HTML do backup.

Validar depois: as quatro telas abrem, o formulário de chamado devolve número, o login da
equipe entra no GLPI e o login do monitoramento funciona.
