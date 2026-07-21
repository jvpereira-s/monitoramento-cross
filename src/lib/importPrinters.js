import { normalizeDate } from './mapping';

export const DEFAULT_CLIENT = 'Saúde São Gabriel da Palha';

function parseNum(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const parsed = parseInt(String(raw).replace(/\D/g, ''), 10);
  return isNaN(parsed) ? null : parsed;
}

// Big O: O(linhas da planilha) — uma passada única gerando até 2 leituras por linha
// (início + fim de período, quando a planilha traz os dois contadores na mesma linha).
export function buildImportPayload({ rawRows, mapping, manualDate, manualDateIni, defaultClient = DEFAULT_CLIENT }) {
  if (!mapping.identificador) {
    return { success: false, error: 'Mapeie pelo menos o identificador da impressora (nº de série ou nome).' };
  }
  const today = new Date().toISOString().slice(0, 10);
  const effectiveDate = manualDate || today;
  const hasIni = mapping.contadorPBIni || mapping.contadorColorIni;
  if (hasIni && !manualDateIni) {
    return { success: false, error: 'Você mapeou contador de início de período — informe a data de início também.' };
  }

  const printersById = new Map();
  const readings = [];
  let imported = 0;

  rawRows.forEach((row) => {
    const id = String(row[mapping.identificador] || '').trim();
    if (!id) return;

    // Contador P&B é hoje o único usado no relatório (regra confirmada no schema);
    // uma planilha com só "contador total" (sem separar por cor) cai direto nele.
    const contadorPB = mapping.contadorPB
      ? parseNum(row[mapping.contadorPB])
      : (mapping.contador ? parseNum(row[mapping.contador]) : null);
    const contadorColor = mapping.contadorColor ? parseNum(row[mapping.contadorColor]) : null;
    const contadorPBIni = mapping.contadorPBIni ? parseNum(row[mapping.contadorPBIni]) : null;
    const contadorColorIni = mapping.contadorColorIni ? parseNum(row[mapping.contadorColorIni]) : null;

    const cliente = (mapping.cliente && row[mapping.cliente]) ? String(row[mapping.cliente]).trim() : defaultClient;

    // Só inclui as colunas que essa planilha realmente mapeou — colunas ausentes não
    // entram no upsert, então um import parcial não apaga dado já cadastrado.
    const printer = { id, cliente, ...printersById.get(id) };
    if (mapping.ip && row[mapping.ip]) printer.ip = String(row[mapping.ip]).trim();
    if (mapping.modelo && row[mapping.modelo]) printer.modelo = String(row[mapping.modelo]).trim();
    if (mapping.local && row[mapping.local]) printer.local = String(row[mapping.local]).trim();
    if (mapping.conexao && row[mapping.conexao]) printer.conexao = String(row[mapping.conexao]).trim();
    printersById.set(id, printer);

    readings.push({
      printer_id: id,
      data: normalizeDate(mapping.dataLeitura ? row[mapping.dataLeitura] : null) || effectiveDate,
      contador_pb: contadorPB,
      contador_color: contadorColor,
      status: mapping.statusComunicacao ? String(row[mapping.statusComunicacao] || '') : null,
    });

    if (contadorPBIni !== null || contadorColorIni !== null) {
      readings.push({
        printer_id: id,
        data: manualDateIni,
        contador_pb: contadorPBIni,
        contador_color: contadorColorIni,
        status: null,
      });
    }
    imported += 1;
  });

  if (!imported) {
    return { success: false, error: 'Nenhuma linha válida encontrada com esse mapeamento. Confira a coluna de identificador.' };
  }

  return { success: true, printers: Array.from(printersById.values()), readings, importedCount: imported };
}
