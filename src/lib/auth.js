import { supabase } from './supabaseClient';

const USERNAME_DOMAIN = 'cross.local';

// O Supabase Auth exige e-mail, mas o login do produto é por usuário (decisão confirmada
// com o cliente). Resolvemos o e-mail sintético de forma determinística a partir do
// username, então não precisamos de nenhuma consulta prévia para descobrir o e-mail.
export function usernameToEmail(username) {
  const normalized = String(username || '').trim().toLowerCase();
  return `${normalized}@${USERNAME_DOMAIN}`;
}

export async function signInWithUsername(username, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  });
  if (error) return { success: false, error: 'Usuário ou senha inválidos.' };
  return { success: true, session: data.session };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// Busca o perfil (role + cliente_associado) do usuário autenticado. RLS de `profiles`
// só libera a própria linha (id = auth.uid()) para não-admins.
export async function fetchOwnProfile() {
  const { data, error } = await supabase.from('profiles').select('*').single();
  if (error) return { success: false, error: error.message };
  return { success: true, profile: data };
}
