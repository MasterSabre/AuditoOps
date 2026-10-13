import { useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import type { AuditDetailRow } from "@/lib/audit/types";
import { getGlobalFilterSummary } from "@/lib/audit/global-filters";
import { useGlobalAuditFilters, useSearchQuery } from "@/lib/search-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const PAGE_OPTIONS = [10, 25, 50, 100];
type SortKey = keyof AuditDetailRow;

function csvCell(value: unknown) {
  let text = value == null ? "" : String(value);
  // Spreadsheet apps may execute CSV strings starting with formula characters even when quoted.
  if (typeof value === "string" && /^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function downloadCsv(filename: string, headers: string[], rows: Array<Array<unknown>>, metadata: string[] = []) {
  const metadataRows = metadata.map((line) => [line, ...Array(Math.max(0, headers.length - 1)).fill("")]);
  const content = [...metadataRows, headers, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n");
  const blob = new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatNumber(value: number | null) {
  return value == null ? "—" : value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

export function AuditDetailTable({
  rows,
  emptyMessage = "Nenhum registro encontrado para os filtros atuais.",
  initialQuery = "",
}: {
  rows: AuditDetailRow[];
  emptyMessage?: string;
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const globalFilters = useGlobalAuditFilters();
  const globalQuery = useSearchQuery();
  const [sortKey, setSortKey] = useState<SortKey>("estoqueAtual");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(0);
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-BR");
    const matching = term
      ? rows.filter((row) =>
          [row.codigo, row.produto, row.classeRaiz, row.local, row.situacao, row.usuario]
            .join(" ")
            .toLocaleLowerCase("pt-BR")
            .includes(term),
        )
      : rows;
    return [...matching].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      let compare = 0;
      if (typeof av === "number" || typeof bv === "number") {
        compare = ((av as number | null) ?? -Infinity) - ((bv as number | null) ?? -Infinity);
      } else {
        compare = String(av ?? "").localeCompare(String(bv ?? ""), "pt-BR", { numeric: true, sensitivity: "base" });
      }
      return sortDirection === "asc" ? compare : -compare;
    });
  }, [rows, query, sortKey, sortDirection]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize);

  const sortButton = (label: string, key: SortKey) => (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded-sm text-left hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      onClick={() => {
        if (sortKey === key) setSortDirection((value) => (value === "asc" ? "desc" : "asc"));
        else { setSortKey(key); setSortDirection(key === "estoqueAtual" ? "desc" : "asc"); }
        setPage(0);
      }}
      aria-label={`Ordenar por ${label}`}
    >
      {label}{sortKey === key ? (sortDirection === "asc" ? " ↑" : " ↓") : " ↕"}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => { setQuery(event.target.value); setPage(0); }}
            placeholder="Filtrar código, produto, classe, local, situação ou colaborador"
            aria-label="Filtrar registros detalhados"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted-foreground">{filtered.length.toLocaleString("pt-BR")} registros</span>
          <Button
            variant="outline"
            onClick={() => downloadCsv(
              "auditops-detalhamento.csv",
              ["Código", "Produto", "Classe raiz", "Local", "Estoque atual", "Situação", "Colaborador", "Auditado em", "Dias sem venda"],
              filtered.map((row) => [row.codigo, row.produto, row.classeRaiz, row.local, row.estoqueAtual, row.situacao, row.usuario, row.auditadoEm, row.diasSemVenda]),
              [
                getGlobalFilterSummary(globalFilters, globalQuery).length
                  ? `Filtros globais: ${getGlobalFilterSummary(globalFilters, globalQuery).join(" · ")}`
                  : "Filtros globais: nenhum filtro aplicado",
                ...(query.trim() ? [`Busca adicional desta tabela: ${query.trim()}`] : []),
              ],
            )}
            disabled={filtered.length === 0}
          >
            <Download className="mr-2 size-4" /> Exportar CSV
          </Button>
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">{emptyMessage}</div>
      ) : (
        <>
          <div className="audit-table-scroll">
            <table className="audit-table audit-detail-table">
              <thead><tr>
                <th>{sortButton("Código", "codigo")}</th>
                <th>{sortButton("Produto", "produto")}</th>
                <th>{sortButton("Classe raiz", "classeRaiz")}</th>
                <th>{sortButton("Local", "local")}</th>
                <th className="text-right">{sortButton("Estoque", "estoqueAtual")}</th>
                <th>{sortButton("Situação", "situacao")}</th>
                <th>{sortButton("Colaborador", "usuario")}</th>
                <th>{sortButton("Auditado em", "auditadoEm")}</th>
                <th className="text-right">{sortButton("Dias sem venda", "diasSemVenda")}</th>
              </tr></thead>
              <tbody>
                {visible.map((row, index) => (
                  <tr key={`${row.codigo}-${row.local}-${index}`}>
                    <td className="font-semibold text-link">{row.codigo || "—"}</td>
                    <td>{row.produto || "—"}</td>
                    <td>{row.classeRaiz || "—"}</td>
                    <td>{row.local || "—"}</td>
                    <td className="text-right font-semibold text-tabular">{formatNumber(row.estoqueAtual)}</td>
                    <td><span className="inline-flex max-w-56 rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{row.situacao || "Sem situação"}</span></td>
                    <td>{row.usuario || "—"}</td>
                    <td>{row.auditadoEm || "—"}</td>
                    <td className="text-right text-tabular">{formatNumber(row.diasSemVenda)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">Exibindo {((safePage * pageSize) + 1).toLocaleString("pt-BR")}–{Math.min((safePage + 1) * pageSize, filtered.length).toLocaleString("pt-BR")} de {filtered.length.toLocaleString("pt-BR")}</p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">Linhas
                <select className="h-10 rounded-md border bg-background px-2 text-sm text-foreground" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(0); }}>
                  {PAGE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <Button size="sm" variant="outline" onClick={() => setPage(0)} disabled={safePage === 0}>Primeira</Button>
              <Button size="sm" variant="outline" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={safePage === 0}>Anterior</Button>
              <span className="min-w-20 text-center text-sm text-muted-foreground">{safePage + 1} / {pageCount}</span>
              <Button size="sm" variant="outline" onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} disabled={safePage >= pageCount - 1}>Próxima</Button>
              <Button size="sm" variant="outline" onClick={() => setPage(pageCount - 1)} disabled={safePage >= pageCount - 1}>Última</Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
