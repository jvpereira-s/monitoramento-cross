-- Departamento é a unidade administrativa (ex.: "Secretaria Municipal de Saúde"),
-- separada de `local`, que passa a guardar o ponto físico exato do equipamento
-- (ex.: "ESF São Sebastião", "CAPS", "UBS Progresso"). Antes os dois viviam
-- amontoados em `local`. Coluna nullable e aditiva — nenhum dado existente é tocado
-- na aplicação da migration; o preenchimento é feito por UPDATE separado (ver
-- MANUTENCAO.md) ou pelo import/cadastro manual.
--
-- Assim como `local` e `cliente`, `departamento` é DADO NOSSO, nunca da API do
-- PrintWayy — a Edge Function `printwayy-sync` não escreve esta coluna (o payload de
-- toPrinterRow não a inclui, então o upsert de sincronização nunca a sobrescreve).
alter table public.printers
  add column departamento text;
