import { useReducedMotion } from "framer-motion";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { SetorRow } from "@/lib/audit/types";

const COLORS = [
  "var(--primary)",
  "var(--gold)",
  "var(--link)",
  "var(--success)",
  "var(--critical)",
  "var(--chrome-band)",
];

export function ClasseDonut({ data }: { data: SetorRow[] }) {
  const reduced = useReducedMotion();
  const slices = data.filter((row) => row.qtd > 0).slice(0, 6);

  return (
    <div className="chart-frame">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={slices}
            dataKey="qtd"
            nameKey="setor"
            innerRadius="55%"
            outerRadius="80%"
            paddingAngle={2}
            isAnimationActive={!reduced}
            animationDuration={1100}
          >
            {slices.map((slice, index) => (
              <Cell key={slice.setor} fill={COLORS[index % COLORS.length]} stroke="var(--card)" />
            ))}
          </Pie>
          <Legend wrapperStyle={{ fontSize: "var(--chart-tooltip-size)" }} />
          <Tooltip
            contentStyle={{
              borderRadius: 8,
              border: "1px solid var(--border)",
              fontSize: "var(--chart-tooltip-size)",
              background: "var(--card)",
            }}
            formatter={(value: number, name) => [value, String(name)]}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
