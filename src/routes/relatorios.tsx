import { createFileRoute } from "@tanstack/react-router";
import * as XLSX from "xlsx";
import {
  AlertTriangle,
  Boxes,
  CircleSlash,
  FileSpreadsheet,
  FileText,
  Info,
  PackageCheck,
  PackageX,
  Printer,
  ScanLine,
  Tags,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader, PageTransition } from "@/components/PageTransition";
import { AuditDetailTable } from "@/components/AuditDetailTable";
import { RequireAudit } from "@/components/RequireAudit";
import { SectionCard } from "@/components/SectionCard";
import { Button } from "@/components/ui/button";
import { useGlobalAuditFilters, useSearchQuery } from "@/lib/search-store";
import {
  applyGlobalAuditFilters,
  getGlobalCollaboratorRows,
  getGlobalFilterSummary,
  hasActiveGlobalFilters,
} from "@/lib/audit/global-filters";
import { getDashboardDetailRows, type DashboardDetailKind } from "@/lib/audit/dashboard-details";
import { getUniqueSkuDetailRows, toExportFilename } from "@/lib/audit/export-utils";
import type { AuditDetailRow, AuditResult } from "@/lib/audit/types";

export const Route = createFileRoute("/relatorios")({
  head: () => ({
    meta: [
      { title: "Exportações · AuditOps" },
      {
        name: "description",
        content: "Exporte relatórios de colaboradores e categorias da auditoria em PDF ou Excel.",
      },
    ],
  }),
  component: RelatoriosPage,
});

type ExportCategory =
  | "sku-base"
  | "parcial"
  | "nao-lidos"
  | "lidos-com-estoque"
  | "lidos-sem-estoque"
  | "etiquetas-desatualizadas"
  | "lidos-nao-pertence"
  | "colaboradores";

type ExportOption = {
  value: ExportCategory;
  label: string;
  description: string;
  icon: LucideIcon;
};

const CATEGORY_OPTIONS: ExportOption[] = [
  { value: "sku-base", label: "SKU da base", description: "Relação única de produtos da auditoria", icon: Boxes },
  { value: "parcial", label: "Parcial", description: "Cálculo da taxa e itens que compõem a pendência", icon: AlertTriangle },
  { value: "nao-lidos", label: "Não lidos", description: "Itens não localizados na auditoria", icon: PackageX },
  { value: "lidos-com-estoque", label: "Lidos com estoque", description: "Registros lidos que possuem estoque", icon: PackageCheck },
  { value: "lidos-sem-estoque", label: "Lidos sem estoque", description: "Registros lidos sem estoque disponível", icon: CircleSlash },
  { value: "etiquetas-desatualizadas", label: "Etiquetas desatualizadas", description: "Itens com etiqueta que precisa de atualização", icon: Tags },
  { value: "lidos-nao-pertence", label: "Lidos não pertence", description: "Registros fora da categoria esperada", icon: ScanLine },
  { value: "colaboradores", label: "Colaboradores ativos", description: "Ranking com leituras e participação de cada pessoa", icon: Users },
];

const DETAIL_KIND_BY_CATEGORY: Partial<Record<ExportCategory, DashboardDetailKind>> = {
  parcial: "parcial",
  "nao-lidos": "nao-lidos",
  "lidos-com-estoque": "lidos-com-estoque",
  "lidos-sem-estoque": "lidos-sem-estoque",
  "etiquetas-desatualizadas": "etiquetas-desatualizadas",
  "lidos-nao-pertence": "lidos-nao-pertence",
};

function csvSafe(value: unknown) {
  return String(value ?? "—");
}

function formatNumber(value: number) {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function matchesSector(row: AuditDetailRow, sector: string) {
  if (sector === "__GERAL__") return true;
  if (sector === "__SEM_CLASSE__") return !row.classeRaiz.trim();
  return row.classeRaiz === sector;
}

function formatProcessedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value || "Não informado" : date.toLocaleString("pt-BR");
}

