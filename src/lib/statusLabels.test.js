import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ultimaComunicacaoText, offlineDaysText, semMonitoramentoText, detalheComunicacaoText } from './statusLabels';

// Regra do contrato: a tela do cliente nunca cita a plataforma de terceiro de onde vem a
// leitura nem a empresa que a opera. Antes de 09/10/2026 a tabela, as listas, o card
// "Offline", o CSV e o detalhe da impressora diziam "Sem cadastro no PrintWayy" /
// "Última comunicação com o PrintWayy" também para o cliente.
const PROIBIDO = /printwayy|cibox/i;

const SITUACOES = ['contrato', 'fora-do-contrato', 'nao-encontrada', null];
const casos = SITUACOES.flatMap((situacao_printwayy) => [
  { situacao_printwayy, ultimaComunicacao: '2026-10-09T08:00:00Z', ultima_comunicacao: '2026-10-09T08:00:00Z', diasSemComunicar: 0, offlineDays: 3, zeroDays: 2 },
  { situacao_printwayy, ultimaComunicacao: null, ultima_comunicacao: null, diasSemComunicar: null, offlineDays: null, zeroDays: null },
  { situacao_printwayy, ultimaComunicacao: null, offlineDays: 0, zeroDays: 0 },
  { situacao_printwayy, ultimaComunicacao: null, offlineDays: 1, zeroDays: 1 },
]);

describe('rótulos de situação vistos pelo cliente', () => {
  it('nenhum rótulo cita a plataforma de terceiro', () => {
    for (const p of casos) {
      for (const fn of [ultimaComunicacaoText, offlineDaysText, semMonitoramentoText, detalheComunicacaoText]) {
        expect(fn(p)).not.toMatch(PROIBIDO);
      }
    }
  });

  it('mantém o significado de cada situação', () => {
    expect(ultimaComunicacaoText({ situacao_printwayy: 'fora-do-contrato' })).toBe('Fora do contrato');
    expect(ultimaComunicacaoText({ situacao_printwayy: 'nao-encontrada' })).toBe('Sem leitura automática');
    expect(semMonitoramentoText({ situacao_printwayy: 'nao-encontrada' })).toBe('Sem leitura automática');
    expect(offlineDaysText({ situacao_printwayy: 'contrato', offlineDays: 4 })).toBe('Parada há 4 dias');
    expect(semMonitoramentoText({ situacao_printwayy: 'contrato', zeroDays: 1 })).toBe('Zerada há 1 dia');
    expect(detalheComunicacaoText({ situacao_printwayy: 'nao-encontrada' })).toMatch(/lançado manualmente/);
  });
});

// Componentes que o cliente vê inteiros: nenhum texto (fora de comentário) pode citar a
// plataforma. O Painel fica de fora porque tem telas só de admin (sincronizar, importar).
const SO_CLIENTE_VE = [
  '../components/PrinterDetailModal.jsx',
  '../components/PrinterIssueList.jsx',
  '../components/AppShell.jsx',
  '../components/StatusDot.jsx',
  '../pages/Login.jsx',
  '../pages/Relatorio.jsx',
  './reportExport.js',
];

function semComentarios(codigo) {
  return codigo
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    // identificador de coluna do banco, não texto de tela
    .replace(/situacao_printwayy/g, '');
}

describe('telas que o cliente vê', () => {
  for (const arquivo of SO_CLIENTE_VE) {
    it(`${arquivo} não cita a plataforma de terceiro`, () => {
      const codigo = semComentarios(readFileSync(new URL(arquivo, import.meta.url), 'utf8'));
      expect(codigo).not.toMatch(PROIBIDO);
    });
  }
});
