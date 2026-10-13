import {
  SETORES,
  SITUACAO_PENDENCIA,
  type AuditDetailRow,
  type AuditResult,
  type AuditType,
  type FluxoPoint,
  type NamedCount,
  type ProductRow,
  type RawRow,
  type SetorRow,
} from "./types";

const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const parsed = Number(v.replace(/\./g, "").replace(",", "."));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const str = (v: unknown): string => (v == null ? "" : String(v).trim());

function isRupturePending(value: string): boolean {
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  if (normalized.includes("lido sem estoque") || normalized.includes("sem ruptura") || normalized.includes("conforme") || normalized.includes("sem ocorrencia")) return false;
  return normalized.includes("ruptura") || normalized.includes("sem estoque") || normalized.includes("nao encontrado");
}

const pad2 = (value: number): string => String(value).padStart(2, "0");

/** Convert Excel time fractions and common textual time formats to HH:mm:ss. */
export function formatAuditTime(value: unknown): string {
  if (value == null || value === "") return "";

  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return `${pad2(value.getHours())}:${pad2(value.getMinutes())}:${pad2(value.getSeconds())}`;
  }

  const raw = String(value).trim();
  const textTime = raw.match(/(?:^|\s)(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(?:\s|$)/);
  if (textTime) {
    const hours = Number(textTime[1]);
    const minutes = Number(textTime[2]);
    const seconds = Number(textTime[3] ?? 0);
    if (hours <= 23 && minutes <= 59 && seconds <= 59) {
      return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
    }
  }

  // In XLSX, a time-only cell is stored as a fraction of a 24-hour day.
  const numeric = typeof value === "number"
    ? value
    : (/^\d+(?:\.\d+)?$/.test(raw) ? Number(raw) : Number.NaN);
  if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 100000) {
    const dayFraction = numeric % 1;
    const totalSeconds = Math.round(dayFraction * 86400) % 86400;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
  }

  return "";
}

export interface ComputeInput {
  auditoria: AuditType;
  sku: number;
  dataAuditoria: string;
  origem: string;
  rows: RawRow[];
}

