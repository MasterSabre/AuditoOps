import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Download, PackageSearch, Search, ChevronLeft, ChevronRight } from "lucide-react";
import type { ProductRow } from "@/lib/audit/types";
import { getGlobalFilterSummary } from "@/lib/audit/global-filters";
import { useGlobalAuditFilters } from "@/lib/search-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { downloadCsv } from "@/components/AuditDetailTable";

type SortKey = keyof ProductRow;

export function ProductTable({ rows, query }: { rows: ProductRow[]; query: string }) {
  const [localQuery, setLocalQuery] = useState("");
  const globalFilters = useGlobalAuditFilters();
  const [sortKey, setSortKey] = useState<SortKey>("estoqueAtual");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const filtered = useMemo(() => {
    const terms = [query, localQuery].map((value) => value.trim().toLocaleLowerCase("pt-BR")).filter(Boolean);
    const matches = rows.filter((row) => terms.every((term) =>
      [row.codigo, row.produto, row.classeRaiz, row.local].join(" ").toLocaleLowerCase("pt-BR").includes(term),
    ));
    return [...matches].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const compare = typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv), "pt-BR", { numeric: true, sensitivity: "base" });
      return direction === "asc" ? compare : -compare;
    });
  }, [rows, query, localQuery, sortKey, direction]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize);
  const sortLabel = (label: string, key: SortKey) => (
    <button type="button" className="hover:text-foreground" onClick={() => {
      if (sortKey === key) setDirection((current) => current === "asc" ? "desc" : "asc");
      else { setSortKey(key); setDirection(key === "estoqueAtual" ? "desc" : "asc"); }
      setPage(0);
    }} aria-label={`Ordenar por ${label}`}>{label}{sortKey === key ? direction === "asc" ? " ↑" : " ↓" : " ↕"}</button>
  );

  if (rows.length === 0) {
    return <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground"><PackageSearch className="size-6" />Nenhum item disponível nesta lista.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full max-w-lg">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={localQuery} onChange={(event) => { setLocalQuery(event.target.value); setPage(0); }} placeholder="Filtrar esta lista de produtos" aria-label="Filtrar produtos" className="pl-9" />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{filtered.length.toLocaleString("pt-BR")} itens</span>
          <Button variant="outline" disabled={!filtered.length} onClick={() => downloadCsv("auditops-produtos.csv", ["Código", "Produto", "Classe raiz", "Local", "Estoque atual"], filtered.map((row) => [row.codigo, row.produto, row.classeRaiz, row.local, row.estoqueAtual]), [getGlobalFilterSummary(globalFilters, query).length ? `Filtros globais: ${getGlobalFilterSummary(globalFilters, query).join(" · ")}` : "Filtros globais: nenhum filtro aplicado", ...(localQuery.trim() ? [`Busca adicional desta tabela: ${localQuery.trim()}`] : [])])}><Download className="mr-2 size-4" />Exportar CSV</Button>
        </div>
      </div>
      {filtered.length === 0 ? <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground"><PackageSearch className="size-6" />Nenhum item encontrado para os filtros atuais.</div> : <>
        <div className="audit-table-scroll">
          <table className="audit-table">
            <thead><tr>
              <th>{sortLabel("Código", "codigo")}</th><th>{sortLabel("Produto", "produto")}</th><th>{sortLabel("Classe raiz", "classeRaiz")}</th><th>{sortLabel("Local", "local")}</th><th className="text-right">{sortLabel("Estoque atual", "estoqueAtual")}</th>
            </tr></thead>
            <tbody>
              <AnimatePresence initial={false}>
                {visible.map((row, index) => <motion.tr key={`${row.codigo}-${index}`} layout="position" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} className="border-b border-border/60 transition-colors last:border-0 hover:bg-accent/60">
                  <td className="font-medium text-link">{row.codigo || "—"}</td><td>{row.produto || "—"}</td><td className="text-muted-foreground">{row.classeRaiz || "—"}</td><td className="text-muted-foreground">{row.local || "—"}</td><td className="text-right font-semibold text-tabular text-critical">{row.estoqueAtual.toLocaleString("pt-BR")}</td>
                </motion.tr>)}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">Exibindo {((safePage * pageSize) + 1).toLocaleString("pt-BR")}–{Math.min((safePage + 1) * pageSize, filtered.length).toLocaleString("pt-BR")} de {filtered.length.toLocaleString("pt-BR")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">Linhas<select className="h-10 rounded-md border bg-background px-2 text-sm text-foreground" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(0); }}>{[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
            <Button size="sm" variant="outline" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={safePage === 0}><ChevronLeft className="mr-1 size-4" />Anterior</Button><span className="min-w-16 text-center text-sm text-muted-foreground">{safePage + 1}/{pageCount}</span><Button size="sm" variant="outline" onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} disabled={safePage >= pageCount - 1}>Próxima<ChevronRight className="ml-1 size-4" /></Button>
          </div>
        </div>
      </>}
    </div>
  );
}
