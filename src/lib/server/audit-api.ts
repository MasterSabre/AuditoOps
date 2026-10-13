import { getWeeklyScheduleForDate, addIsoDays } from "../audit/schedule";
import type { AuditResult, AuditType, AuditDetailRow } from "../audit/types";

type SqlValue = string | number | bigint | null;
type SqlRow = {
  id?: unknown;
  schedule_id?: unknown;
  data_auditoria?: unknown;
  audit_type?: unknown;
  status?: unknown;
  source_file?: unknown;
  processed_at?: unknown;
  window_start?: unknown;
  window_end?: unknown;
  sku?: unknown;
  nao_lidos?: unknown;
  lidos_com_estoque?: unknown;
  lidos_sem_estoque?: unknown;
  lidos_nao_pertence?: unknown;
  etiquetas_desatualizadas?: unknown;
  colaboradores_ativos?: unknown;
  parcial?: unknown;
  details_count?: unknown;
  result_json?: unknown;
  audit_date?: unknown;
  weekday?: unknown;
  action_label?: unknown;
  current_run_id?: unknown;
  name?: unknown;
  count?: unknown;
};
type SqlStatement = {
  run: (...values: SqlValue[]) => { lastInsertRowid: number | bigint; changes: number };
  get: (...values: SqlValue[]) => SqlRow | undefined;
  all: (...values: SqlValue[]) => SqlRow[];
};
type SqliteDatabase = {
  exec: (sql: string) => void;
  prepare: (sql: string) => SqlStatement;
  close: () => void;
};

const SQL_SCHEMA = `
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
CREATE TABLE IF NOT EXISTS scheduled_audits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  audit_date TEXT NOT NULL UNIQUE,
  weekday INTEGER NOT NULL,
  window_start TEXT,
  window_end TEXT,
  audit_type TEXT NOT NULL CHECK (audit_type IN ('Etiqueta', 'Presença', 'Ruptura')),
  action_label TEXT NOT NULL DEFAULT 'Criar',
  status TEXT NOT NULL DEFAULT 'Aberta' CHECK (status IN ('Aberta', 'Fechada')),
  latest_run_id INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_id INTEGER,
  data_auditoria TEXT NOT NULL,
  audit_type TEXT NOT NULL CHECK (audit_type IN ('Etiqueta', 'Presença', 'Ruptura')),
  status TEXT NOT NULL DEFAULT 'Fechada' CHECK (status IN ('Aberta', 'Fechada')),
  source_file TEXT NOT NULL,
  processed_at TEXT NOT NULL,
  sku INTEGER NOT NULL DEFAULT 0,
  nao_lidos INTEGER NOT NULL DEFAULT 0,
  lidos_com_estoque INTEGER NOT NULL DEFAULT 0,
  lidos_sem_estoque INTEGER NOT NULL DEFAULT 0,
  lidos_nao_pertence INTEGER NOT NULL DEFAULT 0,
  etiquetas_desatualizadas INTEGER NOT NULL DEFAULT 0,
  colaboradores_ativos INTEGER NOT NULL DEFAULT 0,
  parcial REAL NOT NULL DEFAULT 0,
  details_count INTEGER NOT NULL DEFAULT 0,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (schedule_id) REFERENCES scheduled_audits(id)
);
CREATE TABLE IF NOT EXISTS audit_detail_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  product_code TEXT NOT NULL DEFAULT '',
  product_name TEXT NOT NULL DEFAULT '',
  root_class TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  current_stock REAL,
  situation TEXT NOT NULL DEFAULT '',
  user_name TEXT NOT NULL DEFAULT '',
  audited_time TEXT NOT NULL DEFAULT '',
  sales_days REAL,
  FOREIGN KEY (run_id) REFERENCES audit_runs(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_scheduled_audits_date ON scheduled_audits(audit_date);
CREATE INDEX IF NOT EXISTS idx_audit_runs_date ON audit_runs(data_auditoria);
CREATE INDEX IF NOT EXISTS idx_audit_runs_type_status ON audit_runs(audit_type, status);
CREATE INDEX IF NOT EXISTS idx_audit_records_run ON audit_detail_records(run_id);
CREATE INDEX IF NOT EXISTS idx_audit_records_code ON audit_detail_records(product_code);
`;

const validType = (value: unknown): value is AuditType =>
  value === "Etiqueta" || value === "Presença" || value === "Ruptura";
const validStatus = (value: unknown): value is "Aberta" | "Fechada" =>
  value === "Aberta" || value === "Fechada";
