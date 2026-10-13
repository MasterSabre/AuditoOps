import { getDashboardDetailRows } from "./dashboard-details";
import { SETORES, type AuditDetailRow, type AuditResult, type FluxoPoint, type NamedCount, type ProductRow, type SetorRow } from "./types";
import type { GlobalAuditFilters } from "../search-store";

export function normalizeFilterText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

export function hasActiveGlobalFilters(filters: GlobalAuditFilters, query = ""): boolean {
  return Boolean(query.trim() || filters.setor || filters.corredor || filters.colaborador || filters.situacao);
}

export function countActiveStructuredFilters(filters: GlobalAuditFilters): number {
  return Object.values(filters).filter(Boolean).length;
}

export function getGlobalFilterSummary(filters: GlobalAuditFilters, query = ""): string[] {
  return [
    ...(query.trim() ? [`Busca: ${query.trim()}`] : []),
    ...(filters.setor ? [`Setor: ${filters.setor}`] : []),
    ...(filters.corredor ? [`Corredor/local: ${filters.corredor}`] : []),
    ...(filters.colaborador ? [`Colaborador: ${filters.colaborador}`] : []),
    ...(filters.situacao ? [`Situação: ${filters.situacao}`] : []),
  ];
}

export function getGlobalFilterLabel(filters: GlobalAuditFilters, query = ""): string {
  const summary = getGlobalFilterSummary(filters, query);
  return summary.length ? summary.join(" · ") : "Nenhum filtro global aplicado";
}

function detailText(row: AuditDetailRow): string {
  return normalizeFilterText([
    row.codigo,
    row.produto,
    row.classeRaiz,
    row.local,
    row.situacao,
    row.usuario,
    row.auditadoEm,
    row.estoqueAtual,
    row.diasSemVenda,
  ].join(" "));
}

export function matchesGlobalDetailRow(
  row: AuditDetailRow,
  filters: GlobalAuditFilters,
  query = "",
): boolean {
  if (filters.setor && row.classeRaiz !== filters.setor) return false;
  if (filters.corredor && row.local !== filters.corredor) return false;
  if (filters.colaborador && row.usuario !== filters.colaborador) return false;
  if (filters.situacao && row.situacao !== filters.situacao) return false;

  const terms = normalizeFilterText(query).split(" ").filter(Boolean);
  if (terms.length) {
    const haystack = detailText(row);
    if (!terms.every((term) => haystack.includes(term))) return false;
  }
  return true;
}

export function applyGlobalAuditFilters(
  rows: AuditDetailRow[],
  filters: GlobalAuditFilters,
  query = "",
): AuditDetailRow[] {
  if (!hasActiveGlobalFilters(filters, query)) return rows;
  return rows.filter((row) => matchesGlobalDetailRow(row, filters, query));
}

export function applyGlobalFiltersToProducts(
  products: ProductRow[],
  allDetails: AuditDetailRow[],
  filters: GlobalAuditFilters,
): ProductRow[] {
  return products.filter((product) => {
    if (filters.setor && product.classeRaiz !== filters.setor) return false;
    if (filters.corredor && product.local !== filters.corredor) return false;

    // Product summaries do not carry user/status columns. When either filter is selected,
    // relate the product to its source rows by code and location rather than guessing.
    if (filters.colaborador || filters.situacao) {
      const related = allDetails.filter((row) =>
        row.codigo === product.codigo && row.local === product.local,
      );
      if (!related.some((row) => matchesGlobalDetailRow(row, filters))) return false;
    }
    return true;
  });
}

function countBy(rows: AuditDetailRow[], key: "usuario" | "local"): NamedCount[] {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const name = row[key].trim();
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  });
  return [...counts.entries()]
    .map(([nome, qtd]) => ({ nome, qtd }))
    .sort((a, b) => b.qtd - a.qtd || a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));
}

function countSectors(rows: AuditDetailRow[]): SetorRow[] {
  // Keep the original engine's allow-list: unknown classes do not enter the sector ranking.
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const name = row.classeRaiz.trim();
    if ((SETORES as readonly string[]).includes(name)) counts.set(name, (counts.get(name) ?? 0) + 1);
  });
  const denominator = rows.length;
  return [...counts.entries()]
    .map(([setor, qtd]) => ({
      setor,
      qtd,
      representatividade: denominator > 0 ? Number(((qtd / denominator) * 100).toFixed(2)) : 0,
    }))
    .sort((a, b) => b.qtd - a.qtd || a.setor.localeCompare(b.setor, "pt-BR", { sensitivity: "base" }));
}

export function getGlobalSectorRows(
  result: AuditResult,
  filters: GlobalAuditFilters,
  query = "",
): SetorRow[] {
  if (!hasActiveGlobalFilters(filters, query)) return result.setores;
  if (!Array.isArray(result.detalhesRegistros)) {
    if (filters.corredor || filters.colaborador || filters.situacao) return [];
    const terms = normalizeFilterText(query).split(" ").filter(Boolean);
    return result.setores.filter((row) =>
      (!filters.setor || row.setor === filters.setor) &&
      terms.every((term) => normalizeFilterText(row.setor).includes(term)),
    );
  }
  const pending = getDashboardDetailRows(result, "nao-lidos");
  return countSectors(applyGlobalAuditFilters(pending, filters, query));
}

export function getGlobalCollaboratorRows(
  result: AuditResult,
  filters: GlobalAuditFilters,
  query = "",
): NamedCount[] {
  if (!hasActiveGlobalFilters(filters, query)) return result.colaboradores;
  if (!Array.isArray(result.detalhesRegistros)) {
    if (filters.setor || filters.corredor || filters.situacao) return [];
    const terms = normalizeFilterText(query).split(" ").filter(Boolean);
    return result.colaboradores.filter((row) => terms.every((term) => normalizeFilterText(row.nome).includes(term)) && (!filters.colaborador || row.nome === filters.colaborador));
  }
  return countBy(applyGlobalAuditFilters(result.detalhesRegistros, filters, query), "usuario");
}

export function getGlobalCorridorRows(
  result: AuditResult,
  filters: GlobalAuditFilters,
  query = "",
): NamedCount[] {
  if (!hasActiveGlobalFilters(filters, query)) return result.corredores;
  if (!Array.isArray(result.detalhesRegistros)) {
    if (filters.setor || filters.colaborador || filters.situacao) return [];
    const terms = normalizeFilterText(query).split(" ").filter(Boolean);
    return result.corredores.filter((row) => terms.every((term) => normalizeFilterText(row.nome).includes(term)) && (!filters.corredor || row.nome === filters.corredor));
  }
  return countBy(applyGlobalAuditFilters(getDashboardDetailRows(result, "nao-lidos"), filters, query), "local").slice(0, 15);
}

export function getGlobalFlowRows(
  rows: AuditDetailRow[],
  dataAuditoria: string,
  filters: GlobalAuditFilters,
  query = "",
): FluxoPoint[] {
  const counts = new Map<string, number>();
  applyGlobalAuditFilters(rows, filters, query).forEach((row) => {
    const time = row.auditadoEm.slice(0, 5);
    if (!row.usuario.trim() || !/^\d{2}:\d{2}$/.test(time)) return;
    const key = `${dataAuditoria} ${time}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return [...counts.entries()].map(([timestamp, leituras]) => ({ timestamp, leituras })).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

