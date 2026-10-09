import crossLogo from '../assets/cross-logo.png';
import { formatDateBR } from './report';

const COMPANY = {
  name: 'Cross Soluções',
  tagline: 'Inovações contínuas na computação e na prestação de serviços',
  doc: 'CNPJ 65.404.622/0001-20 · Inscrição Estadual 084.818.99-9',
  address: 'Av. Raphael Barbosa Brhaim, 847, Guriri Norte, São Mateus – ES',
  contact: '(27) 99693-8793 · crosssolucoes@outlook.com',
};

// Mesma identidade do site e do sistema (src/lib/theme.js): marinho no cabeçalho da tabela e no
// título, laranja só como acento. Texto branco sobre o laranja da marca não passa no contraste.
const BRAND = { navy: 'FF0E2240', ink: 'FF1C2533', muted: 'FF5A6576', totalBg: 'FFEEF1F6' };

const CLIENT_HEADERS = ['#', 'Impressora', 'Número de série', 'Localização', 'Contador inicial', 'Contador final', 'Total de impressões'];
// Colunas extras só pro export de admin/interno — cliente já vê o suficiente com as
// de cima. Cor fica de fora do total "oficial" (reportTotals.pb) de propósito: o
// contrato hoje é só P&B, cor é informação extra de controle interno.
const ADMIN_EXTRA_HEADERS = ['Departamento', 'Cliente', 'IP', 'Conexão', 'Contador inicial (cor)', 'Contador final (cor)', 'Total de impressões (cor)'];
// Índice (1-based) da coluna do total colorido, que muda conforme colunas extras entram.
const COLOR_TOTAL_COL = CLIENT_HEADERS.length + ADMIN_EXTRA_HEADERS.length; // 14

function reportHeaders(isAdmin) {
  return isAdmin ? [...CLIENT_HEADERS, ...ADMIN_EXTRA_HEADERS] : CLIENT_HEADERS;
}

function reportRowValues(r, i, isAdmin) {
  const base = [i + 1, r.modelo || r.id, r.id, r.local || '', r.iniPB ?? '', r.finPB ?? '', r.totalPB ?? ''];
  if (!isAdmin) return base;
  return [...base, r.departamento || '', r.cliente || '', r.ip || '', r.conexao || '', r.iniColor ?? '', r.finColor ?? '', r.totalColor ?? ''];
}

