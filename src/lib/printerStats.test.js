import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  isOfflineStatus, computePrinterStats, computeKpis, computeLastSync,
  computeOfflineList, computeSemMonitoramentoList, computeConexaoData,
} from './printerStats';

// Textos exatos gravados por printwayy-sync (supabase/functions/printwayy-sync/index.ts).
const OFF = 'Sem comunicação (PrintWayy)';
const ON = 'Comunicando (PrintWayy)';
const CLIENTE = 'Fundo Municipal de Saúde de São Gabriel da Palha';
const THRESHOLD = 7;

// Relógio congelado: computePrinterStats deriva "há quantos dias" de Date.now(), então sem
// isso os testes mudariam de resultado a cada dia que passasse.
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-28T18:00:00Z'));
});
afterAll(() => vi.useRealTimers());

describe('isOfflineStatus', () => {
  it('reconhece o texto gravado pelo sync da API', () => {
    expect(isOfflineStatus(OFF)).toBe(true);
    expect(isOfflineStatus(ON)).toBe(false);
  });

  it('reconhece variações que aparecem em planilha exportada', () => {
    expect(isOfflineStatus('Offline')).toBe(true);
    expect(isOfflineStatus('Falha de comunicação')).toBe(true);
    expect(isOfflineStatus('Desligada')).toBe(true);
  });

  it('trata status ausente como desconhecido, não como offline', () => {
    expect(isOfflineStatus(null)).toBe(false);
    expect(isOfflineStatus('')).toBe(false);
  });
});

