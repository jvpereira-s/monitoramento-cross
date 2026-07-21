import * as XLSX from 'xlsx';
import crossLogo from '../assets/cross-logo.png';
import { formatDateBR } from './report';

function escapeCsv(v) {
  const s = String(v ?? '');
  return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function exportReportCSV(reportRows, reportTotals, client, reportEnd) {
  const headers = ['#', 'Impressora', 'Numero de serie', 'Localizacao', 'Total de impressoes'];
  const rows = reportRows.map((r, i) => [i + 1, r.modelo || r.id, r.id, r.local || '', r.totalPB ?? '']);
  rows.push(['', '', '', 'Total geral', reportTotals.pb]);
  const BOM = String.fromCharCode(0xfeff);
  const csv = BOM + [headers, ...rows].map((r) => r.map(escapeCsv).join(';')).join('\r\n');
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

export function exportReportExcel(reportRows, reportTotals, client, reportEnd) {
  const rows = reportRows.map((r, i) => ({
    '#': i + 1,
    'Impressora': r.modelo || r.id,
    'Número de série': r.id,
    'Localização': r.local || '',
    'Total de impressões': r.totalPB ?? '',
  }));
  rows.push({ '#': '', 'Impressora': '', 'Número de série': '', 'Localização': 'Total geral', 'Total de impressões': reportTotals.pb });
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 5 }, { wch: 22 }, { wch: 18 }, { wch: 42 }, { wch: 18 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Relatório');
  XLSX.writeFile(wb, `relatorio-impressoes-${client.replace(/\s+/g, '-')}-${reportEnd}.xlsx`);
}

// Abre uma janela própria com o relatório formatado e dispara a impressão — é a mesma
// abordagem do protótipo, que só existia por causa do sandbox de artefato bloquear
// window.print() da janela principal. Fora do sandbox (app real) window.print() direto
// funcionaria também, mas manter a janela separada dá um documento limpo, sem a UI do app.
export function exportReportPDF(reportRows, reportTotals, client, reportStart, reportEnd) {
  const rowsHtml = reportRows.map((r, i) => `
    <tr>
      <td style="text-align:right;color:#6B6B6B">${i + 1}</td>
      <td>${r.modelo || '—'}</td>
      <td style="font-family:monospace">${r.id}</td>
      <td>${(r.local || '—').replace(/</g, '&lt;')}</td>
      <td style="text-align:right;font-weight:600;font-family:monospace">${r.totalPB !== null ? r.totalPB.toLocaleString('pt-BR') : '—'}</td>
    </tr>`).join('');

  const logoUrl = new URL(crossLogo, window.location.origin).href;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Relatório de Impressões — ${client}</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: -apple-system, Arial, sans-serif; color: #111; margin: 32px; }
      .hd { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #E8720C; padding-bottom:16px; margin-bottom:20px; }
      .hd img { width:52px; height:52px; object-fit:contain; }
      .hd .name { font-weight:700; font-size:16px; letter-spacing:.03em; }
      .hd .sm { font-size:10px; color:#6B6B6B; margin-top:2px; }
      h1 { text-align:center; font-size:19px; margin:0 0 4px; }
      .period { text-align:center; font-size:12px; color:#6B6B6B; margin-bottom:20px; }
      .meta { background:#FAFAF9; border:1px solid #E5E5E5; border-radius:6px; padding:10px 14px; font-size:12px; margin-bottom:20px; display:flex; gap:28px; flex-wrap:wrap; }
      table { width:100%; border-collapse:collapse; font-size:11px; }
      th { background:#E8720C; color:#fff; text-align:left; padding:7px 9px; font-size:10px; text-transform:uppercase; letter-spacing:.04em; }
      td { padding:6px 9px; border-bottom:1px solid #EEE; }
      tr.total td { background:#FCE9D8; font-weight:700; }
      .ft { margin-top:26px; padding-top:12px; border-top:1px solid #E5E5E5; display:flex; justify-content:space-between; font-size:9.5px; color:#6B6B6B; }
      @media print { body { margin:0; } }
    </style></head><body>
      <div class="hd">
        <div style="display:flex;gap:14px;align-items:center">
          <img src="${logoUrl}" alt="Cross">
          <div>
            <div class="name">CROSS SOLUÇÕES</div>
            <div class="sm">Inovações contínuas na computação e na prestação de serviços</div>
            <div class="sm">CNPJ 65.404.622/0001-20 · Inscrição Estadual 084.818.99-9</div>
          </div>
        </div>
        <div style="text-align:right;font-size:10px;color:#6B6B6B;line-height:1.7">
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
        <thead><tr><th style="text-align:right">#</th><th>Impressora</th><th>Número de série</th><th>Localização</th><th style="text-align:right">Total de impressões</th></tr></thead>
        <tbody>
          ${rowsHtml}
          <tr class="total"><td colspan="4" style="text-align:right">Total geral de impressões</td><td style="text-align:right;font-family:monospace">${reportTotals.pb.toLocaleString('pt-BR')}</td></tr>
        </tbody>
      </table>
      <div class="ft">
        <span>CROSS Soluções · Monitoramento de impressão · Documento gerado automaticamente</span>
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