const MAX_AUDIT_JSON_BYTES = 64 * 1024 * 1024;
const MAX_AUDIT_DETAIL_ROWS = 200_000;
const isIsoDate = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`));
const asNumber = (value: unknown, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const asString = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;

async function importRuntimeModule(specifier: string): Promise<Record<string, unknown>> {
  // Kept dynamic so client bundles and non-Node preview targets don't eagerly resolve Node-only modules.
  return await import(/* @vite-ignore */ specifier) as Record<string, unknown>;
}

async function openDatabase(): Promise<SqliteDatabase> {
  const sqliteSpecifier = ["node", "sqlite"].join(":");
  const fsSpecifier = "node:" + ["fs", "promises"].join("/");
  const pathSpecifier = ["node", "path"].join(":");
  const [sqliteModule, fsModule, pathModule] = await Promise.all([
    importRuntimeModule(sqliteSpecifier),
    importRuntimeModule(fsSpecifier),
    importRuntimeModule(pathSpecifier),
  ]);
  const processLike = (globalThis as unknown as { process?: { cwd?: () => string; env?: Record<string, string | undefined> } }).process;
  const join = pathModule["join"] as (...parts: string[]) => string;
  const dirname = pathModule["dirname"] as (path: string) => string;
  const mkdir = fsModule["mkdir"] as (path: string, options: { recursive: boolean; mode?: number }) => Promise<unknown>;
  const chmod = fsModule["chmod"] as (path: string, mode: number) => Promise<void>;
  const DatabaseSync = sqliteModule["DatabaseSync"] as new (path: string) => SqliteDatabase;
  const cwd = processLike?.cwd?.() ?? ".";
  const databasePath = processLike?.env?.["AUDITOPS_DB_PATH"] || join(cwd, "data", "auditops.sqlite");
  await mkdir(dirname(databasePath), { recursive: true, mode: 0o700 });
  await chmod(dirname(databasePath), 0o700).catch(() => undefined);
  const db = new DatabaseSync(databasePath);
  await chmod(databasePath, 0o600).catch(() => undefined);
  db.exec(SQL_SCHEMA);
  return db;
}

const BACKUP_ID_PATTERN = /^auditops-backup-\d{8}T\d{9}Z(?:-\d+)?$/;

type BackupMetadata = { id: string; fileName: string; createdAt: string; bytes: number };

async function getStoragePaths() {
  const pathSpecifier = ["node", "path"].join(":");
  const pathModule = await importRuntimeModule(pathSpecifier);
  const processLike = (globalThis as unknown as { process?: { cwd?: () => string; env?: Record<string, string | undefined> } }).process;
  const join = pathModule["join"] as (...parts: string[]) => string;
  const dirname = pathModule["dirname"] as (path: string) => string;
  const cwd = processLike?.cwd?.() ?? ".";
  const databasePath = processLike?.env?.["AUDITOPS_DB_PATH"] || join(cwd, "data", "auditops.sqlite");
  return { databasePath, backupDirectory: join(dirname(databasePath), "backups"), join };
}

function backupIdFromFileName(fileName: string): string | null {
  if (!fileName.endsWith(".sqlite")) return null;
  const id = fileName.slice(0, -".sqlite".length);
  return BACKUP_ID_PATTERN.test(id) ? id : null;
}

async function createDatabaseBackup(): Promise<BackupMetadata> {
  const { databasePath, backupDirectory, join } = await getStoragePaths();
  const fsSpecifier = "node:" + ["fs", "promises"].join("/");
  const fsModule = await importRuntimeModule(fsSpecifier);
  const mkdir = fsModule["mkdir"] as (path: string, options: { recursive: boolean; mode?: number }) => Promise<unknown>;
  const chmod = fsModule["chmod"] as (path: string, mode: number) => Promise<void>;
  const readdir = fsModule["readdir"] as (path: string) => Promise<string[]>;
  const stat = fsModule["stat"] as (path: string) => Promise<{ size: number; mtime: Date; isFile: () => boolean }>;
  await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
  await chmod(backupDirectory, 0o700).catch(() => undefined);

  const compactTimestamp = new Date().toISOString().replace(/[-:]/g, "").replace(".", "");
  let id = `auditops-backup-${compactTimestamp}`;
  let suffix = 1;
  const existingFiles = new Set(await readdir(backupDirectory).catch(() => []));
  while (existingFiles.has(`${id}.sqlite`)) {
    id = `auditops-backup-${compactTimestamp}-${suffix}`;
    suffix += 1;
  }
  const fileName = `${id}.sqlite`;
  const backupPath = join(backupDirectory, fileName);
  const db = await openDatabase();
  try {
    // VACUUM INTO produces a consistent SQLite snapshot instead of copying a live DB file.
    db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
  } finally {
    db.close();
  }
  const chmodFile = fsModule["chmod"] as (path: string, mode: number) => Promise<void>;
  await chmodFile(backupPath, 0o600).catch(() => undefined);
  const fileStats = await stat(backupPath);
  return { id, fileName, createdAt: fileStats.mtime.toISOString(), bytes: fileStats.size };
}

async function listDatabaseBackups(): Promise<BackupMetadata[]> {
  const { backupDirectory, join } = await getStoragePaths();
  const fsSpecifier = "node:" + ["fs", "promises"].join("/");
  const fsModule = await importRuntimeModule(fsSpecifier);
  const mkdir = fsModule["mkdir"] as (path: string, options: { recursive: boolean; mode?: number }) => Promise<unknown>;
  const chmod = fsModule["chmod"] as (path: string, mode: number) => Promise<void>;
  const readdir = fsModule["readdir"] as (path: string) => Promise<string[]>;
  const stat = fsModule["stat"] as (path: string) => Promise<{ size: number; mtime: Date; isFile: () => boolean }>;
  await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
  await chmod(backupDirectory, 0o700).catch(() => undefined);
  const names = await readdir(backupDirectory);
  const backups: BackupMetadata[] = [];
  for (const fileName of names) {
    const id = backupIdFromFileName(fileName);
    if (!id) continue;
    try {
      const fileStats = await stat(join(backupDirectory, fileName));
      if (!fileStats.isFile()) continue;
      backups.push({ id, fileName, createdAt: fileStats.mtime.toISOString(), bytes: fileStats.size });
    } catch {
      // Ignore files concurrently deleted or unavailable during a listing.
    }
  }
  return backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}

async function downloadDatabaseBackup(id: string): Promise<Response> {
  if (!BACKUP_ID_PATTERN.test(id)) return json({ error: "Identificador de backup inválido." }, 400);
  const { backupDirectory, join } = await getStoragePaths();
  const fsSpecifier = "node:" + ["fs", "promises"].join("/");
  const fsModule = await importRuntimeModule(fsSpecifier);
  const readFile = fsModule["readFile"] as (path: string) => Promise<Uint8Array>;
  const backupPath = join(backupDirectory, `${id}.sqlite`);
  let content: Uint8Array;
  try {
    content = await readFile(backupPath);
  } catch {
    return json({ error: "Backup não encontrado." }, 404);
  }
  return new Response(content, {
    status: 200,
    headers: {
      "content-type": "application/vnd.sqlite3",
      "content-disposition": `attachment; filename="${id}.sqlite"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

