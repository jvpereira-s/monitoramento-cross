-- Preenche o setor (`printers.local`) das impressoras que estão em branco, com o nome da
-- coluna SETOR do relatório oficial de SETEMBRO/2026 do contrato 049/2026.
-- Só atualiza onde `local` está nulo: nenhum setor já cadastrado é sobrescrito.
-- Seguro rodar mais de uma vez.
update public.printers p
set local = v.local, updated_at = now()
from (values
  ('BRBST15100', 'Almoxarifado da Farmácia'),
  ('BRBSTBD09D', 'SISVAN'),
  ('BRBSTBD09P', 'Sala de Telesaúde'),
  ('BRBSTBD097', 'Centro de Reabilitação'),
  ('BRBSTCW0BB', 'CTA')
) v(id, local)
where p.id = v.id and p.local is null
returning p.id, p.local;
-- Esperado: 5 linhas devolvidas.
