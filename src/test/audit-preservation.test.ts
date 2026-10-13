import { describe, expect, it } from "vitest";
import { computeAudit } from "@/lib/audit/engine";

describe("Original AuditOps calculations remain unchanged", () => {
  it("keeps unread percentage and presence categories", () => {
    const result = computeAudit({
      auditoria: "Presença", sku: 10, dataAuditoria: "2026-10-10", origem: "verification.xlsx",
      rows: [
        { Código: "101", Produto: "Arroz", Situação: "Sem Presença e Com Estoque", "Estoque atual": 150, "Classe de Produto Raiz": "ALTO GIRO", Local: "Corredor 01", "Dias sem venda": 0 },
        { Código: "102", Produto: "Feijão", Situação: "Sem Presença e Com Estoque", "Estoque atual": 80, "Classe de Produto Raiz": "SECA SALGADA", Local: "Corredor 02" },
        { Situação: "Com Presença e Com Estoque", Usuário: "ana", "Auditado em.1": "09:30:00" },
        { Situação: "Com Presença e Sem Estoque", Usuário: "bruno" },
        { Situação: "Lido não pertence", Usuário: "ana" },
      ],
    });
    expect(result.naoLidos).toBe(2);
    expect(result.parcial).toBe(20);
    expect(result.lidosComEstoque).toBe(1);
    expect(result.lidosSemEstoque).toBe(1);
    expect(result.lidosNaoPertence).toBe(1);
    expect(result.colaboradoresAtivos).toBe(2);
    expect(result.produtosSemLeitura.map(row => row.codigo)).toEqual(["101", "102"]);
    expect(result.detalhesRegistros).toHaveLength(5);
    expect(result.detalhesRegistros?.filter(row => row.situacao === "Sem Presença e Com Estoque")).toHaveLength(2);
    expect(result.detalhesRegistros?.find(row => row.codigo === "101")?.diasSemVenda).toBe(0);
    expect(result.semLeituraComVendas.map(row => row.codigo)).toEqual(["101"]);
    expect(result.setores.find(row => row.setor === "ALTO GIRO")?.representatividade).toBe(50);
  });

  it("keeps the original label-audit stock complement", () => {
    const result = computeAudit({ auditoria: "Etiqueta", sku: 10, dataAuditoria: "2026-10-10", origem: "verification.xlsx", rows: [
      { Situação: "Não lidos com estoque", "Estoque atual": 20 },
      { Situação: "Desatualizado" },
      { Situação: "Lido sem estoque" },
    ] });
    expect(result.naoLidos).toBe(1);
    expect(result.parcial).toBe(10);
    expect(result.lidosComEstoque).toBe(9);
    expect(result.etiquetasDesatualizadas).toBe(1);
    expect(result.lidosSemEstoque).toBe(1);
  });
});