class PayloadTooLargeError extends Error {}

async function readBoundedJson(request: Request, maxBytes = 1024 * 1024): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) throw new PayloadTooLargeError();
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new PayloadTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)) as unknown; }
  catch { throw new Error("Corpo JSON inválido."); }
}

function cleanSheetText(value: unknown, maxLength = 500): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value)
    .normalize("NFKC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[\u202A-\u202E\u2066-\u2069]/g, "")
    .trim()
    .slice(0, maxLength);
}

function finiteNonNegative(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.min(parsed, 1_000_000_000) : fallback;
}

function finiteNullable(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(-1_000_000_000, Math.min(parsed, 1_000_000_000)) : null;
}

function sanitizeAuditResult(value: unknown): AuditResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const auditType = raw["auditoria"];
  const auditDate = raw["dataAuditoria"];
  if (!validType(auditType) || !isIsoDate(auditDate)) return null;
  const detailsRaw = Array.isArray(raw["detalhesRegistros"]) ? raw["detalhesRegistros"] : [];
  if (detailsRaw.length > MAX_AUDIT_DETAIL_ROWS) return null;
  const detalhesRegistros: AuditDetailRow[] = detailsRaw.map((entry) => {
    const row = entry && typeof entry === "object" && !Array.isArray(entry) ? entry as Record<string, unknown> : {};
    return {
      codigo: cleanSheetText(row["codigo"], 100),
      produto: cleanSheetText(row["produto"], 500),
      classeRaiz: cleanSheetText(row["classeRaiz"], 250),
      local: cleanSheetText(row["local"], 250),
      estoqueAtual: finiteNullable(row["estoqueAtual"]),
      situacao: cleanSheetText(row["situacao"], 250),
      usuario: cleanSheetText(row["usuario"], 250),
      auditadoEm: cleanSheetText(row["auditadoEm"], 100),
      diasSemVenda: finiteNullable(row["diasSemVenda"]),
    };
  });
  const cleanProducts = (input: unknown): AuditResult["produtosSemLeitura"] => {
    if (!Array.isArray(input)) return [];
    return input.slice(0, MAX_AUDIT_DETAIL_ROWS).map((entry) => {
      const item = entry && typeof entry === "object" && !Array.isArray(entry) ? entry as Record<string, unknown> : {};
      return {
        codigo: cleanSheetText(item["codigo"], 100),
        produto: cleanSheetText(item["produto"], 500),
        classeRaiz: cleanSheetText(item["classeRaiz"], 250),
        local: cleanSheetText(item["local"], 250),
        estoqueAtual: finiteNonNegative(item["estoqueAtual"]),
      };
    });
  };
  const cleanNamedCounts = (input: unknown): AuditResult["colaboradores"] => {
    if (!Array.isArray(input)) return [];
    return input.slice(0, MAX_AUDIT_DETAIL_ROWS).map((entry) => {
      const item = entry && typeof entry === "object" && !Array.isArray(entry) ? entry as Record<string, unknown> : {};
      return { nome: cleanSheetText(item["nome"], 250), qtd: finiteNonNegative(item["qtd"]) };
    }).filter((item) => item.nome.length > 0);
  };
  const setores: AuditResult["setores"] = Array.isArray(raw["setores"]) ? raw["setores"].slice(0, 2_000).map((entry) => {
    const item = entry && typeof entry === "object" && !Array.isArray(entry) ? entry as Record<string, unknown> : {};
    return { setor: cleanSheetText(item["setor"], 250), qtd: finiteNonNegative(item["qtd"]), representatividade: finiteNonNegative(item["representatividade"]) };
  }).filter((item) => item.setor.length > 0) : [];
  const fluxo: AuditResult["fluxo"] = Array.isArray(raw["fluxo"]) ? raw["fluxo"].slice(0, 20_000).map((entry) => {
    const item = entry && typeof entry === "object" && !Array.isArray(entry) ? entry as Record<string, unknown> : {};
    return { timestamp: cleanSheetText(item["timestamp"], 100), leituras: finiteNonNegative(item["leituras"]) };
  }).filter((item) => item.timestamp.length > 0) : [];
  const distinctCodes = new Set(detalhesRegistros.map((row) => row.codigo.trim()).filter(Boolean));
  const sourceFile = cleanSheetText(raw["origem"], 180).replace(/[\\/]/g, "_").replace(/^\.+$/, "arquivo");
  return {
    auditoria: auditType,
    sku: distinctCodes.size > 0 ? distinctCodes.size : Math.floor(finiteNonNegative(raw["sku"])),
    dataAuditoria: auditDate,
    processadoEm: cleanSheetText(raw["processadoEm"], 100) || new Date().toISOString(),
    origem: sourceFile || "planilha.xlsx",
    naoLidos: finiteNonNegative(raw["naoLidos"]),
    lidosComEstoque: finiteNonNegative(raw["lidosComEstoque"]),
    lidosSemEstoque: finiteNonNegative(raw["lidosSemEstoque"]),
    lidosNaoPertence: finiteNonNegative(raw["lidosNaoPertence"]),
    etiquetasDesatualizadas: finiteNonNegative(raw["etiquetasDesatualizadas"]),
    colaboradoresAtivos: finiteNonNegative(raw["colaboradoresAtivos"]),
    parcial: Math.min(finiteNonNegative(raw["parcial"]), 100),
    produtosSemLeitura: cleanProducts(raw["produtosSemLeitura"]),
    semLeituraComVendas: cleanProducts(raw["semLeituraComVendas"]),
    setores,
    colaboradores: cleanNamedCounts(raw["colaboradores"]),
    corredores: cleanNamedCounts(raw["corredores"]),
    fluxo,
    detalhesRegistros,
  };
}

