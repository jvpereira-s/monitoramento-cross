import { supabase } from './supabaseClient';

// Dispara a sincronização via API do PrintWayy — a Edge Function `printwayy-sync` faz
// todo o trabalho (busca impressoras + contadores na API, grava em printers/readings).
// Mesmo idioma de desembrulhar erro que src/lib/users.js usa pra `manage-users`.
export async function syncPrintwayy() {
  const { data, error } = await supabase.functions.invoke('printwayy-sync', { body: { action: 'sync' } });
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
