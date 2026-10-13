import * as XLSX from "xlsx";
import { computeAudit } from "./engine";
import { normalizeAuditRow } from "./normalize";
import {
  SHEET_ETIQUETA,
  SHEET_PRESENCA,
  SHEET_RUPTURA,
  type AuditResult,
  type AuditType,
  type RawRow,
} from "./types";

export class AuditParseError extends Error {}

export const MAX_WORKBOOK_SIZE_BYTES = 50 * 1024 * 1024;

function assertWorkbookSize(file: File) {
  if (file.size > MAX_WORKBOOK_SIZE_BYTES) {
    throw new AuditParseError("O arquivo excede o limite de 50 MB. Reduza o tamanho da planilha e tente novamente.");
  }
}

const workbookCache = new WeakMap<File, XLSX.WorkBook>();

function typeFromSheetName(sheetName: string): AuditType | null {
  const normalized = sheetName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  if (normalized.includes("ruptura")) return "Ruptura";
  if (normalized.includes("presenca")) return "Presença";
  if (normalized.includes("etiqueta")) return "Etiqueta";
  return null;
}

function chooseAuditSheet(workbook: XLSX.WorkBook, preferredType?: AuditType): { auditoria: AuditType; sheetName: string } | null {
  const exactByType: Record<AuditType, string> = {
    Presença: SHEET_PRESENCA,
    Etiqueta: SHEET_ETIQUETA,
    Ruptura: SHEET_RUPTURA,
  };
  if (preferredType && workbook.SheetNames.includes(exactByType[preferredType])) {
    return { auditoria: preferredType, sheetName: exactByType[preferredType] };
  }
  if (!preferredType) {
    // Preserve the previous priority when no calendar day is selected.
    if (workbook.SheetNames.includes(SHEET_PRESENCA)) return { auditoria: "Presença", sheetName: SHEET_PRESENCA };
    if (workbook.SheetNames.includes(SHEET_ETIQUETA)) return { auditoria: "Etiqueta", sheetName: SHEET_ETIQUETA };
    if (workbook.SheetNames.includes(SHEET_RUPTURA)) return { auditoria: "Ruptura", sheetName: SHEET_RUPTURA };
  }
  const selected = workbook.SheetNames.find((name) => typeFromSheetName(name) === preferredType);
  if (preferredType && selected) return { auditoria: preferredType, sheetName: selected };
  const detected = workbook.SheetNames.map((name) => ({ name, type: typeFromSheetName(name) })).find((item) => item.type !== null);
  return detected?.type ? { auditoria: detected.type, sheetName: detected.name } : null;
}

export interface WorkbookPreview {
  auditoria: AuditType;
  sheetName: string;
  totalRows: number;
  skuCount: number;
  headers: string[];
  missingColumns: string[];
  optionalColumnsMissing: string[];
  previewRows: RawRow[];
}

/** Counts distinct, non-empty product codes. Repeated rows for the same code count as one SKU. */
export function countUniqueSkuCodes(rows: RawRow[]): number {
  const codes = rows
    .map((row) => String(row["Código"] ?? "").trim())
    .filter((code) => code.length > 0);
  return new Set(codes).size;
}

/** Reads a lightweight preview so the operator can verify the source before processing. */
export async function inspectWorkbookFile(file: File, preferredType?: AuditType): Promise<WorkbookPreview> {
  assertWorkbookSize(file);
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  workbookCache.set(file, workbook);
  const selected = chooseAuditSheet(workbook, preferredType);
  if (!selected) {
    throw new AuditParseError(`Nenhuma aba reconhecida encontrada. O arquivo precisa conter uma aba de Presença, Etiqueta ou Ruptura.`);
  }
  const { auditoria, sheetName } = selected;
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new AuditParseError("Não foi possível ler a aba de auditoria do arquivo.");
  const rawRef = sheet["!ref"];
  if (!rawRef) throw new AuditParseError("A aba de auditoria está vazia.");
  const usedRange = XLSX.utils.decode_range(rawRef);
  let totalRows = 0;
  for (let r = usedRange.s.r + 1; r <= usedRange.e.r; r += 1) {
    let hasValue = false;
    for (let c = usedRange.s.c; c <= usedRange.e.c; c += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (cell && cell.v !== null && cell.v !== undefined && String(cell.v).trim() !== "") {
        hasValue = true;
        break;
      }
    }
    if (hasValue) totalRows += 1;
  }
  if (totalRows === 0) throw new AuditParseError("A aba de auditoria está vazia.");
  const allRows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: null, raw: true })
    .map(normalizeAuditRow);
  const skuCount = countUniqueSkuCodes(allRows);
  const previewRange = {
    s: { r: usedRange.s.r, c: usedRange.s.c },
    e: { r: Math.min(usedRange.e.r, usedRange.s.r + 20), c: usedRange.e.c },
  };
  const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: null, raw: true, range: previewRange })
    .map(normalizeAuditRow);
  const headers = Object.keys(rows[0] ?? {});
  const required = ["Código", "Produto", "Classe de Produto Raiz", "Local", "Situação", "Estoque atual"];
  const optional = ["Usuário", "Auditado em.1", "Dias sem venda"];
  return {
    auditoria,
    sheetName,
    totalRows,
    skuCount,
    headers,
    missingColumns: required.filter((name) => !headers.includes(name)),
    optionalColumnsMissing: optional.filter((name) => !headers.includes(name)),
    previewRows: rows.filter((row) => Object.values(row).some((value) => value != null && String(value).trim() !== "")).slice(0, 4),
  };
}

export async function parseWorkbookFile(
  file: File,
  dataAuditoria: string,
  preferredType?: AuditType,
): Promise<AuditResult> {
  assertWorkbookSize(file);
  const workbook = workbookCache.get(file) ?? XLSX.read(await file.arrayBuffer(), { type: "array" });
  workbookCache.delete(file);

  const selected = chooseAuditSheet(workbook, preferredType);
  if (!selected) {
    throw new AuditParseError("Nenhuma aba de auditoria reconhecida. O arquivo precisa conter uma aba de Presença, Etiqueta ou Ruptura.");
  }
  const { auditoria, sheetName } = selected;

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new AuditParseError("Não foi possível ler a aba de auditoria do arquivo.");
  }

  const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, {
    defval: null,
    raw: true,
  }).map(normalizeAuditRow);

  if (rows.length === 0) {
    throw new AuditParseError("A aba de auditoria está vazia.");
  }

  const sku = countUniqueSkuCodes(rows);
  if (sku === 0) {
    throw new AuditParseError('Não foram encontrados códigos de produto na coluna "Código". Confira a planilha antes de processar.');
  }

  return computeAudit({ auditoria, sku, dataAuditoria, origem: file.name, rows });
}