async function restoreDatabaseBackup(request: Request, id: string): Promise<Response> {
  if (!BACKUP_ID_PATTERN.test(id)) return json({ error: "Identificador de backup inválido." }, 400);
  let payload: { confirmation?: unknown };
  try { payload = await readBoundedJson(request) as { confirmation?: unknown }; }
  catch (error) {
    if (error instanceof PayloadTooLargeError) return json({ error: "A requisição excede o limite permitido de 1 MB." }, 413);
    return json({ error: "Corpo JSON inválido." }, 400);
  }
  if (payload.confirmation !== "RESTAURAR") {
    return json({ error: "Para restaurar, envie a confirmação exata RESTAURAR." }, 400);
  }

  const { backupDirectory, join } = await getStoragePaths();
  const fsSpecifier = "node:" + ["fs", "promises"].join("/");
  const sqliteSpecifier = ["node", "sqlite"].join(":");
  const [fsModule, sqliteModule] = await Promise.all([
    importRuntimeModule(fsSpecifier), importRuntimeModule(sqliteSpecifier),
  ]);
  const stat = fsModule["stat"] as (path: string) => Promise<{ size: number; mtime: Date; isFile: () => boolean }>;
  const DatabaseSync = sqliteModule["DatabaseSync"] as new (path: string) => SqliteDatabase;
  const backupPath = join(backupDirectory, `${id}.sqlite`);
  try {
    const backupStats = await stat(backupPath);
    if (!backupStats.isFile()) return json({ error: "Backup não encontrado." }, 404);
  } catch {
    return json({ error: "Backup não encontrado." }, 404);
  }

  // Verify the snapshot before changing current data.
  const source = new DatabaseSync(backupPath);
  try {
    const integrityRow = source.prepare("PRAGMA integrity_check").get();
    const integrityValue = integrityRow ? Object.values(integrityRow)[0] : null;
    if (integrityValue !== "ok") return json({ error: "O backup não passou na verificação de integridade. O histórico atual foi mantido." }, 422);
    const required = new Set(source.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => asString(row.name)));
    for (const table of ["scheduled_audits", "audit_runs", "audit_detail_records"]) {
      if (!required.has(table)) return json({ error: `O backup não contém a tabela necessária ${table}. O histórico atual foi mantido.` }, 422);
    }
  } finally {
    source.close();
  }

  // Every restore first snapshots the live database so the operator can undo a mistaken restore.
  const safetyBackup = await createDatabaseBackup();
  const db = await openDatabase();
  let attached = false;
  try {
    db.prepare("ATTACH DATABASE ? AS restore_source").run(backupPath);
    attached = true;
    db.exec("BEGIN IMMEDIATE");
    db.exec(`
      DELETE FROM audit_detail_records;
      DELETE FROM audit_runs;
      DELETE FROM scheduled_audits;
      INSERT INTO scheduled_audits
        (id, audit_date, weekday, window_start, window_end, audit_type, action_label, status, latest_run_id, created_at, updated_at)
        SELECT id, audit_date, weekday, window_start, window_end, audit_type, action_label, status, latest_run_id, created_at, updated_at FROM restore_source.scheduled_audits;
      INSERT INTO audit_runs
        (id, schedule_id, data_auditoria, audit_type, status, source_file, processed_at, sku, nao_lidos, lidos_com_estoque, lidos_sem_estoque, lidos_nao_pertence, etiquetas_desatualizadas, colaboradores_ativos, parcial, details_count, result_json, created_at)
        SELECT id, schedule_id, data_auditoria, audit_type, status, source_file, processed_at, sku, nao_lidos, lidos_com_estoque, lidos_sem_estoque, lidos_nao_pertence, etiquetas_desatualizadas, colaboradores_ativos, parcial, details_count, result_json, created_at FROM restore_source.audit_runs;
      INSERT INTO audit_detail_records
        (id, run_id, product_code, product_name, root_class, location, current_stock, situation, user_name, audited_time, sales_days)
        SELECT id, run_id, product_code, product_name, root_class, location, current_stock, situation, user_name, audited_time, sales_days FROM restore_source.audit_detail_records;
    `);
    db.exec("COMMIT");
    const restored = {
      schedules: Number(db.prepare("SELECT COUNT(*) AS count FROM scheduled_audits").get()?.count ?? 0),
      audits: Number(db.prepare("SELECT COUNT(*) AS count FROM audit_runs").get()?.count ?? 0),
      details: Number(db.prepare("SELECT COUNT(*) AS count FROM audit_detail_records").get()?.count ?? 0),
    };
    return json({ ok: true, restoredBackupId: id, safetyBackupId: safetyBackup.id, restoredAt: new Date().toISOString(), restored });
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch { /* transaction may already have rolled back */ }
    console.error("AuditOps: falha interna ao restaurar o backup", error);
    return json({ error: `Restauração cancelada por um erro interno. O sistema criou o backup preventivo ${safetyBackup.fileName}. Consulte o log do servidor.` }, 500);
  } finally {
    if (attached) { try { db.exec("DETACH DATABASE restore_source"); } catch { /* closing the connection also detaches it */ } }
    db.close();
  }
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function getIsoWeekday(date: string): number {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day;
}

