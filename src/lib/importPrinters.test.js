import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { buildImportPayload, DEFAULT_CLIENT } from './importPrinters';

const mapping = {
  identificador: 'Número de Série',
  modelo: 'Modelo',
  departamento: 'Departamento',
  local: 'Observação',
  contadorPB: 'Cont. Fin. P&B',
};

const rawRows = [
  { 'Número de Série': 'BRBSTBD001', 'Modelo': 'HP M428fdw', 'Departamento': 'Secretaria Municipal de Saúde', 'Observação': 'CAPS', 'Cont. Fin. P&B': '1.500' },
  { 'Número de Série': 'BRBSTBD002', 'Modelo': 'HP M428fdw', 'Departamento': 'Secretaria Municipal de Saúde', 'Observação': 'ESF São Sebastião', 'Cont. Fin. P&B': '500' },
];

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-28T12:00:00Z'));
});
afterAll(() => vi.useRealTimers());

describe('buildImportPayload', () => {
  it('recusa import sem coluna de identificador mapeada', () => {
    const r = buildImportPayload({ rawRows, mapping: { modelo: 'Modelo' }, manualDate: '2026-07-28' });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/identificador/i);
  });

  it('recusa contador de início sem a data de início correspondente', () => {
    const r = buildImportPayload({
      rawRows,
      mapping: { ...mapping, contadorPBIni: 'Cont. Ini. P&B' },
      manualDate: '2026-07-28',
      manualDateIni: '',
    });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/data de início/i);
  });

  it('recusa planilha sem nenhuma linha com identificador preenchido', () => {
    const r = buildImportPayload({
      rawRows: [{ 'Número de Série': '', 'Modelo': 'HP' }],
      mapping,
      manualDate: '2026-07-28',
    });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/nenhuma linha válida/i);
  });

  it('monta impressoras e leituras a partir das linhas mapeadas', () => {
    const r = buildImportPayload({ rawRows, mapping, manualDate: '2026-07-28' });
    expect(r.success).toBe(true);
    expect(r.importedCount).toBe(2);
    expect(r.printers).toHaveLength(2);
    expect(r.printers[0]).toMatchObject({
      id: 'BRBSTBD001',
      cliente: DEFAULT_CLIENT,
      local: 'CAPS',
      departamento: 'Secretaria Municipal de Saúde',
    });
    expect(r.readings[0]).toMatchObject({ printer_id: 'BRBSTBD001', data: '2026-07-28', contador_pb: 1500 });
  });

  it('limpa separador de milhar do contador', () => {
    const r = buildImportPayload({ rawRows, mapping, manualDate: '2026-07-28' });
    expect(r.readings.map((l) => l.contador_pb)).toEqual([1500, 500]);
  });

  it('usa o cliente padrão quando a planilha não traz coluna de cliente', () => {
    const r = buildImportPayload({ rawRows, mapping, manualDate: '2026-07-28' });
    expect(r.printers.every((p) => p.cliente === DEFAULT_CLIENT)).toBe(true);
  });

  it('respeita a coluna de cliente da planilha quando ela existe', () => {
    const comCliente = rawRows.map((r) => ({ ...r, 'Cliente': 'Outro Contrato' }));
    const r = buildImportPayload({
      rawRows: comCliente,
      mapping: { ...mapping, cliente: 'Cliente' },
      manualDate: '2026-07-28',
    });
    expect(r.printers.every((p) => p.cliente === 'Outro Contrato')).toBe(true);
  });

  it('não cria chave para coluna não mapeada — import parcial não apaga dado existente', () => {
    const r = buildImportPayload({
      rawRows,
      mapping: { identificador: 'Número de Série', contadorPB: 'Cont. Fin. P&B' },
      manualDate: '2026-07-28',
    });
    expect(r.printers[0]).not.toHaveProperty('local');
    expect(r.printers[0]).not.toHaveProperty('departamento');
    expect(r.printers[0]).not.toHaveProperty('modelo');
  });

  it('gera duas leituras por linha quando a planilha traz contador de início e de fim', () => {
    const comIni = rawRows.map((r) => ({ ...r, 'Cont. Ini. P&B': '1.000' }));
    const r = buildImportPayload({
      rawRows: comIni,
      mapping: { ...mapping, contadorPBIni: 'Cont. Ini. P&B' },
      manualDate: '2026-07-28',
      manualDateIni: '2026-07-01',
    });
    const daPrimeira = r.readings.filter((l) => l.printer_id === 'BRBSTBD001');
    expect(daPrimeira).toHaveLength(2);
    expect(daPrimeira.find((l) => l.data === '2026-07-01').contador_pb).toBe(1000);
    expect(daPrimeira.find((l) => l.data === '2026-07-28').contador_pb).toBe(1500);
  });

  it('usa a data da própria planilha quando a coluna de data está mapeada', () => {
    const comData = rawRows.map((r) => ({ ...r, 'Última Comunicação': '15/07/2026' }));
    const r = buildImportPayload({
      rawRows: comData,
      mapping: { ...mapping, dataLeitura: 'Última Comunicação' },
      manualDate: '2026-07-28',
    });
    expect(r.readings.every((l) => l.data === '2026-07-15')).toBe(true);
  });

  it('cai na data de hoje quando nenhuma data foi informada', () => {
    const r = buildImportPayload({ rawRows, mapping, manualDate: '' });
    expect(r.readings.every((l) => l.data === '2026-07-28')).toBe(true);
  });

  it('deduplica impressora repetida na planilha mantendo uma linha só', () => {
    const duplicada = [...rawRows, { ...rawRows[0], 'Cont. Fin. P&B': '1.600' }];
    const r = buildImportPayload({ rawRows: duplicada, mapping, manualDate: '2026-07-28' });
    expect(r.printers).toHaveLength(2);
    expect(r.readings).toHaveLength(3); // cadastro deduplicado, leituras preservadas
  });

  it('deixa contador nulo quando a célula está vazia', () => {
    const semContador = [{ 'Número de Série': 'BRBSTBD003', 'Cont. Fin. P&B': '' }];
    const r = buildImportPayload({ rawRows: semContador, mapping, manualDate: '2026-07-28' });
    expect(r.readings[0].contador_pb).toBeNull();
  });
});
