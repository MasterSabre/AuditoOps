import { describe, expect, it } from "vitest";
import { buildMockResult } from "@/lib/audit/mock";
import {
  getDashboardDetailRows,
  getRowsForSkuSector,
  getSkuSectorCounts,
} from "@/lib/audit/dashboard-details";
import type { AuditDetailRow } from "@/lib/audit/types";

const row = (overrides: Partial<AuditDetailRow> = {}): AuditDetailRow => ({
  codigo: "SKU-001",
  produto: "Produto de teste",
  classeRaiz: "BAZAR",
  local: "Corredor 01",
  estoqueAtual: 10,
  situacao: "Com Presença e Com Estoque",
  usuario: "matricula 123",
  auditadoEm: "08:15:00",
  diasSemVenda: 2,
  ...overrides,
});

function resultWithRows(rows: AuditDetailRow[], auditoria: "Presença" | "Etiqueta" = "Presença") {
  return { ...buildMockResult("2026-10-10"), auditoria, detalhesRegistros: rows };
}

describe("dashboard KPI drill-downs", () => {
  it("opens the original pending situation for both the no-read and partial cards", () => {
    const rows = [
      row({ codigo: "1", situacao: "Sem Presença e Com Estoque" }),
      row({ codigo: "2", situacao: "Com Presença e Com Estoque" }),
      row({ codigo: "3", situacao: "Lido não pertence" }),
    ];
    const result = resultWithRows(rows);
    expect(getDashboardDetailRows(result, "nao-lidos").map((item) => item.codigo)).toEqual(["1"]);
    expect(getDashboardDetailRows(result, "parcial").map((item) => item.codigo)).toEqual(["1"]);
  });

  it("separates read-with-stock, read-without-stock, and does-not-belong rows", () => {
    const rows = [
      row({ codigo: "1", situacao: "Com Presença e Com Estoque" }),
      row({ codigo: "2", situacao: "Com Presença e Sem Estoque" }),
      row({ codigo: "3", situacao: "Lido não pertence" }),
    ];
    const result = resultWithRows(rows);
    expect(getDashboardDetailRows(result, "lidos-com-estoque").map((item) => item.codigo)).toEqual(["1"]);
    expect(getDashboardDetailRows(result, "lidos-sem-estoque").map((item) => item.codigo)).toEqual(["2"]);
    expect(getDashboardDetailRows(result, "lidos-nao-pertence").map((item) => item.codigo)).toEqual(["3"]);
  });

  it("selects outdated labels and explicit label records without changing the existing KPI formula", () => {
    const rows = [
      row({ codigo: "1", situacao: "Desatualizado" }),
      row({ codigo: "2", situacao: "Lido sem estoque" }),
      row({ codigo: "3", situacao: "Lido com estoque" }),
      row({ codigo: "4", situacao: "Não lidos com estoque" }),
    ];
    const result = resultWithRows(rows, "Etiqueta");
    expect(getDashboardDetailRows(result, "etiquetas-desatualizadas").map((item) => item.codigo)).toEqual(["1"]);
    expect(getDashboardDetailRows(result, "lidos-sem-estoque").map((item) => item.codigo)).toEqual(["2"]);
    expect(getDashboardDetailRows(result, "lidos-com-estoque").map((item) => item.codigo)).toEqual(["3"]);
    expect(getDashboardDetailRows(result, "nao-lidos").map((item) => item.codigo)).toEqual(["4"]);
  });

  it("recovers the read-with-stock detail for Etiqueta exports without explicit positive status", () => {
    const rows = [
      row({ codigo: "1", situacao: "Desatualizado", estoqueAtual: 18 }),
      row({ codigo: "2", situacao: "Não lidos com estoque", estoqueAtual: 32 }),
      row({ codigo: "3", situacao: "Lido sem estoque", estoqueAtual: 0 }),
      row({ codigo: "4", situacao: "Lido não pertence", estoqueAtual: 12 }),
      row({ codigo: "5", situacao: "Etiqueta atualizada", estoqueAtual: 7 }),
    ];
    const result = resultWithRows(rows, "Etiqueta");
    expect(getDashboardDetailRows(result, "lidos-com-estoque").map((item) => item.codigo)).toEqual(["1", "5"]);
  });

  it("summarizes all rows by product-root class and exposes each class product list", () => {
    const rows = [
      row({ codigo: "A", classeRaiz: "BAZAR" }),
      row({ codigo: "A", classeRaiz: "BAZAR", local: "Corredor 02" }),
      row({ codigo: "B", classeRaiz: "BAZAR" }),
      row({ codigo: "C", classeRaiz: "DPH" }),
      row({ codigo: "", classeRaiz: "" }),
    ];
    const counts = getSkuSectorCounts(rows);
    expect(counts.find((item) => item.setor === "BAZAR")).toMatchObject({
      quantidadeItens: 2,
      quantidadeRegistros: 3,
      participacaoRegistros: 60,
    });
    expect(counts.find((item) => item.setor === "Sem classe informada")).toMatchObject({
      quantidadeItens: 1,
      quantidadeRegistros: 1,
    });
    expect(getRowsForSkuSector(rows, "BAZAR")).toHaveLength(3);
    expect(getRowsForSkuSector(rows, "Sem classe informada")).toHaveLength(1);
  });
});