function parseResultJson(raw: unknown): Partial<AuditResult> | null {
  if (typeof raw !== "string") return null;
  try {
    const result = JSON.parse(raw) as AuditResult;
    // The SQL detail table stores the complete row-level dataset. History dashboards only need
    // aggregates and rankings, so don't send large arrays of every product to the browser.
    const { detalhesRegistros: _details, produtosSemLeitura: _products, semLeituraComVendas: _sales, ...summary } = result;
    return summary;
  } catch {
    return null;
  }
}

function mapProcessedRow(row: SqlRow) {
  return {
    id: Number(row.id),
    scheduleId: row.schedule_id == null ? null : Number(row.schedule_id),
    kind: "processed" as const,
    dataAuditoria: asString(row.data_auditoria),
    auditType: asString(row.audit_type) as AuditType,
    status: asString(row.status, "Fechada") as "Aberta" | "Fechada",
    sourceFile: asString(row.source_file),
    processedAt: asString(row.processed_at),
    windowStart: row.window_start == null ? null : asString(row.window_start),
    windowEnd: row.window_end == null ? null : asString(row.window_end),
    sku: asNumber(row.sku),
    naoLidos: asNumber(row.nao_lidos),
    lidosComEstoque: asNumber(row.lidos_com_estoque),
    lidosSemEstoque: asNumber(row.lidos_sem_estoque),
    lidosNaoPertence: asNumber(row.lidos_nao_pertence),
    etiquetasDesatualizadas: asNumber(row.etiquetas_desatualizadas),
    colaboradoresAtivos: asNumber(row.colaboradores_ativos),
    parcial: asNumber(row.parcial),
    detailsCount: asNumber(row.details_count),
    result: parseResultJson(row.result_json),
  };
}


