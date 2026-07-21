import { supabase } from './supabaseClient';

export async function fetchUsers() {
  const { data, error } = await supabase.from('profiles').select('*').order('username');
  if (error) return { success: false, error: error.message };
  return { success: true, users: data };
}

// Toda operação privilegiada (criar/excluir usuário, trocar senha) passa pela Edge
// Function `manage-users`, que é a única peça com acesso à service_role key.
async function callManageUsers(payload) {
  const { data, error } = await supabase.functions.invoke('manage-users', { body: payload });
  if (error) {
    let message = error.message;
    try {
      const parsed = await error.context?.json?.();
      if (parsed?.error) message = parsed.error;
    } catch {
      // corpo da resposta não era JSON — mantém a mensagem padrão do erro
    }
    return { success: false, error: message };
  }
  if (data?.error) return { success: false, error: data.error };
  return { success: true, ...data };
}

export function createUser({ username, password, role, cliente_associado }) {
  return callManageUsers({ action: 'create', username, password, role, cliente_associado });
}

export function deleteUser(userId) {
  return callManageUsers({ action: 'delete', userId });
}

export function resetUserPassword(userId, password) {
  return callManageUsers({ action: 'reset_password', userId, password });
}
