-- =============================================================================
-- Teste de isolamento entre clientes (RLS) — pendência 7
--
-- COMO RODAR: cole o arquivo INTEIRO no SQL Editor do Supabase e execute de uma vez.
-- Termina com `rollback` — nada do que ele cria sobrevive: nem usuário, nem perfil,
-- nem impressora. Pode rodar em produção quantas vezes quiser.
--
-- COMO LER O RESULTADO:
--   - Última linha "TODOS OS TESTES DE ISOLAMENTO PASSARAM" => RLS está isolando.
--   - Qualquer erro "FALHOU: ..." => vazamento real, com a explicação no texto do erro.
--
-- O QUE ELE PROVA: que o Postgres não entrega dado de um contrato para o usuário de
-- outro, mesmo que o front-end peça. É a camada que realmente garante o isolamento
-- (filtro em JavaScript é decoração — quem manda é a policy).
-- O QUE ELE NÃO PROVA: o caminho de login pela tela (e-mail sintético, carregamento do
-- perfil, telas). Isso exige entrar no sistema com uma conta cliente de verdade.
-- =============================================================================

begin;

-- Ajuste aqui se o contrato mudar de nome ou de tamanho -------------------------------
select set_config('teste.cliente_nome', 'Fundo Municipal de Saúde de São Gabriel da Palha', true);
select set_config('teste.total_esperado', '37', true);
-- -------------------------------------------------------------------------------------

-- Usuários descartáveis. Vivem só dentro desta transação; o rollback no fim apaga os
-- dois. Nenhuma senha é definida — não dá para logar com eles nem por acidente.
do $$
declare
  v_cliente_id uuid := gen_random_uuid();
  v_admin_id   uuid := gen_random_uuid();
  v_intruso_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values
    (v_cliente_id, 'teste-rls-cliente@invalido.local'),
    (v_admin_id,   'teste-rls-admin@invalido.local'),
    (v_intruso_id, 'teste-rls-intruso@invalido.local');

  insert into public.profiles (id, role, cliente_associado) values
    (v_cliente_id, 'cliente', current_setting('teste.cliente_nome')),
    (v_admin_id,   'admin',   null),
    -- Cliente de um contrato que não existe: prova que a policy compara o texto de
    -- verdade, em vez de simplesmente liberar tudo para qualquer papel 'cliente'.
    (v_intruso_id, 'cliente', 'Contrato Que Nao Existe');

  perform set_config('teste.cliente_id', v_cliente_id::text, true);
  perform set_config('teste.admin_id',   v_admin_id::text,   true);
  perform set_config('teste.intruso_id', v_intruso_id::text, true);
end $$;

-- Confere que a massa de dados esperada existe antes de testar. Sem isso, um banco vazio
-- passaria em "não vazou nada" sem ter provado coisa nenhuma.
do $$
declare v_total int;
begin
  select count(*) into v_total from public.printers
   where cliente = current_setting('teste.cliente_nome');
  if v_total <> current_setting('teste.total_esperado')::int then
    raise exception 'PRÉ-REQUISITO: o contrato "%" tem % impressoras cadastradas, esperado %. Ajuste teste.total_esperado no topo do arquivo ou confira o cadastro.',
      current_setting('teste.cliente_nome'), v_total, current_setting('teste.total_esperado');
  end if;
end $$;