function categoryMetric(category: ExportCategory, result: AuditResult) {
  switch (category) {
    case "sku-base": return { label: "SKUs na base", value: formatNumber(result.sku) };
    case "parcial": return { label: "Parcial", value: `${result.parcial.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` };
    case "nao-lidos": return { label: "Itens não lidos", value: formatNumber(result.naoLidos) };
    case "lidos-com-estoque": return { label: "Lidos com estoque", value: formatNumber(result.lidosComEstoque) };
    case "lidos-sem-estoque": return { label: "Lidos sem estoque", value: formatNumber(result.lidosSemEstoque) };
    case "etiquetas-desatualizadas": return { label: "Etiquetas desatualizadas", value: formatNumber(result.etiquetasDesatualizadas) };
    case "lidos-nao-pertence": return { label: "Lidos não pertence", value: formatNumber(result.lidosNaoPertence) };
    case "colaboradores": return { label: "Colaboradores ativos", value: formatNumber(result.colaboradoresAtivos) };
  }
}

function categoryNote(category: ExportCategory, result: AuditResult) {
  switch (category) {
    case "sku-base": return "Um registro por código de produto único; linhas sem Código são excluídas da relação de SKUs.";
    case "parcial": return `Taxa de pendência calculada pelo AuditOps: ${result.naoLidos.toLocaleString("pt-BR")} item(ns) não lido(s) ÷ ${result.sku.toLocaleString("pt-BR")} SKU(s) da base.`;
    case "nao-lidos": return "Lista de itens que correspondem ao critério de não leitura desta modalidade de auditoria.";
    case "lidos-com-estoque": return "Lista de registros lidos com estoque, aplicando a regra de detalhamento da auditoria atual.";
    case "lidos-sem-estoque": return "Lista de registros classificados como lidos sem estoque.";
    case "etiquetas-desatualizadas": return "Lista de registros identificados como etiquetas desatualizadas.";
    case "lidos-nao-pertence": return "Lista de registros classificados como lidos que não pertencem à seleção esperada.";
    case "colaboradores": return "Ranking calculado a partir dos usuários registrados nas leituras disponíveis para esta auditoria.";
  }
}

function productRowsAsObjects(rows: AuditDetailRow[]) {
  return rows.map((row) => ({
    "Código": row.codigo,
    "Produto": row.produto,
    "Classe raiz": row.classeRaiz,
    "Local": row.local,
    "Estoque atual": row.estoqueAtual,
    "Situação": row.situacao,
    "Colaborador": row.usuario,
    "Auditado em": row.auditadoEm,
    "Dias sem venda": row.diasSemVenda,
  }));
}

