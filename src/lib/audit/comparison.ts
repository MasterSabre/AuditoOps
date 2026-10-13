import type { SqlAuditEntry } from "./database-client";
import type { NamedCount, SetorRow } from "./types";

export type AuditMetricKey =
  | "sku"
  | "naoLidos"
  | "lidosComEstoque"
  | "lidosSemEstoque"
  | "lidosNaoPertence"
  | "etiquetasDesatualizadas"
  | "colaboradoresAtivos"
  | "parcial";

export interface AuditMetricComparison {
  key: AuditMetricKey;
  label: string;
  currentValue: number;
  previousValue: number;
  delta: number;
  percentChange: number | null;
  unit: "count" | "percent";
  lowerIsBetter: boolean;
}

export interface NamedCountComparison {
  name: string;
  current: number;
  previous: number;
  delta: number;
}

export function compareAuditOrder(a: SqlAuditEntry, b: SqlAuditEntry): number {
  return a.dataAuditoria.localeCompare(b.dataAuditoria)
    || (a.processedAt ?? "").localeCompare(b.processedAt ?? "")
    || a.id - b.id;
}

export function getPreviousSameTypeAudit(current: SqlAuditEntry, audits: SqlAuditEntry[]): SqlAuditEntry | null {
  const currentOrder = compareAuditOrder;
  return audits
    .filter((item) => item.kind === "processed" && item.id !== current.id && item.auditType === current.auditType && currentOrder(item, current) < 0)
    .sort(currentOrder)
    .at(-1) ?? null;
}

export function compareAuditMetrics(current: SqlAuditEntry, previous: SqlAuditEntry): AuditMetricComparison[] {
  const definitions: Array<{ key: AuditMetricKey; label: string; unit: "count" | "percent"; lowerIsBetter?: boolean }> = [
    { key: "sku", label: "SKUs da base", unit: "count" },
    { key: "naoLidos", label: "Itens pendentes / não lidos", unit: "count", lowerIsBetter: true },
    { key: "lidosComEstoque", label: "Lidos com estoque", unit: "count" },
    { key: "lidosSemEstoque", label: "Lidos sem estoque", unit: "count" },
    { key: "lidosNaoPertence", label: "Lidos não pertence", unit: "count" },
    { key: "colaboradoresAtivos", label: "Colaboradores ativos", unit: "count" },
    { key: "parcial", label: "% pendente", unit: "percent", lowerIsBetter: true },
  ];
  if (current.auditType === "Etiqueta") definitions.splice(5, 0, { key: "etiquetasDesatualizadas", label: "Etiquetas desatualizadas", unit: "count", lowerIsBetter: true });
  return definitions.map((definition) => {
    const currentRaw = current[definition.key];
    const previousRaw = previous[definition.key];
    const currentValue = typeof currentRaw === "number" ? currentRaw : 0;
    const previousValue = typeof previousRaw === "number" ? previousRaw : 0;
    const delta = currentValue - previousValue;
    return {
      ...definition,
      lowerIsBetter: Boolean(definition.lowerIsBetter),
      currentValue,
      previousValue,
      delta,
      percentChange: definition.unit === "percent" || previousValue === 0 ? null : (delta / Math.abs(previousValue)) * 100,
    };
  });
}

export function compareSectorCounts(current: SetorRow[], previous: SetorRow[]): NamedCountComparison[] {
  return compareNamedCounts(current.map((row) => ({ nome: row.setor, qtd: row.qtd })), previous.map((row) => ({ nome: row.setor, qtd: row.qtd })));
}

export function compareUserCounts(current: NamedCount[], previous: NamedCount[]): NamedCountComparison[] {
  return compareNamedCounts(current, previous);
}

function compareNamedCounts(current: NamedCount[], previous: NamedCount[]): NamedCountComparison[] {
  const names = new Set([...current.map((row) => row.nome), ...previous.map((row) => row.nome)]);
  const currentValues = new Map(current.map((row) => [row.nome, row.qtd]));
  const previousValues = new Map(previous.map((row) => [row.nome, row.qtd]));
  return [...names].map((name) => {
    const now = currentValues.get(name) ?? 0;
    const before = previousValues.get(name) ?? 0;
    return { name, current: now, previous: before, delta: now - before };
  }).filter((row) => row.delta !== 0 || row.current !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || b.current - a.current || a.name.localeCompare(b.name, "pt-BR"));
}
