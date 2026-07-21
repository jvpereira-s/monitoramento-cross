import { supabase } from './supabaseClient';

// RLS decide o que cada usuário vê — admin recebe todas as linhas, cliente só as do
// próprio contrato. Não há filtro de cliente aqui de propósito: duplicar essa regra no
// front-end violaria o isolamento por banco que o projeto exige.
export async function fetchPrinters() {
  const { data, error } = await supabase.from('printers').select('*');
  if (error) return { success: false, error: error.message };
  return { success: true, printers: data };
}

export async function fetchReadings() {
  const { data, error } = await supabase.from('readings').select('*');
  if (error) return { success: false, error: error.message };
  return { success: true, readings: data };
}

// Upsert em `printers` (chave = número de série) + insert em `readings` de uma importação.
// RLS exige admin para gravar em ambas as tabelas.
export async function saveImport(printers, readings) {
  if (printers.length) {
    const { error } = await supabase.from('printers').upsert(printers, { onConflict: 'id' });
    if (error) return { success: false, error: error.message };
  }
  if (readings.length) {
    const { error } = await supabase.from('readings').insert(readings);
    if (error) return { success: false, error: error.message };
  }
  return { success: true };
}
