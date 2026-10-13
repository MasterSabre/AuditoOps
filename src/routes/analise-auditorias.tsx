import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Activity, CalendarDays, CheckCircle2, Database, Filter, RefreshCw, Target, ClipboardList, AlertTriangle, Layers3, ChartNoAxesCombined, GitCompare, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { PageHeader, PageTransition } from "@/components/PageTransition";
import { SectionCard } from "@/components/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchSqlAudits, updateSqlAuditStatus, type SqlAuditEntry } from "@/lib/audit/database-client";
import type { AuditType } from "@/lib/audit/types";
import { getLocalIsoDate, addIsoDays } from "@/lib/audit/schedule";
import { compareAuditMetrics, compareSectorCounts, compareUserCounts, getPreviousSameTypeAudit, type NamedCountComparison } from "@/lib/audit/comparison";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/analise-auditorias")({
  head: () => ({ meta: [{ title: "Análise de Auditorias · AuditOps" }, { name: "description", content: "Desempenho histórico de auditorias, filtros por período, tipo, status e meta de pendência." }] }),
  component: AuditAnalysisPage,
});

type PeriodPreset = "30d" | "3m" | "6m" | "12m" | "all" | "custom";
type AuditTypeFilter = "Todas" | AuditType;
type StatusFilter = "all" | "open" | "closed";
type MetaFilter = "all" | "within" | "outside";
type AnalysisTab = "overview" | "sectors" | "users" | "audits" | "charts" | "comparison";
type ChartMetric = "sku" | "pending" | "partial";
type EvolutionPoint = { id: number; dataAuditoria: string; auditType: AuditType; sourceFile: string; label: string; sku: number; naoLidos: number; parcial: number | null; valor: number | null };
type DailyComparisonPoint = { date: string; label: string; Etiqueta: number | null; Presença: number | null; Ruptura: number | null };

