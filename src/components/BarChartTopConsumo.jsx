import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ORANGE, MUTED } from '../lib/theme';

export default function BarChartTopConsumo({ data }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
        <XAxis dataKey="name" fontSize={11} stroke={MUTED} />
        <YAxis fontSize={11} stroke={MUTED} />
        <Tooltip />
        <Bar dataKey="paginas" fill={ORANGE} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
