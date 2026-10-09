import { formatDateTimeBR } from './report';

// Rótulos de situação que aparecem para o CLIENTE (tabela do Painel, listas de impressora
// com problema, CSV e detalhe da impressora). Regra do contrato: a tela do cliente nunca cita
// a plataforma de terceiro de onde vem a leitura, nem a empresa que a opera — o cliente
// contrata a Cross, e o monitoramento é da Cross. O nome técnico fica só nas telas de admin
// (sincronizar, importar, ajustes). Teste: statusLabels.test.js.

// Coluna "Última comunicação": último contato da impressora com o monitoramento.
// p: impressora derivada por computePrinterStats (situacao_printwayy, ultimaComunicacao,
//    diasSemComunicar).
export function ultimaComunicacaoText(p) {
  if (p.situacao_printwayy === 'fora-do-contrato') return 'Fora do contrato';
  if (p.situacao_printwayy === 'nao-encontrada') return 'Sem leitura automática';
  if (!p.ultimaComunicacao) return '—';
  return `${formatDateTimeBR(p.ultimaComunicacao)} (${p.diasSemComunicar}d)`;
}

// Há quanto tempo a impressora está sem comunicar. `offlineDays` conta desde o primeiro dia
// da sequência, não desde a última leitura (o sync grava uma leitura por dia para todas).
export function offlineDaysText(p) {
  if (p.situacao_printwayy === 'fora-do-contrato') return 'Fora do contrato';
  if (p.offlineDays === null) return 'Sem comunicar';
  if (p.offlineDays === 0) return 'Parou hoje';
  return p.offlineDays === 1 ? 'Parada há 1 dia' : `Parada há ${p.offlineDays} dias`;
}

// Lista "sem monitoramento de páginas": contador lançado à mão ou contador zerado.
export function semMonitoramentoText(p) {
  if (p.situacao_printwayy === 'nao-encontrada') return 'Sem leitura automática';
  if (p.zeroDays === null) return 'Contador zerado';
  if (p.zeroDays === 0) return 'Zerou hoje';
  return p.zeroDays === 1 ? 'Zerada há 1 dia' : `Zerada há ${p.zeroDays} dias`;
}

// Linha "Última comunicação" do detalhe da impressora.
export function detalheComunicacaoText(printer) {
  if (printer.situacao_printwayy === 'fora-do-contrato') return 'Fora do contrato (contador congelado)';
  if (printer.situacao_printwayy === 'nao-encontrada') return 'Sem leitura automática (contador lançado manualmente)';
  return formatDateTimeBR(printer.ultimaComunicacao ?? printer.ultima_comunicacao);
}
