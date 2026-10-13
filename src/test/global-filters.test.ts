import { describe, expect, it } from "vitest";
import { buildMockResult } from "@/lib/audit/mock";
import {
  applyGlobalAuditFilters,
  getGlobalCollaboratorRows,
  getGlobalCorridorRows,
  getGlobalFlowRows,
  getGlobalSectorRows,
} from "@/lib/audit/global-filters";
import type { AuditDetailRow } from "@/lib/audit/types";
import type { GlobalAuditFilters } from "@/lib/search-store";

const row = (overrides: Partial<AuditDetailRow> = {}): AuditDetailRow => ({
  codigo: "SKU-001",
  produto: "Café torrado",
  classeRaiz: "BAZAR",
  local: "Corredor 01",
  estoqueAtual: 10,
  situacao: "Sem Presença e Com Estoque",
  usuario: "123 (ANA LIMA)",
  auditadoEm: "08:15:00",
  diasSemVenda: 2,
  ...overrides,
});

const noFilters: GlobalAuditFilters = { setor: "", corredor: "", colaborador: "", situacao: "" };

function resultWithRows(rows: AuditDetailRow[]) {
  return {
    ...buildMockResult("2026-10-10"),
    auditoria: "Presença" as const,
    naoLidos: rows.filter((item) => item.situacao === "Sem Presença e Com Estoque").length,
    detalhesRegistros: rows,
    setores: [{ setor: "BAZAR", qtd: 2, representatividade: 100 }],
    corredores: [{ nome: "Corredor 01", qtd: 2 }],
    colaboradores: [{ nome: "123 (ANA LIMA)", qtd: 2 }],
  };
}

describe("global AuditOps filters", () => {
  const rows = [
    row({ codigo: "1", classeRaiz: "BAZAR", local: "Corredor 01", usuario: "123 (ANA LIMA)", auditadoEm: "08:15:00" }),
    row({ codigo: "2", produto: "Arroz integral", classeRaiz: "BAZAR", local: "Corredor 01", usuario: "123 (ANA LIMA)", auditadoEm: "08:15:10" }),
    row({ codigo: "3", produto: "Café moído", classeRaiz: "DPH", local: "Corredor 07", usuario: "456 (JOÃO SILVA)", auditadoEm: "08:16:00" }),
    row({ codigo: "4", produto: "Leite", classeRaiz: "DPH", local: "Corredor 07", usuario: "456 (JOÃO SILVA)", situacao: "Com Presença e Com Estoque", auditadoEm: "08:17:00" }),
  ];

  it("combines exact field filters and an accent-insensitive global search", () => {
    const result = applyGlobalAuditFilters(rows, {
      setor: "BAZAR",
      corredor: "Corredor 01",
      colaborador: "123 (ANA LIMA)",
      situacao: "Sem Presença e Com Estoque",
    }, "cafe");
    expect(result.map((item) => item.codigo)).toEqual(["1"]);
  });

  it("rebuilds sector, collaborator and corridor views from the filtered rows", () => {
    const result = resultWithRows(rows);
    const scoped: GlobalAuditFilters = { ...noFilters, setor: "DPH", situacao: "Sem Presença e Com Estoque" };
    expect(getGlobalSectorRows(result, scoped).map((item) => [item.setor, item.qtd])).toEqual([["DPH", 1]]);
    expect(getGlobalCollaboratorRows(result, scoped).map((item) => [item.nome, item.qtd])).toEqual([["456 (JOÃO SILVA)", 1]]);
    expect(getGlobalCorridorRows(result, scoped).map((item) => [item.nome, item.qtd])).toEqual([["Corredor 07", 1]]);
    expect(result.naoLidos).toBe(3);
  });

  it("rebuilds the reading flow only from rows matching the global recut", () => {
    const result = getGlobalFlowRows(rows, "2026-10-10", { ...noFilters, colaborador: "456 (JOÃO SILVA)" });
    expect(result).toEqual([
      { timestamp: "2026-10-10 08:16", leituras: 1 },
      { timestamp: "2026-10-10 08:17", leituras: 1 },
    ]);
  });

  it("does not mutate source records while filtering", () => {
    const before = structuredClone(rows);
    applyGlobalAuditFilters(rows, { ...noFilters, setor: "BAZAR" });
    expect(rows).toEqual(before);
  });
});