function RelatoriosPage() {
  const [category, setCategory] = useState<ExportCategory>("sku-base");
  const [sector, setSector] = useState("__GERAL__");
  const [printMode, setPrintMode] = useState(false);
  const [reportTitle, setReportTitle] = useState("Relatório AuditOps");
  const globalFilters = useGlobalAuditFilters();
  const globalQuery = useSearchQuery();

  useEffect(() => {
    const finishPrint = () => setPrintMode(false);
    window.addEventListener("afterprint", finishPrint);
    return () => window.removeEventListener("afterprint", finishPrint);
  }, []);

  return <RequireAudit>{(result) => {
    const availableCategories = CATEGORY_OPTIONS.filter((option) =>
      option.value !== "etiquetas-desatualizadas" || result.auditoria === "Etiqueta",
    );
    const activeCategory = availableCategories.some((option) => option.value === category)
      ? category
      : "sku-base";
    const selectedOption = availableCategories.find((option) => option.value === activeCategory) ?? CATEGORY_OPTIONS[0]!;
    const SelectedIcon = selectedOption.icon;
    const isCollaborators = activeCategory === "colaboradores";
    const filterSummary = getGlobalFilterSummary(globalFilters, globalQuery);
    const hasFilters = hasActiveGlobalFilters(globalFilters, globalQuery);
    const sourceDetails: AuditDetailRow[] = result.detalhesRegistros ?? result.produtosSemLeitura.map((row) => ({
      ...row,
      situacao: result.auditoria === "Presença"
        ? "Sem Presença e Com Estoque"
        : result.auditoria === "Etiqueta" ? "Não lidos com estoque" : "Ruptura",
      usuario: "",
      auditadoEm: "",
      diasSemVenda: null,
    }));
    const filteredSourceDetails = applyGlobalAuditFilters(sourceDetails, globalFilters, globalQuery);
    const sectorNames = Array.from(new Set(sourceDetails.map((row) => row.classeRaiz.trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));

    let productRows: AuditDetailRow[] = [];
    if (activeCategory === "sku-base") {
      productRows = getUniqueSkuDetailRows(filteredSourceDetails);
    } else if (DETAIL_KIND_BY_CATEGORY[activeCategory]) {
      productRows = applyGlobalAuditFilters(
        getDashboardDetailRows(result, DETAIL_KIND_BY_CATEGORY[activeCategory]!),
        globalFilters,
        globalQuery,
      );
    }
    const sectorFilteredRows = isCollaborators
      ? []
      : productRows.filter((row) => matchesSector(row, sector));
    const collaborationRows = [...getGlobalCollaboratorRows(result, globalFilters, globalQuery)]
      .sort((a, b) => b.qtd - a.qtd || a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));
    const collaborationTotal = collaborationRows.reduce((sum, row) => sum + row.qtd, 0);
    const exportRowCount = isCollaborators ? collaborationRows.length : sectorFilteredRows.length;
    const metric = categoryMetric(activeCategory, result);
    const printAt = new Date().toLocaleString("pt-BR");
    const isLegacy = !result.detalhesRegistros;
    const currentScope = isCollaborators ? "Colaboradores" : sector === "__GERAL__" ? "Geral" : sector === "__SEM_CLASSE__" ? "Sem classe informada" : sector;
    const filterContext = [
      ...filterSummary,
      ...(!isCollaborators && sector !== "__GERAL__" ? [`Setor: ${currentScope}`] : []),
    ];

    const printNow = () => {
      setReportTitle(`${selectedOption.label} · ${currentScope}`);
      setPrintMode(true);
      window.setTimeout(() => window.print(), 180);
    };

    const exportExcel = () => {
      const workbook = XLSX.utils.book_new();
      workbook.Props = {
        Title: `AuditOps · ${selectedOption.label}`,
        Subject: `Exportação da auditoria ${result.auditoria}`,
        Author: "AuditOps",
        CreatedDate: new Date(),
      };
      const summaryRows: Array<Array<string | number>> = [
        ["AUDITOPS · RELATÓRIO DE AUDITORIA"],
        ["Categoria", selectedOption.label],
        ["Tipo de auditoria", result.auditoria],
        ["Data da auditoria", result.dataAuditoria || "Não informada"],
        ["Arquivo de origem", result.origem || "Não informado"],
        ["Processado em", formatProcessedAt(result.processadoEm)],
        ["Exportado em", new Date().toLocaleString("pt-BR")],
        [metric.label, metric.value],
        ["Registros detalhados exportados", exportRowCount],
        ["Escopo", currentScope],
        ["Filtros aplicados", filterContext.length ? filterContext.join(" · ") : "Nenhum"],
        ["Critério / observação", categoryNote(activeCategory, result)],
        ...((isLegacy && !isCollaborators) ? [["Aviso", "Auditoria antiga sem o conjunto completo de detalhes; a lista pode estar limitada aos dados preservados."]] : []),
      ];
      const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
      summarySheet["!cols"] = [{ wch: 30 }, { wch: 92 }];
      XLSX.utils.book_append_sheet(workbook, summarySheet, "Resumo");

      let detailSheet: XLSX.WorkSheet;
      if (isCollaborators) {
        const rows = collaborationRows.map((row, index) => ({
          "Posição": index + 1,
          "Colaborador": row.nome,
          "Leituras": row.qtd,
          "Participação (%)": collaborationTotal ? Number(((row.qtd / collaborationTotal) * 100).toFixed(2)) : 0,
        }));
        const headers = ["Posição", "Colaborador", "Leituras", "Participação (%)"];
        detailSheet = XLSX.utils.aoa_to_sheet([headers, ...rows.map((row) => headers.map((header) => row[header as keyof typeof row]))]);
        detailSheet["!cols"] = [{ wch: 12 }, { wch: 42 }, { wch: 16 }, { wch: 20 }];
      } else {
        const rows = productRowsAsObjects(sectorFilteredRows);
        const headers = ["Código", "Produto", "Classe raiz", "Local", "Estoque atual", "Situação", "Colaborador", "Auditado em", "Dias sem venda"];
        detailSheet = XLSX.utils.aoa_to_sheet([headers, ...rows.map((row) => headers.map((header) => row[header as keyof typeof row]))]);
        detailSheet["!cols"] = [{ wch: 18 }, { wch: 44 }, { wch: 24 }, { wch: 18 }, { wch: 16 }, { wch: 30 }, { wch: 30 }, { wch: 16 }, { wch: 16 }];
      }
      if (exportRowCount > 0) {
        const columnCount = isCollaborators ? 4 : 9;
        detailSheet["!autofilter"] = {
          ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: exportRowCount, c: columnCount - 1 } }),
        };
      }
      XLSX.utils.book_append_sheet(workbook, detailSheet, "Detalhamento");
      XLSX.writeFile(workbook, `${toExportFilename(`auditops-${selectedOption.label}-${result.dataAuditoria}`)}.xlsx`, { compression: true });
    };

    const previewRows = sectorFilteredRows.slice(0, 100);

    return <PageTransition>
      <PageHeader
        title="Exportações"
        subtitle="Gere PDF pronto para impressão ou Excel com resumo e detalhamento da categoria selecionada."
        action={<Button variant="audit" onClick={exportExcel}><FileSpreadsheet className="mr-2 size-4"/>Baixar Excel</Button>}
      />

      <SectionCard title="1. Escolha o que deseja exportar" description="Selecione um dos indicadores da Visão geral. A exportação respeita os filtros globais ativos no cabeçalho.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {availableCategories.map((option) => {
            const Icon = option.icon;
            const active = option.value === activeCategory;
            return <button
              type="button"
              key={option.value}
              onClick={() => setCategory(option.value)}
              aria-pressed={active}
              className={`group rounded-xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-[var(--shadow-card)] ${active ? "border-primary bg-primary/5 shadow-[var(--shadow-card)] ring-1 ring-primary/20" : "border-border bg-card"}`}
            >
              <span className="flex items-start justify-between gap-3">
                <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}><Icon className="size-5"/></span>
                <span className={`mt-1 size-2 rounded-full ${active ? "bg-primary" : "bg-transparent"}`} />
              </span>
              <strong className="mt-3 block text-sm font-semibold">{option.label}</strong>
              <span className="mt-1 block min-h-10 text-xs leading-relaxed text-muted-foreground">{option.description}</span>
            </button>;
          })}
        </div>
      </SectionCard>

      <SectionCard title="2. Configure a exportação" description="PDF inclui cabeçalho, contexto, indicadores e tabela; Excel inclui as abas Resumo e Detalhamento.">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
          <div className="rounded-lg border bg-muted/30 p-4">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Categoria selecionada</span>
            <div className="mt-1 flex items-center gap-2"><SelectedIcon className="size-5 text-primary"/><strong>{selectedOption.label}</strong></div>
            <div className="mt-3 flex items-baseline gap-2"><span className="text-2xl font-bold tabular-nums">{metric.value}</span><span className="text-xs text-muted-foreground">{metric.label}</span></div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{categoryNote(activeCategory, result)}</p>
          </div>
          {!isCollaborators ? <label className="space-y-2 text-sm font-medium">Escopo por setor
            <select value={sector} onChange={(event) => setSector(event.target.value)} className="h-12 w-full rounded-md border border-input bg-background px-3 text-foreground">
              <option value="__GERAL__">Geral — todos os setores</option>
              {sectorNames.map((name) => <option key={name} value={name}>{name}</option>)}
              <option value="__SEM_CLASSE__">Sem classe informada</option>
            </select>
          </label> : <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground"><Users className="mb-2 size-5 text-primary"/><p>O ranking de colaboradores é exportado separadamente, sem misturar produtos críticos.</p></div>}
          <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
            <Button variant="audit" onClick={printNow}><Printer className="mr-2 size-4"/>Gerar PDF</Button>
            <Button variant="outline" onClick={exportExcel}><FileSpreadsheet className="mr-2 size-4"/>Baixar Excel</Button>
          </div>
        </div>
      </SectionCard>

      {hasFilters ? <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground"><strong className="text-foreground">Filtros globais aplicados:</strong> {filterSummary.join(" · ")}. Esses filtros serão incluídos no arquivo exportado.</div> : null}

      {isLegacy && !isCollaborators ? <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-muted-foreground"><Info className="mt-0.5 size-4 shrink-0 text-amber-600"/><p>Esta auditoria foi salva sem o detalhamento completo dos registros. A exportação poderá conter apenas os dados preservados na época. Reimporte a planilha para gerar uma lista integral.</p></div> : null}

      {isCollaborators ? <SectionCard title="Prévia · Ranking de colaboradores" description={`${collaborationRows.length.toLocaleString("pt-BR")} colaborador(es) incluídos. A participação é calculada sobre as leituras mostradas na prévia/arquivo.`}>
        <div className="audit-table-scroll"><table className="audit-table"><thead><tr><th>Posição</th><th>Colaborador</th><th className="text-right">Leituras</th><th className="text-right">Participação</th></tr></thead><tbody>
          {collaborationRows.slice(0, 100).map((row, index) => <tr key={row.nome}><td>#{index + 1}</td><td className="font-semibold">{row.nome}</td><td className="text-right text-tabular">{row.qtd.toLocaleString("pt-BR")}</td><td className="text-right text-tabular">{(collaborationTotal ? (row.qtd / collaborationTotal) * 100 : 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</td></tr>)}
          {collaborationRows.length === 0 ? <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">Não há dados de colaboradores para esta auditoria.</td></tr> : null}
        </tbody></table></div>
        {collaborationRows.length > 100 ? <p className="mt-3 text-xs text-muted-foreground">Prévia limitada a 100 linhas. O Excel e o PDF incluem todos os {collaborationRows.length.toLocaleString("pt-BR")} colaboradores.</p> : null}
      </SectionCard> : <SectionCard title={`Prévia · ${selectedOption.label} · ${currentScope}`} description={`${exportRowCount.toLocaleString("pt-BR")} registro(s) na exportação. A prévia mostra até 100 linhas; os arquivos incluem todo o conjunto filtrado.`}>
        <AuditDetailTable key={`${activeCategory}-${sector}`} rows={previewRows} emptyMessage="Nenhum registro corresponde à categoria e aos filtros selecionados." />
        {sectorFilteredRows.length > 100 ? <p className="mt-3 text-xs text-muted-foreground">A exportação incluirá os {sectorFilteredRows.length.toLocaleString("pt-BR")} registros, não apenas as linhas exibidas nesta prévia.</p> : null}
      </SectionCard>}

      <div className="flex items-start gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground"><FileText className="mt-0.5 size-4 shrink-0"/><p><strong className="text-foreground">Sobre o PDF:</strong> o navegador abrirá a janela de impressão. Selecione “Salvar como PDF”, papel A4 e orientação paisagem para preservar as tabelas. O Excel é baixado diretamente em .xlsx.</p></div>

      {printMode ? <div id="print-root" className={`print-report-root ${isCollaborators ? "print-report-people" : "print-report-items"}`} aria-hidden="true">
        <header className="print-report-header">
          <div className="print-brand-row">
            <div className="print-brand-lockup"><span className="print-brand-mark">AO</span><div><div className="print-brand">Audit<span>Ops</span></div><div className="print-brand-subtitle">CONTROLE E INTELIGÊNCIA DE AUDITORIA</div></div></div>
            <div className="print-document-tag">RELATÓRIO OPERACIONAL</div>
          </div>
          <div className="print-title-block">
            <p className="print-eyebrow">{isCollaborators ? "DESEMPENHO DE LEITURAS" : activeCategory === "sku-base" ? "BASE DE PRODUTOS" : activeCategory === "parcial" ? "INDICADOR DE PENDÊNCIA" : "DETALHAMENTO DE AUDITORIA"}</p>
            <h1>{reportTitle}</h1>
            <p className="print-report-description">{categoryNote(activeCategory, result)}</p>
          </div>
          <div className="print-meta-grid">
            <div><span>Tipo de auditoria</span><strong>{result.auditoria}</strong></div>
            <div><span>Data da auditoria</span><strong>{result.dataAuditoria || "Não informada"}</strong></div>
            <div><span>Arquivo de origem</span><strong>{result.origem || "Não informado"}</strong></div>
            <div><span>Processado em</span><strong>{formatProcessedAt(result.processadoEm)}</strong></div>
            <div><span>Relatório emitido</span><strong>{printAt}</strong></div>
          </div>
          <div className="print-filter-context"><strong>Filtros aplicados:</strong> {filterContext.length ? filterContext.join(" · ") : "Nenhum filtro aplicado"}</div>
        </header>
        <div className="print-section-heading"><div><span className="print-section-kicker">RESUMO EXECUTIVO</span><h2>{metric.label}</h2></div><span className="print-section-context">Escopo: {currentScope}</span></div>
        <div className="print-kpis">
          <div><span>{metric.label}</span><strong>{metric.value}</strong><small>Indicador original da auditoria</small></div>
          <div><span>SKUs na base</span><strong>{result.sku.toLocaleString("pt-BR")}</strong><small>Códigos distintos reconhecidos</small></div>
          <div><span>Parcial</span><strong>{result.parcial.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</strong><small>Não lidos ÷ SKU da base</small></div>
          <div><span>Linhas no relatório</span><strong>{exportRowCount.toLocaleString("pt-BR")}</strong><small>{isCollaborators ? "Colaboradores listados" : "Registros detalhados"}</small></div>
        </div>
        {!isCollaborators && activeCategory === "parcial" ? <div className="print-scope"><strong>Fórmula:</strong> {result.naoLidos.toLocaleString("pt-BR")} item(ns) não lido(s) ÷ {result.sku.toLocaleString("pt-BR")} SKU(s) da base × 100 = {result.parcial.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%.</div> : null}
        {isLegacy && !isCollaborators ? <p className="print-data-note"><strong>Observação sobre a origem:</strong> a auditoria foi salva sem o conjunto completo de detalhes. A relação pode estar limitada aos registros preservados; reimporte a planilha para obter os dados integrais.</p> : null}
        <div className="print-section-heading print-table-heading"><div><span className="print-section-kicker">DETALHAMENTO</span><h2>{isCollaborators ? "Ranking de leituras" : selectedOption.label}</h2></div><span className="print-section-context">{exportRowCount.toLocaleString("pt-BR")} registros</span></div>
        {isCollaborators ? <table className="print-table print-table-people"><thead><tr><th className="print-number">Posição</th><th>Colaborador</th><th className="print-number">Leituras registradas</th><th>Participação no ranking</th></tr></thead><tbody>
          {collaborationRows.map((row, index) => { const share = collaborationTotal ? (row.qtd / collaborationTotal) * 100 : 0; return <tr key={row.nome}><td className="print-number"><span className="print-rank">{String(index + 1).padStart(2, "0")}</span></td><td><strong>{row.nome}</strong></td><td className="print-number">{row.qtd.toLocaleString("pt-BR")}</td><td><div className="print-share-cell"><strong>{share.toFixed(2)}%</strong><span className="print-share-track"><span style={{ width: `${Math.min(100, share)}%` }}/></span></div></td></tr>; })}
          {collaborationRows.length === 0 ? <tr><td colSpan={4} className="print-empty">Não há dados de colaboradores nesta auditoria.</td></tr> : null}
        </tbody></table> : <table className="print-table print-table-items"><colgroup><col className="col-code"/><col className="col-product"/><col className="col-class"/><col className="col-local"/><col className="col-stock"/><col className="col-status"/></colgroup><thead><tr><th>Código</th><th>Produto e informações da leitura</th><th>Classe raiz</th><th>Local</th><th className="print-number">Estoque</th><th>Situação</th></tr></thead><tbody>
          {sectorFilteredRows.map((row, index) => <tr key={`${row.codigo}-${row.local}-${index}`}><td className="print-code">{csvSafe(row.codigo)}</td><td><strong className="print-product-name">{csvSafe(row.produto)}</strong><small className="print-product-meta">Colaborador: {csvSafe(row.usuario)} <span>·</span> Auditado em: {csvSafe(row.auditadoEm)} <span>·</span> Dias sem venda: {row.diasSemVenda == null ? "—" : row.diasSemVenda.toLocaleString("pt-BR")}</small></td><td>{csvSafe(row.classeRaiz)}</td><td>{csvSafe(row.local)}</td><td className="print-number">{row.estoqueAtual == null ? "—" : row.estoqueAtual.toLocaleString("pt-BR")}</td><td><span className="print-status">{csvSafe(row.situacao)}</span></td></tr>)}
          {sectorFilteredRows.length === 0 ? <tr><td colSpan={6} className="print-empty">Nenhum registro encontrado no escopo selecionado.</td></tr> : null}
        </tbody></table>}
        <footer className="print-footer"><span><strong>AuditOps</strong> · Relatório gerado localmente no navegador</span><span>Origem: {result.origem}</span></footer>
      </div> : null}
    </PageTransition>;
  }}</RequireAudit>;
}
