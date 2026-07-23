// Versão em linha fina do símbolo da Cross (cruz + anel), no mesmo estilo visual do
// globo e do ícone antigo de login (branco, traço fino, sem preenchimento sólido
// pesado) — o CrossMark.jsx é um selo em PNG com fundo preto e sombreado, que destoa
// bastante sobre o globo (fundo transparente, só pontos/contorno brancos).
export default function CrossEmblem({ size = 64, color = '#ffffff' }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} style={{ display: 'block' }}>
      <circle cx="50" cy="50" r="44" stroke={color} strokeWidth="1.5" fill="none" opacity="0.5" />
      <rect x="42" y="14" width="16" height="72" fill={color} opacity="0.9" />
      <rect x="14" y="42" width="72" height="16" fill={color} opacity="0.9" />
    </svg>
  );
}