async function getCurrentAudit(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const sinceParam = url.searchParams.get("since");
  const since = sinceParam && /^\d+$/.test(sinceParam) ? Number(sinceParam) : null;
  const db = await openDatabase();
  try {
    const row = db.prepare(`SELECT id, data_auditoria, audit_type, processed_at, source_file, result_json
      FROM audit_runs ORDER BY id DESC LIMIT 1`).get();
    if (!row) return json({ runId: null, updatedAt: null, result: null, unchanged: false });
    const runId = Number(row.id);
    if (since !== null && since === runId) return json({ runId, updatedAt: asString(row.processed_at), unchanged: true });
    let result: AuditResult | null = null;
    try { result = JSON.parse(asString(row.result_json)) as AuditResult; } catch { result = null; }
    return json({
      runId,
      updatedAt: asString(row.processed_at),
      dataAuditoria: asString(row.data_auditoria),
      auditType: asString(row.audit_type),
      sourceFile: asString(row.source_file),
      result,
      unchanged: false,
    });
  } finally {
    db.close();
  }
}

async function getCalendar(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const from = isIsoDate(url.searchParams.get("from")) ? url.searchParams.get("from") as string : addIsoDays(todayIso, -((getIsoWeekday(todayIso) + 6) % 7));
  const to = isIsoDate(url.searchParams.get("to")) ? url.searchParams.get("to") as string : addIsoDays(from, 6);
  if (from > to) return json({ error: "A data inicial precisa ser anterior à data final." }, 400);

  const db = await openDatabase();
  try {
    const rows = db.prepare(`
      SELECT s.*, r.id AS current_run_id, r.source_file, r.processed_at, r.sku, r.nao_lidos, r.parcial
      FROM scheduled_audits s
      LEFT JOIN audit_runs r ON r.id = s.latest_run_id
      WHERE s.audit_date BETWEEN ? AND ?
      ORDER BY s.audit_date ASC
    `).all(from, to);
    return json({
      from, to,
      events: rows.map((row) => ({
        id: Number(row.id),
        date: asString(row.audit_date),
        weekday: Number(row.weekday),
        windowStart: row.window_start == null ? null : asString(row.window_start),
        windowEnd: row.window_end == null ? null : asString(row.window_end),
        type: asString(row.audit_type) as AuditType,
        actionLabel: asString(row.action_label, "Criar"),
        status: asString(row.status, "Aberta") as "Aberta" | "Fechada",
        hasUpload: row.current_run_id != null,
        sourceFile: row.source_file == null ? null : asString(row.source_file),
        processedAt: row.processed_at == null ? null : asString(row.processed_at),
        sku: row.sku == null ? null : asNumber(row.sku),
        naoLidos: row.nao_lidos == null ? null : asNumber(row.nao_lidos),
        parcial: row.parcial == null ? null : asNumber(row.parcial),
      })),
    });
  } finally {
    db.close();
  }
}

async function createCalendarSlot(request: Request): Promise<Response> {
  let payload: { date?: unknown };
  try { payload = await readBoundedJson(request) as { date?: unknown }; }
  catch (error) {
    if (error instanceof PayloadTooLargeError) return json({ error: "A requisição excede o limite permitido de 1 MB." }, 413);
    return json({ error: "Corpo JSON inválido." }, 400);
  }
  if (!isIsoDate(payload.date)) return json({ error: "Informe uma data válida para criar a auditoria." }, 400);
  const date = payload.date;
  const scheduled = getWeeklyScheduleForDate(date);
  if (!scheduled) return json({ error: "A data selecionada não tem uma janela recorrente. Use Importar data para uma auditoria histórica." }, 400);
  const db = await openDatabase();
  try {
    const now = new Date().toISOString();
    db.prepare(`INSERT OR IGNORE INTO scheduled_audits
      (audit_date, weekday, window_start, window_end, audit_type, action_label, status, latest_run_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'Aberta', NULL, ?, ?)`)
      .run(date, scheduled.weekday, scheduled.startTime, scheduled.endTime, scheduled.type, scheduled.actionLabel, now, now);
    const row = db.prepare("SELECT * FROM scheduled_audits WHERE audit_date = ?").get(date);
    if (!row) return json({ error: "Não foi possível criar a auditoria no banco SQL." }, 500);
    if (asString(row.audit_type) !== scheduled.type) return json({ error: `Já existe uma auditoria de ${asString(row.audit_type)} para esta data.` }, 409);
    return json({ ok: true, id: Number(row.id), date, type: scheduled.type, status: asString(row.status, "Aberta") });
  } finally {
    db.close();
  }
}

