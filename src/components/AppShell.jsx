import { LayoutDashboard, FileText, Users, LogOut, ShieldCheck } from 'lucide-react';
import CrossMark from './CrossMark';
import { ORANGE, TEAL, DANGER, INK } from '../lib/theme';

export default function AppShell({
  profile,
  isAdmin,
  view,
  onViewChange,
  onLogout,
  lastSync,
  title,
  topbarExtra,
  children,
}) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {isAdmin && (
        <aside className="no-print" style={{ width: 200, flexShrink: 0, background: '#FAFAF9', borderRight: '1px solid #E5E5E5', padding: '20px 14px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 30, paddingLeft: 4 }}>
            <CrossMark size={30} />
            <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 12.5, letterSpacing: '0.05em' }}>CROSS</div>
          </div>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <button className={`cx-nav-item ${view === 'dashboard' || view === 'mapping' ? 'active' : ''}`} onClick={() => onViewChange('dashboard')}>
              <LayoutDashboard size={15} /> Painel
            </button>
            <button className={`cx-nav-item ${view === 'relatorio' ? 'active' : ''}`} onClick={() => onViewChange('relatorio')}>
              <FileText size={15} /> Relatório
            </button>
            <button className={`cx-nav-item ${view === 'usuarios' ? 'active' : ''}`} onClick={() => onViewChange('usuarios')}>
              <Users size={15} /> Usuários
            </button>
          </nav>
        </aside>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <header className="no-print" style={{ background: INK, color: '#fff', padding: '13px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {!isAdmin && <CrossMark size={26} />}
            <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {lastSync && (() => {
              const color = lastSync.daysAgo <= 1 ? TEAL : lastSync.daysAgo <= 3 ? ORANGE : DANGER;
              const label = lastSync.daysAgo === 0 ? 'hoje' : lastSync.daysAgo === 1 ? 'ontem' : `há ${lastSync.daysAgo} dias`;
              return (
                <span style={{ fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 20, background: 'rgba(255,255,255,0.08)' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
                  Atualizado {label}
                </span>
              );
            })()}
            {topbarExtra}
            <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.2)' }} />
            <span style={{ fontSize: 12, opacity: 0.75, display: 'flex', alignItems: 'center', gap: 5 }}>
              <ShieldCheck size={13} /> {profile.username}
            </span>
            <button className="cx-btn cx-topbar-btn" onClick={onLogout}
              style={{ padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
              <LogOut size={14} /> Sair
            </button>
          </div>
        </header>

        {!isAdmin && (
          <div className="no-print" style={{ display: 'flex', gap: 4, borderBottom: '1px solid #E5E5E5', padding: '0 26px', background: '#fff' }}>
            <button className={`cx-tab ${view !== 'relatorio' ? 'active' : ''}`} onClick={() => onViewChange('dashboard')}>Painel</button>
            <button className={`cx-tab ${view === 'relatorio' ? 'active' : ''}`} onClick={() => onViewChange('relatorio')}>Relatório</button>
          </div>
        )}

        <div style={{ padding: '22px 26px', flex: 1 }}>{children}</div>
      </div>
    </div>
  );
}
