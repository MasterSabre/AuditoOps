import { useReducedMotion } from "framer-motion";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { NamedCount } from "@/lib/audit/types";

const PALETTE = [
  "var(--primary)",
  "var(--gold)",
  "var(--link)",
  "var(--success)",
  "var(--chrome-band)",
];

interface RankingBarsProps {
  data: NamedCount[];
  valueLabel: string;
  color?: string;
}

const MAX_LABEL_CHARS = 22;
const LABEL_LINE_HEIGHT = 13;

function wrapLabel(label: string): string[] {
  const words = label.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (word.length > MAX_LABEL_CHARS) {
      if (current) {
        lines.push(current);
        current = "";
      }
      for (let start = 0; start < word.length; start += MAX_LABEL_CHARS) {
        lines.push(word.slice(start, start + MAX_LABEL_CHARS));
      }
      continue;
    }

    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > MAX_LABEL_CHARS && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) lines.push(current);
  return lines.length ? lines : [label];
}

function RankingYAxisTick({ x = 0, y = 0, payload }: {
  x?: number;
  y?: number;
  payload?: { value?: string | number };
}) {
  const label = String(payload?.value ?? "");
  const lines = wrapLabel(label);
  const firstDy = -((lines.length - 1) * LABEL_LINE_HEIGHT) / 2;

  return (
    <g>
      <title>{label}</title>
      <text
        x={x - 10}
        y={y}
        textAnchor="end"
        fill="var(--foreground)"
        fontSize={12}
        fontWeight={500}
      >
        {lines.map((line, index) => (
          <tspan key={`${index}-${line}`} x={x - 10} dy={index === 0 ? firstDy : LABEL_LINE_HEIGHT}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}

export function RankingBars({ data, valueLabel, color }: RankingBarsProps) {
  const reduced = useReducedMotion();
  const maximumLines = Math.max(1, ...data.map((row) => wrapLabel(row.nome).length));
  const rowHeight = Math.max(48, maximumLines * LABEL_LINE_HEIGHT + 12);
  const height = Math.max(320, data.length * rowHeight + 48);
  const maxValue = Math.max(0, ...data.map((row) => row.qtd));
  const valueDomainMax = maxValue + Math.max(10, Math.ceil(maxValue * 0.1));

  return (
    <div className="w-full overflow-x-auto">
      <div style={{ height, minWidth: 820 }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 56, bottom: 8, left: 8 }}>
            <CartesianGrid stroke="var(--border)" horizontal={false} />
            <XAxis
              type="number"
              domain={[0, valueDomainMax]}
              tick={{ fontSize: "var(--chart-tick-size)", fill: "var(--muted-foreground)" }}
              tickFormatter={(value: number) => value.toLocaleString("pt-BR")}
              stroke="var(--border)"
              allowDecimals={false}
            />
            <YAxis
              type="category"
              dataKey="nome"
              width={270}
              interval={0}
              tick={<RankingYAxisTick />}
              tickLine={false}
              stroke="var(--border)"
            />
            <Tooltip
              cursor={{ fill: "var(--accent)" }}
              labelFormatter={(label: string | number) => String(label)}
              formatter={(value: number) => [value.toLocaleString("pt-BR"), valueLabel]}
              contentStyle={{
                borderRadius: 8,
                border: "1px solid var(--border)",
                fontSize: "var(--chart-tooltip-size)",
                background: "var(--card)",
              }}
            />
            <Bar
              dataKey="qtd"
              name={valueLabel}
              radius={[0, 6, 6, 0]}
              isAnimationActive={!reduced}
              animationDuration={1000}
              barSize={Math.min(28, rowHeight * 0.58)}
            >
              {data.map((entry, index) => (
                <Cell key={`${entry.nome}-${index}`} fill={color ?? PALETTE[index % PALETTE.length]} />
              ))}
              <LabelList
                dataKey="qtd"
                position="right"
                offset={8}
                fill="var(--foreground)"
                fontSize={12}
                fontWeight={600}
                formatter={(value: unknown) => Number(value ?? 0).toLocaleString("pt-BR")}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