-- =============================================================================
-- CENÁRIO 1 — usuário CLIENTE do contrato
-- =============================================================================
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('teste.cliente_id'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v_total     int;
  v_fora      int;
  v_leituras  int;
  v_perfis    int;
  v_afetadas  int;
begin
  select count(*) into v_total from public.printers;
  if v_total <> current_setting('teste.total_esperado')::int then
    raise exception 'FALHOU (leitura): cliente enxerga % impressoras, deveria enxergar exatamente %.',
      v_total, current_setting('teste.total_esperado');
  end if;

  select count(*) into v_fora from public.printers
   where cliente is distinct from current_setting('teste.cliente_nome');
  if v_fora <> 0 then
    raise exception 'FALHOU (vazamento): % impressoras de OUTRO contrato visíveis para o cliente.', v_fora;
  end if;

  -- Leitura vaza por tabela filha? readings tem policy própria; se ela estivesse errada,
  -- o contador de outro contrato apareceria mesmo com printers isolada.
  select count(*) into v_leituras from public.readings r
   where not exists (select 1 from public.printers p
                      where p.id = r.printer_id
                        and p.cliente = current_setting('teste.cliente_nome'));
  if v_leituras <> 0 then
    raise exception 'FALHOU (vazamento): % leituras de impressora de outro contrato visíveis.', v_leituras;
  end if;

  -- Cliente não pode enxergar a conta de ninguém além da própria.
  select count(*) into v_perfis from public.profiles;
  if v_perfis <> 1 then
    raise exception 'FALHOU (vazamento): cliente enxerga % perfis, deveria enxergar só o dele.', v_perfis;
  end if;

  -- Cliente é leitura somente: INSERT tem que ser barrado pela policy.
  begin
    insert into public.printers (id, cliente)
      values ('TESTE-RLS-NAO-DEVE-EXISTIR', current_setting('teste.cliente_nome'));
    raise exception 'FALHOU (escrita): cliente conseguiu INSERIR impressora.';
  exception
    when insufficient_privilege then null; -- comportamento correto
  end;

  -- UPDATE/DELETE sob RLS não dão erro: simplesmente não encontram linha. Zero linhas
  -- afetadas é o resultado correto — qualquer número acima disso é alteração indevida.
  update public.printers set modelo = 'ALTERADO-INDEVIDAMENTE';
  get diagnostics v_afetadas = row_count;
  if v_afetadas <> 0 then
    raise exception 'FALHOU (escrita): cliente alterou % impressoras.', v_afetadas;
  end if;

  delete from public.printers;
  get diagnostics v_afetadas = row_count;
  if v_afetadas <> 0 then
    raise exception 'FALHOU (escrita): cliente apagou % impressoras.', v_afetadas;
  end if;
end $$;

reset role;

-- =============================================================================
-- CENÁRIO 2 — usuário CLIENTE de um contrato inexistente (não pode ver nada)
-- =============================================================================
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('teste.intruso_id'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare v_total int; v_leituras int;
begin
  select count(*) into v_total from public.printers;
  select count(*) into v_leituras from public.readings;
  if v_total <> 0 or v_leituras <> 0 then
    raise exception 'FALHOU (vazamento): cliente de contrato inexistente enxerga % impressoras e % leituras, deveria ser 0 e 0.',
      v_total, v_leituras;
  end if;
end $$;

reset role;

-- =============================================================================
-- CENÁRIO 3 — visitante sem login (chave anônima, sem JWT)
-- =============================================================================
select set_config('request.jwt.claims', '', true);
set local role anon;

do $$
declare v_total int; v_leituras int; v_perfis int;
begin
  select count(*) into v_total    from public.printers;
  select count(*) into v_leituras from public.readings;
  select count(*) into v_perfis   from public.profiles;
  if v_total <> 0 or v_leituras <> 0 or v_perfis <> 0 then
    raise exception 'FALHOU (vazamento): visitante sem login enxerga % impressoras, % leituras, % perfis — deveria ser 0 em tudo.',
      v_total, v_leituras, v_perfis;
  end if;
end $$;

reset role;

-- =============================================================================
-- CENÁRIO 4 — usuário ADMIN (contraprova: se admin também não visse nada, os testes
-- acima passariam por RLS quebrada demais, não por isolamento correto)
-- =============================================================================
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('teste.admin_id'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare v_total int; v_do_contrato int;
begin
  select count(*) into v_total from public.printers;
  select count(*) into v_do_contrato from public.printers
   where cliente = current_setting('teste.cliente_nome');

  if v_do_contrato <> current_setting('teste.total_esperado')::int then
    raise exception 'FALHOU (admin cego): admin enxerga % impressoras do contrato, esperado %.',
      v_do_contrato, current_setting('teste.total_esperado');
  end if;
  if v_total < v_do_contrato then
    raise exception 'FALHOU (admin cego): admin enxerga menos impressoras (%) que as do contrato (%).',
      v_total, v_do_contrato;
  end if;
end $$;

reset role;

select 'TODOS OS TESTES DE ISOLAMENTO PASSARAM' as resultado,
       current_setting('teste.cliente_nome')    as contrato_testado,
       current_setting('teste.total_esperado')  as impressoras_esperadas;

-- Desfaz tudo: usuários de teste, perfis e qualquer efeito colateral.
rollback;
