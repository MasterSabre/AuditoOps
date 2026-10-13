import { describe, expect, it } from "vitest";
import { compareAuditMetrics, compareSectorCounts, getPreviousSameTypeAudit } from "@/lib/audit/comparison";
import type { SqlAuditEntry } from "@/lib/audit/database-client";

function audit(overrides: Partial<SqlAuditEntry> & Pick<SqlAuditEntry, "id" | "dataAuditoria" | "auditType">): SqlAuditEntry {
  return {
    id: overrides.id,
    scheduleId: null,
    kind: "processed",
    dataAuditoria: overrides.dataAuditoria,
    auditType: overrides.auditType,
    status: "Fechada",
    sourceFile: `auditoria-${overrides.id}.xlsx`,
    processedAt: `${overrides.dataAuditoria}T12:00:00.000Z`,
    windowStart: null,
    windowEnd: null,
    sku: 100,
    naoLidos: 4,
    lidosComEstoque: 80,
    lidosSemEstoque: 10,
    lidosNaoPertence: 2,
    etiquetasDesatualizadas: 3,
    colaboradoresAtivos: 5,
    parcial: 4,
    detailsCount: 100,
    result: null,
    ...overrides,
  };
}

describe("automatic audit comparisons", () => {
  it("finds the previous audit of the same type, not the previous date of another category", () => {
    const monday = audit({ id: 1, dataAuditoria: "2026-10-05", auditType: "Etiqueta" });
    const tuesday = audit({ id: 2, dataAuditoria: "2026-10-06", auditType: "Presença" });
    const nextMonday = audit({ id: 3, dataAuditoria: "2026-10-12", auditType: "Etiqueta" });
    expect(getPreviousSameTypeAudit(nextMonday, [tuesday, nextMonday, monday])?.id).toBe(1);
    expect(getPreviousSameTypeAudit(monday, [monday, tuesday])).toBeNull();
  });

  it("computes absolute differences and percent-change where a baseline exists", () => {
    const previous = audit({ id: 1, dataAuditoria: "2026-10-05", auditType: "Etiqueta", sku: 100, naoLidos: 10, parcial: 10 });
    const current = audit({ id: 2, dataAuditoria: "2026-10-12", auditType: "Etiqueta", sku: 120, naoLidos: 5, parcial: 4.17 });
    const metrics = compareAuditMetrics(current, previous);
    expect(metrics.find((row) => row.key === "sku")).toMatchObject({ currentValue: 120, previousValue: 100, delta: 20, percentChange: 20 });
    expect(metrics.find((row) => row.key === "naoLidos")).toMatchObject({ delta: -5, lowerIsBetter: true });
    expect(metrics.find((row) => row.key === "parcial")).toMatchObject({ delta: -5.83, percentChange: null });
    expect(metrics.some((row) => row.key === "etiquetasDesatualizadas")).toBe(true);
  });

  it("only compares label-specific metrics for Etiqueta and reports sector changes", () => {
    const previous = audit({ id: 1, dataAuditoria: "2026-10-06", auditType: "Presença" });
    expect(compareAuditMetrics(previous, previous).some((row) => row.key === "etiquetasDesatualizadas")).toBe(false);
    expect(compareSectorCounts([{ setor: "Bebidas", qtd: 8, representatividade: 0.2 }], [{ setor: "Bebidas", qtd: 3, representatividade: 0.1 }])).toEqual([
      { name: "Bebidas", current: 8, previous: 3, delta: 5 },
    ]);
  });
});
