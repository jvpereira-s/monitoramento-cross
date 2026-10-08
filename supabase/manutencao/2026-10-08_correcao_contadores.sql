-- Correção dos contadores do contrato 049/2026 contra o relatório oficial de SETEMBRO/2026
-- (41 impressoras, 47.743 páginas, ciclo 02/09 → 02/10). Rodar no SQL Editor, UMA vez,
-- DEPOIS de aplicar a migration 0006 e publicar a versão nova de `printwayy-sync`.
--
-- Diagnóstico (08/10/2026, via API da PrintWayy, ação `inspect` da função):
--  * 36 impressoras do contrato: `counters?date=` bate 100% com o relatório (02/09 e 02/10).
--  * BRBSSDC02V: movida na PrintWayy para outro cliente em 01/09/2026. O relatório congela
--    em 17.237; o sistema somava o que o outro cliente imprimiu.
--  * BRBST1609T: em outro cliente na PrintWayy desde antes de 23/07/2026. O relatório
--    congela em 14.779; o sync de 23/07 sobrescreveu o valor do PDF e seguiu somando.
--  * BRBST15125: no estoque (`inDealer`), contador fixo 61.759 no relatório.
--  * BRBSRB902N, BRBSSD60GZ: não existem na PrintWayy, valores fixos no relatório.
--  * BRBSSD60HN, BRBSS7C0HK: substituídas e fora do relatório de setembro.
--  * printwayy_customers tinha 3 customers alheios ligados ao Fundo, aprendidos das
--    impressoras movidas. Com o cadastro automático ligado, o sync importaria o parque deles.
--
-- Tudo o que é apagado vai antes para o schema `backup` (não exposto pela API).

begin;
create schema if not exists backup;
revoke all on schema backup from anon, authenticated;

-- 1. Leituras que pertencem a outro cliente na PrintWayy
create table backup.readings_fora_contrato_20261008 as
  select * from public.readings
  where (printer_id = 'BRBSSDC02V' and data >= '2026-09-01')
     or (printer_id = 'BRBST1609T' and data >= '2026-07-23');
delete from public.readings
  where (printer_id = 'BRBSSDC02V' and data >= '2026-09-01')
     or (printer_id = 'BRBST1609T' and data >= '2026-07-23');
-- 1609T congelada no valor do relatório oficial
insert into public.readings (printer_id, data, contador_pb, status)
  values ('BRBST1609T', '2026-07-23', 14779, null);

-- 2. Vínculos contaminados: fica só o customer do Fundo
create table backup.printwayy_customers_20261008 as select * from public.printwayy_customers;
delete from public.printwayy_customers where printwayy_customer_id <> 'c148bb03-d601-4c2e-8f8e-85f04257627b';

-- 3. Impressoras do contrato que faltavam no cadastro (contador fixo, lançado à mão)
insert into public.printers (id, cliente, local, departamento, situacao_printwayy) values
  ('BRBSRB902N', 'Fundo Municipal de Saúde de São Gabriel da Palha', 'Casa da Mulher - Drª Gyovana', 'Secretaria Municipal de Saúde', 'nao-encontrada'),
  ('BRBSSD60GZ', 'Fundo Municipal de Saúde de São Gabriel da Palha', 'Sala do Sub-Secretário', 'Secretaria Municipal de Saúde', 'nao-encontrada'),
  ('BRBST15125', 'Fundo Municipal de Saúde de São Gabriel da Palha', 'ESF Centro', 'Secretaria Municipal de Saúde', 'fora-do-contrato');
insert into public.readings (printer_id, data, contador_pb, status) values
  ('BRBSRB902N', '2026-09-02', 48787, null), ('BRBSRB902N', '2026-10-02', 48787, null),
  ('BRBSSD60GZ', '2026-09-02', 41, null),    ('BRBSSD60GZ', '2026-10-02', 41, null),
  ('BRBST15125', '2026-09-02', 61759, null), ('BRBST15125', '2026-10-02', 61759, null);

-- 4. Saíram do contrato antes do ciclo de setembro (histórico preservado)
update public.printers set removida_em = '2026-09-02' where id in ('BRBSSD60HN', 'BRBSS7C0HK');

-- 5. Situação das duas movidas
update public.printers set situacao_printwayy = 'fora-do-contrato' where id in ('BRBSSDC02V', 'BRBST1609T');
commit;

-- 6. Fechamentos históricos pela API (`counters?date=`), só impressora do contrato.
--    A resposta fica em net._http_response (conferir status_code = 200).
select net.http_post(
  url := 'https://tgwxhiymjasxlmoqpyph.supabase.co/functions/v1/printwayy-sync',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'printwayy_sync_service_key')
  ),
  body := '{"action":"fechamento","dates":["2026-06-02","2026-07-02","2026-08-02","2026-09-02","2026-10-02"]}'::jsonb,
  timeout_milliseconds := 140000
) as request_id;

-- 7. Conferência contra o relatório: deve devolver ZERO linhas e total 47.743.
--    Rodar o arquivo supabase/tests/conciliacao_setembro_2026.sql.
