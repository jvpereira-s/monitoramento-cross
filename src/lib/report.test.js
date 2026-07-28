import { describe, it, expect } from 'vitest';
import {
  formatDateBR,
  currentMonthRange, previousMonthRange, currentQuarterRange, previousQuarterRange,
  computeReportRows, computeReportTotals, computeMonthlyTotals,
  computeTopConsumo, computeTopClientes, computeDailyTrend,
} from './report';

const CLIENTE = 'Fundo Municipal de Saúde de São Gabriel da Palha';
const OUTRO = 'Outro Contrato';

// Espelha o formato real do contrato 049/2026: leitura só nas datas de fronteira
// (01/06, 01/07) mais o histórico corrente. É esse formato que quebrava quando o período
// fechado terminava no último dia do calendário.
const printers = [
  { id: 'BRBSTBD001', cliente: CLIENTE, local: 'CAPS', conexao: 'Rede' },
  { id: 'BRBSTBD002', cliente: CLIENTE, local: 'ESF São Sebastião', conexao: 'USB' },
  { id: 'BRBSTBD099', cliente: OUTRO, local: 'Recepção', conexao: 'Rede' },
];

const readings = [
  { printer_id: 'BRBSTBD001', data: '2026-06-01', contador_pb: 1000, contador_color: 0 },
  { printer_id: 'BRBSTBD001', data: '2026-07-01', contador_pb: 1500, contador_color: 0 },
  { printer_id: 'BRBSTBD001', data: '2026-07-20', contador_pb: 1620, contador_color: 0 },
  { printer_id: 'BRBSTBD002', data: '2026-06-01', contador_pb: 200, contador_color: 0 },
  { printer_id: 'BRBSTBD002', data: '2026-07-01', contador_pb: 500, contador_color: 0 },
  { printer_id: 'BRBSTBD002', data: '2026-07-20', contador_pb: 560, contador_color: 0 },
  { printer_id: 'BRBSTBD099', data: '2026-06-01', contador_pb: 90000, contador_color: 0 },
  { printer_id: 'BRBSTBD099', data: '2026-07-01', contador_pb: 99999, contador_color: 0 },
];

// 28/07/2026 — meio de julho, com junho já fechado.
const HOJE = new Date(2026, 6, 28);

describe('formatDateBR', () => {
  it('converte ISO para dd/mm/aaaa', () => {
    expect(formatDateBR('2026-07-01')).toBe('01/07/2026');
  });

  it('devolve travessão quando não há data', () => {
    expect(formatDateBR(null)).toBe('—');
    expect(formatDateBR('')).toBe('—');
  });
});

describe('presets de período', () => {
  it('mês anterior termina no 1º dia do mês atual, não no último dia do mês anterior', () => {
    // Regressão: com fim em 30/06 não existe leitura de fechamento dentro da janela
    // (o snapshot é datado 01/07) e o relatório do mês fechado dava zero.
    expect(previousMonthRange(HOJE)).toEqual({ start: '2026-06-01', end: '2026-07-01' });
  });

  it('mês atual vai do 1º ao último dia do calendário', () => {
    expect(currentMonthRange(HOJE)).toEqual({ start: '2026-07-01', end: '2026-07-31' });
  });

  it('trimestre anterior termina no 1º dia do trimestre atual', () => {
    expect(previousQuarterRange(HOJE)).toEqual({ start: '2026-04-01', end: '2026-07-01' });
  });

  it('trimestre atual cobre o trimestre calendário inteiro', () => {
    expect(currentQuarterRange(HOJE)).toEqual({ start: '2026-07-01', end: '2026-09-30' });
  });

  it('vira o ano corretamente em janeiro', () => {
    const janeiro = new Date(2026, 0, 15);
    expect(previousMonthRange(janeiro)).toEqual({ start: '2025-12-01', end: '2026-01-01' });
    expect(previousQuarterRange(janeiro)).toEqual({ start: '2025-10-01', end: '2026-01-01' });
  });

  it('respeita ano bissexto', () => {
    expect(currentMonthRange(new Date(2024, 1, 10))).toEqual({ start: '2024-02-01', end: '2024-02-29' });
  });
});