describe('computePrinterStats', () => {
  it('classifica como online quando a última leitura diz que está comunicando', () => {
    const [p] = computePrinterStats(
      [{ id: 'A', cliente: CLIENTE }],
      [{ printer_id: 'A', data: '2026-07-28', contador_pb: 100, status: ON }],
      THRESHOLD
    );
    expect(p.comm).toBe('online');
    expect(p.offlineSince).toBeNull();
  });

  it('conta os dias desde o início da sequência sem comunicar, não desde a última leitura', () => {
    // O sync grava uma leitura por dia para toda impressora, inclusive as offline — por
    // isso "dias desde a última leitura" seria sempre 0 e não serve como tempo parado.
    const [p] = computePrinterStats(
      [{ id: 'A', cliente: CLIENTE }],
      [
        { printer_id: 'A', data: '2026-07-24', contador_pb: 500, status: ON },
        { printer_id: 'A', data: '2026-07-25', contador_pb: 500, status: OFF },
        { printer_id: 'A', data: '2026-07-26', contador_pb: 500, status: OFF },
        { printer_id: 'A', data: '2026-07-28', contador_pb: 500, status: OFF },
      ],
      THRESHOLD
    );
    expect(p.comm).toBe('offline');
    expect(p.daysSince).toBe(0); // leitura de hoje existe
    expect(p.offlineSince).toBe('2026-07-25');
    expect(p.offlineDays).toBe(3);
  });

  it('reinicia a contagem quando a impressora voltou a comunicar no meio do histórico', () => {
    const [p] = computePrinterStats(
      [{ id: 'A', cliente: CLIENTE }],
      [
        { printer_id: 'A', data: '2026-07-20', contador_pb: 10, status: OFF },
        { printer_id: 'A', data: '2026-07-25', contador_pb: 10, status: ON },
        { printer_id: 'A', data: '2026-07-27', contador_pb: 10, status: OFF },
        { printer_id: 'A', data: '2026-07-28', contador_pb: 10, status: OFF },
      ],
      THRESHOLD
    );
    expect(p.offlineSince).toBe('2026-07-27');
    expect(p.offlineDays).toBe(1);
  });

  it('offline vence contador zerado — parada não pode ser contabilizada como sem monitoramento', () => {
    // Regressão: contador parado em 0 é consequência de não comunicar, não um problema
    // separado. Antes o bucket "sem monitoramento" engolia a impressora e ela sumia do
    // número de offline.
    const [p] = computePrinterStats(
      [{ id: 'A', cliente: CLIENTE }],
      [{ printer_id: 'A', data: '2026-07-28', contador_pb: 0, status: OFF }],
      THRESHOLD
    );
    expect(p.comm).toBe('offline');
  });

  it('marca sem-monitoramento quando comunica mas o contador está zerado', () => {
    const [p] = computePrinterStats(
      [{ id: 'A', cliente: CLIENTE }],
      [{ printer_id: 'A', data: '2026-07-28', contador_pb: 0, status: ON }],
      THRESHOLD
    );
    expect(p.comm).toBe('sem-monitoramento');
    expect(p.offlineSince).toBeNull();
    expect(p.zeroSince).toBe('2026-07-28');
    expect(p.zeroDays).toBe(0);
  });

  it('conta desde quando o contador está zerado, não desde a última leitura', () => {
    const [p] = computePrinterStats(
      [{ id: 'A', cliente: CLIENTE }],
      [
        { printer_id: 'A', data: '2026-07-22', contador_pb: 340, status: ON },
        { printer_id: 'A', data: '2026-07-24', contador_pb: 0, status: ON },
        { printer_id: 'A', data: '2026-07-26', contador_pb: 0, status: ON },
        { printer_id: 'A', data: '2026-07-28', contador_pb: 0, status: ON },
      ],
      THRESHOLD
    );
    expect(p.comm).toBe('sem-monitoramento');
    expect(p.daysSince).toBe(0); // leitura de hoje existe — por isso não serve de medida
    expect(p.zeroSince).toBe('2026-07-24');
    expect(p.zeroDays).toBe(4);
  });

  it('ignora leitura sem contador ao medir desde quando está zerada', () => {
    // Leitura sem contador não prova que a impressora voltou a registrar página, então
    // não pode quebrar a sequência de zeros.
    const [p] = computePrinterStats(
      [{ id: 'A', cliente: CLIENTE }],
      [
        { printer_id: 'A', data: '2026-07-25', contador_pb: 0, status: ON },
        { printer_id: 'A', data: '2026-07-26', contador_pb: null, status: ON },
        { printer_id: 'A', data: '2026-07-28', contador_pb: 0, status: ON },
      ],
      THRESHOLD
    );
    expect(p.zeroSince).toBe('2026-07-25');
    expect(p.zeroDays).toBe(3);
  });

  it('não reporta contador zerado para impressora que está apenas offline', () => {
    const [p] = computePrinterStats(
      [{ id: 'A', cliente: CLIENTE }],
      [{ printer_id: 'A', data: '2026-07-28', contador_pb: 0, status: OFF }],
      THRESHOLD
    );
    expect(p.comm).toBe('offline');
    expect(p.zeroSince).toBeNull();
    expect(p.zeroDays).toBeNull();
  });

  it('sem status explícito, cai no limite de dias configurado', () => {
    const printers = [{ id: 'RECENTE', cliente: CLIENTE }, { id: 'ANTIGA', cliente: CLIENTE }];
    const stats = computePrinterStats(printers, [
      { printer_id: 'RECENTE', data: '2026-07-25', contador_pb: 10, status: null },
      { printer_id: 'ANTIGA', data: '2026-06-01', contador_pb: 10, status: null },
    ], THRESHOLD);
    expect(stats.find((p) => p.id === 'RECENTE').comm).toBe('online');
    expect(stats.find((p) => p.id === 'ANTIGA').comm).toBe('offline');
  });

  it('não inventa data de parada quando o offline veio de leitura sem status', () => {
    const [p] = computePrinterStats(
      [{ id: 'A', cliente: CLIENTE }],
      [{ printer_id: 'A', data: '2026-06-01', contador_pb: 10, status: null }],
      THRESHOLD
    );
    expect(p.comm).toBe('offline');
    expect(p.offlineSince).toBeNull();
    expect(p.offlineDays).toBeNull();
  });

  it('marca sem-dados quando a impressora foi cadastrada mas nunca teve leitura', () => {
    const [p] = computePrinterStats([{ id: 'A', cliente: CLIENTE }], [], THRESHOLD);
    expect(p.comm).toBe('sem-dados');
    expect(p.contador).toBeNull();
    expect(p.daysSince).toBeNull();
  });

  it('usa a última leitura com contador preenchido, ignorando leitura sem contador', () => {
    const [p] = computePrinterStats(
      [{ id: 'A', cliente: CLIENTE }],
      [
        { printer_id: 'A', data: '2026-07-26', contador_pb: 777, status: ON },
        { printer_id: 'A', data: '2026-07-28', contador_pb: null, status: ON },
      ],
      THRESHOLD
    );
    expect(p.contador).toBe(777);
  });
});

describe('computeKpis', () => {
  it('conta cada bucket de comunicação', () => {
    const stats = [
      { comm: 'online' }, { comm: 'online' }, { comm: 'offline' },
      { comm: 'sem-monitoramento' }, { comm: 'sem-dados' },
    ];
    expect(computeKpis(stats)).toEqual({
      total: 5, online: 2, offline: 1, semMonitoramento: 1, semDados: 1,
    });
  });
});

describe('computeOfflineList', () => {
  it('ordena da parada há mais tempo para a mais recente', () => {
    const stats = [
      { id: 'A', comm: 'offline', offlineDays: 1, local: 'CAPS' },
      { id: 'B', comm: 'offline', offlineDays: 9, local: 'UBS' },
      { id: 'C', comm: 'online', offlineDays: null, local: 'ESF' },
    ];
    expect(computeOfflineList(stats).map((p) => p.id)).toEqual(['B', 'A']);
  });

  it('desempata por ponto físico para a lista não embaralhar a cada refresh', () => {
    const stats = [
      { id: 'A', comm: 'offline', offlineDays: 0, local: 'Recepção' },
      { id: 'B', comm: 'offline', offlineDays: 0, local: 'Almoxarifado' },
      { id: 'C', comm: 'offline', offlineDays: 0, local: 'Farmácia' },
    ];
    expect(computeOfflineList(stats).map((p) => p.local)).toEqual(['Almoxarifado', 'Farmácia', 'Recepção']);
  });
});

