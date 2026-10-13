import {
  createHash,
  createHmac,
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

type SqlValue = string | number | null;
type SqlRow = Record<string, unknown>;
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

export const ACCESS_OPTIONS = [
  { key: "overview", label: "Visão geral", path: "/" },
  { key: "setores", label: "Setores", path: "/setores" },
  { key: "colaboradores", label: "Colaboradores", path: "/colaboradores" },
  { key: "corredores", label: "Corredores", path: "/corredores" },
  { key: "calendar", label: "Calendário semanal", path: "/atualizar-dados" },
  { key: "analysis", label: "Análise de Auditorias", path: "/analise-auditorias" },
  { key: "reports", label: "Exportações", path: "/relatorios" },
  { key: "about", label: "Sobre", path: "/sobre" },
] as const;
export type AccessKey = (typeof ACCESS_OPTIONS)[number]["key"];
export type PermissionMap = Record<AccessKey, boolean>;
export type PublicAuthUser = {
  id: number;
  username: string;
  displayName: string;
  role: "master" | "custom";
  active: boolean;
  forcePasswordChange: boolean;
  lastLoginAt: string | null;
  lockedUntil: string | null;
  failedAttempts: number;
  permissions: PermissionMap;
  online?: boolean;
  otpEnabled: boolean;
};
export type AuthContext = {
  user: PublicAuthUser;
  sessionId: number;
  tokenHash: string;
  sessionTimeoutMinutes: number;
};

const SESSION_COOKIE = "auditops_session";
const SESSION_ABSOLUTE_MINUTES = 8 * 60;
const FAILED_WINDOW_MINUTES = 15;
const ACCOUNT_FAILURE_LIMIT = 5;
const ACCOUNT_LOCK_MINUTES = 15;
const IP_FAILURE_LIMIT = 30;
const IP_LOCK_MINUTES = 15;
const HASH_N = 131072;
const HASH_R = 8;
const HASH_P = 1;
const HASH_BYTES = 64;
const SCRYPT_MAXMEM = 256 * 1024 * 1024;
const DEFAULT_MASTER_USERNAME = "5520991";
// Legacy markers are used only to rotate credentials created by older builds.
// New installations never share a source-controlled master password.
const LEGACY_MASTER_SALT = "8f7ac0e24d68819a4a7cb3d04ed2c62b";
const LEGACY_MASTER_HASH = "32811c3c838367811c67a65b1639fde37ef4a039642eb000651404fb8d4a6a2f74f704885b28d324e466b96bfcf950b527257af752b4578fc44499719a4551fa";
const IP_UNAVAILABLE_KEY = "ip-unavailable";
const MAX_AUTH_BODY_BYTES = 1024 * 1024;
const DUMMY_SALT = "be1d9a47a0bc4ab29d9efc5f741d2a78";
const DUMMY_HASH = "4b3a7bf8e6c3b5f061de89d14e14aef4b40b2c132912d3318f8a4f53a9ff3f5d74a05d966bbd9c7d38f24d31d7f3a10e82a8a9e3d14c8fdd43e7b8b3f87a2f03";
const ALL_PERMISSION_KEYS = ACCESS_OPTIONS.map((item) => item.key) as AccessKey[];
const DATA_PERMISSION_KEYS: AccessKey[] = ["overview", "setores", "colaboradores", "corredores", "calendar", "analysis", "reports"];

const AUTH_SCHEMA = `
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
CREATE TABLE IF NOT EXISTS auth_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'custom' CHECK (role IN ('master', 'custom')),
  is_active INTEGER NOT NULL DEFAULT 1,
  force_password_change INTEGER NOT NULL DEFAULT 1,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  failed_window_started_at TEXT,
  locked_until TEXT,
  last_login_at TEXT,
  otp_secret_enc TEXT,
  otp_pending_secret_enc TEXT,
  otp_pending_expires_at TEXT,
  otp_enabled INTEGER NOT NULL DEFAULT 0,
  otp_last_used_step INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_user_permissions (
  user_id INTEGER NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  section_key TEXT NOT NULL,
  can_view INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, section_key)
);
CREATE TABLE IF NOT EXISTS auth_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  presence_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z',
  absolute_expires_at TEXT NOT NULL,
  revoked_at TEXT,
  user_agent TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS auth_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_login_challenges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  client_ip_hash TEXT NOT NULL,
  consumed_at TEXT
);
CREATE TABLE IF NOT EXISTS auth_user_recovery_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  used_at TEXT
);
CREATE TABLE IF NOT EXISTS auth_login_rate_limits (
  ip_hash TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  window_started_at TEXT NOT NULL,
  blocked_until TEXT
);
CREATE TABLE IF NOT EXISTS auth_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  user_id INTEGER,
  username TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_token ON auth_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_auth_events_date ON auth_events(created_at);
`;

async function importRuntimeModule(specifier: string): Promise<Record<string, unknown>> {
  return await import(/* @vite-ignore */ specifier) as Record<string, unknown>;
}

function ensureColumn(db: SqliteDatabase, table: string, column: string, declaration: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((entry) => asString(entry["name"]) === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${declaration}`);
  }
}

function bootstrapPassword(): { password: string; generated: boolean } {
  const processLike = globalThis as unknown as { process?: { env?: Record<string, string | undefined> } };
  const configured = processLike.process?.env?.["AUDITOPS_MASTER_PASSWORD"];
  if (configured !== undefined) {
    if (configured.length < 12 || configured.length > 128) {
      throw new Error("AUDITOPS_MASTER_PASSWORD deve conter entre 12 e 128 caracteres.");
    }
    return { password: configured, generated: false };
  }
  return { password: randomBytes(32).toString("base64url").slice(0, 20), generated: true };
}

function printBootstrapPassword(password: string, reason: "created" | "rotated" | "migrated" | "promoted") {
  const reasonText = {
    created: "primeira inicialização",
    rotated: "credencial antiga invalidada",
    migrated: "login mestre migrado para a matrícula",
    promoted: "conta existente da matrícula promovida a mestre",
  }[reason];
  console.warn("\n[AUDITOPS] CREDENCIAL MESTRE INICIAL — MOSTRADA UMA ÚNICA VEZ\n"
    + `Motivo: ${reasonText}\n`
    + `Usuário: ${DEFAULT_MASTER_USERNAME}\nSenha: ${password}\n`
    + "Troque esta senha no primeiro login. Não compartilhe nem salve este log.\n");
}

async function openAuthDatabase(): Promise<SqliteDatabase> {
  const [sqliteModule, fsModule, pathModule] = await Promise.all([
    importRuntimeModule(["node", "sqlite"].join(":")),
    importRuntimeModule("node:" + ["fs", "promises"].join("/")),
    importRuntimeModule(["node", "path"].join(":")),
  ]);
  const processLike = globalThis as unknown as { process?: { cwd?: () => string; env?: Record<string, string | undefined> } };
  const join = pathModule["join"] as (...parts: string[]) => string;
  const dirname = pathModule["dirname"] as (path: string) => string;
  const mkdir = fsModule["mkdir"] as (path: string, options: { recursive: boolean; mode?: number }) => Promise<unknown>;
  const DatabaseSync = sqliteModule["DatabaseSync"] as new (path: string) => SqliteDatabase;
  const cwd = processLike.process?.cwd?.() ?? ".";
  const databasePath = processLike.process?.env?.["AUDITOPS_DB_PATH"] || join(cwd, "data", "auditops.sqlite");
  await mkdir(dirname(databasePath), { recursive: true, mode: 0o700 });
  await chmod(dirname(databasePath), 0o700).catch(() => undefined);
  const db = new DatabaseSync(databasePath);
  await chmod(databasePath, 0o600).catch(() => undefined);
  db.exec(AUTH_SCHEMA);
  // Migrate the authentication schema before provisioning the master identity.
  ensureColumn(db, "auth_users", "otp_secret_enc", "TEXT");
  ensureColumn(db, "auth_users", "otp_pending_secret_enc", "TEXT");
  ensureColumn(db, "auth_users", "otp_pending_expires_at", "TEXT");
  ensureColumn(db, "auth_users", "otp_enabled", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "auth_users", "otp_last_used_step", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "auth_sessions", "presence_at", "TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z'");
  const now = new Date().toISOString();
  db.prepare("INSERT OR IGNORE INTO auth_settings (setting_key, setting_value) VALUES ('session_timeout_minutes', '20')").run();
  if (!db.prepare("SELECT setting_value FROM auth_settings WHERE setting_key = 'ip_hash_pepper'").get()) {
    db.prepare("INSERT INTO auth_settings (setting_key, setting_value) VALUES ('ip_hash_pepper', ?)").run(randomBytes(32).toString("hex"));
  }
  // The master login is the employee registration number. Migrate older databases safely.
  const masterRows = db.prepare("SELECT * FROM auth_users WHERE role = 'master' ORDER BY id ASC").all();
  if (masterRows.length > 1) {
    throw new Error("Mais de uma conta mestre foi encontrada no banco. Interrompendo para evitar alterar a conta errada.");
  }
  let master = masterRows[0];
  const targetAccount = db.prepare("SELECT * FROM auth_users WHERE username = ?").get(DEFAULT_MASTER_USERNAME);

  if (master && targetAccount && asNumber(targetAccount["id"]) !== asNumber(master["id"])) {
    // The matricula may already belong to the owner's custom account. Keep that account and its OTP,
    // promote it to master, and disable/archive the old master rather than losing either identity.
    const initial = bootstrapPassword();
    const hashed = await hashPassword(initial.password);
    const archivedUsername = `legacy-master-${asNumber(master["id"])}-${Date.now()}`;
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare(`UPDATE auth_users SET username = ?, display_name = 'Conta mestre anterior', role = 'custom',
        is_active = 0, force_password_change = 1, failed_attempts = 0, failed_window_started_at = NULL,
        locked_until = NULL, updated_at = ? WHERE id = ? AND role = 'master'`)
        .run(archivedUsername, now, asNumber(master["id"]));
      db.prepare("UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL")
        .run(now, asNumber(master["id"]));
      db.prepare("DELETE FROM auth_user_permissions WHERE user_id = ?").run(asNumber(master["id"]));
      db.prepare(`UPDATE auth_users SET password_salt = ?, password_hash = ?, role = 'master',
        is_active = 1, force_password_change = 1, failed_attempts = 0, failed_window_started_at = NULL,
        locked_until = NULL, updated_at = ? WHERE id = ?`)
        .run(hashed.salt, hashed.hash, now, asNumber(targetAccount["id"]));
      db.prepare("UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL")
        .run(now, asNumber(targetAccount["id"]));
      db.prepare("DELETE FROM auth_user_permissions WHERE user_id = ?").run(asNumber(targetAccount["id"]));
      logEvent(db, "master_account_archived", asNumber(master["id"]), archivedUsername,
        "Conta mestre antiga desativada após migração do login para a matrícula 5520991.");
      logEvent(db, "master_account_promoted", asNumber(targetAccount["id"]), DEFAULT_MASTER_USERNAME,
        "Conta da matrícula promovida a mestre; senha inicial nova e troca obrigatória.");
      db.exec("COMMIT");
    } catch (error) {
      try { db.exec("ROLLBACK"); } catch { /* transaction already closed */ }
      throw error;
    }
    if (initial.generated) printBootstrapPassword(initial.password, "promoted");
  } else if (!master && targetAccount) {
    // Recovery path when an installation has no master role but the requested owner account exists.
    const initial = bootstrapPassword();
    const hashed = await hashPassword(initial.password);
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare(`UPDATE auth_users SET password_salt = ?, password_hash = ?, role = 'master', is_active = 1,
        force_password_change = 1, failed_attempts = 0, failed_window_started_at = NULL, locked_until = NULL,
        updated_at = ? WHERE id = ?`)
        .run(hashed.salt, hashed.hash, now, asNumber(targetAccount["id"]));
      db.prepare("UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL")
        .run(now, asNumber(targetAccount["id"]));
      db.prepare("DELETE FROM auth_user_permissions WHERE user_id = ?").run(asNumber(targetAccount["id"]));
      logEvent(db, "master_account_recovered", asNumber(targetAccount["id"]), DEFAULT_MASTER_USERNAME,
        "Conta mestre recuperada usando a matrícula; troca de senha obrigatória.");
      db.exec("COMMIT");
    } catch (error) {
      try { db.exec("ROLLBACK"); } catch { /* transaction already closed */ }
      throw error;
    }
    if (initial.generated) printBootstrapPassword(initial.password, "promoted");
  } else if (!master) {
    const initial = bootstrapPassword();
    const hashed = await hashPassword(initial.password);
    const insert = db.prepare(`INSERT OR IGNORE INTO auth_users
      (username, display_name, password_salt, password_hash, role, is_active, force_password_change, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'master', 1, 1, ?, ?)`);
    const created = insert.run(DEFAULT_MASTER_USERNAME, "Usuário mestre", hashed.salt, hashed.hash, now, now);
    if (created.changes > 0) {
      logEvent(db, "master_bootstrapped", null, DEFAULT_MASTER_USERNAME, "Conta mestre criada; troca de senha obrigatória.");
      if (initial.generated) printBootstrapPassword(initial.password, "created");
    }
  } else if (asString(master["username"]).toLowerCase() !== DEFAULT_MASTER_USERNAME.toLowerCase()
    || (asString(master["password_salt"]) === LEGACY_MASTER_SALT && asString(master["password_hash"]) === LEGACY_MASTER_HASH)) {
    // Rename the old master login and rotate its password, revoking every existing session.
    const initial = bootstrapPassword();
    const hashed = await hashPassword(initial.password);
    const previousUsername = asString(master["username"]);
    const reason = previousUsername.toLowerCase() !== DEFAULT_MASTER_USERNAME.toLowerCase() ? "migrated" : "rotated";
    db.exec("BEGIN IMMEDIATE");
    let rotatedChanges = 0;
    try {
      const rotated = db.prepare(`UPDATE auth_users SET username = ?, password_salt = ?, password_hash = ?, force_password_change = 1,
        failed_attempts = 0, failed_window_started_at = NULL, locked_until = NULL, updated_at = ? WHERE id = ?`)
        .run(DEFAULT_MASTER_USERNAME, hashed.salt, hashed.hash, now, asNumber(master["id"]));
      rotatedChanges = rotated.changes;
      if (rotated.changes > 0) {
        db.prepare("UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").run(now, asNumber(master["id"]));
        logEvent(db, reason === "migrated" ? "master_username_migrated" : "master_default_password_rotated",
          asNumber(master["id"]), DEFAULT_MASTER_USERNAME,
          reason === "migrated" ? `Login mestre alterado de ${previousUsername} para a matrícula; nova senha obrigatória.` : "Senha padrão de versão anterior invalidada; troca obrigatória.");
      }
      db.exec("COMMIT");
    } catch (error) {
      try { db.exec("ROLLBACK"); } catch { /* transaction already closed */ }
      throw error;
    }
    if (rotatedChanges > 0 && initial.generated) printBootstrapPassword(initial.password, reason);
  }
  return db;
}

/** Initialize/migrate the authentication database at server startup so the one-time credential
 * is emitted to the server terminal before anyone needs to guess a password in the login form. */
export async function initializeAuthDatabase(): Promise<void> {
  const db = await openAuthDatabase();
  db.close();
}

function logEvent(db: SqliteDatabase, eventType: string, userId: number | null, username: string, details = "") {
  db.prepare("INSERT INTO auth_events (event_type, user_id, username, created_at, details) VALUES (?, ?, ?, ?, ?)")
    .run(eventType, userId, username.slice(0, 100), new Date().toISOString(), details.slice(0, 500));
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}
function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function asBoolean(value: unknown): boolean {
  return value === 1 || value === true;
}
function safeJson(payload: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}
function getCookie(request: Request, name: string): string | null {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim() || null;
  }
  return null;
}
function cookieOptions(request: Request): string {
  const url = new URL(request.url);
  const processLike = globalThis as unknown as { process?: { env?: Record<string, string | undefined> } };
  const trustedProxy = processLike.process?.env?.["AUDITOPS_TRUST_PROXY"] === "1";
  const forwardedProto = trustedProxy ? request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() : undefined;
  const secure = url.protocol === "https:" || forwardedProto === "https";
  return `Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}
function sessionCookie(request: Request, token: string): string {
  return `${SESSION_COOKIE}=${token}; ${cookieOptions(request)}; Max-Age=${SESSION_ABSOLUTE_MINUTES * 60}`;
}
function clearSessionCookie(request: Request): string {
  return `${SESSION_COOKIE}=; ${cookieOptions(request)}; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}
function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
function isoInMinutes(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}
function isFutureIso(value: unknown): boolean {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) && Date.parse(value) > Date.now();
}
async function loadOtpEncryptionKey(): Promise<Buffer> {
  const processLike = globalThis as unknown as { process?: { cwd?: () => string; env?: Record<string, string | undefined> } };
  const env = processLike.process?.env ?? {};
  const configured = env["AUDITOPS_OTP_ENCRYPTION_KEY"];
  if (configured && /^[a-f0-9]{64}$/i.test(configured)) return Buffer.from(configured, "hex");
  const cwd = processLike.process?.cwd?.() ?? ".";
  const dataDir = env["AUDITOPS_DB_PATH"] ? dirname(env["AUDITOPS_DB_PATH"]) : join(cwd, "data");
  const keyPath = env["AUDITOPS_OTP_KEY_PATH"] || join(dataDir, "auditops-otp-encryption.key");
  await mkdir(dirname(keyPath), { recursive: true, mode: 0o700 });
  await chmod(dirname(keyPath), 0o700).catch(() => undefined);
  try {
    const existing = await readFile(keyPath);
    if (existing.length !== 32) throw new Error("Chave de criptografia OTP inválida.");
    await chmod(keyPath, 0o600).catch(() => undefined);
    return existing;
  } catch (error) {
    if ((error as { code?: string }).code !== "ENOENT") throw error;
    const generated = randomBytes(32);
    try {
      await writeFile(keyPath, generated, { flag: "wx", mode: 0o600 });
      return generated;
    } catch (writeError) {
      if ((writeError as { code?: string }).code === "EEXIST") {
        const racedKey = await readFile(keyPath);
        if (racedKey.length === 32) {
          await chmod(keyPath, 0o600).catch(() => undefined);
          return racedKey;
        }
      }
      throw writeError;
    }
  }
}

function base32Encode(input: Buffer): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of input.toUpperCase().replace(/=+$/g, "").replace(/\s/g, "")) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error("Segredo do autenticador inválido.");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

async function encryptOtpSecret(secret: string): Promise<string> {
  const key = await loadOtpEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

async function decryptOtpSecret(encrypted: string): Promise<string> {
  const [ivPart, tagPart, dataPart] = encrypted.split(".");
  if (!ivPart || !tagPart || !dataPart) throw new Error("Segredo OTP armazenado inválido.");
  const key = await loadOtpEncryptionKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataPart, "base64url")), decipher.final()]).toString("utf8");
}

function findValidTotpStep(secret: string, suppliedCode: string, lastUsedStep = -1): number | null {
  if (!/^\d{6}$/.test(suppliedCode)) return null;
  const key = base32Decode(secret);
  const currentStep = Math.floor(Date.now() / 30_000);
  const supplied = Buffer.from(suppliedCode, "ascii");
  for (const step of [currentStep - 1, currentStep, currentStep + 1]) {
    if (step <= lastUsedStep || step < 0) continue;
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(step));
    const digest = createHmac("sha1", key).update(counter).digest();
    const offset = digest[digest.length - 1]! & 0x0f;
    const binary = ((digest[offset]! & 0x7f) << 24) | ((digest[offset + 1]! & 0xff) << 16) | ((digest[offset + 2]! & 0xff) << 8) | (digest[offset + 3]! & 0xff);
    const candidate = Buffer.from(String(binary % 1_000_000).padStart(6, "0"), "ascii");
    if (candidate.length === supplied.length && timingSafeEqual(candidate, supplied)) return step;
  }
  return null;
}

function recoveryCodeHash(code: string): string {
  return createHash("sha256").update(code.trim().toUpperCase().replace(/\s+/g, "")).digest("hex");
}

function makeRecoveryCodes(): string[] {
  return Array.from({ length: 8 }, () => {
    const raw = randomBytes(8).toString("hex").toUpperCase();
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
  });
}

function getTimeoutMinutes(db: SqliteDatabase): number {
  const raw = asNumber(Number(db.prepare("SELECT setting_value FROM auth_settings WHERE setting_key = 'session_timeout_minutes'").get()?.["setting_value"]), 20);
  return [15, 20, 25, 30].includes(raw) ? raw : 20;
}

function derivePassword(password: string, saltHex: string): Promise<Buffer> {
  const salt = Buffer.from(saltHex, "hex");
  return new Promise((resolve, reject) => {
    scrypt(password, salt, HASH_BYTES, { N: HASH_N, r: HASH_R, p: HASH_P, maxmem: SCRYPT_MAXMEM }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}
async function hashPassword(password: string): Promise<{ salt: string; hash: string }> {
  const salt = randomBytes(16).toString("hex");
  const hash = await derivePassword(password, salt);
  return { salt, hash: hash.toString("hex") };
}
async function verifyPassword(password: string, salt: string, hashHex: string): Promise<boolean> {
  const derived = await derivePassword(password, salt);
  const expected = Buffer.from(hashHex, "hex");
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

function getPermissions(db: SqliteDatabase, userId: number, role: string): PermissionMap {
  const permissions = Object.fromEntries(ALL_PERMISSION_KEYS.map((key) => [key, role === "master"])) as PermissionMap;
  if (role === "master") return permissions;
  const rows = db.prepare("SELECT section_key, can_view FROM auth_user_permissions WHERE user_id = ?").all(userId);
  for (const row of rows) {
    const key = asString(row["section_key"]) as AccessKey;
    if (ALL_PERMISSION_KEYS.includes(key)) permissions[key] = asBoolean(row["can_view"]);
  }
  return permissions;
}

function mapPublicUser(db: SqliteDatabase, row: SqlRow): PublicAuthUser {
  const role = asString(row["role"], "custom") === "master" ? "master" : "custom";
  return {
    id: asNumber(row["id"]),
    username: asString(row["username"]),
    displayName: asString(row["display_name"]),
    role,
    active: asBoolean(row["is_active"]),
    forcePasswordChange: asBoolean(row["force_password_change"]),
    lastLoginAt: typeof row["last_login_at"] === "string" ? row["last_login_at"] : null,
    lockedUntil: typeof row["locked_until"] === "string" ? row["locked_until"] : null,
    failedAttempts: asNumber(row["failed_attempts"]),
    permissions: getPermissions(db, asNumber(row["id"]), role),
    online: asBoolean(row["online"]),
    otpEnabled: asBoolean(row["otp_enabled"]),
  };
}

export async function getAuthSession(request: Request, touch = true): Promise<AuthContext | null> {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token || token.length > 200) return null;
  const db = await openAuthDatabase();
  try {
    const hashedToken = tokenHash(token);
    const row = db.prepare(`SELECT s.id AS session_id, s.token_hash, s.last_seen_at, s.absolute_expires_at, s.revoked_at,
      u.* FROM auth_sessions s JOIN auth_users u ON u.id = s.user_id WHERE s.token_hash = ?`).get(hashedToken);
    if (!row || row["revoked_at"] != null || !asBoolean(row["is_active"])) return null;
    const timeoutMinutes = getTimeoutMinutes(db);
    const idleElapsed = Date.now() - Date.parse(asString(row["last_seen_at"]));
    const absoluteExpired = !isFutureIso(row["absolute_expires_at"]);
    if (absoluteExpired || !Number.isFinite(idleElapsed) || idleElapsed >= timeoutMinutes * 60_000) {
      db.prepare("UPDATE auth_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").run(new Date().toISOString(), asNumber(row["session_id"]));
      logEvent(db, "session_expired", asNumber(row["id"]), asString(row["username"]), absoluteExpired ? "absolute_timeout" : "idle_timeout");
      return null;
    }
    // Only real authenticated actions refresh activity. Status polling uses touch=false so it cannot
    // keep an otherwise idle session alive forever.
    if (touch) {
      db.prepare("UPDATE auth_sessions SET last_seen_at = ? WHERE id = ? AND revoked_at IS NULL")
        .run(new Date().toISOString(), asNumber(row["session_id"]));
    }
    return {
      user: mapPublicUser(db, row),
      sessionId: asNumber(row["session_id"]),
      tokenHash: hashedToken,
      sessionTimeoutMinutes: timeoutMinutes,
    };
  } finally {
    db.close();
  }
}

export function userCanAccess(user: PublicAuthUser, key: string): boolean {
  if (user.role === "master") return true;
  return ALL_PERMISSION_KEYS.includes(key as AccessKey) && user.permissions[key as AccessKey] === true;
}

export function firstAllowedPath(user: PublicAuthUser): string {
  if (user.role === "master") return "/";
  return ACCESS_OPTIONS.find((item) => user.permissions[item.key])?.path ?? "/minha-conta";
}

export function permissionForPage(pathname: string): string | null {
  const map: Record<string, string> = {
    "/": "overview",
    "/setores": "setores",
    "/colaboradores": "colaboradores",
    "/corredores": "corredores",
    "/atualizar-dados": "calendar",
    "/analise-auditorias": "analysis",
    "/relatorios": "reports",
    "/sobre": "about",
    "/minha-conta": "__authenticated__",
    "/acessos": "__master__",
    "/seguranca-dados": "__master__",
  };
  return map[pathname] ?? null;
}

export async function authorizeAuditApiRequest(request: Request): Promise<Response | null> {
  const context = await getAuthSession(request);
  if (!context) return safeJson({ error: "Sessão expirada. Entre novamente.", code: "UNAUTHENTICATED" }, 401, { "set-cookie": clearSessionCookie(request) });
  const path = new URL(request.url).pathname.replace(/\/+$/, "") || "/";
  if (context.user.forcePasswordChange) {
    return safeJson({ error: "Troque a senha inicial antes de continuar.", code: "PASSWORD_CHANGE_REQUIRED" }, 428);
  }
  if (path.startsWith("/api/backups")) {
    if (context.user.role !== "master") return safeJson({ error: "Somente o usuário mestre pode acessar os backups do banco.", code: "FORBIDDEN" }, 403);
    return null;
  }
  if (path.startsWith("/api/admin/")) {
    if (context.user.role !== "master") return safeJson({ error: "Apenas o usuário mestre pode administrar acessos.", code: "FORBIDDEN" }, 403);
    return null;
  }
  let required: string | null = null;
  if (path === "/api/calendar") required = request.method === "GET" ? "calendar" : "calendar";
  else if (path === "/api/audits") required = request.method === "GET" ? "analysis" : "calendar";
  else if (/^\/api\/audits\/\d+\/status$/.test(path)) required = "analysis";
  else if (path === "/api/current-audit") {
    if (context.user.role === "master" || DATA_PERMISSION_KEYS.some((key) => userCanAccess(context.user, key))) return null;
    return safeJson({ error: "Seu acesso não permite visualizar dados de auditoria.", code: "FORBIDDEN" }, 403);
  }
  if (required && !userCanAccess(context.user, required)) {
    return safeJson({ error: "Seu perfil não tem acesso a esta funcionalidade.", code: "FORBIDDEN" }, 403);
  }
  return null;
}

function normalizeUsername(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const username = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{2,31}$/.test(username) ? username : null;
}
function normalizeDisplayName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ");
  return name.length >= 2 && name.length <= 80 ? name : null;
}
function validPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 12 && value.length <= 128;
}
function parsePermissionMap(value: unknown): PermissionMap | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const result = Object.fromEntries(ALL_PERMISSION_KEYS.map((key) => [key, input[key] === true])) as PermissionMap;
  if (Object.keys(input).some((key) => !ALL_PERMISSION_KEYS.includes(key as AccessKey))) return null;
  return result;
}
class PayloadTooLargeError extends Error {}

async function readJsonBody(request: Request, maxBytes = MAX_AUTH_BODY_BYTES): Promise<Record<string, unknown> | null> {
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
  try {
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch (error) {
    if (error instanceof PayloadTooLargeError) throw error;
    return null;
  }
}
function clientIpKey(request: Request, db: SqliteDatabase): string {
  const processLike = globalThis as unknown as { process?: { env?: Record<string, string | undefined> } };
  // Fetch Request does not expose the socket peer. Trust proxy headers only when explicitly enabled
  // behind a reverse proxy configured to overwrite them; otherwise account-level throttling applies.
  if (processLike.process?.env?.["AUDITOPS_TRUST_PROXY"] !== "1") return IP_UNAVAILABLE_KEY;
  const forwarded = request.headers.get("cf-connecting-ip")
    || request.headers.get("x-real-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (!forwarded || forwarded.length > 128 || /[\s,]/.test(forwarded)) return IP_UNAVAILABLE_KEY;
  const pepper = asString(db.prepare("SELECT setting_value FROM auth_settings WHERE setting_key = 'ip_hash_pepper'").get()?.["setting_value"]);
  return createHmac("sha256", pepper).update(forwarded).digest("hex");
}
function ipLimitIsActive(db: SqliteDatabase, key: string): boolean {
  if (key === IP_UNAVAILABLE_KEY) return false;
  const row = db.prepare("SELECT blocked_until FROM auth_login_rate_limits WHERE ip_hash = ?").get(key);
  return isFutureIso(row?.["blocked_until"]);
}
function recordIpFailure(db: SqliteDatabase, key: string): boolean {
  if (key === IP_UNAVAILABLE_KEY) return false;
  const now = new Date();
  const row = db.prepare("SELECT attempts, window_started_at FROM auth_login_rate_limits WHERE ip_hash = ?").get(key);
  const windowStart = row?.["window_started_at"] == null ? null : Date.parse(asString(row["window_started_at"]));
  const reset = !windowStart || !Number.isFinite(windowStart) || now.getTime() - windowStart >= FAILED_WINDOW_MINUTES * 60_000;
  const attempts = reset ? 1 : asNumber(row?.["attempts"]) + 1;
  const started = reset ? now.toISOString() : asString(row?.["window_started_at"], now.toISOString());
  const blockedUntil = attempts >= IP_FAILURE_LIMIT ? isoInMinutes(IP_LOCK_MINUTES) : null;
  db.prepare(`INSERT INTO auth_login_rate_limits (ip_hash, attempts, window_started_at, blocked_until) VALUES (?, ?, ?, ?)
    ON CONFLICT(ip_hash) DO UPDATE SET attempts = excluded.attempts, window_started_at = excluded.window_started_at, blocked_until = excluded.blocked_until`)
    .run(key, attempts, started, blockedUntil);
  return blockedUntil != null;
}
function resetIpLimit(db: SqliteDatabase, key: string) {
  if (key === IP_UNAVAILABLE_KEY) return;
  db.prepare("DELETE FROM auth_login_rate_limits WHERE ip_hash = ?").run(key);
}

function recordAccountFailure(db: SqliteDatabase, user: SqlRow, eventType: string, details: string): { locked: boolean; attempts: number } {
  const now = new Date();
  const startedAt = typeof user["failed_window_started_at"] === "string" ? Date.parse(user["failed_window_started_at"]) : 0;
  const resetWindow = !Number.isFinite(startedAt) || now.getTime() - startedAt >= FAILED_WINDOW_MINUTES * 60_000;
  const attempts = resetWindow ? 1 : asNumber(user["failed_attempts"]) + 1;
  const windowStart = resetWindow ? now.toISOString() : asString(user["failed_window_started_at"], now.toISOString());
  const locked = attempts >= ACCOUNT_FAILURE_LIMIT;
  const lockedUntil = locked ? isoInMinutes(ACCOUNT_LOCK_MINUTES) : null;
  const userId = asNumber(user["id"]);
  const username = asString(user["username"]);
  db.prepare(`UPDATE auth_users SET failed_attempts = ?, failed_window_started_at = ?, locked_until = ?, updated_at = ? WHERE id = ?`)
    .run(attempts, windowStart, lockedUntil, now.toISOString(), userId);
  if (locked) db.prepare("UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL")
    .run(now.toISOString(), userId);
  logEvent(db, eventType, userId, username, `${details}; attempt=${attempts}${locked ? "; locked" : ""}`);
  return { locked, attempts };
}

function wrongCredentialResponse(locked: boolean, message = "Senha atual incorreta."): Response {
  return safeJson({ error: locked ? "Muitas tentativas incorretas. A conta foi bloqueada por 15 minutos." : message },
    locked ? 429 : 400, locked ? { "retry-after": String(ACCOUNT_LOCK_MINUTES * 60) } : {});
}
function badLoginResponse(request: Request, locked = false): Response {
  return safeJson({
    error: locked
      ? "Não foi possível entrar. A conta ou origem foi temporariamente bloqueada; aguarde 15 minutos e tente novamente."
      : "Usuário ou senha inválidos.",
  }, locked ? 429 : 401, locked ? { "retry-after": String(IP_LOCK_MINUTES * 60) } : {});
}

function issueSession(request: Request, db: SqliteDatabase, userId: number, username: string, ipKey: string): Response {
  const now = new Date().toISOString();
  const token = randomBytes(32).toString("base64url");
  const hashedToken = tokenHash(token);
  const expiry = isoInMinutes(SESSION_ABSOLUTE_MINUTES);
  db.prepare(`INSERT INTO auth_sessions (user_id, token_hash, created_at, last_seen_at, presence_at, absolute_expires_at, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(userId, hashedToken, now, now, now, expiry, (request.headers.get("user-agent") ?? "").slice(0, 400));
  db.prepare("UPDATE auth_users SET failed_attempts = 0, failed_window_started_at = NULL, locked_until = NULL, last_login_at = ?, updated_at = ? WHERE id = ?")
    .run(now, now, userId);
  resetIpLimit(db, ipKey);
  logEvent(db, "login_success", userId, username);
  const updatedUser = db.prepare("SELECT * FROM auth_users WHERE id = ?").get(userId)!;
  const publicUser = mapPublicUser(db, updatedUser);
  return safeJson({ ok: true, user: publicUser, mustChangePassword: publicUser.forcePasswordChange, sessionTimeoutMinutes: getTimeoutMinutes(db) }, 200, { "set-cookie": sessionCookie(request, token) });
}

async function login(request: Request): Promise<Response> {
  const payload = await readJsonBody(request);
  const usernameRaw = typeof payload?.["username"] === "string" ? payload["username"].trim().toLowerCase().slice(0, 100) : "";
  const username = normalizeUsername(usernameRaw);
  const password = typeof payload?.["password"] === "string" ? payload["password"].slice(0, 128) : "";
  if (!username || !password) return safeJson({ error: "Informe usuário e senha válidos." }, 400);
  const db = await openAuthDatabase();
  try {
    const ipKey = clientIpKey(request, db);
    if (ipLimitIsActive(db, ipKey)) return badLoginResponse(request, true);
    const userRow = db.prepare("SELECT * FROM auth_users WHERE username = ?").get(username);
    if (userRow && isFutureIso(userRow["locked_until"])) {
      recordIpFailure(db, ipKey);
      return badLoginResponse(request, true);
    }
    if (!userRow || !asBoolean(userRow["is_active"])) {
      await verifyPassword(password, DUMMY_SALT, DUMMY_HASH).catch(() => false);
      const ipBlocked = recordIpFailure(db, ipKey);
      logEvent(db, "login_failed", userRow ? asNumber(userRow["id"]) : null, username, "credentials_or_disabled");
      return badLoginResponse(request, ipBlocked);
    }
    const valid = await verifyPassword(password, asString(userRow["password_salt"]), asString(userRow["password_hash"]));
    if (!valid) {
      const accountFailure = recordAccountFailure(db, userRow, "login_failed", "bad_password");
      const ipBlocked = recordIpFailure(db, ipKey);
      return badLoginResponse(request, accountFailure.locked || ipBlocked);
    }
    if (asBoolean(userRow["otp_enabled"])) {
      const now = new Date().toISOString();
      const challengeToken = randomBytes(32).toString("base64url");
      db.prepare("DELETE FROM auth_login_challenges WHERE consumed_at IS NOT NULL OR expires_at <= ?").run(now);
      db.prepare(`INSERT INTO auth_login_challenges (user_id, token_hash, created_at, expires_at, attempts, client_ip_hash)
        VALUES (?, ?, ?, ?, 0, ?)`)
        .run(asNumber(userRow["id"]), tokenHash(challengeToken), now, isoInMinutes(5), ipKey);
      logEvent(db, "otp_challenge_created", asNumber(userRow["id"]), username);
      return safeJson({ ok: true, requiresOtp: true, challengeToken, expiresInSeconds: 300 });
    }
    return issueSession(request, db, asNumber(userRow["id"]), username, ipKey);
  } finally {
    db.close();
  }
}

async function getStatus(request: Request): Promise<Response> {
  const context = await getAuthSession(request, false);
  if (!context) return safeJson({ authenticated: false }, 401, getCookie(request, SESSION_COOKIE) ? { "set-cookie": clearSessionCookie(request) } : {});
  return safeJson({ authenticated: true, sessionTimeoutMinutes: context.sessionTimeoutMinutes, forcePasswordChange: context.user.forcePasswordChange });
}

async function getMe(request: Request): Promise<Response> {
  const context = await getAuthSession(request);
  if (!context) return safeJson({ authenticated: false }, 200, getCookie(request, SESSION_COOKIE) ? { "set-cookie": clearSessionCookie(request) } : {});
  return safeJson({ authenticated: true, user: context.user, sessionTimeoutMinutes: context.sessionTimeoutMinutes });
}

async function logout(request: Request): Promise<Response> {
  const token = getCookie(request, SESSION_COOKIE);
  if (token) {
    const db = await openAuthDatabase();
    try {
      const hashedToken = tokenHash(token);
      const row = db.prepare("SELECT s.id, u.id AS user_id, u.username FROM auth_sessions s JOIN auth_users u ON u.id = s.user_id WHERE s.token_hash = ?").get(hashedToken);
      if (row) {
        db.prepare("UPDATE auth_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").run(new Date().toISOString(), asNumber(row["id"]));
        logEvent(db, "logout", asNumber(row["user_id"]), asString(row["username"]));
      }
    } finally { db.close(); }
  }
  return safeJson({ ok: true }, 200, { "set-cookie": clearSessionCookie(request) });
}

async function changePassword(request: Request): Promise<Response> {
  const context = await getAuthSession(request);
  if (!context) return safeJson({ error: "Sessão expirada. Entre novamente." }, 401, { "set-cookie": clearSessionCookie(request) });
  const payload = await readJsonBody(request);
  const newPassword = payload?.["newPassword"];
  if (!validPassword(newPassword)) return safeJson({ error: "A senha nova deve ter entre 12 e 128 caracteres." }, 400);
  const db = await openAuthDatabase();
  try {
    const row = db.prepare("SELECT * FROM auth_users WHERE id = ?").get(context.user.id);
    if (!row) return safeJson({ error: "Usuário não encontrado." }, 404);
    if (!asBoolean(row["force_password_change"])) {
      const currentPassword = payload?.["currentPassword"];
      if (typeof currentPassword !== "string" || !await verifyPassword(currentPassword, asString(row["password_salt"]), asString(row["password_hash"]))) {
        const failure = recordAccountFailure(db, row, "password_change_failed", "current_password_invalid");
        return wrongCredentialResponse(failure.locked);
      }
    }
    if (await verifyPassword(newPassword, asString(row["password_salt"]), asString(row["password_hash"]))) {
      return safeJson({ error: "Escolha uma senha diferente da senha atual." }, 400);
    }
    const password = await hashPassword(newPassword);
    const now = new Date().toISOString();
    db.prepare(`UPDATE auth_users SET password_salt = ?, password_hash = ?, force_password_change = 0,
      failed_attempts = 0, failed_window_started_at = NULL, locked_until = NULL, updated_at = ? WHERE id = ?`)
      .run(password.salt, password.hash, now, context.user.id);
    db.prepare("UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND id <> ? AND revoked_at IS NULL")
      .run(now, context.user.id, context.sessionId);
    logEvent(db, "password_changed", context.user.id, context.user.username, "self_service");
    return safeJson({ ok: true });
  } finally { db.close(); }
}

async function requireMaster(request: Request): Promise<{ context: AuthContext } | { response: Response }> {
  const context = await getAuthSession(request);
  if (!context) return { response: safeJson({ error: "Sessão expirada. Entre novamente.", code: "UNAUTHENTICATED" }, 401, { "set-cookie": clearSessionCookie(request) }) };
  if (context.user.forcePasswordChange) return { response: safeJson({ error: "Troque a senha inicial antes de continuar.", code: "PASSWORD_CHANGE_REQUIRED" }, 428) };
  if (context.user.role !== "master") return { response: safeJson({ error: "Apenas o usuário mestre pode administrar acessos.", code: "FORBIDDEN" }, 403) };
  return { context };
}

async function listUsers(request: Request): Promise<Response> {
  const auth = await requireMaster(request);
  if ("response" in auth) return auth.response;
  const db = await openAuthDatabase();
  try {
    const now = new Date().toISOString();
    const rows = db.prepare(`SELECT u.*,
      CASE WHEN EXISTS (
        SELECT 1 FROM auth_sessions s WHERE s.user_id = u.id AND s.revoked_at IS NULL
          AND s.absolute_expires_at > ? AND s.presence_at >= ? AND s.last_seen_at >= ?
      ) THEN 1 ELSE 0 END AS online
      FROM auth_users u
      ORDER BY CASE WHEN u.role = 'master' THEN 0 ELSE 1 END, u.display_name COLLATE NOCASE`)
      .all(now, isoInMinutes(-90), isoInMinutes(-getTimeoutMinutes(db)));
    return safeJson({ users: rows.map((row) => mapPublicUser(db, row)) });
  } finally { db.close(); }
}

async function savePermissions(db: SqliteDatabase, userId: number, permissionMap: PermissionMap) {
  db.prepare("DELETE FROM auth_user_permissions WHERE user_id = ?").run(userId);
  const insert = db.prepare("INSERT INTO auth_user_permissions (user_id, section_key, can_view) VALUES (?, ?, ?)");
  for (const key of ALL_PERMISSION_KEYS) insert.run(userId, key, permissionMap[key] ? 1 : 0);
}

async function createUser(request: Request): Promise<Response> {
  const auth = await requireMaster(request);
  if ("response" in auth) return auth.response;
  const payload = await readJsonBody(request);
  const username = normalizeUsername(payload?.["username"]);
  const displayName = normalizeDisplayName(payload?.["displayName"]);
  if (!username || !displayName) return safeJson({ error: "Informe usuário (3–32 caracteres: letras, números, ponto, hífen ou sublinhado) e nome (2–80 caracteres)." }, 400);
  if (!validPassword(payload?.["password"])) return safeJson({ error: "A senha temporária deve ter entre 12 e 128 caracteres." }, 400);
  const permissionMap = parsePermissionMap(payload?.["permissions"]);
  if (!permissionMap) return safeJson({ error: "A seleção de permissões contém valores inválidos." }, 400);
  const password = await hashPassword(payload["password"]);
  const db = await openAuthDatabase();
  try {
    const now = new Date().toISOString();
    db.exec("BEGIN IMMEDIATE");
    const result = db.prepare(`INSERT INTO auth_users (username, display_name, password_salt, password_hash, role, is_active, force_password_change, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'custom', 1, 1, ?, ?)`)
      .run(username, displayName, password.salt, password.hash, now, now);
    const id = Number(result.lastInsertRowid);
    await savePermissions(db, id, permissionMap);
    logEvent(db, "user_created", auth.context.user.id, auth.context.user.username, `user_id=${id};username=${username}`);
    db.exec("COMMIT");
    return safeJson({ ok: true, user: mapPublicUser(db, db.prepare("SELECT * FROM auth_users WHERE id = ?").get(id)!) }, 201);
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch { /* transaction may not have started */ }
    const message = error instanceof Error && /UNIQUE|constraint/i.test(error.message)
      ? "Esse nome de usuário já está cadastrado."
      : "Não foi possível criar o usuário.";
    return safeJson({ error: message }, 400);
  } finally { db.close(); }
}

async function updateUser(request: Request, idText: string): Promise<Response> {
  const auth = await requireMaster(request);
  if ("response" in auth) return auth.response;
  const id = Number(idText);
  if (!Number.isInteger(id) || id <= 0) return safeJson({ error: "Identificador de usuário inválido." }, 400);
  const payload = await readJsonBody(request);
  const displayName = payload?.["displayName"] === undefined ? undefined : normalizeDisplayName(payload["displayName"]);
  const permissions = payload?.["permissions"] === undefined ? undefined : parsePermissionMap(payload["permissions"]);
  const active = payload?.["active"] === undefined ? undefined : payload["active"] === true;
  if (payload?.["displayName"] !== undefined && !displayName) return safeJson({ error: "Nome inválido." }, 400);
  if (payload?.["permissions"] !== undefined && !permissions) return safeJson({ error: "Permissões inválidas." }, 400);
  const db = await openAuthDatabase();
  try {
    const target = db.prepare("SELECT * FROM auth_users WHERE id = ?").get(id);
    if (!target) return safeJson({ error: "Usuário não encontrado." }, 404);
    if (asString(target["role"]) === "master") return safeJson({ error: "A conta mestre não pode ser bloqueada nem ter permissões reduzidas por esta tela." }, 400);
    const now = new Date().toISOString();
    if (displayName !== undefined) db.prepare("UPDATE auth_users SET display_name = ?, updated_at = ? WHERE id = ?").run(displayName, now, id);
    if (active !== undefined) {
      db.prepare("UPDATE auth_users SET is_active = ?, updated_at = ? WHERE id = ?").run(active ? 1 : 0, now, id);
      if (!active) db.prepare("UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").run(now, id);
    }
    if (permissions) await savePermissions(db, id, permissions);
    logEvent(db, active === false ? "user_disabled" : active === true ? "user_enabled" : "user_updated", auth.context.user.id, auth.context.user.username, `user_id=${id}`);
    const updated = db.prepare("SELECT * FROM auth_users WHERE id = ?").get(id)!;
    return safeJson({ ok: true, user: mapPublicUser(db, updated) });
  } finally { db.close(); }
}

async function resetUserPassword(request: Request, idText: string): Promise<Response> {
  const auth = await requireMaster(request);
  if ("response" in auth) return auth.response;
  const id = Number(idText);
  const payload = await readJsonBody(request);
  if (!Number.isInteger(id) || id <= 0) return safeJson({ error: "Identificador inválido." }, 400);
  if (!validPassword(payload?.["password"])) return safeJson({ error: "A senha temporária deve ter entre 12 e 128 caracteres." }, 400);
  if (id === auth.context.user.id) return safeJson({ error: "Use a opção de troca de senha da própria conta." }, 400);
  const password = await hashPassword(payload["password"]);
  const db = await openAuthDatabase();
  try {
    const target = db.prepare("SELECT id, username, role FROM auth_users WHERE id = ?").get(id);
    if (!target) return safeJson({ error: "Usuário não encontrado." }, 404);
    if (asString(target["role"]) === "master") return safeJson({ error: "A senha mestre só pode ser alterada na própria conta autenticada." }, 400);
    const now = new Date().toISOString();
    db.prepare(`UPDATE auth_users SET password_salt = ?, password_hash = ?, force_password_change = 1,
      failed_attempts = 0, failed_window_started_at = NULL, locked_until = NULL, updated_at = ? WHERE id = ?`)
      .run(password.salt, password.hash, now, id);
    db.prepare("UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").run(now, id);
    logEvent(db, "user_password_reset", auth.context.user.id, auth.context.user.username, `user_id=${id}`);
    return safeJson({ ok: true });
  } finally { db.close(); }
}

async function unlockUser(request: Request, idText: string): Promise<Response> {
  const auth = await requireMaster(request);
  if ("response" in auth) return auth.response;
  const id = Number(idText);
  const db = await openAuthDatabase();
  try {
    const target = db.prepare("SELECT id, username FROM auth_users WHERE id = ?").get(id);
    if (!target) return safeJson({ error: "Usuário não encontrado." }, 404);
    const now = new Date().toISOString();
    db.prepare("UPDATE auth_users SET failed_attempts = 0, failed_window_started_at = NULL, locked_until = NULL, updated_at = ? WHERE id = ?").run(now, id);
    logEvent(db, "user_unlocked", auth.context.user.id, auth.context.user.username, `user_id=${id}`);
    return safeJson({ ok: true });
  } finally { db.close(); }
}

async function recordOtpFailure(db: SqliteDatabase, challenge: SqlRow, username: string): Promise<Response> {
  const now = new Date().toISOString();
  const update = db.prepare(`UPDATE auth_login_challenges
    SET attempts = attempts + 1, consumed_at = CASE WHEN attempts + 1 >= 5 THEN ? ELSE consumed_at END
    WHERE id = ? AND consumed_at IS NULL`).run(now, asNumber(challenge["id"]));
  if (update.changes !== 1) return safeJson({ error: "A etapa de autenticação já foi usada ou expirou. Entre novamente." }, 401);
  const latest = db.prepare("SELECT attempts FROM auth_login_challenges WHERE id = ?").get(asNumber(challenge["id"]));
  const attempts = asNumber(latest?.["attempts"]);
  const locked = attempts >= 5;
  const ipBlocked = recordIpFailure(db, asString(challenge["client_ip_hash"]));
  if (locked) {
    const userId = asNumber(challenge["user_id"]);
    db.prepare("UPDATE auth_users SET failed_attempts = ?, failed_window_started_at = ?, locked_until = ?, updated_at = ? WHERE id = ?")
      .run(ACCOUNT_FAILURE_LIMIT, now, isoInMinutes(ACCOUNT_LOCK_MINUTES), now, userId);
    db.prepare("UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL")
      .run(now, userId);
  }
  logEvent(db, "otp_login_failed", asNumber(challenge["user_id"]), username, `attempt=${attempts}`);
  return safeJson({ error: locked ? "Muitas tentativas de código. A conta foi bloqueada por 15 minutos." : "Código autenticador inválido ou expirado." }, locked || ipBlocked ? 429 : 401,
    locked || ipBlocked ? { "retry-after": String(ACCOUNT_LOCK_MINUTES * 60) } : {});
}

async function verifyLoginOtp(request: Request): Promise<Response> {
  const payload = await readJsonBody(request);
  const challengeToken = typeof payload?.["challengeToken"] === "string" ? payload["challengeToken"] : "";
  const code = typeof payload?.["code"] === "string" ? payload["code"].trim() : "";
  if (challengeToken.length < 32 || challengeToken.length > 100 || !code || code.length > 40) {
    return safeJson({ error: "Informe o código do autenticador." }, 400);
  }
  const db = await openAuthDatabase();
  try {
    const challenge = db.prepare(`SELECT c.*, u.* , c.id AS challenge_id, c.attempts AS challenge_attempts,
      c.client_ip_hash AS challenge_ip_hash, c.user_id AS challenge_user_id, c.token_hash AS challenge_token_hash,
      c.expires_at AS challenge_expires_at, c.consumed_at AS challenge_consumed_at
      FROM auth_login_challenges c JOIN auth_users u ON u.id = c.user_id WHERE c.token_hash = ?`)
      .get(tokenHash(challengeToken));
    if (!challenge || challenge["challenge_consumed_at"] != null || !isFutureIso(challenge["challenge_expires_at"]) || !asBoolean(challenge["is_active"])) {
      return safeJson({ error: "A etapa de autenticação expirou. Entre novamente com usuário e senha." }, 401);
    }
    if (isFutureIso(challenge["locked_until"])) return safeJson({ error: "Esta conta está temporariamente bloqueada. Aguarde 15 minutos." }, 429, { "retry-after": String(ACCOUNT_LOCK_MINUTES * 60) });

    const codeNormal = code.trim().toUpperCase();
    let matchedStep: number | null = null;
    let recoveryRow: SqlRow | undefined;
    if (/^\d{6}$/.test(codeNormal)) {
      try {
        const secret = await decryptOtpSecret(asString(challenge["otp_secret_enc"]));
        matchedStep = findValidTotpStep(secret, codeNormal, asNumber(challenge["otp_last_used_step"], -1));
      } catch { matchedStep = null; }
    } else {
      recoveryRow = db.prepare("SELECT id FROM auth_user_recovery_codes WHERE user_id = ? AND code_hash = ? AND used_at IS NULL")
        .get(asNumber(challenge["challenge_user_id"]), recoveryCodeHash(codeNormal));
    }
    if (matchedStep === null && !recoveryRow) {
      // Alias the challenge fields to avoid collisions with auth_users.attempts columns.
      const mappedChallenge: SqlRow = { id: challenge["challenge_id"], attempts: challenge["challenge_attempts"], user_id: challenge["challenge_user_id"], client_ip_hash: challenge["challenge_ip_hash"] };
      return await recordOtpFailure(db, mappedChallenge, asString(challenge["username"]));
    }

    const now = new Date().toISOString();
    db.exec("BEGIN IMMEDIATE");
    try {
      if (matchedStep !== null) {
        const used = db.prepare("UPDATE auth_users SET otp_last_used_step = ? WHERE id = ? AND otp_last_used_step < ?")
          .run(matchedStep, asNumber(challenge["challenge_user_id"]), matchedStep);
        if (used.changes !== 1) { db.exec("ROLLBACK"); return safeJson({ error: "Esse código já foi utilizado. Aguarde um novo código e tente novamente." }, 401); }
      }
      if (recoveryRow) {
        const used = db.prepare("UPDATE auth_user_recovery_codes SET used_at = ? WHERE id = ? AND used_at IS NULL")
          .run(now, asNumber(recoveryRow["id"]));
        if (used.changes !== 1) { db.exec("ROLLBACK"); return safeJson({ error: "Esse código de recuperação já foi utilizado." }, 401); }
      }
      const consumed = db.prepare("UPDATE auth_login_challenges SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL AND expires_at > ? AND attempts < 5")
        .run(now, asNumber(challenge["challenge_id"]), now);
      if (consumed.changes !== 1) { db.exec("ROLLBACK"); return safeJson({ error: "A etapa de autenticação já foi usada ou expirou. Entre novamente." }, 401); }
      const sessionResponse = issueSession(request, db, asNumber(challenge["challenge_user_id"]), asString(challenge["username"]), asString(challenge["challenge_ip_hash"]));
      db.exec("COMMIT");
      return sessionResponse;
    } catch (error) { try { db.exec("ROLLBACK"); } catch { /* transaction may already have ended */ } throw error; }
  } finally { db.close(); }
}

async function getOtpStatus(request: Request): Promise<Response> {
  const context = await getAuthSession(request);
  if (!context) return safeJson({ error: "Sessão expirada." }, 401, { "set-cookie": clearSessionCookie(request) });
  const db = await openAuthDatabase();
  try {
    const row = db.prepare("SELECT otp_enabled FROM auth_users WHERE id = ?").get(context.user.id);
    const recovery = db.prepare("SELECT COUNT(*) AS count FROM auth_user_recovery_codes WHERE user_id = ? AND used_at IS NULL").get(context.user.id);
    return safeJson({ enabled: asBoolean(row?.["otp_enabled"]), recoveryCodesRemaining: asNumber(recovery?.["count"]) });
  } finally { db.close(); }
}

async function setupOtp(request: Request): Promise<Response> {
  const context = await getAuthSession(request);
  if (!context) return safeJson({ error: "Sessão expirada. Entre novamente." }, 401, { "set-cookie": clearSessionCookie(request) });
  if (context.user.forcePasswordChange) return safeJson({ error: "Troque a senha antes de configurar o autenticador." }, 428);
  const payload = await readJsonBody(request);
  const currentPassword = typeof payload?.["currentPassword"] === "string" ? payload["currentPassword"] : "";
  const db = await openAuthDatabase();
  try {
    const user = db.prepare("SELECT * FROM auth_users WHERE id = ?").get(context.user.id);
    if (!user) return safeJson({ error: "Usuário não encontrado." }, 404);
    if (!await verifyPassword(currentPassword, asString(user["password_salt"]), asString(user["password_hash"]))) {
      const failure = recordAccountFailure(db, user, "otp_setup_password_failed", "current_password_invalid");
      return wrongCredentialResponse(failure.locked);
    }
    if (asBoolean(user["otp_enabled"])) return safeJson({ error: "O autenticador já está ativo. Desative-o antes de cadastrar um novo dispositivo." }, 409);
    const secret = base32Encode(randomBytes(20));
    const encrypted = await encryptOtpSecret(secret);
    const expiresAt = isoInMinutes(10);
    db.prepare("UPDATE auth_users SET otp_pending_secret_enc = ?, otp_pending_expires_at = ?, updated_at = ? WHERE id = ?")
      .run(encrypted, expiresAt, new Date().toISOString(), context.user.id);
    const label = encodeURIComponent(`AuditOps:${context.user.username}`);
    const uri = `otpauth://totp/${label}?secret=${secret}&issuer=AuditOps&algorithm=SHA1&digits=6&period=30`;
    logEvent(db, "otp_setup_started", context.user.id, context.user.username);
    return safeJson({ secret, otpauthUri: uri, expiresAt });
  } finally { db.close(); }
}

async function verifyOtpSetup(request: Request): Promise<Response> {
  const context = await getAuthSession(request);
  if (!context) return safeJson({ error: "Sessão expirada." }, 401, { "set-cookie": clearSessionCookie(request) });
  if (context.user.forcePasswordChange) return safeJson({ error: "Troque a senha antes de configurar o autenticador." }, 428);
  const payload = await readJsonBody(request);
  const code = typeof payload?.["code"] === "string" ? payload["code"].trim() : "";
  const db = await openAuthDatabase();
  try {
    const user = db.prepare("SELECT * FROM auth_users WHERE id = ?").get(context.user.id);
    if (!user || asBoolean(user["otp_enabled"]) || !asString(user["otp_pending_secret_enc"]) || !isFutureIso(user["otp_pending_expires_at"])) {
      return safeJson({ error: "A configuração expirou. Inicie novamente." }, 400);
    }
    const secret = await decryptOtpSecret(asString(user["otp_pending_secret_enc"]));
    const step = findValidTotpStep(secret, code, -1);
    if (step === null) {
      const failure = recordAccountFailure(db, user, "otp_setup_code_failed", "totp_invalid");
      return safeJson({ error: failure.locked ? "Muitas tentativas incorretas. A conta foi bloqueada por 15 minutos." : "Código inválido. Confira o horário do celular e tente novamente." },
        failure.locked ? 429 : 400, failure.locked ? { "retry-after": String(ACCOUNT_LOCK_MINUTES * 60) } : {});
    }
    const recoveryCodes = makeRecoveryCodes();
    const now = new Date().toISOString();
    db.exec("BEGIN IMMEDIATE");
    try {
      const activated = db.prepare(`UPDATE auth_users SET otp_secret_enc = otp_pending_secret_enc, otp_pending_secret_enc = NULL,
        otp_pending_expires_at = NULL, otp_enabled = 1, otp_last_used_step = ?, updated_at = ?
        WHERE id = ? AND otp_enabled = 0 AND otp_pending_expires_at > ?`)
        .run(step, now, context.user.id, now);
      if (activated.changes !== 1) { db.exec("ROLLBACK"); return safeJson({ error: "A configuração foi concluída em outra sessão ou expirou. Verifique o status do autenticador." }, 409); }
      db.prepare("DELETE FROM auth_user_recovery_codes WHERE user_id = ?").run(context.user.id);
      const insert = db.prepare("INSERT INTO auth_user_recovery_codes (user_id, code_hash, created_at) VALUES (?, ?, ?)");
      for (const recoveryCode of recoveryCodes) insert.run(context.user.id, recoveryCodeHash(recoveryCode), now);
      logEvent(db, "otp_enabled", context.user.id, context.user.username);
      db.exec("COMMIT");
    } catch (error) { try { db.exec("ROLLBACK"); } catch { /* no transaction */ } throw error; }
    return safeJson({ ok: true, enabled: true, recoveryCodes });
  } finally { db.close(); }
}

async function disableOtp(request: Request): Promise<Response> {
  const context = await getAuthSession(request);
  if (!context) return safeJson({ error: "Sessão expirada." }, 401, { "set-cookie": clearSessionCookie(request) });
  const payload = await readJsonBody(request);
  const currentPassword = typeof payload?.["currentPassword"] === "string" ? payload["currentPassword"] : "";
  const code = typeof payload?.["code"] === "string" ? payload["code"].trim().toUpperCase() : "";
  const db = await openAuthDatabase();
  try {
    const user = db.prepare("SELECT * FROM auth_users WHERE id = ?").get(context.user.id);
    if (!user || !asBoolean(user["otp_enabled"])) return safeJson({ error: "O autenticador não está ativo." }, 400);
    if (!await verifyPassword(currentPassword, asString(user["password_salt"]), asString(user["password_hash"]))) {
      const failure = recordAccountFailure(db, user, "otp_disable_password_failed", "current_password_invalid");
      return wrongCredentialResponse(failure.locked);
    }
    let step: number | null = null;
    let recoveryRow: SqlRow | undefined;
    if (/^\d{6}$/.test(code)) {
      const secret = await decryptOtpSecret(asString(user["otp_secret_enc"]));
      step = findValidTotpStep(secret, code, asNumber(user["otp_last_used_step"], -1));
    } else if (code) {
      recoveryRow = db.prepare("SELECT id FROM auth_user_recovery_codes WHERE user_id = ? AND code_hash = ? AND used_at IS NULL")
        .get(context.user.id, recoveryCodeHash(code));
    }
    if (step === null && !recoveryRow) {
      const failure = recordAccountFailure(db, user, "otp_disable_code_failed", "totp_or_recovery_invalid");
      return safeJson({ error: failure.locked ? "Muitas tentativas incorretas. A conta foi bloqueada por 15 minutos." : "Código atual ou código de recuperação inválido." },
        failure.locked ? 429 : 400, failure.locked ? { "retry-after": String(ACCOUNT_LOCK_MINUTES * 60) } : {});
    }
    const now = new Date().toISOString();
    db.exec("BEGIN IMMEDIATE");
    try {
      if (step !== null) {
        const used = db.prepare("UPDATE auth_users SET otp_last_used_step = ? WHERE id = ? AND otp_last_used_step < ?").run(step, context.user.id, step);
        if (used.changes !== 1) { db.exec("ROLLBACK"); return safeJson({ error: "Esse código já foi utilizado. Aguarde um novo código." }, 400); }
      }
      if (recoveryRow) {
        const used = db.prepare("UPDATE auth_user_recovery_codes SET used_at = ? WHERE id = ? AND used_at IS NULL").run(now, asNumber(recoveryRow["id"]));
        if (used.changes !== 1) { db.exec("ROLLBACK"); return safeJson({ error: "Esse código de recuperação já foi utilizado." }, 400); }
      }
      db.prepare(`UPDATE auth_users SET otp_secret_enc = NULL, otp_pending_secret_enc = NULL,
        otp_pending_expires_at = NULL, otp_enabled = 0, otp_last_used_step = 0, updated_at = ? WHERE id = ?`)
        .run(now, context.user.id);
      db.prepare("DELETE FROM auth_user_recovery_codes WHERE user_id = ?").run(context.user.id);
      logEvent(db, "otp_disabled", context.user.id, context.user.username);
      db.exec("COMMIT");
    } catch (error) { try { db.exec("ROLLBACK"); } catch { /* no transaction */ } throw error; }
    return safeJson({ ok: true, enabled: false });
  } finally { db.close(); }
}

async function updatePresence(request: Request): Promise<Response> {
  const context = await getAuthSession(request, false);
  if (!context) return safeJson({ error: "Sessão expirada." }, 401, { "set-cookie": clearSessionCookie(request) });
  const db = await openAuthDatabase();
  try {
    db.prepare("UPDATE auth_sessions SET presence_at = ? WHERE id = ? AND revoked_at IS NULL")
      .run(new Date().toISOString(), context.sessionId);
    return safeJson({ ok: true });
  } finally { db.close(); }
}

async function getAdminSettings(request: Request): Promise<Response> {
  const auth = await requireMaster(request);
  if ("response" in auth) return auth.response;
  const db = await openAuthDatabase();
  try { return safeJson({ sessionTimeoutMinutes: getTimeoutMinutes(db) }); }
  finally { db.close(); }
}
async function putAdminSettings(request: Request): Promise<Response> {
  const auth = await requireMaster(request);
  if ("response" in auth) return auth.response;
  const payload = await readJsonBody(request);
  const timeout = Number(payload?.["sessionTimeoutMinutes"]);
  if (![15, 20, 25, 30].includes(timeout)) return safeJson({ error: "Escolha um tempo de 15, 20, 25 ou 30 minutos." }, 400);
  const db = await openAuthDatabase();
  try {
    db.prepare("INSERT INTO auth_settings (setting_key, setting_value) VALUES ('session_timeout_minutes', ?) ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value")
      .run(String(timeout));
    logEvent(db, "session_timeout_changed", auth.context.user.id, auth.context.user.username, `${timeout} minutos`);
    return safeJson({ ok: true, sessionTimeoutMinutes: timeout });
  } finally { db.close(); }
}

export async function handleAuthApiRequest(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/\/+$/, "") || "/";
  try {
    if (path === "/api/auth/login" && request.method === "POST") return await login(request);
    if (path === "/api/auth/me" && request.method === "GET") return await getMe(request);
    if (path === "/api/auth/status" && request.method === "GET") return await getStatus(request);
    if (path === "/api/auth/logout" && request.method === "POST") return await logout(request);
    if (path === "/api/auth/activity" && request.method === "POST") {
      const context = await getAuthSession(request);
      return context ? safeJson({ ok: true }) : safeJson({ error: "Sessão expirada." }, 401, { "set-cookie": clearSessionCookie(request) });
    }
    if (path === "/api/auth/presence" && request.method === "POST") return await updatePresence(request);
    if (path === "/api/auth/otp/status" && request.method === "GET") return await getOtpStatus(request);
    if (path === "/api/auth/otp/setup" && request.method === "POST") return await setupOtp(request);
    if (path === "/api/auth/otp/verify-setup" && request.method === "POST") return await verifyOtpSetup(request);
    if (path === "/api/auth/otp/verify-login" && request.method === "POST") return await verifyLoginOtp(request);
    if (path === "/api/auth/otp/disable" && request.method === "POST") return await disableOtp(request);
    if (path === "/api/auth/change-password" && request.method === "POST") return await changePassword(request);
    if (path === "/api/admin/users" && request.method === "GET") return await listUsers(request);
    if (path === "/api/admin/users" && request.method === "POST") return await createUser(request);
    const resetMatch = path.match(/^\/api\/admin\/users\/(\d+)\/reset-password$/);
    if (resetMatch && request.method === "POST") return await resetUserPassword(request, resetMatch[1]!);
    const unlockMatch = path.match(/^\/api\/admin\/users\/(\d+)\/unlock$/);
    if (unlockMatch && request.method === "POST") return await unlockUser(request, unlockMatch[1]!);
    const userMatch = path.match(/^\/api\/admin\/users\/(\d+)$/);
    if (userMatch && request.method === "PATCH") return await updateUser(request, userMatch[1]!);
    if (path === "/api/admin/settings" && request.method === "GET") return await getAdminSettings(request);
    if (path === "/api/admin/settings" && request.method === "PUT") return await putAdminSettings(request);
    return safeJson({ error: "Endpoint de autenticação não encontrado." }, 404);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) return safeJson({ error: "A requisição excede o limite permitido de 1 MB." }, 413);
    console.error("AuditOps auth API:", error);
    return safeJson({ error: "Erro interno de autenticação. Consulte o log do servidor." }, 500);
  }
}

export function redirectLocation(request: Request, pathname: string, status = 302): Response {
  const url = new URL(request.url);
  url.pathname = pathname;
  url.search = "";
  return Response.redirect(url, status);
}
