import type { AuditDetailRow } from "./types";

/** Returns one row per non-empty SKU code, preserving the first occurrence and its audit metadata. */
export function getUniqueSkuDetailRows(rows: AuditDetailRow[]): AuditDetailRow[] {
  const seen = new Set<string>();
  const unique: AuditDetailRow[] = [];
  for (const row of rows) {
    const code = row.codigo.trim();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    unique.push(row);
  }
  return unique;
}

/** Create a stable filename without accents, reserved path characters or repeated separators. */
export function toExportFilename(value: string): string {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "relatorio-auditops";
}
