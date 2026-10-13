import { useSyncExternalStore } from "react";
import { normalizeStoredAuditResult } from "./engine";
import { buildMockResult } from "./mock";
import type { AuditResult } from "./types";

const KEY = "auditops:last-result";
const SEED_KEY = "auditops:demo-seeded";
const HISTORY_KEY = "auditops:audit-history";
const HISTORY_LIMIT = 8;

export interface AuditHistoryEntry {
  id: string;
  savedAt: string;
  result: AuditResult;
}

let current: AuditResult | null = null;
let history: AuditHistoryEntry[] = [];
let hydrated = false;
let historyHydrated = false;
let storageListenerRegistered = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function safeParseHistory(raw: string | null): AuditHistoryEntry[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const entries = parsed.filter((item): item is AuditHistoryEntry =>
      Boolean(item && typeof item === "object" && "id" in item && "savedAt" in item && "result" in item),
    );
    return entries.map((entry) => ({ ...entry, result: normalizeStoredAuditResult(entry.result) }));
  } catch {
    return [];
  }
}

function hydrateHistory() {
  if (historyHydrated || typeof window === "undefined") return;
  historyHydrated = true;
  try {
    history = safeParseHistory(window.localStorage.getItem(HISTORY_KEY));
  } catch {
    history = [];
  }
}

function load() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      current = normalizeStoredAuditResult(JSON.parse(raw) as AuditResult);
    } else if (!window.localStorage.getItem(SEED_KEY)) {
      // First visit: seed the demo dataset so the dashboard is explorable.
      window.localStorage.setItem(SEED_KEY, "1");
      current = buildMockResult();
      window.localStorage.setItem(KEY, JSON.stringify(current));
    }
  } catch {
    current = null;
  }
  hydrateHistory();
  emit();
}

function persistHistory() {
  if (typeof window === "undefined") return;
  // Browser storage is limited. Older snapshots are dropped only if the quota is exceeded.
  while (history.length > 0) {
    try {
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
      return;
    } catch {
      history = history.slice(0, -1);
    }
  }
  try {
    window.localStorage.removeItem(HISTORY_KEY);
  } catch {
    /* storage unavailable */
  }
}

function addHistoryEntry(result: AuditResult) {
  hydrateHistory();
  const entry: AuditHistoryEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    savedAt: new Date().toISOString(),
    result,
  };
  history = [entry, ...history].slice(0, HISTORY_LIMIT);
  persistHistory();
}

/** Replace the browser view with the latest shared result from the SQL server.
 * This intentionally does not persist per-user localStorage or append a duplicate local history entry.
 */
export function setSharedAuditResult(result: AuditResult | null) {
  current = result ? normalizeStoredAuditResult(result) : null;
  hydrated = true;
  emit();
}

export function setAuditResult(result: AuditResult) {
  current = result;
  hydrated = true;
  hydrateHistory();
  let saved = false;
  try {
    const serialized = JSON.stringify(result);
    while (!saved) {
      try {
        window.localStorage.setItem(KEY, serialized);
        window.localStorage.setItem(SEED_KEY, "1");
        saved = true;
      } catch {
        if (history.length === 0) break;
        history = history.slice(0, -1);
        persistHistory();
      }
    }
  } catch {
    /* storage unavailable: keep in memory only */
  }
  addHistoryEntry(result);
  emit();
}

export function loadDemoResult() {
  setAuditResult(buildMockResult());
}


/** Removes spreadsheet values cached in this browser when a session ends or the login is shown. */
export function clearSensitiveAuditCache() {
  current = null;
  history = [];
  hydrated = true;
  historyHydrated = true;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(KEY);
      window.localStorage.removeItem(HISTORY_KEY);
    } catch {
      /* browser storage may be unavailable */
    }
  }
  emit();
}

export function clearAuditResult() {
  current = null;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  emit();
}

export function removeAuditHistoryEntry(id: string) {
  hydrateHistory();
  history = history.filter((entry) => entry.id !== id);
  persistHistory();
  emit();
}

export function clearAuditHistory() {
  history = [];
  historyHydrated = true;
  try {
    window.localStorage.removeItem(HISTORY_KEY);
  } catch {
    /* ignore */
  }
  emit();
}

function registerStorageListener() {
  if (typeof window === "undefined" || storageListenerRegistered) return;
  storageListenerRegistered = true;
  window.addEventListener("storage", (event) => {
    if (event.key === KEY) {
      current = event.newValue ? (() => {
        try { return normalizeStoredAuditResult(JSON.parse(event.newValue) as AuditResult); } catch { return null; }
      })() : null;
      hydrated = true;
    }
    if (event.key === HISTORY_KEY) {
      history = safeParseHistory(event.newValue);
      historyHydrated = true;
    }
    if (event.key === KEY || event.key === HISTORY_KEY) emit();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  load();
  hydrateHistory();
  registerStorageListener();
  return () => listeners.delete(listener);
}

const getSnapshot = () => current;
const getHistorySnapshot = () => history;
const EMPTY_HISTORY: AuditHistoryEntry[] = [];
const getServerSnapshot = () => null;
const getHistoryServerSnapshot = () => EMPTY_HISTORY;

export function useAuditResult() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useAuditHistory() {
  return useSyncExternalStore(subscribe, getHistorySnapshot, getHistoryServerSnapshot);
}

export function useAuditHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => hydrated,
    () => false,
  );
}