export function computeAudit({
  auditoria,
  sku,
  dataAuditoria,
  origem,
  rows,
}: ComputeInput): AuditResult {
  const pendencia = SITUACAO_PENDENCIA[auditoria];

  let naoLidos = 0;
  let lidosComEstoque = 0;
  let lidosSemEstoque = 0;
  let lidosNaoPertence = 0;
  let etiquetasDesatualizadas = 0;

  const produtosSemLeitura: ProductRow[] = [];
  const semLeituraComVendas: ProductRow[] = [];
  const setorCount = new Map<string, number>(SETORES.map((s) => [s, 0]));
  const colaboradorCount = new Map<string, number>();
  const corredorCount = new Map<string, number>();
  const fluxoCount = new Map<string, number>();
  const detalhesRegistros: AuditDetailRow[] = [];
  const usuarios = new Set<string>();

  for (const row of rows) {
    const situacao = str(row["Situação"]);
    const classe = str(row["Classe de Produto Raiz"]);
    const local = str(row.Local);
    const usuario = str(row["Usuário"]);
    const estoque = num(row["Estoque atual"]);
    const horaAuditoria = formatAuditTime(row["Auditado em.1"]);
    detalhesRegistros.push({
      codigo: str(row["Código"]),
      produto: str(row.Produto),
      classeRaiz: classe,
      local,
      estoqueAtual: estoque,
      situacao,
      usuario,
      auditadoEm: horaAuditoria,
      diasSemVenda: num(row["Dias sem venda"]),
    });

    if (situacao === "Lido não pertence") {
      lidosNaoPertence += 1;
    } else if (auditoria === "Presença") {
      if (situacao === "Sem Presença e Com Estoque") naoLidos += 1;
      else if (situacao === "Com Presença e Com Estoque") lidosComEstoque += 1;
      else if (situacao === "Com Presença e Sem Estoque") lidosSemEstoque += 1;
    } else if (auditoria === "Etiqueta") {
      if (situacao === "Não lidos com estoque") naoLidos += 1;
      else if (situacao === "Lido sem estoque") lidosSemEstoque += 1;
      else if (situacao === "Desatualizado") etiquetasDesatualizadas += 1;
    } else {
      // Ruptura is a separate scheduled audit. Keep the existing Presença/Etiqueta
      // calculations unchanged; for Ruptura, count only explicit rupture/pending labels.
      const normalizedSituation = situacao.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-BR");
      if (normalizedSituation.includes("lido sem estoque")) {
        lidosSemEstoque += 1;
      } else if (normalizedSituation.includes("sem ruptura") || normalizedSituation.includes("conforme") || normalizedSituation.includes("sem ocorrencia")) {
        lidosComEstoque += 1;
      } else if (normalizedSituation.includes("ruptura") || normalizedSituation.includes("sem estoque") || normalizedSituation.includes("nao encontrado")) {
        naoLidos += 1;
      } else if (normalizedSituation.includes("com estoque")) {
        lidosComEstoque += 1;
      }
    }

    const isPendingSituation = auditoria === "Ruptura" ? isRupturePending(situacao) : situacao === pendencia;
    if (isPendingSituation) {
      if (setorCount.has(classe)) setorCount.set(classe, (setorCount.get(classe) ?? 0) + 1);
      if (local) corredorCount.set(local, (corredorCount.get(local) ?? 0) + 1);
    }

    if (usuario) {
      usuarios.add(usuario);
      colaboradorCount.set(usuario, (colaboradorCount.get(usuario) ?? 0) + 1);
      const hora = horaAuditoria.slice(0, 5);
      if (/^\d{2}:\d{2}$/.test(hora)) {
        const ts = `${dataAuditoria} ${hora}`;
        fluxoCount.set(ts, (fluxoCount.get(ts) ?? 0) + 1);
      }
    }

    if (estoque !== null) {
      const item: ProductRow = {
        codigo: str(row["Código"]),
        produto: str(row.Produto),
        classeRaiz: classe,
        local,
        estoqueAtual: estoque,
      };
      if (situacao === "Não lidos com estoque" || situacao === "Sem Presença e Com Estoque" || (auditoria === "Ruptura" && isRupturePending(situacao))) {
        produtosSemLeitura.push(item);
        if (
          auditoria === "Presença" &&
          situacao === "Sem Presença e Com Estoque" &&
          num(row["Dias sem venda"]) === 0
        ) {
          semLeituraComVendas.push(item);
        }
      }
    }
  }

  if (auditoria === "Etiqueta") {
    lidosComEstoque = sku - naoLidos;
  }

  const parcial = sku > 0 ? Number(((naoLidos / sku) * 100).toFixed(2)) : 0;

  const setores: SetorRow[] = [...setorCount.entries()]
    .map(([setor, qtd]) => ({
      setor,
      qtd,
      representatividade: naoLidos > 0 ? Number(((qtd / naoLidos) * 100).toFixed(2)) : 0,
    }))
    .sort((a, b) => b.qtd - a.qtd);

  const toRanking = (map: Map<string, number>): NamedCount[] =>
    [...map.entries()].map(([nome, qtd]) => ({ nome, qtd })).sort((a, b) => b.qtd - a.qtd);

  const fluxo: FluxoPoint[] = [...fluxoCount.entries()]
    .map(([timestamp, leituras]) => ({ timestamp, leituras }))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  return {
    auditoria,
    sku,
    dataAuditoria,
    origem,
    processadoEm: new Date().toISOString(),
    naoLidos,
    lidosComEstoque,
    lidosSemEstoque,
    lidosNaoPertence,
    etiquetasDesatualizadas,
    colaboradoresAtivos: usuarios.size,
    parcial,
    produtosSemLeitura: [...produtosSemLeitura]
      .sort((a, b) => b.estoqueAtual - a.estoqueAtual)
      .slice(0, 30),
    semLeituraComVendas: [...semLeituraComVendas].sort((a, b) => b.estoqueAtual - a.estoqueAtual),
    setores,
    colaboradores: toRanking(colaboradorCount),
    corredores: toRanking(corredorCount).slice(0, 15),
    fluxo,
    detalhesRegistros,
  };
}

/** Repairs supplemental timestamps in locally saved snapshots without changing audit KPIs. */
export function normalizeStoredAuditResult(result: AuditResult): AuditResult {
  const details = result.detalhesRegistros;
  if (!Array.isArray(details) || details.length === 0) return result;

  const flowCount = new Map<string, number>();
  const detalhesRegistros: AuditDetailRow[] = details.map((row) => {
    const auditadoEm = formatAuditTime(row.auditadoEm);
    if (row.usuario.trim() && auditadoEm) {
      const timestamp = `${result.dataAuditoria} ${auditadoEm.slice(0, 5)}`;
      flowCount.set(timestamp, (flowCount.get(timestamp) ?? 0) + 1);
    }
    return { ...row, auditadoEm };
  });

  const fluxo: FluxoPoint[] = [...flowCount.entries()]
    .map(([timestamp, leituras]) => ({ timestamp, leituras }))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  return { ...result, detalhesRegistros, fluxo };
}
