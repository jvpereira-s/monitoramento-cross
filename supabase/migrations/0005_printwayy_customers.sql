-- Vínculo entre o `customer` da PrintWayy e o nosso `cliente` — usado pela descoberta
-- automática de impressora nova em `printwayy-sync` (ver discovery.ts). O par é
-- aprendido a partir do nosso próprio cadastro (impressora já cadastrada com `cliente`
-- definido pelo admin), nunca a partir de `customer.name`, que só fica como rótulo.
--
-- RECONSTRUÍDA do banco de produção em 08/10/2026: a tabela já existia lá (aplicada
-- direto no SQL Editor), mas o arquivo nunca tinha sido commitado. Conteúdo derivado de
-- information_schema/pg_indexes/pg_policy — não reaplicar em produção.
create table public.printwayy_customers (
  printwayy_customer_id text primary key,
  cliente text not null,
  printwayy_customer_name text,
  -- Switch do admin: false = a descoberta não cadastra impressora nova desse contrato.
  auto_registrar boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index printwayy_customers_cliente_idx on public.printwayy_customers (cliente);

alter table public.printwayy_customers enable row level security;

create policy printwayy_customers_admin_all on public.printwayy_customers
  for all using (is_admin()) with check (is_admin());
