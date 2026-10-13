import { describe, expect, it } from "vitest";
import { getUniqueSkuDetailRows, toExportFilename } from "@/lib/audit/export-utils";
import type { AuditDetailRow } from "@/lib/audit/types";

const row = (codigo: string, produto: string): AuditDetailRow => ({
  codigo,
  produto,
  classeRaiz: "SECA DOCE",
  local: "A1",
  estoqueAtual: 2,
  situacao: "Com Presença e Com Estoque",
  usuario: "Operador",
  auditadoEm: "08:45",
  diasSemVenda: 0,
});

describe("report export utilities", () => {
  it("exports a single row for each SKU code and ignores empty codes", () => {
    const rows = [row("001", "Produto A"), row("001", "Produto A duplicado"), row("002", "Produto B"), row("", "Sem código")];
    expect(getUniqueSkuDetailRows(rows).map((item) => item.codigo)).toEqual(["001", "002"]);
  });

  it("creates a readable, safe filename", () => {
    expect(toExportFilename("Etiquetas desatualizadas · 12/10/2026")).toBe("etiquetas-desatualizadas-12-10-2026");
  });
});
