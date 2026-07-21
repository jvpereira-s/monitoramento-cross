import { TEAL, DANGER } from '../lib/theme';

export default function StatusDot({ status }) {
  const color = status === 'online' ? TEAL : status === 'offline' ? DANGER : '#9CA3AF';
  return (
    <span style={{ position: 'relative', display: 'inline-flex', width: 10, height: 10, marginRight: 8 }}>
      {status === 'online' && (
        <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: color, opacity: 0.5, animation: 'pulse-ring 2s ease-out infinite' }} />
      )}
      <span style={{ position: 'relative', width: 10, height: 10, borderRadius: '50%', background: color }} />
    </span>
  );
}
