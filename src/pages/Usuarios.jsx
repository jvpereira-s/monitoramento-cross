import { useEffect, useState } from 'react';
import { AlertTriangle, X, UserPlus, KeyRound, Trash2 } from 'lucide-react';
import AppShell from '../components/AppShell';
import { fetchUsers, createUser, deleteUser, resetUserPassword } from '../lib/users';
import { DEFAULT_CLIENT } from '../lib/importPrinters';
import { MUTED, TEAL, DANGER, LINE } from '../lib/theme';

const EMPTY_FORM = { username: '', password: '', role: 'cliente', cliente_associado: DEFAULT_CLIENT };

export default function Usuarios({ profile, isAdmin, onNavigate, onLogout }) {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState(EMPTY_FORM);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [passwordRowId, setPasswordRowId] = useState(null);
  const [newPassword, setNewPassword] = useState('');

  async function loadUsers() {
    setLoading(true);
    const result = await fetchUsers();
    if (!result.success) { setError(result.error); setLoading(false); return; }
    setUsers(result.users);
    setLoading(false);
  }

  useEffect(() => { loadUsers(); }, []);

  async function handleCreate() {
    if (!form.username.trim() || !form.password) {
      setError('Preencha usuário e senha.');
      return;
    }
    if (form.password.length < 8) {
      setError('A senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await createUser(form);
    setBusy(false);
    if (!result.success) { setError(result.error); return; }
    setNotice(`Conta "${form.username.trim().toLowerCase()}" criada.`);
    setForm(EMPTY_FORM);
    await loadUsers();
  }

  async function handleDelete(userId) {
    setBusy(true);
    setError(null);
    const result = await deleteUser(userId);
    setBusy(false);
    setConfirmDeleteId(null);
    if (!result.success) { setError(result.error); return; }
    setNotice('Conta excluída.');
    await loadUsers();
  }

  async function handleResetPassword(userId) {
    if (newPassword.length < 8) {
      setError('A nova senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await resetUserPassword(userId, newPassword);
    setBusy(false);
    if (!result.success) { setError(result.error); return; }
    setNotice('Senha atualizada.');
    setPasswordRowId(null);
    setNewPassword('');
  }

  return (
    <AppShell profile={profile} isAdmin={isAdmin} view="usuarios" onViewChange={onNavigate} onLogout={onLogout}
      lastSync={null} title="Usuários">

      {error && (
        <div className="no-print" style={{ background: '#FBEAE8', border: '1px solid #E8B4AC', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#7A281E', display: 'flex', justifyContent: 'space-between' }}>
          <span><AlertTriangle size={14} style={{ verticalAlign: -2, marginRight: 6 }} />{error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7A281E' }}><X size={14} /></button>
        </div>
      )}
      {notice && (
        <div className="no-print" style={{ background: '#EAF6F3', border: '1px solid #B8E0D6', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#0F5C4F', display: 'flex', justifyContent: 'space-between' }}>
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0F5C4F' }}><X size={14} /></button>
        </div>
      )}

      <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 10, padding: 20 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginTop: 0 }}>Contas de acesso</h2>

        {loading ? (
          <div style={{ padding: '30px 0', textAlign: 'center', color: MUTED, fontSize: 13.5 }}>Carregando...</div>
        ) : (
          <table className="cx-table" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 22 }}>
            <thead>
              <tr><th>Usuário</th><th>Papel</th><th>Cliente</th><th></th></tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600 }}>{u.username}</td>
                  <td>{u.role === 'admin' ? 'Interno (admin)' : 'Cliente'}</td>
                  <td>{u.cliente_associado || '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
                      {passwordRowId === u.id ? (
                        <>
                          <input type="password" className="cx-input" placeholder="Nova senha" value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)} style={{ width: 140, padding: '4px 8px', fontSize: 12.5 }} />
                          <button className="cx-btn" onClick={() => handleResetPassword(u.id)} disabled={busy}
                            style={{ background: TEAL, color: '#fff', padding: '4px 10px', fontSize: 12 }}>
                            Salvar
                          </button>
                          <button className="cx-btn" onClick={() => { setPasswordRowId(null); setNewPassword(''); }} disabled={busy}
                            style={{ background: 'none', border: `1px solid ${LINE}`, padding: '4px 10px', fontSize: 12 }}>
                            Cancelar
                          </button>
                        </>
                      ) : confirmDeleteId === u.id ? (
                        <>
                          <span style={{ fontSize: 12, color: DANGER }}>Excluir de vez?</span>
                          <button className="cx-btn" onClick={() => handleDelete(u.id)} disabled={busy}
                            style={{ background: DANGER, color: '#fff', padding: '4px 10px', fontSize: 12 }}>
                            Confirmar
                          </button>
                          <button className="cx-btn" onClick={() => setConfirmDeleteId(null)} disabled={busy}
                            style={{ background: 'none', border: `1px solid ${LINE}`, padding: '4px 10px', fontSize: 12 }}>
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <>
                          <button className="cx-btn" onClick={() => setPasswordRowId(u.id)}
                            title="Trocar senha"
                            style={{ background: 'none', border: `1px solid ${LINE}`, padding: '4px 8px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <KeyRound size={12} /> Senha
                          </button>
                          <button className="cx-btn" onClick={() => setConfirmDeleteId(u.id)}
                            title="Excluir"
                            disabled={u.id === profile.id}
                            style={{ background: 'none', border: `1px solid ${LINE}`, padding: '4px 8px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, color: u.id === profile.id ? '#C7CCC3' : DANGER }}>
                            <Trash2 size={12} /> Excluir
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: '#9CA3AF', padding: 24 }}>Nenhuma conta cadastrada.</td></tr>
              )}
            </tbody>
          </table>
        )}

        <h3 style={{ fontSize: 13.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
          <UserPlus size={15} /> Nova conta
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, alignItems: 'end' }}>
          <div>
            <label style={{ fontSize: 12, color: MUTED, display: 'block', marginBottom: 4 }}>Usuário</label>
            <input className="cx-input" style={{ width: '100%' }} value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: MUTED, display: 'block', marginBottom: 4 }}>Senha</label>
            <input className="cx-input" type="password" style={{ width: '100%' }} value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: MUTED, display: 'block', marginBottom: 4 }}>Papel</label>
            <select className="cx-input" style={{ width: '100%' }} value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
              <option value="cliente">Cliente</option>
              <option value="admin">Interno (admin)</option>
            </select>
          </div>
          {form.role === 'cliente' && (
            <div>
              <label style={{ fontSize: 12, color: MUTED, display: 'block', marginBottom: 4 }}>Cliente associado</label>
              <input className="cx-input" style={{ width: '100%' }} value={form.cliente_associado}
                onChange={(e) => setForm((f) => ({ ...f, cliente_associado: e.target.value }))} />
            </div>
          )}
          <button className="cx-btn" onClick={handleCreate} disabled={busy}
            style={{ background: TEAL, color: '#fff', padding: '9px 16px', fontSize: 13.5 }}>
            {busy ? 'Criando...' : 'Criar conta'}
          </button>
        </div>
      </div>
    </AppShell>
  );
}
