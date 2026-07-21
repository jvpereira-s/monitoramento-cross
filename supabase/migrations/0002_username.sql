-- Login é por usuário (não e-mail) — decisão confirmada com o cliente. O Supabase Auth
-- exige e-mail internamente; o e-mail de cada conta é sintético (`<username>@cross.local`),
-- resolvido no cliente sem precisar de consulta prévia. `username` fica em profiles só
-- para exibição e para a tela de gestão de usuários.
alter table public.profiles
  add column username text not null unique
  check (username = lower(username) and username ~ '^[a-z0-9._-]+$');