describe('computeReportRows', () => {
  it('devolve lista vazia sem cliente selecionado', () => {
    expect(computeReportRows(printers, readings, null, '2026-06-01', '2026-07-01')).toEqual([]);
  });

  it('inclui só as impressoras do cliente pedido', () => {
    const rows = computeReportRows(printers, readings, CLIENTE, '2026-06-01', '2026-07-01');
    expect(rows.map((r) => r.id)).toEqual(['BRBSTBD001', 'BRBSTBD002']);
  });

  it('calcula o total do período por diferença entre os contadores de fronteira', () => {
    const rows = computeReportRows(printers, readings, CLIENTE, '2026-06-01', '2026-07-01');
    const caps = rows.find((r) => r.id === 'BRBSTBD001');
    expect(caps.iniPB).toBe(1000);
    expect(caps.finPB).toBe(1500);
    expect(caps.totalPB).toBe(500);
  });

  it('não zera o mês fechado quando só existe leitura nas duas fronteiras', () => {
    const { start, end } = previousMonthRange(HOJE);
    const totais = computeReportTotals(computeReportRows(printers, readings, CLIENTE, start, end));
    expect(totais.pb).toBe(800); // 500 (CAPS) + 300 (ESF)
  });

  it('ordena por ponto físico', () => {
    const rows = computeReportRows(printers, readings, CLIENTE, '2026-06-01', '2026-07-20');
    expect(rows.map((r) => r.local)).toEqual(['CAPS', 'ESF São Sebastião']);
  });

  it('usa a primeira leitura própria quando a impressora entrou no meio do período', () => {
    const nova = [{ id: 'BRBSTBD097', cliente: CLIENTE, local: 'UBS Progresso' }];
    const leiturasNovas = [
      { printer_id: 'BRBSTBD097', data: '2026-06-10', contador_pb: 40, contador_color: 0 },
      { printer_id: 'BRBSTBD097', data: '2026-07-01', contador_pb: 90, contador_color: 0 },
    ];
    const [row] = computeReportRows(nova, leiturasNovas, CLIENTE, '2026-06-01', '2026-07-01');
    expect(row.iniPB).toBe(40);
    expect(row.totalPB).toBe(50);
  });

  it('marca hasData falso e total nulo para impressora sem leitura nenhuma', () => {
    const semLeitura = [{ id: 'BRBSTBD500', cliente: CLIENTE, local: 'Almoxarifado' }];
    const [row] = computeReportRows(semLeitura, [], CLIENTE, '2026-06-01', '2026-07-01');
    expect(row.hasData).toBe(false);
    expect(row.totalPB).toBeNull();
  });

  it('nunca devolve total negativo quando o contador é resetado (troca de equipamento)', () => {
    const reset = [{ id: 'BRBSTBD600', cliente: CLIENTE, local: 'Farmácia' }];
    const leiturasReset = [
      { printer_id: 'BRBSTBD600', data: '2026-06-01', contador_pb: 9000, contador_color: 0 },
      { printer_id: 'BRBSTBD600', data: '2026-07-01', contador_pb: 12, contador_color: 0 },
    ];
    const [row] = computeReportRows(reset, leiturasReset, CLIENTE, '2026-06-01', '2026-07-01');
    expect(row.totalPB).toBe(0);
  });
});

describe('computeReportTotals', () => {
  it('soma P&B e colorido ignorando linhas sem dado', () => {
    const rows = [
      { totalPB: 100, totalColor: 5 },
      { totalPB: null, totalColor: null },
      { totalPB: 40, totalColor: null },
    ];
    expect(computeReportTotals(rows)).toEqual({ pb: 140, color: 5 });
  });
});

describe('computeMonthlyTotals', () => {
  it('separa mês fechado de mês em andamento', () => {
    const totais = computeMonthlyTotals(printers.filter((p) => p.cliente === CLIENTE), readings, HOJE);
    expect(totais.lastMonth).toBe(800); // junho: (1500-1000) + (500-200)
    expect(totais.currentMonth).toBe(180); // julho até 20/07: (1620-1500) + (560-500)
  });
});

describe('computeTopConsumo', () => {
  it('rankeia pelo mês anterior fechado, não pelo mês em andamento', () => {
    const top = computeTopConsumo(printers.filter((p) => p.cliente === CLIENTE), readings, HOJE);
    expect(top).toEqual([
      { name: 'BRBSTBD001', paginas: 500 },
      { name: 'BRBSTBD002', paginas: 300 },
    ]);
  });

  it('descarta impressora sem consumo no período', () => {
    const parada = [...printers, { id: 'BRBSTBD700', cliente: CLIENTE, local: 'Depósito' }];
    const top = computeTopConsumo(parada.filter((p) => p.cliente === CLIENTE), readings, HOJE);
    expect(top.map((t) => t.name)).not.toContain('BRBSTBD700');
  });

  it('limita a 8 equipamentos e trunca identificador longo', () => {
    const muitas = Array.from({ length: 12 }, (_, i) => ({
      id: `SERIAL-MUITO-LONGO-${i}`, cliente: CLIENTE, local: `Sala ${i}`,
    }));
    const leituras = muitas.flatMap((p, i) => ([
      { printer_id: p.id, data: '2026-06-01', contador_pb: 0, contador_color: 0 },
      { printer_id: p.id, data: '2026-07-01', contador_pb: (i + 1) * 10, contador_color: 0 },
    ]));
    const top = computeTopConsumo(muitas, leituras, HOJE);
    expect(top).toHaveLength(8);
    expect(top[0].paginas).toBe(120); // o maior primeiro
    expect(top[0].name).toBe('SERIAL-MUITO-…'); // 13 primeiros caracteres + reticências
  });
});

describe('computeTopClientes', () => {
  it('agrupa o consumo do mês anterior por cliente', () => {
    const top = computeTopClientes(printers, readings, HOJE);
    expect(top).toEqual([
      { name: OUTRO, paginas: 9999 },
      { name: CLIENTE, paginas: 800 },
    ]);
  });
});

describe('computeDailyTrend', () => {
  it('soma o delta diário do parque dentro do período', () => {
    const rows = [{ id: 'BRBSTBD001' }, { id: 'BRBSTBD002' }];
    const trend = computeDailyTrend(rows, readings, '2026-06-01', '2026-07-20');
    expect(trend).toEqual([
      { date: '01/07/2026', total: 800 }, // 500 + 300
      { date: '20/07/2026', total: 180 }, // 120 + 60
    ]);
  });

  it('ignora leitura fora do período pedido', () => {
    const rows = [{ id: 'BRBSTBD001' }];
    const trend = computeDailyTrend(rows, readings, '2026-07-01', '2026-07-20');
    expect(trend).toEqual([{ date: '20/07/2026', total: 120 }]);
  });
});
