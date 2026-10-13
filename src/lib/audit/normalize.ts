import type { RawRow } from "./types";

/**
 * SheetJS makes duplicate column names unique by suffixing the later column
 * (commonly "Auditado em_1"). The calculation engine intentionally uses a
 * stable canonical key so the time column works for every exported workbook.
 */
export function normalizeAuditRow(row: RawRow): RawRow {
  const source = row as Record<string, unknown>;
  if (source["Auditado em.1"] !== undefined) return row;

  const keys = Object.keys(source);
  const duplicateTimeKey = keys.find((key) =>
    /^auditado em(?:[_\.\s]+\d+|\s*\(\d+\))$/i.test(key.trim()),
  ) ?? keys.filter((key) => key.trim().toLocaleLowerCase("pt-BR") === "auditado em")[1];

  if (!duplicateTimeKey) return row;

  const normalized: Record<string, unknown> = { ...source };
  normalized["Auditado em.1"] = source[duplicateTimeKey];
  delete normalized[duplicateTimeKey];
  return normalized as RawRow;
}
