export type AuditType = "Presença" | "Etiqueta" | "Ruptura";

export const SHEET_PRESENCA = "Itens da Auditoria de Presença";
export const SHEET_ETIQUETA = "Itens da Auditoria de Etiqueta";
export const SHEET_RUPTURA = "Itens da Auditoria de Ruptura";

/** Raw spreadsheet row, keys exactly as exported by the audit system. */
export interface RawRow {
  Código?: string | number | null;
  Produto?: string | null;
  "Classe de Produto Raiz"?: string | null;
  Local?: string | null;
  Situação?: string | null;
  "Estoque atual"?: number | string | null;
  Usuário?: string | null;
  /** 2nd "Auditado em" column: scan time. Excel may supply a day fraction (number). */
  "Auditado em.1"?: string | number | Date | null;
  "Dias sem venda"?: number | string | null;
}

export interface ProductRow {
  codigo: string;
  produto: string;
  classeRaiz: string;
  local: string;
  estoqueAtual: number;
}

/** Supplemental record-level detail. This is informational and does not change KPI calculations. */
export interface AuditDetailRow {
  codigo: string;
  produto: string;
  classeRaiz: string;
  local: string;
  estoqueAtual: number | null;
  situacao: string;
  usuario: string;
  auditadoEm: string;
  diasSemVenda: number | null;
}

export interface SetorRow {
  setor: string;
  qtd: number;
  representatividade: number;
}

export interface NamedCount {
  nome: string;
  qtd: number;
}

export interface FluxoPoint {
  timestamp: string;
  leituras: number;
}

export interface AuditResult {
  auditoria: AuditType;
  sku: number;
  dataAuditoria: string;
  processadoEm: string;
  origem: string;
  naoLidos: number;
  lidosComEstoque: number;
  lidosSemEstoque: number;
  lidosNaoPertence: number;
  etiquetasDesatualizadas: number;
  colaboradoresAtivos: number;
  parcial: number;
  produtosSemLeitura: ProductRow[];
  semLeituraComVendas: ProductRow[];
  setores: SetorRow[];
  colaboradores: NamedCount[];
  corredores: NamedCount[];
  fluxo: FluxoPoint[];
  /** All source records retained for drill-downs, audit reports and comparisons. Optional for legacy saved results. */
  detalhesRegistros?: AuditDetailRow[];
}

export const SETORES = [
  "ALTO GIRO",
  "BAZAR",
  "DPH",
  "DIVERSOS",
  "FLV",
  "LATICINIOS 1",
  "LIQUIDA",
  "PERECIVEL 1",
  "PERECIVEL 2",
  "PERECIVEL 2 B",
  "PERECIVEL 3",
  "SECA DOCE",
  "SECA SALGADA",
  "SECA SALGADA 2",
] as const;

export const SITUACAO_PENDENCIA: Record<AuditType, string> = {
  Presença: "Sem Presença e Com Estoque",
  Etiqueta: "Não lidos com estoque",
  Ruptura: "Ruptura",
};
