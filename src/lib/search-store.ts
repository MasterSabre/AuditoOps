import { useSyncExternalStore } from "react";

export interface GlobalAuditFilters {
  setor: string;
  corredor: string;
  colaborador: string;
  situacao: string;
}

export const EMPTY_GLOBAL_AUDIT_FILTERS: GlobalAuditFilters = {
  setor: "",
  corredor: "",
  colaborador: "",
  situacao: "",
};

let query = "";
let globalFilters: GlobalAuditFilters = { ...EMPTY_GLOBAL_AUDIT_FILTERS };
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function setSearchQuery(next: string) {
  if (query === next) return;
  query = next;
  emit();
}

export function setGlobalAuditFilters(next: Partial<GlobalAuditFilters>) {
  const updated = { ...globalFilters, ...next };
  if (Object.keys(updated).every((key) => updated[key as keyof GlobalAuditFilters] === globalFilters[key as keyof GlobalAuditFilters])) return;
  globalFilters = updated;
  emit();
}

export function clearGlobalAuditFilters() {
  globalFilters = { ...EMPTY_GLOBAL_AUDIT_FILTERS };
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSearchQuery() {
  return useSyncExternalStore(
    subscribe,
    () => query,
    () => "",
  );
}

export function useGlobalAuditFilters() {
  return useSyncExternalStore(
    subscribe,
    () => globalFilters,
    () => EMPTY_GLOBAL_AUDIT_FILTERS,
  );
}
