export const FIELDS = [
  { key: 'identificador', label: 'Identificador / nº de série', required: true },
  { key: 'contador', label: 'Contador total (se não separar por cor)', required: false },
  { key: 'contadorPBIni', label: 'Contador P&B (início do período)', required: false },
  { key: 'contadorPB', label: 'Contador P&B (fim do período)', required: false },
  { key: 'contadorColorIni', label: 'Contador colorido (início do período)', required: false },
  { key: 'contadorColor', label: 'Contador colorido (fim do período)', required: false },
  { key: 'ip', label: 'Endereço IP', required: false },
  { key: 'modelo', label: 'Modelo', required: false },
  { key: 'serie', label: 'Número de série', required: false },
  { key: 'cliente', label: 'Cliente (nome curto, não o contrato)', required: false },
  { key: 'local', label: 'Local / localização', required: false },
  { key: 'conexao', label: 'Tipo de conexão', required: false },
  { key: 'dataLeitura', label: 'Última comunicação / data', required: false },
  { key: 'statusComunicacao', label: 'Situação / status', required: false },
];

const GUESS_DICT = {
  ip: ['ip', 'endereço', 'endereco'],
  serie: ['número de série', 'numero de serie', 'série', 'serie', 'serial'],
  modelo: ['modelo', 'model'],
  cliente: ['cliente', 'empresa', 'customer'],
  local: ['localização', 'localizacao', 'observação', 'observacao', 'ponto de instalação', 'ponto de instalacao', 'local', 'setor', 'departamento'],
  conexao: ['tipo de conexão', 'tipo de conexao', 'conexão', 'conexao'],
  contadorPBIni: ['cont. ini. p&b', 'cont ini p&b', 'cont ini pb', 'contador p&b inicial'],
  contadorPB: ['cont. fin. p&b', 'cont fin p&b', 'cont fin pb', 'total p&b', 'total pb', 'contador p&b'],
  contadorColorIni: ['cont. ini. color', 'cont ini color', 'contador colorido inicial'],
  contadorColor: ['cont. fin. color', 'cont fin color', 'total colorido', 'total color', 'contador colorido'],
  contador: ['contador', 'páginas', 'paginas', 'impressões', 'impressoes', 'lifecount', 'total de páginas', 'total de paginas'],
  dataLeitura: ['última comunicação', 'ultima comunicacao', 'data', 'date', 'leitura'],
  statusComunicacao: ['situação', 'situacao', 'status'],
  identificador: ['identificador', 'nome', 'device', 'equipamento', 'host'],
};

// Big O: O(campos × termos × colunas) sobre o cabeçalho da planilha importada — todas as
// três dimensões são pequenas e fixas (poucas dezenas no máximo), então o custo real é trivial.
export function guessMapping(headers) {
  const guess = {};
  const used = new Set();
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '');
  const normHeaders = headers.map((h) => ({ raw: h, n: norm(h) }));
  // Ordem de resolução: campos mais específicos/confiáveis primeiro.
  const order = ['ip', 'serie', 'contadorPBIni', 'contadorPB', 'contadorColorIni', 'contadorColor', 'contador', 'dataLeitura', 'statusComunicacao', 'conexao', 'modelo', 'cliente', 'local', 'identificador'];
  order.forEach((key) => {
    const terms = GUESS_DICT[key] || [];
    let match = null;
    // Dentro de cada campo, tenta os termos na ordem de prioridade — o primeiro termo que
    // achar uma coluna livre vence, mesmo que um termo genérico apareça antes no arquivo.
    for (const term of terms) {
      const nt = norm(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp('(^|[^a-z0-9])' + nt + '($|[^a-z0-9])');
      const candidate = normHeaders.find((h) => !used.has(h.raw) && re.test(h.n));
      if (candidate) { match = candidate.raw; break; }
    }
    if (match) { guess[key] = match; used.add(match); }
  });
  // Sem coluna dedicada a identificador, mas com "série" mapeada: usa a mesma coluna —
  // nessa planilha (e na maioria dos exports de parque HP) o nº de série É o identificador único.
  // Número de série sempre vence como identificador quando existir — é o único campo com garantia real
  // de unicidade. Termos genéricos ("nome", "equipamento") às vezes são só o modelo, não um id único.
  if (guess.serie) guess.identificador = guess.serie;
  return guess;
}

// Big O: O(linhas escaneadas × campos × termos) — escaneia até as primeiras `maxScan`
// linhas do arquivo procurando qual delas é a linha de cabeçalho de verdade. Necessário
// porque o relatório do PrintWayy não traz os cabeçalhos na primeira linha: antes deles
// vêm o logo, o título do relatório e os dados do cliente/contrato.
export function findHeaderRowIndex(rows, maxScan = 15) {
  let bestIndex = 0;
  let bestScore = 0;
  const scanLimit = Math.min(rows.length, maxScan);
  for (let i = 0; i < scanLimit; i++) {
    const candidate = (rows[i] || []).map((c) => String(c ?? ''));
    if (candidate.every((c) => !c.trim())) continue;
    const matches = Object.keys(guessMapping(candidate)).length;
    if (matches > bestScore) { bestScore = matches; bestIndex = i; }
  }
  // Menos de 2 campos batendo não é confiável o suficiente pra chamar de cabeçalho —
  // nesse caso assume linha 1 mesmo (comportamento antigo, planilha "normal").
  return bestScore >= 2 ? bestIndex : 0;
}

// Converte uma planilha crua (array de arrays, sem assumir onde fica o cabeçalho) em
// {headers, rows} prontos para a tela de mapeamento de colunas.
export function rowsFromSheet(rawArray) {
  if (!rawArray.length) return { headers: [], rows: [] };
  const headerIndex = findHeaderRowIndex(rawArray);
  const headerLine = rawArray[headerIndex].map((h) => String(h ?? '').trim());
  const rows = rawArray
    .slice(headerIndex + 1)
    .filter((r) => (r || []).some((c) => String(c ?? '').trim() !== ''))
    .map((r) => {
      const obj = {};
      headerLine.forEach((h, i) => { if (h) obj[h] = r[i]; });
      return obj;
    });
  return { headers: headerLine.filter(Boolean), rows };
}

export function normalizeDate(value) {
  if (!value) return null;
  if (value instanceof Date && !isNaN(value)) return value.toISOString().slice(0, 10);
  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = '20' + y;
    return `${y.padStart(4, '0')}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const asNum = Number(str);
  if (!isNaN(asNum) && asNum > 20000 && asNum < 60000) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(excelEpoch.getTime() + asNum * 86400000).toISOString().slice(0, 10);
  }
  return str;
}
