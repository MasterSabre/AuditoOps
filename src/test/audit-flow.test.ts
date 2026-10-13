import { describe, expect, it } from "vitest";
import { computeAudit, normalizeStoredAuditResult } from "@/lib/audit/engine";
import { normalizeAuditRow } from "@/lib/audit/normalize";
import type { RawRow } from "@/lib/audit/types";

describe("reading flow and Excel time normalization", () => {
  it("normalizes the second duplicate Auditado em header produced by XLSX exports", () => {
    const row = normalizeAuditRow({
      "Auditado em": 46303,
      "Auditado em_1": 0.664212962962963,
      "Usuário": "7251955 (LUCAS AUGUSTO BARBOSA PENA)",
    } as unknown as RawRow);

    expect(row["Auditado em.1"]).toBe(0.664212962962963);
    expect("Auditado em_1" in row).toBe(false);
  });

  it("groups Excel time fractions by minute and keeps a readable time in details", () => {
    const result = computeAudit({
      auditoria: "Etiqueta",
      sku: 10,
      dataAuditoria: "2026-10-10",
      origem: "mv2cy9y0.xlsx",
      rows: [
        { Usuário: "7251955 (LUCAS AUGUSTO BARBOSA PENA)", "Auditado em.1": 0.664212962962963, Situação: "Atualizado" },
        { Usuário: "6921558 (KAUA NEVES DE LIRA)", "Auditado em.1": 0.6645, Situação: "Atualizado" },
        { Usuário: "6921558 (KAUA NEVES DE LIRA)", "Auditado em.1": 0.665, Situação: "Atualizado" },
      ],
    });

    expect(result.fluxo).toEqual([
      { timestamp: "2026-10-10 15:56", leituras: 2 },
      { timestamp: "2026-10-10 15:57", leituras: 1 },
    ]);
    expect(result.detalhesRegistros?.[0]?.auditadoEm).toBe("15:56:28");
    expect(result.colaboradores[0]?.qtd).toBe(2);
  });

  it("keeps textual HH:mm:ss times working", () => {
    const result = computeAudit({
      auditoria: "Presença",
      sku: 1,
      dataAuditoria: "2026-10-10",
      origem: "text-time.xlsx",
      rows: [
        { Usuário: "matricula (Nome Completo)", "Auditado em.1": "09:30:22", Situação: "Com Presença e Com Estoque" },
      ],
    });

    expect(result.fluxo).toEqual([{ timestamp: "2026-10-10 09:30", leituras: 1 }]);
    expect(result.detalhesRegistros?.[0]?.auditadoEm).toBe("09:30:22");
  });

  it("repairs a previously saved result automatically without changing its audit KPIs", () => {
    const computed = computeAudit({
      auditoria: "Etiqueta",
      sku: 10,
      dataAuditoria: "2026-10-10",
      origem: "older-saved-audit.xlsx",
      rows: [
        { Usuário: "7251955 (LUCAS AUGUSTO BARBOSA PENA)", "Auditado em.1": 0.664212962962963, Situação: "Atualizado" },
      ],
    });
    const oldSavedResult = {
      ...computed,
      fluxo: [],
      detalhesRegistros: computed.detalhesRegistros?.map((row) => ({
        ...row,
        auditadoEm: "0.664212962962963",
      })),
    };

    const migrated = normalizeStoredAuditResult(oldSavedResult);
    expect(migrated.fluxo).toEqual([{ timestamp: "2026-10-10 15:56", leituras: 1 }]);
    expect(migrated.detalhesRegistros?.[0]?.auditadoEm).toBe("15:56:28");
    expect(migrated.naoLidos).toBe(computed.naoLidos);
    expect(migrated.parcial).toBe(computed.parcial);
    expect(migrated.colaboradores).toEqual(computed.colaboradores);
  });
});

describe("rupture audit type", () => {
  it("counts explicit rupture situations while keeping ordinary audit rules intact", () => {
    const result = computeAudit({
      auditoria: "Ruptura",
      sku: 4,
      dataAuditoria: "2026-10-14",
      origem: "ruptura.xlsx",
      rows: [
        { Código: "1", Situação: "Ruptura", "Classe de Produto Raiz": "ALTO GIRO", Local: "Corredor 01", "Estoque atual": 10 },
        { Código: "2", Situação: "Sem estoque", "Classe de Produto Raiz": "ALTO GIRO", Local: "Corredor 02", "Estoque atual": 0 },
        { Código: "3", Situação: "Sem ruptura", "Classe de Produto Raiz": "BAZAR", Local: "Corredor 03", "Estoque atual": 2 },
        { Código: "4", Situação: "Lido sem estoque", "Classe de Produto Raiz": "BAZAR", Local: "Corredor 04", "Estoque atual": 0 },
      ],
    });

    expect(result.naoLidos).toBe(2);
    expect(result.parcial).toBe(50);
    expect(result.lidosComEstoque).toBe(1);
    expect(result.lidosSemEstoque).toBe(1);
    expect(result.produtosSemLeitura.map((item) => item.codigo)).toEqual(["1", "2"]);
    expect(result.setores.find((item) => item.setor === "ALTO GIRO")?.qtd).toBe(2);
  });
});
