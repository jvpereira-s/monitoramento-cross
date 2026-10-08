import { supabase } from './supabaseClient';

// RLS decide o que cada usuário vê — admin recebe todas as linhas, cliente só as do
// próprio contrato. Não há filtro de cliente aqui de propósito: duplicar essa regra no
// front-end violaria o isolamento por banco que o projeto exige.
// O PostgREST corta toda resposta no teto de linhas do projeto (1000 no Supabase) SEM
// sinalizar erro — `select('*')` simples devolvia só as 1000 primeiras leituras de um
// histórico com milhares, e o relatório calculava contador inicial/final em cima de um
// pedaço aleatório do histórico. Por isso pagina com `range` e ordem estável (a ordem
// precisa ser determinística, senão uma página pode repetir/pular linha da outra).
const PAGE_SIZE = 1000;
const MAX_PAGES = 500; // proteção contra loop infinito (500 mil linhas), não limite esperado

// Big O: O(linhas / PAGE_SIZE) requisições sequenciais, O(linhas) memória.
async function fetchAllRows(
  table,   // nome da tabela no Supabase
  orderBy, // colunas de ordenação estável, ex: ['printer_id', 'data']
) {
  const rows = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    let query = supabase.from(table).select('*');
    orderBy.forEach((col) => { query = query.order(col, { ascending: true }); });
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) return { success: false, error: error.message };
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) return { success: true, rows };
  }
  return { success: false, error: `Mais de ${MAX_PAGES * PAGE_SIZE} linhas em ${table} — leitura interrompida.` };
}

export async function fetchPrinters() {
  const res = await fetchAllRows('printers', ['id']);
  if (!res.success) return res;
  return { success: true, printers: res.rows };
}

export async function fetchReadings() {
  const res = await fetchAllRows('readings', ['printer_id', 'data']);
  if (!res.success) return res;
  return { success: true, readings: res.rows };
}

// Upsert em `printers` (chave = número de série) + insert em `readings` de uma importação.
// RLS exige admin para gravar em ambas as tabelas.
export async function saveImport(printers, readings) {
  if (printers.length) {
    const { error } = await supabase.from('printers').upsert(printers, { onConflict: 'id' });
    if (error) return { success: false, error: error.message };
  }
  if (readings.length) {
    // Upsert por (printer_id, data) — não insert puro: a sincronização via API
    // (Edge Function printwayy-sync) grava leituras no mesmo formato, e reimportar de
    // propósito o mesmo dia deve sobrescrever, não duplicar nem falhar por conflito.
    const { error } = await supabase.from('readings').upsert(readings, {
      onConflict: 'printer_id,data',
      ignoreDuplicates: false,
    });
    if (error) return { success: false, error: error.message };
  }
  return { success: true };
}