async function saveAudit(request: Request): Promise<Response> {
  let payload: { result?: AuditResult; expectedType?: AuditType | null };
  try {
    const parsed = await readBoundedJson(request, MAX_AUDIT_JSON_BYTES);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return json({ error: "O conteúdo da auditoria é inválido." }, 400);
    payload = parsed as { result?: AuditResult; expectedType?: AuditType | null };
  } catch (error) {
    if (error instanceof PayloadTooLargeError) return json({ error: "A planilha processada excede o limite de 64 MB. Divida o arquivo e tente novamente." }, 413);
    return json({ error: "Corpo JSON inválido." }, 400);
  }
  const result = sanitizeAuditResult(payload.result);
  if (!result) {
    return json({ error: "A auditoria enviada está incompleta, excede o limite de registros ou contém data/tipo inválido." }, 400);
  }
  if (payload.expectedType && (!validType(payload.expectedType) || payload.expectedType !== result.auditoria)) {
    return json({ error: `O calendário espera uma auditoria de ${payload.expectedType}, mas a planilha foi identificada como ${result.auditoria}. Verifique a data e a aba selecionada.` }, 409);
  }
  const detailRows = Array.isArray(result.detalhesRegistros) ? result.detalhesRegistros : [];
  const db = await openDatabase();
  try {
    db.exec("BEGIN IMMEDIATE");
    const date = result.dataAuditoria;
    let schedule = db.prepare("SELECT * FROM scheduled_audits WHERE audit_date = ?").get(date);
    if (!schedule) {
      const plan = getWeeklyScheduleForDate(date);
      const now = new Date().toISOString();
      const weekday = getIsoWeekday(date);
      db.prepare(`INSERT INTO scheduled_audits (audit_date, weekday, window_start, window_end, audit_type, action_label, status, latest_run_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'Criar', 'Aberta', NULL, ?, ?)`)
        .run(date, weekday, plan?.startTime ?? null, plan?.endTime ?? null, plan?.type ?? result.auditoria, now, now);
      schedule = db.prepare("SELECT * FROM scheduled_audits WHERE audit_date = ?").get(date);
    }
    if (!schedule) throw new Error("Não foi possível criar o dia no calendário SQL.");
    const currentScheduleType = asString(schedule.audit_type) as AuditType;
    if (currentScheduleType !== result.auditoria) {
      db.exec("ROLLBACK");
      return json({ error: `A data ${date} está programada para ${currentScheduleType}, mas a planilha é de ${result.auditoria}. Selecione a data correta antes de processar.` }, 409);
    }

    const now = new Date().toISOString();
    const insertRun = db.prepare(`INSERT INTO audit_runs
      (schedule_id, data_auditoria, audit_type, status, source_file, processed_at, sku, nao_lidos, lidos_com_estoque, lidos_sem_estoque, lidos_nao_pertence, etiquetas_desatualizadas, colaboradores_ativos, parcial, details_count, result_json, created_at)
      VALUES (?, ?, ?, 'Fechada', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const runInfo = insertRun.run(
      Number(schedule.id), result.dataAuditoria, result.auditoria, result.origem, result.processadoEm || now,
      asNumber(result.sku), asNumber(result.naoLidos), asNumber(result.lidosComEstoque), asNumber(result.lidosSemEstoque),
      asNumber(result.lidosNaoPertence), asNumber(result.etiquetasDesatualizadas), asNumber(result.colaboradoresAtivos),
      asNumber(result.parcial), detailRows.length, JSON.stringify(result), now,
    );
    const runId = Number(runInfo.lastInsertRowid);
    const insertDetail = db.prepare(`INSERT INTO audit_detail_records
      (run_id, product_code, product_name, root_class, location, current_stock, situation, user_name, audited_time, sales_days)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const detail of detailRows as AuditDetailRow[]) {
      insertDetail.run(runId, detail.codigo || "", detail.produto || "", detail.classeRaiz || "", detail.local || "",
        typeof detail.estoqueAtual === "number" ? detail.estoqueAtual : null, detail.situacao || "", detail.usuario || "",
        detail.auditadoEm || "", typeof detail.diasSemVenda === "number" ? detail.diasSemVenda : null);
    }
    db.prepare("UPDATE scheduled_audits SET status = 'Fechada', latest_run_id = ?, updated_at = ? WHERE id = ?")
      .run(runId, now, Number(schedule.id));
    db.exec("COMMIT");
    return json({ ok: true, id: runId, scheduleId: Number(schedule.id), status: "Fechada", savedDetails: detailRows.length });
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch { /* transaction may have rolled back already */ }
    console.error("AuditOps: falha interna ao salvar a auditoria", error);
    return json({ error: "Não foi possível salvar a auditoria. Consulte o log do servidor." }, 500);
  } finally {
    db.close();
  }
}

