export default function MiniDonut({ data, size = 56 }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = size / 2 - 5;
  const circumference = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#EFEFEF" strokeWidth="7" />
      {data.map((d) => {
        const frac = d.value / total;
        const dash = frac * circumference;
        const el = (
          <circle key={d.name} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={d.color} strokeWidth="7"
            strokeDasharray={`${dash} ${circumference - dash}`} strokeDashoffset={-acc}
            transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        );
        acc += dash;
        return el;
      })}
    </svg>
  );
}
