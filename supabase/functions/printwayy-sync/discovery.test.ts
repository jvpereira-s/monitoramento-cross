import { describe, it, expect } from 'vitest';
import {
  classifyPrinter, fechamentoPendente, learnMappings, toFechamentoRow, toPrinterRow, toSituacaoRow,
  type CustomerConfig, type PrintwayyPrinter, type ResolvedPrinter,
} from './discovery.ts';

const FUNDO = 'Fundo Municipal de Saúde de São Gabriel da Palha';
const C_FUNDO = 'c148bb03';
const C_OUTRA = '860e7bf1';

function printer(serial: string, customerId: string | null, extra: Partial<PrintwayyPrinter> = {}): PrintwayyPrinter {
  return {
    id: `pw-${serial}`, type: 'network', serialNumber: serial, status: 'online',
    customer: customerId ? { id: customerId, name: `customer ${customerId}` } : null,
    location: null, ...extra,
  };
}

function resolved(serial: string, cliente: string, customerId: string | null): ResolvedPrinter {
  return { reg: { id: serial, cliente }, printer: printer(serial, customerId), reading: null, error: null };
}

const config = new Map<string, CustomerConfig>([
  [C_FUNDO, { printwayy_customer_id: C_FUNDO, cliente: FUNDO, auto_registrar: false }],
]);

describe('classifyPrinter', () => {
  it('é do contrato quando o customer está vinculado ao mesmo cliente', () => {
    expect(classifyPrinter(printer('A', C_FUNDO), { id: 'A', cliente: FUNDO }, config)).toBe('contrato');
  });

  // Regressão: BRBSSDC02V foi movida na PrintWayy para outra prefeitura em 01/09/2026 e
  // o sync continuou somando o contador dela no Fundo.
  it('sai do contrato quando a impressora foi movida para outro customer', () => {
    expect(classifyPrinter(printer('B', C_OUTRA), { id: 'B', cliente: FUNDO }, config)).toBe('fora-do-contrato');
  });

  it('sai do contrato quando está no estoque (customer nulo, status inDealer)', () => {
    expect(classifyPrinter(printer('C', null, { status: 'inDealer' }), { id: 'C', cliente: FUNDO }, config))
      .toBe('fora-do-contrato');
  });

  it('não aceita customer vinculado a OUTRO cliente nosso', () => {
    const cfg = new Map(config);
    cfg.set(C_OUTRA, { printwayy_customer_id: C_OUTRA, cliente: 'Outro contrato', auto_registrar: false });
    expect(classifyPrinter(printer('D', C_OUTRA), { id: 'D', cliente: FUNDO }, cfg)).toBe('fora-do-contrato');
  });
});

describe('fechamentoPendente (corte dia 02, janela de 7 dias)', () => {
  it('no próprio dia de corte devolve o dia', () => {
    expect(fechamentoPendente('2026-10-02')).toBe('2026-10-02');
  });

  it('dentro da janela devolve o corte do mês', () => {
    expect(fechamentoPendente('2026-10-09')).toBe('2026-10-02');
  });

  it('fora da janela devolve null', () => {
    expect(fechamentoPendente('2026-10-10')).toBeNull();
    expect(fechamentoPendente('2026-10-25')).toBeNull();
  });

  it('dia 01 está fora da janela do corte do mês anterior', () => {
    expect(fechamentoPendente('2026-10-01')).toBeNull();
  });

  it('vira o ano corretamente', () => {
    expect(fechamentoPendente('2027-01-05')).toBe('2027-01-02');
    expect(fechamentoPendente('2027-01-01', 2, 31)).toBe('2026-12-02');
  });
});

describe('learnMappings', () => {
  // Regressão: o vínculo era aprendido de QUALQUER impressora, e duas impressoras movidas
  // ligaram duas prefeituras alheias ao Fundo.
  it('não aprende nada para cliente que já tem vínculo', () => {
    const rows = learnMappings([resolved('A', FUNDO, C_OUTRA)], config);
    expect(rows).toEqual([]);
  });

  it('aprende pela maioria estrita das impressoras do cliente novo', () => {
    const rows = learnMappings([
      resolved('A', 'Novo', 'x'), resolved('B', 'Novo', 'x'), resolved('C', 'Novo', 'y'),
    ], config);
    expect(rows.map((r) => [r.printwayy_customer_id, r.cliente])).toEqual([['x', 'Novo']]);
  });

  it('empate não vira vínculo', () => {
    const rows = learnMappings([resolved('A', 'Novo', 'x'), resolved('B', 'Novo', 'y')], config);
    expect(rows).toEqual([]);
  });

  it('impressora sem customer conta no total mas não vota', () => {
    const rows = learnMappings([resolved('A', 'Novo', 'x'), resolved('B', 'Novo', null)], config);
    expect(rows).toEqual([]);
  });

  it('ignora impressora que não resolveu na API', () => {
    const naoResolvida: ResolvedPrinter = { reg: { id: 'Z', cliente: 'Novo' }, printer: null, reading: null, error: 'x' };
    const rows = learnMappings([naoResolvida, resolved('A', 'Novo', 'x')], config);
    expect(rows.map((r) => r.printwayy_customer_id)).toEqual(['x']);
  });
});

describe('linhas gravadas', () => {
  const now = new Date('2026-10-08T12:00:00Z');

  it('toPrinterRow leva a última comunicação da PrintWayy, não o horário do sync', () => {
    const row = toPrinterRow(printer('A', C_FUNDO, { lastCommunication: '2026-03-05T15:49:09.020Z' }), FUNDO, now);
    expect(row.ultima_comunicacao).toBe('2026-03-05T15:49:09.020Z');
    expect(row.situacao_printwayy).toBe('contrato');
    expect(row.updated_at).toBe(now.toISOString());
  });

  it('toSituacaoRow não carrega metadata da instalação em outro cliente', () => {
    expect(Object.keys(toSituacaoRow({ id: 'B', cliente: FUNDO }, 'fora-do-contrato', now)).sort())
      .toEqual(['cliente', 'id', 'situacao_printwayy', 'updated_at']);
  });

  it('toFechamentoRow usa só blackAndWhite e não carrega status', () => {
    const row = toFechamentoRow(printer('A', C_FUNDO), [
      { type: 'blackAndWhite', dateOfCapture: '2026-09-02T15:10:08Z', totalCount: 4775 },
      { type: 'scan', dateOfCapture: '2026-09-02T15:10:08Z', totalCount: 99 },
    ], '2026-09-02', now);
    expect(row).toEqual({
      printer_id: 'A', data: '2026-09-02', contador_pb: 4775, contador_color: null, imported_at: now.toISOString(),
    });
  });
});