async function listAudits(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const db = await openDatabase();
  try {
    const conditions: string[] = [];
    const values: SqlValue[] = [];
    if (isIsoDate(from)) { conditions.push("r.data_auditoria >= ?"); values.push(from); }
    if (isIsoDate(to)) { conditions.push("r.data_auditoria <= ?"); values.push(to); }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const processedRows = db.prepare(`
      SELECT r.*, s.window_start, s.window_end
      FROM audit_runs r LEFT JOIN scheduled_audits s ON s.id = r.schedule_id
      ${where}
      ORDER BY r.data_auditoria DESC, r.id DESC
    `).all(...values).map(mapProcessedRow);

    // Only occurrences explicitly created by an operator appear as open audits. Merely
    // displaying the recurring calendar does not create history entries or inflate counters.
    const openConditions = ["s.latest_run_id IS NULL", "s.status = 'Aberta'"];
    const openValues: SqlValue[] = [];
    if (isIsoDate(from)) { openConditions.push("s.audit_date >= ?"); openValues.push(from); }
    if (isIsoDate(to)) { openConditions.push("s.audit_date <= ?"); openValues.push(to); }
    const openRows = db.prepare(`SELECT s.* FROM scheduled_audits s WHERE ${openConditions.join(" AND ")} ORDER BY s.audit_date DESC`)
      .all(...openValues).map((row) => ({
        id: Number(row.id), scheduleId: Number(row.id), kind: "scheduled" as const,
        dataAuditoria: asString(row.audit_date), auditType: asString(row.audit_type) as AuditType,
        status: "Aberta" as const, sourceFile: null, processedAt: null,
        windowStart: row.window_start == null ? null : asString(row.window_start),
        windowEnd: row.window_end == null ? null : asString(row.window_end),
        sku: null, naoLidos: null, lidosComEstoque: null, lidosSemEstoque: null, lidosNaoPertence: null,
        etiquetasDesatualizadas: null, colaboradoresAtivos: null, parcial: null, detailsCount: 0, result: null,
      }));
    const audits = [...processedRows, ...openRows].sort((a, b) =>
      b.dataAuditoria.localeCompare(a.dataAuditoria) || Number(b.id) - Number(a.id));
    return json({ audits, count: audits.length });
  } finally {
    db.close();
  }
}

async function updateAuditStatus(request: Request, idText: string): Promise<Response> {
  const id = Number(idText);
  if (!Number.isInteger(id) || id <= 0) return json({ error: "Identificador de auditoria inválido." }, 400);
  let payload: { status?: unknown };
  try { payload = await readBoundedJson(request) as { status?: unknown }; }
  catch (error) {
    if (error instanceof PayloadTooLargeError) return json({ error: "A requisição excede o limite permitido de 1 MB." }, 413);
    return json({ error: "Corpo JSON inválido." }, 400);
  }
  if (!validStatus(payload.status)) return json({ error: "Status inválido." }, 400);
  const db = await openDatabase();
  try {
    const found = db.prepare("SELECT schedule_id FROM audit_runs WHERE id = ?").get(id);
    if (!found) return json({ error: "Auditoria não encontrada." }, 404);
    const now = new Date().toISOString();
    db.exec("BEGIN IMMEDIATE");
    db.prepare("UPDATE audit_runs SET status = ? WHERE id = ?").run(payload.status, id);
    if (found.schedule_id != null) db.prepare("UPDATE scheduled_audits SET status = ?, updated_at = ? WHERE id = ? AND latest_run_id = ?")
      .run(payload.status, now, Number(found.schedule_id), id);
    db.exec("COMMIT");
    return json({ ok: true, id, status: payload.status });
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch { /* ignore */ }
    console.error("AuditOps: falha interna ao atualizar o status", error);
    return json({ error: "Não foi possível atualizar o status. Consulte o log do servidor." }, 500);
  } finally { db.close(); }
}

export async function handleAuditApiRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  try {
    if (path === "/api/current-audit" && request.method === "GET") return await getCurrentAudit(request);
    if (path === "/api/calendar" && request.method === "GET") return await getCalendar(request);
    if (path === "/api/calendar" && request.method === "POST") return await createCalendarSlot(request);
    if (path === "/api/audits" && request.method === "GET") return await listAudits(request);
    if (path === "/api/audits" && request.method === "POST") return await saveAudit(request);
    if (path === "/api/backups" && request.method === "GET") {
      const db = await openDatabase();
      db.close();
      return json({ backups: await listDatabaseBackups() });
    }
    if (path === "/api/backups" && request.method === "POST") {
      return json({ ok: true, backup: await createDatabaseBackup() });
    }
    const backupDownloadMatch = path.match(/^\/api\/backups\/(auditops-backup-\d{8}T\d{9}Z(?:-\d+)?)\/download$/);
    if (backupDownloadMatch && request.method === "GET") return await downloadDatabaseBackup(backupDownloadMatch[1]!);
    const backupRestoreMatch = path.match(/^\/api\/backups\/(auditops-backup-\d{8}T\d{9}Z(?:-\d+)?)\/restore$/);
    if (backupRestoreMatch && request.method === "POST") return await restoreDatabaseBackup(request, backupRestoreMatch[1]!);
    const statusMatch = path.match(/^\/api\/audits\/(\d+)\/status$/);
    if (statusMatch && request.method === "PATCH") return await updateAuditStatus(request, statusMatch[1]!);
    return json({ error: "Endpoint não encontrado." }, 404);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) return json({ error: "A requisição excede o limite permitido." }, 413);
    console.error("AuditOps SQL API:", error);
    return json({ error: "Erro interno no banco SQL. Consulte o log do servidor." }, 500);
  }
}

export const auditSqlSchema = SQL_SCHEMA;
