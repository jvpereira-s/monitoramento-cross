import { describe, it, expect } from 'vitest';
import { guessMapping, findHeaderRowIndex, rowsFromSheet, normalizeDate, FIELDS } from './mapping';

// Formato real do export do PrintWayy: logo, título e dados do contrato ocupam as
// primeiras linhas, e só depois vem o cabeçalho de verdade.
const planilhaPrintwayy = [
  ['Relatório de Impressoras', '', '', '', ''],
  ['Contrato: 049/2026', '', '', '', ''],
  ['', '', '', '', ''],
  ['Número de Série', 'Modelo', 'Departamento', 'Observação', 'Cont. Fin. P&B'],
  ['BRBSTBD001', 'HP M428fdw', 'Secretaria Municipal de Saúde', 'CAPS', '1500'],
  ['BRBSTBD002', 'HP M428fdw', 'Secretaria Municipal de Saúde', 'ESF São Sebastião', '500'],
];

describe('FIELDS', () => {
  it('exige só o identificador', () => {
    expect(FIELDS.filter((f) => f.required).map((f) => f.key)).toEqual(['identificador']);
  });
});

describe('guessMapping', () => {
  it('separa departamento de local — "Observação" é o ponto físico, não a unidade', () => {
    // Regressão real: as duas colunas caíam no mesmo campo e o cliente via
    // "Secretaria Municipal de Saúde" no lugar do ponto físico da impressora.
    const guess = guessMapping(planilhaPrintwayy[3]);
    expect(guess.departamento).toBe('Departamento');
    expect(guess.local).toBe('Observação');
  });

  it('usa o número de série como identificador quando não há coluna dedicada', () => {
    const guess = guessMapping(planilhaPrintwayy[3]);
    expect(guess.serie).toBe('Número de Série');
    expect(guess.identificador).toBe('Número de Série');
  });

  it('prefere o número de série a colunas genéricas como "Nome"', () => {
    const guess = guessMapping(['Nome', 'Serial', 'Modelo']);
    expect(guess.identificador).toBe('Serial');
  });

  it('reconhece cabeçalho sem acento', () => {
    const guess = guessMapping(['Numero de Serie', 'Endereco IP', 'Situacao']);
    expect(guess.serie).toBe('Numero de Serie');
    expect(guess.ip).toBe('Endereco IP');
    expect(guess.statusComunicacao).toBe('Situacao');
  });

  it('distingue contador de início e de fim de período', () => {
    const guess = guessMapping(['Cont. Ini. P&B', 'Cont. Fin. P&B']);
    expect(guess.contadorPBIni).toBe('Cont. Ini. P&B');
    expect(guess.contadorPB).toBe('Cont. Fin. P&B');
  });

  it('nunca mapeia a mesma coluna para dois campos diferentes', () => {
    const guess = guessMapping(planilhaPrintwayy[3]);
    const usadas = Object.entries(guess).filter(([k]) => k !== 'identificador').map(([, v]) => v);
    expect(new Set(usadas).size).toBe(usadas.length);
  });

  it('devolve objeto vazio quando nenhuma coluna é reconhecível', () => {
    expect(guessMapping(['aaa', 'bbb'])).toEqual({});
  });
});

describe('findHeaderRowIndex', () => {
  it('acha a linha de cabeçalho depois do título e dos dados do contrato', () => {
    expect(findHeaderRowIndex(planilhaPrintwayy)).toBe(3);
  });

  it('assume a primeira linha quando nada parece cabeçalho', () => {
    expect(findHeaderRowIndex([['a', 'b'], ['c', 'd']])).toBe(0);
  });

  it('lida com planilha comum, cabeçalho já na primeira linha', () => {
    expect(findHeaderRowIndex([['Serial', 'Modelo'], ['BR1', 'HP']])).toBe(0);
  });
});

describe('rowsFromSheet', () => {
  it('converte a planilha crua em cabeçalho + linhas de objeto', () => {
    const { headers, rows } = rowsFromSheet(planilhaPrintwayy);
    expect(headers).toEqual(['Número de Série', 'Modelo', 'Departamento', 'Observação', 'Cont. Fin. P&B']);
    expect(rows).toHaveLength(2);
    expect(rows[0]['Observação']).toBe('CAPS');
  });

  it('descarta linhas totalmente vazias', () => {
    const comBuraco = [...planilhaPrintwayy, ['', '', '', '', ''], ['BRBSTBD003', 'HP', 'Sec', 'UBS', '10']];
    expect(rowsFromSheet(comBuraco).rows).toHaveLength(3);
  });

  it('devolve vazio para planilha sem nenhuma linha', () => {
    expect(rowsFromSheet([])).toEqual({ headers: [], rows: [] });
  });
});

describe('normalizeDate', () => {
  it('mantém data já em ISO', () => {
    expect(normalizeDate('2026-07-01')).toBe('2026-07-01');
    expect(normalizeDate('2026-07-01T13:00:00Z')).toBe('2026-07-01');
  });

  it('converte formato brasileiro', () => {
    expect(normalizeDate('01/07/2026')).toBe('2026-07-01');
    expect(normalizeDate('1/7/2026')).toBe('2026-07-01');
  });

  it('completa ano de dois dígitos como 20xx', () => {
    expect(normalizeDate('01/07/26')).toBe('2026-07-01');
  });

  it('converte número serial de data do Excel', () => {
    expect(normalizeDate(46204)).toBe('2026-07-01');
  });

  it('aceita objeto Date', () => {
    expect(normalizeDate(new Date(Date.UTC(2026, 6, 1)))).toBe('2026-07-01');
  });

  it('devolve null para valor ausente', () => {
    expect(normalizeDate(null)).toBeNull();
    expect(normalizeDate('')).toBeNull();
  });
});
