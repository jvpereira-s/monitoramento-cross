-- Conciliação do banco contra o relatório oficial de SETEMBRO/2026 do contrato 049/2026
-- (ciclo 02/09/2026 → 02/10/2026, 41 impressoras, 47.743 páginas). Somente leitura.
--
-- Mesma regra de computeReportRows (src/lib/report.js): contador inicial = última leitura
-- até o início do ciclo, final = última até o fim; impressora removida do contrato antes
-- do início não entra.
--
-- Resultado esperado: nenhuma linha com `problema` e a linha TOTAL com 47743/47743.
-- Para outro mês, copie o arquivo e troque as datas e a lista `oficial`.
with oficial(serial, ini, fin) as (values
  ('BRBST1603D',19982,22635),('BRBST16039',10428,10796),('BRDSQB30F4',55459,57046),('BRBSSDB155',17276,19007),
  ('BRBSSDB14Q',21441,23209),('BRBST1609T',14779,14779),('BRBSSDB14W',62621,67465),('BRDSP4H058',220052,227412),
  ('BRBST1603Q',21431,23116),('BRDSQB602M',131775,135448),('BRBSQ9M031',29325,30262),('BRBST1606Q',21000,22716),
  ('BRBSSDB158',7124,7616),('BRBSS3F0QT',70977,70977),('BRBST16040',31166,35032),('BRBSSDB15F',17065,18246),
  ('BRBSS73142',12428,12428),('BRBST16096',13116,14248),('BRBST1609Y',28416,30884),('BRBSSDC02L',16030,17476),
  ('BRBSSDC02V',17237,17237),('BRBSSD60FP',4530,4873),('BRBSSD60GR',10113,11013),('BRBSSCD0SR',3161,3380),
  ('BRBSSD60HX',7255,7575),('BRBSSD60HZ',9206,10227),('BRBSR9P087',50152,50152),('BRBSSD60FV',7014,7473),
  ('BRBSSD401T',7182,7723),('BRBSRB902N',48787,48787),('BRBSSD60J7',4775,5028),('BRBSSD60GJ',1378,1378),
  ('BRBSSD60HB',8723,9403),('BRBSSD60H6',4185,4432),('BRBST15125',61759,61759),('BRBSSD60GZ',41,41),
  ('BRBSTBD09P',261,439),('BRBST15100',36783,37193),('BRBSTBD097',772,1122),('BRBSTBD09D',434,3349),
  ('BRBSTCW0BB',240,240)
),
periodo as (select date '2026-09-02' ini, date '2026-10-02' fin),
sistema as (
  select p.id serial,
    (select r.contador_pb from readings r where r.printer_id = p.id and r.data <= periodo.ini order by r.data desc limit 1) ini,
    (select r.contador_pb from readings r where r.printer_id = p.id and r.data <= periodo.fin order by r.data desc limit 1) fin
  from printers p, periodo
  where p.cliente = 'Fundo Municipal de Saúde de São Gabriel da Palha'
    and (p.removida_em is null or p.removida_em > periodo.ini)
),
cmp as (
  select coalesce(o.serial, s.serial) serial, o.ini oficial_ini, s.ini sistema_ini, o.fin oficial_fin, s.fin sistema_fin,
    case
      when o.serial is null then 'no sistema, fora do relatório'
      when s.serial is null then 'no relatório, fora do sistema'
      when s.ini is distinct from o.ini or s.fin is distinct from o.fin then 'contador diferente'
    end problema
  from oficial o full join sistema s on s.serial = o.serial
)
select * from cmp where problema is not null
union all
select 'TOTAL', null, null,
  (select sum(fin - ini) from oficial)::int,
  (select sum(greatest(fin - ini, 0)) from sistema)::int,
  format('%s impressoras no sistema / 41 no relatório', (select count(*) from sistema))
order by 1;
