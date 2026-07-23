import { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { saveImport } from '../lib/db';
import { MUTED, TEAL, DANGER, LINE, ORANGE } from '../lib/theme';

const EMPTY_FORM = { id: '', cliente: '', modelo: '', ip: '', local: '', conexao: '' };

// Cadastro manual de uma impressora só (serial + cliente, resto opcional) — cobre o
// caso de registrar um cliente novo sem planilha histórica do PrintWayy. Reaproveita
// saveImport() (mesma função do import de planilha) com readings=[] — sem leitura
// ainda, só o cadastro em `printers`; a sincronização por API ou um import posterior
// preenchem o histórico depois.
export default function RegisterPrinterModal({ existingPrinters, knownClients, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const trimmedId = form.id.trim();
  const duplicate = trimmedId ? existingPrinters.find((p) => p.id === trimmedId) : null;

  async function handleSubmit() {
    if (!trimmedId || !form.cliente.trim()) {
      setError('Número de série e cliente são obrigatórios.');
      return;
    }
    setBusy(true);
    setError(null);
    // Só inclui campos opcionais preenchidos — mesma lógica de importPrinters.js:
    // um cadastro incompleto não deve apagar dado já existente pra esse serial.
    const printer = { id: trimmedId, cliente: form.cliente.trim() };
    if (form.modelo.trim()) printer.modelo = form.modelo.trim();
    if (form.ip.trim()) printer.ip = form.ip.trim();
    if (form.local.trim()) printer.local = form.local.trim();
    if (form.conexao.trim()) printer.conexao = form.conexao.trim();

    const result = await saveImport([printer], []);
    setBusy(false);
    if (!result.success) { setError(result.error); return; }
    onSaved(trimmedId);
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(17,17,17,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: 12, padding: 24, width: '100%', maxWidth: 440 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Cadastrar impressora manualmente</h2>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED }}>
            <X size={18} />
          </button>
        </div>

        <p style={{ fontSize: 12.5, color: MUTED, marginTop: -8, marginBottom: 16 }}>
          Sem leitura de contador ainda — só o cadastro. Contador entra depois, pela
          sincronização automática ou por um import de planilha.
        </p>

        {error && (
          <div style={{ background: '#FBEAE8', border: '1px solid #E8B4AC', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 12.5, color: '#7A281E' }}>
            {error}
          </div>
        )}

        {duplicate && (
          <div style={{ background: '#FFF6E9', border: '1px solid #F0D9AE', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 12.5, color: '#7A4E12', display: 'flex', gap: 6 }}>
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              Esse número de série já está cadastrado pro cliente <strong>{duplicate.cliente}</strong>.
              Salvar de novo vai sobrescrever os dados dessa impressora.
            </span>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 18 }}>
          <div>
            <label style={{ fontSize: 12, color: MUTED, display: 'block', marginBottom: 4 }}>
              Número de série <span style={{ color: DANGER }}>*</span>
            </label>
            <input className="cx-input mono" style={{ width: '100%' }} value={form.id}
              onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))} autoFocus />
          </div>
          <div>
            <label style={{ fontSize: 12, color: MUTED, display: 'block', marginBottom: 4 }}>
              Cliente <span style={{ color: DANGER }}>*</span>
            </label>
            <input className="cx-input" style={{ width: '100%' }} value={form.cliente} list="cx-known-clients"
              onChange={(e) => setForm((f) => ({ ...f, cliente: e.target.value }))} />
            <datalist id="cx-known-clients">
              {knownClients.map((c) => <option key={c} value={c} />)}
            </datalist>
            <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>
              Precisa bater exatamente com o "Cliente associado" da conta desse cliente
              (Usuários) — maiúsculas/minúsculas e espaços contam.
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, color: MUTED, display: 'block', marginBottom: 4 }}>Modelo</label>
              <input className="cx-input" style={{ width: '100%' }} value={form.modelo}
                onChange={(e) => setForm((f) => ({ ...f, modelo: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: MUTED, display: 'block', marginBottom: 4 }}>IP</label>
              <input className="cx-input mono" style={{ width: '100%' }} value={form.ip}
                onChange={(e) => setForm((f) => ({ ...f, ip: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: MUTED, display: 'block', marginBottom: 4 }}>Local</label>
              <input className="cx-input" style={{ width: '100%' }} value={form.local}
                onChange={(e) => setForm((f) => ({ ...f, local: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: MUTED, display: 'block', marginBottom: 4 }}>Conexão</label>
              <input className="cx-input" style={{ width: '100%' }} value={form.conexao}
                onChange={(e) => setForm((f) => ({ ...f, conexao: e.target.value }))} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="cx-btn" onClick={onClose} disabled={busy}
            style={{ background: 'none', border: `1px solid ${LINE}`, padding: '8px 14px', fontSize: 13 }}>
            Cancelar
          </button>
          <button type="button" className="cx-btn" onClick={handleSubmit} disabled={busy}
            style={{ background: duplicate ? ORANGE : TEAL, color: '#fff', padding: '8px 16px', fontSize: 13 }}>
            {busy ? 'Salvando...' : duplicate ? 'Sobrescrever e salvar' : 'Cadastrar'}
          </button>
        </div>
      </div>
    </div>
  );
}
