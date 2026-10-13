import type { AuditResult, AuditType } from "./types";

export type AuditStatus = "Aberta" | "Fechada";
export type AuditHistoryKind = "processed" | "scheduled";

export interface SqlAuditEntry {
  id: number;
  scheduleId: number | null;
  kind: AuditHistoryKind;
  dataAuditoria: string;
  auditType: AuditType;
  status: AuditStatus;
  sourceFile: string | null;
  processedAt: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  sku: number | null;
  naoLidos: number | null;
  lidosComEstoque: number | null;
  lidosSemEstoque: number | null;
  lidosNaoPertence: number | null;
  etiquetasDesatualizadas: number | null;
  colaboradoresAtivos: number | null;
  parcial: number | null;
  detailsCount: number;
  result: Partial<AuditResult> | null;
}

export interface CalendarEvent {
  id: number;
  date: string;
  weekday: number;
  windowStart: string | null;
  windowEnd: string | null;
  type: AuditType;
  actionLabel: string;
  status: AuditStatus;
  hasUpload: boolean;
  sourceFile: string | null;
  processedAt: string | null;
  sku: number | null;
  naoLidos: number | null;
  parcial: number | null;
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || `Erro HTTP ${response.status}`);
  return payload;
}


export async function createSqlCalendarSlot(date: string): Promise<{ id: number; status: AuditStatus }> {
  const payload = await readJson<{ ok: boolean; id: number; status: AuditStatus }>(await fetch("/api/calendar", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ date }),
  }));
  return { id: payload.id, status: payload.status };
}

export async function saveAuditToSql(result: AuditResult, expectedType?: AuditType | null): Promise<{ id: number; scheduleId: number; savedDetails: number }> {
  const payload = await readJson<{ ok: boolean; id: number; scheduleId: number; savedDetails: number }>(await fetch("/api/audits", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ result, expectedType: expectedType ?? null }),
  }));
  return { id: payload.id, scheduleId: payload.scheduleId, savedDetails: payload.savedDetails };
}

export async function fetchCalendar(from: string, to: string): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({ from, to });
  const payload = await readJson<{ events: CalendarEvent[] }>(await fetch(`/api/calendar?${params.toString()}`, { cache: "no-store" }));
  return payload.events;
}

export async function fetchSqlAudits(from: string, to: string): Promise<SqlAuditEntry[]> {
  const params = new URLSearchParams({ from, to });
  const payload = await readJson<{ audits: SqlAuditEntry[] }>(await fetch(`/api/audits?${params.toString()}`, { cache: "no-store" }));
  return payload.audits;
}

export async function updateSqlAuditStatus(id: number, status: AuditStatus): Promise<void> {
  await readJson<{ ok: boolean }>(await fetch(`/api/audits/${id}/status`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status }),
  }));
}


export interface AuditBackup {
  id: string;
  fileName: string;
  createdAt: string;
  bytes: number;
}

export interface RestoreBackupResult {
  restoredBackupId: string;
  safetyBackupId: string;
  restoredAt: string;
  restored: { schedules: number; audits: number; details: number };
}

export async function fetchDatabaseBackups(): Promise<AuditBackup[]> {
  const payload = await readJson<{ backups: AuditBackup[] }>(await fetch("/api/backups", { cache: "no-store" }));
  return payload.backups;
}

export async function createDatabaseBackup(): Promise<AuditBackup> {
  const payload = await readJson<{ ok: boolean; backup: AuditBackup }>(await fetch("/api/backups", { method: "POST" }));
  return payload.backup;
}

export async function restoreDatabaseBackup(id: string): Promise<RestoreBackupResult> {
  return await readJson<RestoreBackupResult & { ok: boolean }>(await fetch(`/api/backups/${encodeURIComponent(id)}/restore`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ confirmation: "RESTAURAR" }),
  }));
}

export async function downloadDatabaseBackup(id: string): Promise<void> {
  const response = await fetch(`/api/backups/${encodeURIComponent(id)}/download`, { cache: "no-store" });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: `Erro HTTP ${response.status}` })) as { error?: string };
    throw new Error(payload.error || `Erro HTTP ${response.status}`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${id}.sqlite`;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