describe('computeSemMonitoramentoList', () => {
  it('lista só quem está no bucket de contador zerado', () => {
    const stats = [
      { id: 'A', comm: 'sem-monitoramento', zeroDays: 2 },
      { id: 'B', comm: 'offline', offlineDays: 5 },
    ];
    expect(computeSemMonitoramentoList(stats).map((p) => p.id)).toEqual(['A']);
  });

  it('ordena da zerada há mais tempo, desempatando por ponto físico', () => {
    const stats = [
      { id: 'A', comm: 'sem-monitoramento', zeroDays: 0, local: 'Recepção' },
      { id: 'B', comm: 'sem-monitoramento', zeroDays: 7, local: 'CAPS' },
      { id: 'C', comm: 'sem-monitoramento', zeroDays: 0, local: 'Almoxarifado' },
    ];
    expect(computeSemMonitoramentoList(stats).map((p) => p.id)).toEqual(['B', 'C', 'A']);
  });
});

describe('computeLastSync', () => {
  it('usa o imported_at mais recente e mostra a hora em Brasília', () => {
    const stats = [{ id: 'A' }];
    const readings = [
      { printer_id: 'A', imported_at: '2026-07-28T10:00:00Z' },
      { printer_id: 'A', imported_at: '2026-07-28T13:30:00Z' }, // 10:30 BRT
    ];
    expect(computeLastSync(stats, readings)).toEqual({ date: '2026-07-28', time: '10:30', daysAgo: 0 });
  });

  it('ignora leitura de impressora fora do escopo do usuário', () => {
    const stats = [{ id: 'A' }];
    const readings = [
      { printer_id: 'A', imported_at: '2026-07-27T13:00:00Z' },
      { printer_id: 'OUTRO-CLIENTE', imported_at: '2026-07-28T13:00:00Z' },
    ];
    expect(computeLastSync(stats, readings).date).toBe('2026-07-27');
  });

  it('devolve null quando nenhuma leitura tem carimbo de importação', () => {
    expect(computeLastSync([{ id: 'A' }], [{ printer_id: 'A', imported_at: null }])).toBeNull();
  });
});

describe('computeConexaoData', () => {
  it('agrupa por tipo de conexão e rotula os sem informação', () => {
    const stats = [{ conexao: 'Rede' }, { conexao: 'Rede' }, { conexao: 'USB' }, { conexao: null }];
    expect(computeConexaoData(stats)).toEqual([
      { name: 'Rede', value: 2 },
      { name: 'USB', value: 1 },
      { name: 'Não informado', value: 1 },
    ]);
  });
});

describe('situação na PrintWayy e última comunicação', () => {
  // Regressão: "Parada há N dias" contava a partir da sequência de leituras do nosso sync,
  // e não do último contato da impressora com o PrintWayy. Uma impressora parada desde
  // março aparecia como "parada há poucos dias".
  it('conta o tempo parado a partir do lastCommunication da PrintWayy', () => {
    const [p] = computePrinterStats(
      [{ id: 'A', cliente: CLIENTE, ultima_comunicacao: '2026-07-18T12:49:09.020Z' }],
      [
        { printer_id: 'A', data: '2026-07-27', contador_pb: 70977, status: OFF },
        { printer_id: 'A', data: '2026-07-28', contador_pb: 70977, status: OFF },
      ],
      THRESHOLD
    );
    expect(p.comm).toBe('offline');
    expect(p.ultimaComunicacao).toBe('2026-07-18T12:49:09.020Z');
    expect(p.offlineDays).toBe(10);
    // coluna "Última comunicação": dias desde o contato com o PrintWayy, não desde a
    // última leitura do nosso sync (que é de hoje, daysSince = 0)
    expect(p.diasSemComunicar).toBe(10);
    expect(p.daysSince).toBe(0);
  });

  it('impressora fora do contrato na PrintWayy é tratada como parada, mesmo comunicando lá', () => {
    const [p] = computePrinterStats(
      [{ id: 'B', cliente: CLIENTE, situacao_printwayy: 'fora-do-contrato' }],
      [{ printer_id: 'B', data: '2026-07-28', contador_pb: 17237, status: ON }],
      THRESHOLD
    );
    expect(p.comm).toBe('offline');
  });

  it('impressora sem cadastro na PrintWayy entra como sem monitoramento', () => {
    const [p] = computePrinterStats(
      [{ id: 'C', cliente: CLIENTE, situacao_printwayy: 'nao-encontrada' }],
      [{ printer_id: 'C', data: '2026-07-28', contador_pb: 41, status: null }],
      THRESHOLD
    );
    expect(p.comm).toBe('sem-monitoramento');
  });

  it('impressora removida do contrato não aparece no painel', () => {
    const stats = computePrinterStats(
      [{ id: 'D', cliente: CLIENTE }, { id: 'E', cliente: CLIENTE, removida_em: '2026-07-01' }],
      [],
      THRESHOLD
    );
    expect(stats.map((p) => p.id)).toEqual(['D']);
  });
});
