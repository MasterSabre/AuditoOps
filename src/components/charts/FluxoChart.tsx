import { useReducedMotion } from "framer-motion";
import { Activity, Clock3, Gauge, TimerReset } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AuditDetailRow, FluxoPoint } from "@/lib/audit/types";

interface FluxoChartProps {
  data: FluxoPoint[];
  details?: AuditDetailRow[];
}

const timeLabel = (timestamp: string | undefined) => timestamp?.slice(-5) ?? "—";

export function FluxoChart({ data, details = [] }: FluxoChartProps) {
  const reduced = useReducedMotion();
  const points = data.map((point) => ({
    timestamp: point.timestamp,
    hora: timeLabel(point.timestamp),
    leituras: point.leituras,
  }));
  const totalLeituras = points.reduce((sum, point) => sum + point.leituras, 0);
  const pico = points.reduce<(typeof points)[number] | null>(
    (max, point) => (!max || point.leituras > max.leituras ? point : max),
    null,
  );
  const usuariosComRegistro = details.filter((row) => row.usuario.trim()).length;
  const registrosSemHorario = details.filter((row) => row.usuario.trim() && !row.auditadoEm.trim()).length;

  if (points.length === 0) {
    return (
      <div className="flex min-h-[260px] flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 px-6 py-10 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Activity className="size-6" />
        </span>
        <h3 className="mt-4 text-base font-semibold">Nenhum fluxo de leitura identificado</h3>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Não foram encontrados registros que tenham, ao mesmo tempo, usuário e horário de leitura reconhecíveis.
          Reimporte a planilha para recalcular o fluxo usando a segunda coluna “Auditado em”, inclusive quando o Excel
          a armazenar como horário numérico.
        </p>
        {details.length > 0 ? (
          <div className="mt-5 grid w-full max-w-xl grid-cols-1 gap-3 text-left sm:grid-cols-2">
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground">Registros com usuário</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{usuariosComRegistro.toLocaleString("pt-BR")}</p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground">Sem horário reconhecido</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{registrosSemHorario.toLocaleString("pt-BR")}</p>
            </div>
          </div>
        ) : null}
        <p className="mt-4 max-w-xl text-xs text-muted-foreground">
          Confira também se a coluna Usuário está preenchida nos registros lidos. Essa visualização não altera os indicadores
          nem as regras de cálculo da auditoria.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className="rounded-lg border bg-muted/30 p-3.5">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Activity className="size-4" />Leituras com horário</div>
          <p className="mt-2 text-2xl font-bold tabular-nums">{totalLeituras.toLocaleString("pt-BR")}</p>
          <p className="mt-1 text-xs text-muted-foreground">Usuário e horário identificados</p>
        </div>
        <div className="rounded-lg border bg-muted/30 p-3.5">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Clock3 className="size-4" />Minutos ativos</div>
          <p className="mt-2 text-2xl font-bold tabular-nums">{points.length.toLocaleString("pt-BR")}</p>
          <p className="mt-1 text-xs text-muted-foreground">Minutos com ao menos uma leitura</p>
        </div>
        <div className="rounded-lg border bg-muted/30 p-3.5">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Gauge className="size-4" />Pico por minuto</div>
          <p className="mt-2 text-2xl font-bold tabular-nums">{(pico?.leituras ?? 0).toLocaleString("pt-BR")}</p>
          <p className="mt-1 text-xs text-muted-foreground">Maior volume em um minuto</p>
        </div>
        <div className="rounded-lg border bg-muted/30 p-3.5">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><TimerReset className="size-4" />Horário de pico</div>
          <p className="mt-2 text-2xl font-bold tabular-nums">{timeLabel(pico?.timestamp)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{pico ? `${pico.leituras.toLocaleString("pt-BR")} leituras no minuto` : "Sem pico calculado"}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>Intervalo reconhecido: {timeLabel(points[0]?.timestamp)}–{timeLabel(points[points.length - 1]?.timestamp)}</span>
        <span>O gráfico agrupa os registros por minuto.</span>
      </div>

      <div className="chart-frame">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 12, right: 22, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="hora"
              tick={{ fontSize: "var(--chart-tick-size)", fill: "var(--muted-foreground)" }}
              interval="preserveStartEnd"
              minTickGap={24}
              stroke="var(--border)"
            />
            <YAxis
              tick={{ fontSize: "var(--chart-tick-size)", fill: "var(--muted-foreground)" }}
              stroke="var(--border)"
              allowDecimals={false}
              width={48}
            />
            <Tooltip
              labelFormatter={(label: string | number) => `Horário ${label}`}
              formatter={(value: number) => [value.toLocaleString("pt-BR"), "Leituras no minuto"]}
              contentStyle={{
                borderRadius: 8,
                border: "1px solid var(--border)",
                fontSize: "var(--chart-tooltip-size)",
                background: "var(--card)",
              }}
            />
            <Line
              type="monotone"
              dataKey="leituras"
              name="Leituras"
              stroke="var(--link)"
              strokeWidth={2.6}
              dot={points.length <= 60 ? { r: 2.5, fill: "var(--link)" } : false}
              activeDot={{ r: 5, fill: "var(--primary)" }}
              isAnimationActive={!reduced}
              animationDuration={1000}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
