create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','cliente')),
  cliente_associado text,
  created_at timestamptz not null default now()
);

create table public.printers (
  id text primary key,               -- número de série (identificador único)
  modelo text,
  ip text,
  local text,                        -- localização (coluna "Localização"/"Observação" do PrintWayy)
  conexao text,
  cliente text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.readings (
  id bigint generated always as identity primary key,
  printer_id text not null references public.printers(id) on delete cascade,
  data date not null,                -- data da leitura (início ou fim de período)
  contador_pb bigint,                -- contador P&B (o principal; hoje é o único usado)
  contador_color bigint,             -- contador colorido (reservado; hoje sempre 0/null)
  status text,                       -- situação de comunicação, quando vier de relatório de status
  imported_at timestamptz not null default now()
);
create index on public.readings (printer_id, data);

create or replace function public.is_admin()
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.cliente_do_usuario()
returns text language sql security definer set search_path = public as $$
  select cliente_associado from public.profiles where id = auth.uid();
$$;

alter table public.profiles enable row level security;
alter table public.printers enable row level security;
alter table public.readings enable row level security;

create policy "profiles_select" on public.profiles
  for select using (id = auth.uid() or public.is_admin());
create policy "profiles_admin_write" on public.profiles
  for insert with check (public.is_admin());
create policy "profiles_admin_update" on public.profiles
  for update using (public.is_admin());

-- Admin faz tudo; cliente só LÊ o que é do seu contrato
create policy "printers_admin_all" on public.printers
  for all using (public.is_admin()) with check (public.is_admin());
create policy "printers_select_cliente" on public.printers
  for select using (cliente = public.cliente_do_usuario());

create policy "readings_admin_all" on public.readings
  for all using (public.is_admin()) with check (public.is_admin());
create policy "readings_select_cliente" on public.readings
  for select using (
    exists (select 1 from public.printers pr
            where pr.id = readings.printer_id
              and pr.cliente = public.cliente_do_usuario())
  );
