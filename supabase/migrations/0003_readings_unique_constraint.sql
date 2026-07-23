-- Sincronização via API (Edge Function printwayy-sync) grava em `readings` no mesmo
-- formato da importação manual. Sem uma unique constraint em (printer_id, data),
-- sincronizar o mesmo dia duas vezes (botão "Sincronizar agora" clicado 2x, ou o cron
-- rodando de novo após uma falha) cria linhas duplicadas em vez de atualizar a existente.

-- 1) Remove duplicatas hoje existentes em (printer_id, data) antes de criar a constraint —
--    ADD CONSTRAINT falha se já existir violação. Mantém a leitura mais recente (maior
--    imported_at; em empate, maior id) de cada grupo duplicado e apaga as demais.
--    ATENÇÃO: isto apaga linhas. Faça backup antes (MANUTENCAO.md, seção 5).
delete from public.readings r
using public.readings r2
where r.printer_id = r2.printer_id
  and r.data = r2.data
  and (r.imported_at, r.id) < (r2.imported_at, r2.id);

-- 2) O índice sem nome criado em 0001_init.sql fica redundante com o índice único que a
--    constraint abaixo cria automaticamente sobre as mesmas duas colunas. Remove pra não
--    manter dois índices fazendo o mesmo trabalho. O nome é o default do Postgres para
--    `create index on readings (printer_id, data)`; IF EXISTS torna a linha inofensiva
--    mesmo se o nome real divergir (confira com \d readings se quiser ter certeza).
drop index if exists public.readings_printer_id_data_idx;

-- 3) A constraint que resolve o problema: upsert com onConflict (printer_id, data) passa
--    a atualizar a linha existente em vez de duplicar ou falhar.
alter table public.readings
  add constraint readings_printer_id_data_key unique (printer_id, data);