function escapeCsv(v) {
  const s = String(v ?? '');
  return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function exportReportCSV(reportRows, reportTotals, client, reportStart, reportEnd, isAdmin) {
  const companyRows = [
    [COMPANY.name], [COMPANY.tagline], [COMPANY.doc], [COMPANY.address], [COMPANY.contact],
    [`Relatório de Impressões — ${client}`],
    [`Período de ${formatDateBR(reportStart)} a ${formatDateBR(reportEnd)}`],
    [],
  ];
  const headers = reportHeaders(isAdmin);
  const rows = reportRows.map((r, i) => reportRowValues(r, i, isAdmin));
  const totalRow = ['', '', '', 'Total geral', '', '', reportTotals.pb];
  if (isAdmin) totalRow.push('', '', '', '', '', '', reportTotals.color);
  rows.push(totalRow);
  const BOM = String.fromCharCode(0xfeff);
  const csv = BOM + [...companyRows, headers, ...rows].map((r) => r.map(escapeCsv).join(';')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `relatorio-impressoes-${client.replace(/\s+/g, '-')}-${reportEnd}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Busca o logo bundlado (Vite resolve o import pra uma URL) como binário — exceljs
// precisa do buffer da imagem pra embutir na planilha, não só do caminho.
async function loadLogoBuffer() {
  try {
    const res = await fetch(crossLogo);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

function addCompanyHeader(ws, wb, logoBuffer, lastCol) {
  if (logoBuffer) {
    const imageId = wb.addImage({ buffer: logoBuffer, extension: 'png' });
    // Coluna A com 9 de largura (~68px) pra caber a logo com folga — offsets fracionários
    // (col/row) centralizam a imagem de 46px dentro dela e do bloco de 4 linhas de texto
    // ao lado, em vez de grudar no canto superior esquerdo.
    ws.addImage(imageId, { tl: { col: 0.18, row: 0.35 }, ext: { width: 46, height: 46 } });
  }
  const lines = [COMPANY.name, COMPANY.tagline, COMPANY.doc, `${COMPANY.address} · ${COMPANY.contact}`];
  lines.forEach((text, i) => {
    const row = ws.getRow(i + 1);
    row.height = i === 0 ? 20 : 14;
    ws.mergeCells(i + 1, 2, i + 1, lastCol);
    const cell = row.getCell(2);
    cell.value = text;
    cell.font = i === 0
      ? { bold: true, size: 13, color: { argb: BRAND.ink } }
      : { size: 9, color: { argb: BRAND.muted } };
  });
}

function addTitleAndMeta(ws, client, start, end, printerCount, lastCol) {
  const titleRow = ws.getRow(6);
  ws.mergeCells(6, 1, 6, lastCol);
  titleRow.getCell(1).value = 'Relatório de Impressões';
  titleRow.getCell(1).font = { bold: true, size: 15, color: { argb: BRAND.navy } };
  titleRow.getCell(1).alignment = { horizontal: 'center' };
  titleRow.height = 22;

  const periodRow = ws.getRow(7);
  ws.mergeCells(7, 1, 7, lastCol);
  periodRow.getCell(1).value = `Período de ${formatDateBR(start)} a ${formatDateBR(end)}`;
  periodRow.getCell(1).font = { size: 10.5, color: { argb: BRAND.muted } };
  periodRow.getCell(1).alignment = { horizontal: 'center' };

  const metaRow = ws.getRow(9);
  ws.mergeCells(9, 1, 9, lastCol);
  const generatedAt = new Date().toLocaleDateString('pt-BR');
  metaRow.getCell(1).value = `Cliente: ${client}    Equipamentos: ${printerCount}    Gerado em: ${generatedAt}`;
  metaRow.getCell(1).font = { size: 10, color: { argb: BRAND.ink } };
}

function addTable(ws, reportRows, reportTotals, startRowNum, isAdmin) {
  const headers = reportHeaders(isAdmin);
  const rightAlignCols = isAdmin ? [5, 6, 7, 12, 13, 14] : [5, 6, 7];

  const headerRow = ws.getRow(startRowNum);
  headers.forEach((text, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = text;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.navy } };
    cell.alignment = { horizontal: rightAlignCols.includes(i + 1) ? 'right' : 'left', vertical: 'middle' };
  });
  headerRow.height = 18;

  reportRows.forEach((r, i) => {
    const row = ws.getRow(startRowNum + 1 + i);
    row.values = reportRowValues(r, i, isAdmin);
    rightAlignCols.forEach((col) => { row.getCell(col).alignment = { horizontal: 'right' }; });
    row.getCell(7).font = { bold: true };
  });

  const totalRowNum = startRowNum + 1 + reportRows.length;
  const totalRow = ws.getRow(totalRowNum);
  ws.mergeCells(totalRowNum, 1, totalRowNum, 4);
  totalRow.getCell(1).value = 'Total geral de impressões';
  totalRow.getCell(1).alignment = { horizontal: 'right' };
  totalRow.getCell(7).value = reportTotals.pb;
  totalRow.getCell(7).alignment = { horizontal: 'right' };
  if (isAdmin) {
    totalRow.getCell(COLOR_TOTAL_COL).value = reportTotals.color;
    totalRow.getCell(COLOR_TOTAL_COL).alignment = { horizontal: 'right' };
  }
  for (let col = 1; col <= headers.length; col++) {
    totalRow.getCell(col).font = { bold: true, color: { argb: BRAND.navy } };
    totalRow.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.totalBg } };
  }
}

export async function exportReportExcel(reportRows, reportTotals, client, reportStart, reportEnd, isAdmin) {
  // Import dinâmico: exceljs sozinho pesa ~800kB minificado — carregar só quando o
  // botão Excel é clicado evita inflar o bundle inicial que todo mundo baixa pra logar.
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Cross Soluções';
  wb.created = new Date();
  const ws = wb.addWorksheet('Relatório', { pageSetup: { orientation: 'landscape', fitToWidth: 1 } });
  const baseCols = [{ width: 9 }, { width: 24 }, { width: 20 }, { width: 36 }, { width: 16 }, { width: 16 }, { width: 18 }];
  const adminCols = [{ width: 30 }, { width: 22 }, { width: 15 }, { width: 12 }, { width: 16 }, { width: 16 }, { width: 20 }];
  ws.columns = isAdmin ? [...baseCols, ...adminCols] : baseCols;
  const lastCol = ws.columns.length;

  const logoBuffer = await loadLogoBuffer();
  addCompanyHeader(ws, wb, logoBuffer, lastCol);
  addTitleAndMeta(ws, client, reportStart, reportEnd, reportRows.length, lastCol);
  addTable(ws, reportRows, reportTotals, 10, isAdmin);

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `relatorio-impressoes-${client.replace(/\s+/g, '-')}-${reportEnd}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function reportRowHtml(r, i, isAdmin) {
  const adminCells = !isAdmin ? '' : `
      <td>${(r.departamento || '—').replace(/</g, '&lt;')}</td>
      <td>${(r.cliente || '—').replace(/</g, '&lt;')}</td>
      <td style="font-family:monospace">${r.ip || '—'}</td>
      <td>${r.conexao || '—'}</td>
      <td style="text-align:right;font-family:monospace">${r.iniColor !== null ? r.iniColor.toLocaleString('pt-BR') : '—'}</td>
      <td style="text-align:right;font-family:monospace">${r.finColor !== null ? r.finColor.toLocaleString('pt-BR') : '—'}</td>
      <td style="text-align:right;font-family:monospace">${r.totalColor !== null ? r.totalColor.toLocaleString('pt-BR') : '—'}</td>`;
  return `
    <tr>
      <td style="text-align:right;color:#6B6B6B">${i + 1}</td>
      <td>${r.modelo || '—'}</td>
      <td style="font-family:monospace">${r.id}</td>
      <td>${(r.local || '—').replace(/</g, '&lt;')}</td>
      <td style="text-align:right;font-family:monospace">${r.iniPB !== null ? r.iniPB.toLocaleString('pt-BR') : '—'}</td>
      <td style="text-align:right;font-family:monospace">${r.finPB !== null ? r.finPB.toLocaleString('pt-BR') : '—'}</td>
      <td style="text-align:right;font-weight:600;font-family:monospace">${r.totalPB !== null ? r.totalPB.toLocaleString('pt-BR') : '—'}</td>${adminCells}
    </tr>`;
}

// Abre uma janela própria com o relatório formatado e dispara a impressão — é a mesma
// abordagem do protótipo, que só existia por causa do sandbox de artefato bloquear
// window.print() da janela principal. Fora do sandbox (app real) window.print() direto
// funcionaria também, mas manter a janela separada dá um documento limpo, sem a UI do app.
export function exportReportPDF(reportRows, reportTotals, client, reportStart, reportEnd, isAdmin) {
  const rowsHtml = reportRows.map((r, i) => reportRowHtml(r, i, isAdmin)).join('');

  const adminHeadCells = !isAdmin ? '' : `<th>Departamento</th><th>Cliente</th><th>IP</th><th>Conexão</th><th style="text-align:right">Contador inicial (cor)</th><th style="text-align:right">Contador final (cor)</th><th style="text-align:right">Total (cor)</th>`;
  const totalRowHtml = !isAdmin
    ? `<tr class="total"><td colspan="6" style="text-align:right">Total geral de impressões</td><td style="text-align:right;font-family:monospace">${reportTotals.pb.toLocaleString('pt-BR')}</td></tr>`
    : `<tr class="total"><td colspan="6" style="text-align:right">Total geral de impressões</td><td style="text-align:right;font-family:monospace">${reportTotals.pb.toLocaleString('pt-BR')}</td><td colspan="6"></td><td style="text-align:right;font-family:monospace">${reportTotals.color.toLocaleString('pt-BR')}</td></tr>`;

  // Resolve contra a URL atual (não window.location.origin) — com base relativa no build,
  // isso funciona tanto na raiz do domínio quanto numa subpasta (ex: dominio.com/monitoramento/).
  const logoUrl = new URL(crossLogo, window.location.href).href;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Relatório de Impressões — ${client}</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: 'IBM Plex Sans', -apple-system, 'Segoe UI', Arial, sans-serif; color: #1C2533; margin: 32px; }
      .hd { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #E8720C; padding-bottom:16px; margin-bottom:20px; }
      .hd img { width:52px; height:52px; object-fit:contain; }
      .hd .name { font-weight:600; font-size:17px; color:#0E2240; }
      .hd .sm { font-size:10px; color:#5A6576; margin-top:2px; }
      h1 { text-align:center; font-size:19px; font-weight:600; color:#0E2240; margin:0 0 4px; }
      .period { text-align:center; font-size:12px; color:#5A6576; margin-bottom:20px; }
      .meta { background:#F3F5F8; border:1px solid #DDE2E9; border-radius:4px; padding:10px 14px; font-size:12px; margin-bottom:20px; display:flex; gap:28px; flex-wrap:wrap; }
      table { width:100%; border-collapse:collapse; font-size:11px; }
      th { background:#0E2240; color:#fff; text-align:left; padding:7px 9px; font-size:10px; text-transform:uppercase; letter-spacing:.04em; }
      td { padding:6px 9px; border-bottom:1px solid #EEE; }
      tr.total td { background:#EEF1F6; color:#0E2240; font-weight:700; }
      .ft { margin-top:26px; padding-top:12px; border-top:1px solid #DDE2E9; display:flex; justify-content:space-between; font-size:9.5px; color:#5A6576; }
      @media print { body { margin:0; } }
    </style></head><body>
      <div class="hd">
        <div style="display:flex;gap:14px;align-items:center">
          <img src="${logoUrl}" alt="Cross">
          <div>
            <div class="name">Cross Soluções</div>
            <div class="sm">Inovações contínuas na computação e na prestação de serviços</div>
            <div class="sm">CNPJ 65.404.622/0001-20 · Inscrição Estadual 084.818.99-9</div>
          </div>
        </div>
        <div style="text-align:right;font-size:10px;color:#5A6576;line-height:1.7">
          <div>Av. Raphael Barbosa Brhaim, 847</div>
          <div>Guriri Norte, São Mateus – ES</div>
          <div>(27) 99693-8793 · crosssolucoes@outlook.com</div>
        </div>
      </div>
      <h1>Relatório de Impressões</h1>
      <div class="period">Período de ${formatDateBR(reportStart)} a ${formatDateBR(reportEnd)}</div>
      <div class="meta">
        <div><strong>Cliente:</strong> ${client}</div>
        <div><strong>Equipamentos:</strong> ${reportRows.length}</div>
        <div><strong>Gerado em:</strong> ${new Date().toLocaleDateString('pt-BR')}</div>
      </div>
      <table>
        <thead><tr><th style="text-align:right">#</th><th>Impressora</th><th>Número de série</th><th>Localização</th><th style="text-align:right">Contador inicial</th><th style="text-align:right">Contador final</th><th style="text-align:right">Total de impressões</th>${adminHeadCells}</tr></thead>
        <tbody>
          ${rowsHtml}
          ${totalRowHtml}
        </tbody>
      </table>
      <div class="ft">
        <span>Cross Soluções · Monitoramento de impressões · Documento gerado automaticamente</span>
        <span>crosssolucoes@outlook.com · (27) 99693-8793</span>
      </div>
      <script>window.onload = function(){ setTimeout(function(){ try { window.print(); } catch(e){} }, 300); };</script>
    </body></html>`;

  const win = window.open('', '_blank');
  if (!win) {
    return { success: false, error: 'Não consegui abrir a janela de impressão (bloqueada pelo navegador). Use Exportar Excel e salve como PDF, ou libere pop-ups.' };
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  return { success: true };
}