const META_LIMIT = 3;
const number = (value: number, decimals = 0) => value.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
const prettyDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR");
const shortDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
const chartMetricLabel: Record<ChartMetric, string> = { sku: "SKUs auditados", pending: "Itens pendentes", partial: "% pendente" };
const signedNumber = (value: number, decimals = 0) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${number(Math.abs(value), decimals)}`;
function auditChoiceLabel(item: SqlAuditEntry) {
  return `${prettyDate(item.dataAuditoria)} · ${item.auditType} · ${item.sourceFile || `Planilha #${item.id}`} · #${item.id}`;
}
function getMetricValue(item: Pick<SqlAuditEntry, "sku" | "naoLidos" | "parcial">, metric: ChartMetric): number | null {
  if (metric === "sku") return item.sku;
  if (metric === "pending") return item.naoLidos;
  return item.parcial;
}
function formatMetric(value: number | null | undefined, metric: ChartMetric) {
  if (value == null) return "—";
  return metric === "partial" ? `${number(value, 2)}%` : number(value);
}
function subtractMonths(date: string, months: number) {
  const value = new Date(`${date}T12:00:00`);
  const originalDay = value.getDate();
  value.setDate(1);
  value.setMonth(value.getMonth() - months);
  const finalDayOfMonth = new Date(value.getFullYear(), value.getMonth() + 1, 0).getDate();
  value.setDate(Math.min(originalDay, finalDayOfMonth));
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function MetricCard({ title, value, description, icon: Icon }: { title: string; value: string; description: string; icon: typeof Activity }) {
  return <article className="surface-card min-w-0 p-5"><div className="flex items-start justify-between gap-3"><p className="text-sm font-medium text-muted-foreground">{title}</p><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Icon className="size-4" /></span></div><p className="mt-3 text-3xl font-bold tracking-tight text-tabular">{value}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{description}</p></article>;
}

function SelectFilter({ label, value, onChange, options }: { label: string; value: string; onChange: (next: string) => void; options: Array<{ label: string; value: string }> }) {
  return <label className="block space-y-1.5 text-sm"><span className="font-medium text-muted-foreground">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

function AuditAnalysisPage() {
  const navigate = useNavigate();
  const today = getLocalIsoDate();
  const [period, setPeriod] = useState<PeriodPreset>("30d");
  const [customFrom, setCustomFrom] = useState(addIsoDays(today, -29));
  const [customTo, setCustomTo] = useState(today);
  const [type, setType] = useState<AuditTypeFilter>("Todas");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [meta, setMeta] = useState<MetaFilter>("all");
  const [tab, setTab] = useState<AnalysisTab>("overview");
  const [chartMetric, setChartMetric] = useState<ChartMetric>("sku");
  const [records, setRecords] = useState<SqlAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [statusChanging, setStatusChanging] = useState<number | null>(null);
  const [comparisonHistory, setComparisonHistory] = useState<SqlAuditEntry[]>([]);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [selectedComparisonId, setSelectedComparisonId] = useState("");
  const [baselineSelection, setBaselineSelection] = useState("previous");

  const from = period === "custom" ? customFrom : period === "all" ? "1900-01-01" : period === "3m" ? subtractMonths(today, 3) : period === "6m" ? subtractMonths(today, 6) : period === "12m" ? subtractMonths(today, 12) : addIsoDays(today, -29);
  const to = period === "custom" ? customTo : period === "all" ? "2100-12-31" : today;

  useEffect(() => {
    let canceled = false;
    setLoading(true);
    setError(null);
    fetchSqlAudits(from, to).then((data) => {
      if (!canceled) setRecords(data);
    }).catch((err: unknown) => {
      if (!canceled) setError(err instanceof Error ? err.message : "Não foi possível carregar as auditorias do banco SQL.");
    }).finally(() => {
      if (!canceled) setLoading(false);
    });
    return () => { canceled = true; };
  }, [from, to, refreshToken]);

  useEffect(() => {
    if (tab !== "comparison") return;
    let canceled = false;
    setComparisonLoading(true);
    fetchSqlAudits("1900-01-01", "2100-12-31").then((data) => {
      if (!canceled) setComparisonHistory(data.filter((item) => item.kind === "processed"));
    }).catch((err: unknown) => {
      if (!canceled) setError(err instanceof Error ? err.message : "Não foi possível carregar o histórico completo para comparar.");
    }).finally(() => {
      if (!canceled) setComparisonLoading(false);
    });
    return () => { canceled = true; };
  }, [tab, refreshToken]);

  const filteredRecords = useMemo(() => records.filter((item) => {
    if (type !== "Todas" && item.auditType !== type) return false;
    if (status === "open" && item.status !== "Aberta") return false;
    if (status === "closed" && item.status !== "Fechada") return false;
    if (meta === "within" && (item.parcial == null || item.parcial > META_LIMIT)) return false;
    if (meta === "outside" && (item.parcial == null || item.parcial <= META_LIMIT)) return false;
    return true;
  }), [records, type, status, meta]);

  const processed = filteredRecords.filter((item) => item.kind === "processed" && item.result);
  const openCount = filteredRecords.filter((item) => item.status === "Aberta").length;
  const closedCount = filteredRecords.filter((item) => item.status === "Fechada").length;
  const insideCount = processed.filter((item) => item.parcial != null && item.parcial <= META_LIMIT).length;
  const outsideCount = processed.filter((item) => item.parcial != null && item.parcial > META_LIMIT).length;
  const withinRate = processed.length > 0 ? `${number((insideCount / processed.length) * 100, 1)}%` : "—";
  const averagePartial = processed.length > 0 ? number(processed.reduce((total, item) => total + (item.parcial ?? 0), 0) / processed.length, 2) + "%" : "—";
  const totalSku = processed.reduce((total, item) => total + (item.sku ?? 0), 0);
  const totalPending = processed.reduce((total, item) => total + (item.naoLidos ?? 0), 0);

  const sectorRows = useMemo(() => {
    const grouped = new Map<string, { pending: number; appearances: number }>();
    for (const audit of processed) {
      for (const sector of audit.result?.setores ?? []) {
        const current = grouped.get(sector.setor) ?? { pending: 0, appearances: 0 };
        current.pending += sector.qtd;
        if (sector.qtd > 0) current.appearances += 1;
        grouped.set(sector.setor, current);
      }
    }
    return [...grouped.entries()].map(([name, values]) => ({ name, ...values })).sort((a, b) => b.pending - a.pending || a.name.localeCompare(b.name, "pt-BR"));
  }, [processed]);

  const userRows = useMemo(() => {
    const grouped = new Map<string, { reads: number; appearances: number }>();
    for (const audit of processed) {
      for (const user of audit.result?.colaboradores ?? []) {
        const current = grouped.get(user.nome) ?? { reads: 0, appearances: 0 };
        current.reads += user.qtd;
        current.appearances += 1;
        grouped.set(user.nome, current);
      }
    }
    return [...grouped.entries()].map(([name, values]) => ({ name, ...values })).sort((a, b) => b.reads - a.reads || a.name.localeCompare(b.name, "pt-BR"));
  }, [processed]);

  // Each imported execution is a distinct point, so re-uploads are visible rather than silently merged.
  const evolutionData = useMemo<EvolutionPoint[]>(() => [...processed]
    .sort((a, b) => a.dataAuditoria.localeCompare(b.dataAuditoria)
      || (a.processedAt ?? "").localeCompare(b.processedAt ?? "")
      || a.id - b.id)
    .map((item) => ({
      id: item.id,
      dataAuditoria: item.dataAuditoria,
      auditType: item.auditType,
      sourceFile: item.sourceFile || `Planilha #${item.id}`,
      label: `${shortDate(item.dataAuditoria)} · ${item.auditType} #${item.id}`,
      sku: item.sku ?? 0,
      naoLidos: item.naoLidos ?? 0,
      parcial: item.parcial,
      valor: getMetricValue(item, chartMetric),
    })), [processed, chartMetric]);

  // For daily comparisons, use the latest imported spreadsheet per date and category,
  // preventing re-uploads from double-counting the same day's audit.
  const dailyComparisonData = useMemo<DailyComparisonPoint[]>(() => {
    const latestByDayAndType = new Map<string, SqlAuditEntry>();
    for (const item of processed) {
      const key = `${item.dataAuditoria}|${item.auditType}`;
      const previous = latestByDayAndType.get(key);
      const itemTime = item.processedAt ?? "";
      const previousTime = previous?.processedAt ?? "";
      if (!previous || itemTime > previousTime || (itemTime === previousTime && item.id > previous.id)) {
        latestByDayAndType.set(key, item);
      }
    }
    const byDate = new Map<string, DailyComparisonPoint>();
    for (const item of latestByDayAndType.values()) {
      const point = byDate.get(item.dataAuditoria) ?? {
        date: item.dataAuditoria,
        label: shortDate(item.dataAuditoria),
        Etiqueta: null,
        Presença: null,
        Ruptura: null,
      };
      point[item.auditType] = getMetricValue(item, chartMetric);
      byDate.set(item.dataAuditoria, point);
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [processed, chartMetric]);

  const comparisonCurrentOptions = useMemo(() => filteredRecords
    .filter((item) => item.kind === "processed")
    .sort((a, b) => b.dataAuditoria.localeCompare(a.dataAuditoria)
      || (b.processedAt ?? "").localeCompare(a.processedAt ?? "")
      || b.id - a.id), [filteredRecords]);
  const comparisonCurrent = comparisonCurrentOptions.find((item) => item.id === Number(selectedComparisonId))
    ?? comparisonCurrentOptions[0]
    ?? null;
  const comparisonAlternatives = useMemo(() => comparisonCurrent
    ? comparisonHistory.filter((item) => item.auditType === comparisonCurrent.auditType && item.id !== comparisonCurrent.id)
      .sort((a, b) => b.dataAuditoria.localeCompare(a.dataAuditoria)
        || (b.processedAt ?? "").localeCompare(a.processedAt ?? "") || b.id - a.id)
    : [], [comparisonCurrent, comparisonHistory]);
  const automaticBaseline = comparisonCurrent ? getPreviousSameTypeAudit(comparisonCurrent, comparisonHistory) : null;
  const comparisonBaseline = baselineSelection === "previous"
    ? automaticBaseline
    : comparisonAlternatives.find((item) => item.id === Number(baselineSelection)) ?? null;
  const comparisonMetricRows = useMemo(() => comparisonCurrent && comparisonBaseline
    ? compareAuditMetrics(comparisonCurrent, comparisonBaseline)
    : [], [comparisonCurrent, comparisonBaseline]);
  const sectorComparisonRows = useMemo(() => comparisonCurrent && comparisonBaseline
    ? compareSectorCounts(comparisonCurrent.result?.setores ?? [], comparisonBaseline.result?.setores ?? [])
    : [], [comparisonCurrent, comparisonBaseline]);
  const userComparisonRows = useMemo(() => comparisonCurrent && comparisonBaseline
    ? compareUserCounts(comparisonCurrent.result?.colaboradores ?? [], comparisonBaseline.result?.colaboradores ?? [])
    : [], [comparisonCurrent, comparisonBaseline]);

  useEffect(() => {
    if (selectedComparisonId && !comparisonCurrentOptions.some((item) => item.id === Number(selectedComparisonId))) {
      setSelectedComparisonId("");
    }
  }, [selectedComparisonId, comparisonCurrentOptions]);

  useEffect(() => {
    if (baselineSelection !== "previous" && !comparisonAlternatives.some((item) => item.id === Number(baselineSelection))) {
      setBaselineSelection("previous");
    }
  }, [baselineSelection, comparisonAlternatives]);

  const clearFilters = () => {
    setPeriod("30d");
    setCustomFrom(addIsoDays(today, -29));
    setCustomTo(today);
    setType("Todas");
    setStatus("all");
    setMeta("all");
  };

  const changeStatus = async (item: SqlAuditEntry) => {
    if (item.kind !== "processed") return;
    const newStatus = item.status === "Fechada" ? "Aberta" : "Fechada";
    setStatusChanging(item.id);
    try {
      await updateSqlAuditStatus(item.id, newStatus);
      toast.success(`Auditoria ${newStatus.toLocaleLowerCase("pt-BR")}`);
      setRefreshToken((value) => value + 1);
    } catch (err) {
      toast.error("Não foi possível alterar o status", { description: err instanceof Error ? err.message : "Erro desconhecido." });
    } finally {
      setStatusChanging(null);
    }
  };

  const refresh = () => {
    setRefreshing(true);
    setRefreshToken((value) => value + 1);
    window.setTimeout(() => setRefreshing(false), 350);
  };

  const tabs: Array<{ id: AnalysisTab; label: string; count: number }> = [
    { id: "overview", label: "Visão geral", count: processed.length },
    { id: "sectors", label: "Setores", count: sectorRows.length },
    { id: "users", label: "Usuários", count: userRows.length },
    { id: "audits", label: "Auditorias", count: filteredRecords.length },
    { id: "charts", label: "Gráficos", count: processed.length },
    { id: "comparison", label: "Comparação", count: processed.length },
  ];

  return <PageTransition>
    <PageHeader title="Análise de Auditorias" subtitle="Desempenho histórico · todo o histórico de planilhas processadas, associado à data e ao tipo definidos no Calendário semanal." action={<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={refresh} disabled={loading}><RefreshCw className={cn("mr-2 size-4", refreshing || loading ? "animate-spin" : "")} />Atualizar</Button><Button variant="audit" onClick={() => navigate({ to: "/atualizar-dados" })}><CalendarDays className="mr-2 size-4" />Calendário semanal</Button></div>} />

    <SectionCard title="Filtros históricos" description="Filtre as auditorias registradas no SQLite local. A meta de pendência é de até 3%." action={<span className="rounded-full border bg-muted/60 px-3 py-1 text-xs font-semibold">{filteredRecords.length.toLocaleString("pt-BR")} auditoria(s)</span>}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <SelectFilter label="Período" value={period} onChange={(value) => setPeriod(value as PeriodPreset)} options={[{ value: "30d", label: "30 dias" }, { value: "3m", label: "3 meses" }, { value: "6m", label: "6 meses" }, { value: "12m", label: "12 meses" }, { value: "all", label: "Tudo" }, { value: "custom", label: "Datas" }]} />
        <SelectFilter label="Tipo" value={type} onChange={(value) => setType(value as AuditTypeFilter)} options={[{ value: "Todas", label: "Todos" }, { value: "Etiqueta", label: "Etiqueta" }, { value: "Presença", label: "Presença" }, { value: "Ruptura", label: "Ruptura" }]} />
        <SelectFilter label="Status" value={status} onChange={(value) => setStatus(value as StatusFilter)} options={[{ value: "all", label: "Abertas e fechadas" }, { value: "open", label: "Somente abertas" }, { value: "closed", label: "Somente fechadas" }]} />
        <SelectFilter label="Meta" value={meta} onChange={(value) => setMeta(value as MetaFilter)} options={[{ value: "all", label: "Todas" }, { value: "within", label: "Dentro da meta" }, { value: "outside", label: "Fora da meta" }]} />
        <div className="flex items-end"><Button variant="outline" className="w-full" onClick={clearFilters}><Filter className="mr-2 size-4" />Limpar filtros</Button></div>
      </div>
      {period === "custom" ? <div className="mt-4 grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="date-from">De</Label><Input id="date-from" type="date" value={customFrom} max={customTo} onChange={(event) => setCustomFrom(event.target.value)} /></div><div className="space-y-1.5"><Label htmlFor="date-to">Até</Label><Input id="date-to" type="date" value={customTo} min={customFrom} onChange={(event) => setCustomTo(event.target.value)} /></div></div> : null}
      <p className="mt-4 text-xs text-muted-foreground">Intervalo consultado: {prettyDate(from)} até {prettyDate(to)} · fonte: banco SQL local · a planilha original e os registros detalhados são preservados.</p>
    </SectionCard>

    {error ? <div className="mt-5 flex items-start gap-3 rounded-lg border border-critical/30 bg-critical/5 p-4 text-sm text-critical"><AlertTriangle className="mt-0.5 size-5 shrink-0" /><div><p className="font-semibold">Não foi possível consultar o histórico SQL.</p><p className="mt-1">{error}</p><p className="mt-2 text-xs">Verifique se está usando a versão atualizada do projeto e se o servidor Node.js iniciou corretamente.</p></div></div> : null}

    <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard title="Auditorias" value={loading ? "…" : number(filteredRecords.length)} description={`${number(closedCount)} fechadas · ${number(openCount)} abertas`} icon={ClipboardList} />
      <MetricCard title="Taxa na meta" value={loading ? "…" : withinRate} description={`${number(insideCount)} dentro · ${number(outsideCount)} fora · meta até 3%`} icon={Target} />
      <MetricCard title="% pendente médio" value={loading ? "…" : averagePartial} description="Média das auditorias com planilha processada · meta: até 3%" icon={Activity} />
      <MetricCard title="Itens auditados" value={loading ? "…" : number(totalSku)} description={`${number(totalPending)} ficaram pendentes somando as planilhas filtradas`} icon={Layers3} />
    </div>

    <SectionCard title="Desempenho histórico" description="Acompanhe os resultados agregados, a participação por setor e usuário, e altere o status de cada execução importada.">
      <div className="flex flex-wrap gap-2 border-b pb-4">{tabs.map((item) => <button key={item.id} type="button" onClick={() => setTab(item.id)} className={cn("inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition-colors", tab === item.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>{item.label}<span className={cn("rounded-full px-2 py-0.5 text-xs", tab === item.id ? "bg-primary-foreground/15" : "bg-muted")}>{item.count}</span></button>)}</div>

      {tab === "overview" ? <div className="pt-5">
        {processed.length === 0 ? <EmptyState loading={loading} onCalendar={() => navigate({ to: "/atualizar-dados" })} /> : <>
          <div className="grid gap-4 md:grid-cols-3"><div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Última auditoria processada</p><p className="mt-2 font-semibold">{processed[0]?.sourceFile || "—"}</p><p className="mt-1 text-sm text-muted-foreground">{processed[0] ? `${prettyDate(processed[0].dataAuditoria)} · ${processed[0].auditType}` : "—"}</p></div><div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Tipo mais frequente</p><p className="mt-2 text-xl font-bold">{([...new Set(processed.map((item) => item.auditType))].sort((a, b) => processed.filter((item) => item.auditType === b).length - processed.filter((item) => item.auditType === a).length)[0]) ?? "—"}</p><p className="mt-1 text-xs text-muted-foreground">Dentro do período e dos filtros atuais</p></div><div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Próxima ação sugerida</p><p className="mt-2 font-semibold">{outsideCount > 0 ? "Revisar auditorias fora da meta" : openCount > 0 ? "Processar planilhas pendentes" : "Manter calendário atualizado"}</p><p className="mt-1 text-xs text-muted-foreground">A meta de pendência é de até 3%.</p></div></div>
          <div className="mt-6"><div className="mb-3 flex items-center justify-between gap-3"><h3 className="font-semibold">Últimas auditorias</h3><button className="text-sm font-semibold text-primary hover:underline" onClick={() => setTab("audits")}>Ver todas</button></div><div className="audit-table-scroll"><table className="audit-table"><thead><tr><th>Data</th><th>Tipo</th><th>Arquivo</th><th className="text-right">SKUs</th><th className="text-right">Pendente</th><th>Meta</th></tr></thead><tbody>{processed.slice(0, 8).map((item) => <tr key={`overview-${item.id}`}><td>{prettyDate(item.dataAuditoria)}</td><td>{item.auditType}</td><td className="max-w-64 truncate" title={item.sourceFile ?? ""}>{item.sourceFile}</td><td className="text-right text-tabular">{number(item.sku ?? 0)}</td><td className="text-right text-tabular">{number(item.parcial ?? 0, 2)}%</td><td><MetaBadge value={item.parcial} /></td></tr>)}</tbody></table></div></div>
        </>}
      </div> : null}

      {tab === "sectors" ? <div className="pt-5">{sectorRows.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">Nenhum setor encontrado nas auditorias filtradas.</p> : <div className="audit-table-scroll"><table className="audit-table"><thead><tr><th>Setor</th><th className="text-right">Pendências acumuladas</th><th className="text-right">Auditorias com pendência</th></tr></thead><tbody>{sectorRows.map((row) => <tr key={row.name}><td className="font-semibold">{row.name}</td><td className="text-right text-tabular">{number(row.pending)}</td><td className="text-right text-tabular">{number(row.appearances)}</td></tr>)}</tbody></table></div>}</div> : null}

      {tab === "users" ? <div className="pt-5">{userRows.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">Nenhum usuário encontrado nas auditorias filtradas.</p> : <div className="audit-table-scroll"><table className="audit-table"><thead><tr><th>Usuário</th><th className="text-right">Registros acumulados</th><th className="text-right">Auditorias com atividade</th></tr></thead><tbody>{userRows.map((row) => <tr key={row.name}><td className="font-semibold">{row.name}</td><td className="text-right text-tabular">{number(row.reads)}</td><td className="text-right text-tabular">{number(row.appearances)}</td></tr>)}</tbody></table></div>}</div> : null}

      {tab === "audits" ? <div className="pt-5">{filteredRecords.length === 0 ? <EmptyState loading={loading} onCalendar={() => navigate({ to: "/atualizar-dados" })} /> : <div className="audit-table-scroll"><table className="audit-table"><thead><tr><th>Data</th><th>Tipo</th><th>Status</th><th>Origem</th><th className="text-right">SKUs</th><th className="text-right">Pendência</th><th>Meta</th><th>Ação</th></tr></thead><tbody>{filteredRecords.map((item) => <tr key={`${item.kind}-${item.id}`}><td>{prettyDate(item.dataAuditoria)}</td><td>{item.auditType}</td><td><StatusBadge status={item.status} /></td><td className="max-w-56 truncate" title={item.sourceFile ?? "Agenda semanal"}>{item.sourceFile ?? (item.kind === "scheduled" ? `Janela ${item.windowStart ?? "—"}–${item.windowEnd ?? "—"}` : "—")}</td><td className="text-right text-tabular">{item.sku == null ? "—" : number(item.sku)}</td><td className="text-right text-tabular">{item.parcial == null ? "—" : `${number(item.parcial, 2)}%`}</td><td>{item.parcial == null ? <span className="text-muted-foreground">Pendente</span> : <MetaBadge value={item.parcial} />}</td><td>{item.kind === "processed" ? <Button size="sm" variant="outline" disabled={statusChanging === item.id} onClick={() => void changeStatus(item)}>{statusChanging === item.id ? "Salvando…" : item.status === "Fechada" ? "Reabrir" : "Fechar"}</Button> : <Button size="sm" variant="outline" onClick={() => navigate({ to: "/atualizar-dados" })}>Enviar planilha</Button>}</td></tr>)}</tbody></table></div>}</div> : null}

      {tab === "comparison" ? <div className="space-y-5 pt-5">
        <section className="rounded-xl border p-4 sm:p-5">
          <div className="mb-4 flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted"><GitCompare className="size-5" /></span><div><h3 className="font-semibold">Comparação automática entre auditorias</h3><p className="mt-1 text-sm text-muted-foreground">A referência automática é a auditoria anterior da mesma categoria, usando todo o histórico SQL — mesmo quando ela é anterior ao período selecionado acima. Para evitar comparações incompatíveis, só é possível escolher uma referência da mesma categoria.</p></div></div>
          {comparisonLoading ? <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Carregando todo o histórico para comparar…</div> : comparisonCurrentOptions.length === 0 ? <div className="rounded-lg border border-dashed p-8 text-center"><GitCompare className="mx-auto size-8 text-muted-foreground" /><p className="mt-2 font-semibold">Não há auditorias processadas nos filtros atuais</p><p className="mt-1 text-sm text-muted-foreground">Limpe os filtros ou processe uma planilha para iniciar a comparação.</p></div> : <div className="grid gap-4 md:grid-cols-2">
            <SelectFilter label="Auditoria atual" value={String(comparisonCurrent?.id ?? "")} onChange={setSelectedComparisonId} options={comparisonCurrentOptions.map((item) => ({ value: String(item.id), label: auditChoiceLabel(item) }))} />
            <SelectFilter label="Comparar com" value={baselineSelection} onChange={setBaselineSelection} options={[{ value: "previous", label: automaticBaseline ? `Anterior automática · ${prettyDate(automaticBaseline.dataAuditoria)} · ${automaticBaseline.sourceFile || `#${automaticBaseline.id}`}` : "Anterior automática · sem auditoria anterior" }, ...comparisonAlternatives.map((item) => ({ value: String(item.id), label: auditChoiceLabel(item) }))]} />
          </div>}
        </section>

        {!comparisonLoading && comparisonCurrent && comparisonBaseline ? <>
          <div className="grid gap-4 md:grid-cols-2">
            <article className="surface-card min-w-0 border-l-4 border-l-primary p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Auditoria atual</p><h3 className="mt-2 text-lg font-bold">{comparisonCurrent.auditType} · {prettyDate(comparisonCurrent.dataAuditoria)}</h3><p className="mt-1 break-words text-sm text-muted-foreground">{comparisonCurrent.sourceFile || `Planilha #${comparisonCurrent.id}`}</p><div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-muted px-2.5 py-1">{number(comparisonCurrent.sku ?? 0)} SKUs</span><span className="rounded-full bg-muted px-2.5 py-1">{number(comparisonCurrent.naoLidos ?? 0)} pendentes</span><span className="rounded-full bg-muted px-2.5 py-1">{formatMetric(comparisonCurrent.parcial, "partial")} pendente</span></div></article>
            <article className="surface-card min-w-0 border-l-4 border-l-chart-2 p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Auditoria de referência</p><h3 className="mt-2 text-lg font-bold">{comparisonBaseline.auditType} · {prettyDate(comparisonBaseline.dataAuditoria)}</h3><p className="mt-1 break-words text-sm text-muted-foreground">{comparisonBaseline.sourceFile || `Planilha #${comparisonBaseline.id}`}</p><div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-muted px-2.5 py-1">{number(comparisonBaseline.sku ?? 0)} SKUs</span><span className="rounded-full bg-muted px-2.5 py-1">{number(comparisonBaseline.naoLidos ?? 0)} pendentes</span><span className="rounded-full bg-muted px-2.5 py-1">{formatMetric(comparisonBaseline.parcial, "partial")} pendente</span></div></article>
          </div>

          <section className="rounded-xl border p-4 sm:p-5"><div className="mb-4"><h3 className="font-semibold">Variação dos indicadores</h3><p className="mt-1 text-sm text-muted-foreground">A diferença é atual menos referência. Para pendências e percentual pendente, uma queda é favorável; para os demais indicadores, a variação é apresentada sem atribuir automaticamente um julgamento de desempenho.</p></div><div className="audit-table-scroll"><table className="audit-table"><thead><tr><th>Indicador</th><th className="text-right">Atual</th><th className="text-right">Referência</th><th className="text-right">Variação</th><th className="text-right">Variação relativa</th></tr></thead><tbody>{comparisonMetricRows.map((metric) => { const isZero = metric.delta === 0; const favorable = metric.lowerIsBetter && metric.delta < 0; const unfavorable = metric.lowerIsBetter && metric.delta > 0; const deltaText = metric.unit === "percent" ? `${signedNumber(metric.delta, 2)} p.p.` : signedNumber(metric.delta); const relativeText = metric.percentChange == null ? (metric.previousValue === 0 && metric.unit === "count" ? (metric.currentValue === 0 ? "0%" : "— · base zero") : "—") : `${signedNumber(metric.percentChange, 1)}%`; return <tr key={metric.key}><td className="font-medium">{metric.label}</td><td className="text-right text-tabular">{formatMetric(metric.currentValue, metric.unit === "percent" ? "partial" : "pending")}</td><td className="text-right text-tabular">{formatMetric(metric.previousValue, metric.unit === "percent" ? "partial" : "pending")}</td><td className={cn("text-right font-semibold text-tabular", favorable ? "text-success" : "", unfavorable ? "text-critical" : "")}>{isZero ? <span className="inline-flex items-center justify-end gap-1"><Minus className="size-3.5" />0{metric.unit === "percent" ? " p.p." : ""}</span> : <span className="inline-flex items-center justify-end gap-1">{metric.delta > 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}{deltaText}</span>}</td><td className="text-right text-tabular">{relativeText}</td></tr>; })}</tbody></table></div></section>

          <div className="grid gap-5 xl:grid-cols-2"><ComparisonBreakdown title="Variação por setor" description="Diferença entre os valores de setores presentes nos resumos das duas auditorias." rows={sectorComparisonRows} currentLabel="Atual" previousLabel="Referência" /><ComparisonBreakdown title="Variação por usuário" description="Diferença entre leituras associadas a cada usuário nas duas auditorias." rows={userComparisonRows} currentLabel="Atual" previousLabel="Referência" /></div>
        </> : null}
        {!comparisonLoading && comparisonCurrent && !comparisonBaseline ? <div className="rounded-lg border border-dashed p-8 text-center"><GitCompare className="mx-auto size-8 text-muted-foreground" /><p className="mt-2 font-semibold">Ainda não existe uma auditoria anterior de {comparisonCurrent.auditType}</p><p className="mt-1 text-sm text-muted-foreground">Depois de processar uma segunda planilha desta mesma categoria, a comparação automática será preenchida. Você também poderá escolher uma auditoria de referência no seletor.</p></div> : null}
      </div> : null}

      {tab === "charts" ? <div className="space-y-5 pt-5">
        <div className="flex flex-col justify-between gap-3 rounded-lg border bg-muted/20 p-4 sm:flex-row sm:items-end">
          <div><h3 className="font-semibold">Comparação visual do histórico</h3><p className="mt-1 text-sm text-muted-foreground">Os gráficos usam apenas planilhas processadas que correspondem aos filtros acima.</p></div>
          <div className="w-full sm:max-w-xs"><SelectFilter label="Métrica dos gráficos" value={chartMetric} onChange={(value) => setChartMetric(value as ChartMetric)} options={[{ value: "sku", label: "SKUs auditados" }, { value: "pending", label: "Itens pendentes" }, { value: "partial", label: "% pendente" }]} /></div>
        </div>
        {evolutionData.length === 0 ? <div className="rounded-xl border border-dashed p-10 text-center"><ChartNoAxesCombined className="mx-auto size-9 text-muted-foreground" /><p className="mt-3 font-semibold">Ainda não há planilhas para comparar</p><p className="mt-1 text-sm text-muted-foreground">Importe planilhas pelo Calendário semanal ou ajuste o período e os filtros.</p><Button className="mt-4" variant="audit" onClick={() => navigate({ to: "/atualizar-dados" })}><CalendarDays className="mr-2 size-4" />Abrir Calendário semanal</Button></div> : <div className="grid gap-5 xl:grid-cols-2">
          <section className="min-w-0 rounded-xl border p-4 sm:p-5">
            <div className="mb-4"><h3 className="font-semibold">Evolução de cada planilha importada</h3><p className="mt-1 text-sm text-muted-foreground">Cada ponto representa uma execução importada. Passe o cursor para ver o arquivo, data, categoria e valores.</p></div>
            <div className="chart-frame"><ResponsiveContainer width="100%" height="100%"><LineChart data={evolutionData} margin={{ top: 12, right: 14, bottom: 38, left: 4 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} interval="preserveStartEnd" minTickGap={20} angle={-28} textAnchor="end" height={58} stroke="var(--border)" />
              <YAxis tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} tickFormatter={(value: number) => formatMetric(value, chartMetric)} stroke="var(--border)" width={65} />
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0]?.payload as EvolutionPoint | undefined;
                if (!point) return null;
                return <div className="max-w-xs rounded-lg border bg-background p-3 text-xs shadow-xl"><p className="font-semibold">{prettyDate(point.dataAuditoria)} · {point.auditType}</p><p className="mt-1 break-words text-muted-foreground">{point.sourceFile}</p><p className="mt-2">{chartMetricLabel[chartMetric]}: <strong>{formatMetric(point.valor, chartMetric)}</strong></p><p className="mt-1">SKUs: {number(point.sku)} · Pendentes: {number(point.naoLidos)}</p><p className="mt-1">% pendente: {formatMetric(point.parcial, "partial")}</p></div>;
              }} />
              <Line type="monotone" dataKey="valor" name={chartMetricLabel[chartMetric]} stroke="var(--chart-2)" strokeWidth={2.5} activeDot={{ r: 5 }} dot={{ r: 3 }} connectNulls={false} isAnimationActive animationDuration={650} />
            </LineChart></ResponsiveContainer></div>
            <p className="mt-2 text-xs text-muted-foreground">{evolutionData.length.toLocaleString("pt-BR")} planilha(s) no período · reenvios aparecem como execuções separadas.</p>
          </section>

          <section className="min-w-0 rounded-xl border p-4 sm:p-5">
            <div className="mb-4"><h3 className="font-semibold">Comparação diária por categoria</h3><p className="mt-1 text-sm text-muted-foreground">Compara Etiqueta, Presença e Ruptura por data usando a última planilha enviada de cada categoria naquele dia.</p></div>
            <div className="chart-frame"><ResponsiveContainer width="100%" height="100%"><BarChart data={dailyComparisonData} margin={{ top: 12, right: 14, bottom: 8, left: 4 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} interval="preserveStartEnd" minTickGap={18} stroke="var(--border)" />
              <YAxis tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} tickFormatter={(value: number) => formatMetric(value, chartMetric)} stroke="var(--border)" width={65} />
              <Tooltip labelFormatter={(label) => `Data ${label}`} formatter={(value, name) => [formatMetric(typeof value === "number" ? value : null, chartMetric), String(name)]} contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: "var(--chart-tooltip-size)", background: "var(--card)" }} />
              <Legend />
              <Bar dataKey="Etiqueta" name="Etiqueta" fill="var(--chart-1)" radius={[3, 3, 0, 0]} maxBarSize={28} isAnimationActive animationDuration={650} />
              <Bar dataKey="Presença" name="Presença" fill="var(--chart-2)" radius={[3, 3, 0, 0]} maxBarSize={28} isAnimationActive animationDuration={650} />
              <Bar dataKey="Ruptura" name="Ruptura" fill="var(--chart-3)" radius={[3, 3, 0, 0]} maxBarSize={28} isAnimationActive animationDuration={650} />
            </BarChart></ResponsiveContainer></div>
            <p className="mt-2 text-xs text-muted-foreground">{dailyComparisonData.length.toLocaleString("pt-BR")} dia(s) com ao menos uma planilha processada. Espaços sem dados permanecem vazios, sem assumir valor zero.</p>
          </section>
        </div>}
      </div> : null}
    </SectionCard>

    <div className="mt-4 flex items-start gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground"><Database className="mt-0.5 size-4 shrink-0" /><p>Persistência SQL ativa no servidor local: <code>data/auditops.sqlite</code>. O histórico não depende do limite de armazenamento do navegador. A tabela de detalhes guarda os registros individuais importados por planilha.</p></div>
  </PageTransition>;
}

function ComparisonBreakdown({ title, description, rows, currentLabel, previousLabel }: { title: string; description: string; rows: NamedCountComparison[]; currentLabel: string; previousLabel: string }) {
  return <section className="min-w-0 rounded-xl border p-4 sm:p-5"><div className="mb-4"><h3 className="font-semibold">{title}</h3><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>{rows.length === 0 ? <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">Não há diferenças registradas para detalhar.</p> : <div className="audit-table-scroll"><table className="audit-table"><thead><tr><th>Nome</th><th className="text-right">{currentLabel}</th><th className="text-right">{previousLabel}</th><th className="text-right">Diferença</th></tr></thead><tbody>{rows.slice(0, 8).map((row) => <tr key={row.name}><td className="max-w-56 truncate font-medium" title={row.name}>{row.name}</td><td className="text-right text-tabular">{number(row.current)}</td><td className="text-right text-tabular">{number(row.previous)}</td><td className={cn("text-right font-semibold text-tabular", row.delta < 0 ? "text-success" : row.delta > 0 ? "text-critical" : "")}>{signedNumber(row.delta)}</td></tr>)}</tbody></table></div>}</section>;
}

function EmptyState({ loading, onCalendar }: { loading: boolean; onCalendar: () => void }) {
  return <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center"><Database className="size-9 text-muted-foreground" /><p className="font-semibold">{loading ? "Carregando histórico SQL…" : "Nenhuma auditoria corresponde aos filtros"}</p><p className="max-w-xl text-sm text-muted-foreground">{loading ? "Consultando calendário, resultados e registros gravados." : "Selecione outro período ou processe uma planilha pelo Calendário semanal. Os resultados serão salvos automaticamente no banco SQL."}</p>{!loading ? <Button variant="audit" onClick={onCalendar}>Abrir Calendário semanal</Button> : null}</div>;
}

function MetaBadge({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  const inside = value <= META_LIMIT;
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold", inside ? "bg-success/10 text-success" : "bg-critical/10 text-critical")}>{inside ? <CheckCircle2 className="size-3.5" /> : <AlertTriangle className="size-3.5" />}{inside ? "Dentro" : "Fora"}</span>;
}

function StatusBadge({ status }: { status: "Aberta" | "Fechada" }) {
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", status === "Fechada" ? "bg-success/10 text-success" : "bg-amber-500/10 text-amber-600 dark:text-amber-400")}>{status}</span>;
}
