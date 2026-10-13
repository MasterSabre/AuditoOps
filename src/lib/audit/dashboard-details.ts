import { SITUACAO_PENDENCIA, type AuditDetailRow, type AuditResult } from "./types";

export type DashboardDetailKind =
  | "parcial"
  | "nao-lidos"
  | "lidos-com-estoque"
  | "lidos-sem-estoque"
  | "etiquetas-desatualizadas"
  | "lidos-nao-pertence";

export interface SectorSkuCount {
  setor: string;
  quantidadeItens: number;
  quantidadeRegistros: number;
  participacaoRegistros: number;
}

function normalizeSituation(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

function isNegativeReadWithStockSituation(situation: string): boolean {
  return situation.includes("sem estoque") ||
    situation.includes("sem presenca") ||
    situation.includes("nao lido") ||
    situation.includes("nao pertence");
}

function isExplicitReadWithStockSituation(situation: string): boolean {
  if (isNegativeReadWithStockSituation(situation)) return false;
  return situation.includes("lido com estoque") ||
    (situation.includes("com presenca") && situation.includes("com estoque")) ||
    (situation.includes("com estoque") && (situation.includes("lido") || situation.includes("presenca")));
}

/**
 * Some Etiqueta exports do not have a literal "Lido com estoque" status: the KPI is
 * derived as SKU minus "Não lidos com estoque". If no explicit positive rows exist,
 * recover the detail list from rows with stock on hand and a recognized audited/label
 * status, excluding unread, no-stock and not-belonging rows. This does not change KPIs.
 */
function inferEtiquetaReadWithStockRows(rows: AuditDetailRow[]): AuditDetailRow[] {
  return rows.filter((row) => {
    const situation = normalizeSituation(row.situacao);
    if (isNegativeReadWithStockSituation(situation)) return false;
    if (row.estoqueAtual === null || row.estoqueAtual <= 0) return false;
    return ["desatualiz", "etiqueta", "atualiz", "lido", "presenca", "conforme", "encontrado"]
      .some((marker) => situation.includes(marker));
  });
}

/**
 * Selects source rows for dashboard drill-downs. These filters are descriptive only;
 * KPI calculations continue to be owned by computeAudit().
 */
export function getDashboardDetailRows(
  result: AuditResult,
  kind: DashboardDetailKind,
): AuditDetailRow[] {
  const rows = result.detalhesRegistros ?? [];
  const pendingSituation = normalizeSituation(SITUACAO_PENDENCIA[result.auditoria]);

  if (kind === "lidos-com-estoque" && result.auditoria === "Etiqueta") {
    const explicitRows = rows.filter((row) => isExplicitReadWithStockSituation(normalizeSituation(row.situacao)));
    return explicitRows.length > 0 ? explicitRows : inferEtiquetaReadWithStockRows(rows);
  }

  return rows.filter((row) => {
    const situation = normalizeSituation(row.situacao);

    switch (kind) {
      case "parcial":
      case "nao-lidos":
        if (result.auditoria === "Ruptura") {
          if (situation.includes("lido sem estoque") || situation.includes("sem ruptura") || situation.includes("conforme") || situation.includes("sem ocorrencia")) return false;
          return situation.includes("ruptura") || situation.includes("sem estoque") || situation.includes("nao encontrado");
        }
        return situation === pendingSituation;
      case "lidos-com-estoque": {
        if (result.auditoria === "Presença") {
          return isExplicitReadWithStockSituation(situation);
        }
        if (result.auditoria === "Ruptura") {
          if (situation.includes("lido sem estoque") || situation.includes("sem estoque") || situation.includes("ruptura")) {
            return situation.includes("sem ruptura") || situation.includes("sem ocorrencia");
          }
          return situation.includes("conforme") || situation.includes("com estoque") || situation.includes("lido com estoque");
        }
        return false;
      }
      case "lidos-sem-estoque":
        return result.auditoria === "Ruptura"
          ? situation.includes("lido sem estoque")
          : situation.includes("sem estoque") && !situation.includes("nao lido");
      case "etiquetas-desatualizadas":
        return situation.includes("desatualiz");
      case "lidos-nao-pertence":
        return situation.includes("nao pertence");
    }
  });
}

/** Groups the complete detail set by product-root class, without applying pending-status filters. */
export function getSkuSectorCounts(rows: AuditDetailRow[]): SectorSkuCount[] {
  const grouped = new Map<string, { rows: AuditDetailRow[]; itemKeys: Set<string> }>();

  rows.forEach((row, index) => {
    const setor = row.classeRaiz.trim() || "Sem classe informada";
    const group = grouped.get(setor) ?? { rows: [], itemKeys: new Set<string>() };
    group.rows.push(row);
    // Count a SKU code once per class. Rows without a code remain individually countable.
    group.itemKeys.add(row.codigo.trim() || `__sem_codigo_linha_${index}`);
    grouped.set(setor, group);
  });

  const totalRecords = rows.length;
  return [...grouped.entries()]
    .map(([setor, group]) => ({
      setor,
      quantidadeItens: group.itemKeys.size,
      quantidadeRegistros: group.rows.length,
      participacaoRegistros: totalRecords > 0 ? Number(((group.rows.length / totalRecords) * 100).toFixed(2)) : 0,
    }))
    .sort((a, b) => b.quantidadeItens - a.quantidadeItens || a.setor.localeCompare(b.setor, "pt-BR"));
}

export function getRowsForSkuSector(rows: AuditDetailRow[], setor: string): AuditDetailRow[] {
  if (setor === "Sem classe informada") return rows.filter((row) => !row.classeRaiz.trim());
  return rows.filter((row) => row.classeRaiz.trim() === setor);
}
