-- Três colunas em `printers` para o contador bater com o relatório oficial do contrato.
-- Todas aditivas e nullable: nenhuma linha existente muda na aplicação.
--
-- ultima_comunicacao — `lastCommunication` da PrintWayy: o último contato da IMPRESSORA
--   com o PrintWayy, não o horário da nossa sincronização. Uma impressora parada desde
--   março continua com março aqui, mesmo que o sync rode de hora em hora. Escrita só
--   pelo `printwayy-sync`.
--
-- situacao_printwayy — onde o equipamento está na PrintWayy em relação ao contrato:
--   'contrato'         o customer dele na PrintWayy é o vinculado ao nosso `cliente`;
--   'fora-do-contrato' foi movido para outro customer (ou para o estoque) — o contador
--                      fica CONGELADO no último valor do contrato, como no relatório
--                      oficial, porque o que ele imprime agora é de outro cliente;
--   'nao-encontrada'   serial não existe na PrintWayy (equipamento sem monitoramento,
--                      contador lançado manualmente).
--
-- removida_em — data em que o equipamento saiu do contrato (troca/devolução). Nula =
--   ativa. É dado nosso, preenchido pelo admin. O relatório ainda a conta em períodos
--   que começam antes dessa data (histórico preservado). O painel e o sync a ignoram.
alter table public.printers
  add column ultima_comunicacao timestamptz,
  add column situacao_printwayy text
    check (situacao_printwayy in ('contrato', 'fora-do-contrato', 'nao-encontrada')),
  add column removida_em date;
