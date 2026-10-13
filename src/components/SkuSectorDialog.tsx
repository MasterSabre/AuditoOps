import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download, PackageSearch } from "lucide-react";
import { AuditDetailTable, downloadCsv } from "@/components/AuditDetailTable";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getRowsForSkuSector, getSkuSectorCounts } from "@/lib/audit/dashboard-details";
import type { AuditDetailRow } from "@/lib/audit/types";
import { getGlobalFilterSummary } from "@/lib/audit/global-filters";
import { useGlobalAuditFilters, useSearchQuery } from "@/lib/search-store";

export function SkuSectorDialog({
  open,
  onOpenChange,
  skuBase,
  rows,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skuBase: number;
  rows: AuditDetailRow[];
}) {
  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const globalFilters = useGlobalAuditFilters();
  const globalQuery = useSearchQuery();
  const filterSummary = getGlobalFilterSummary(globalFilters, globalQuery);
  const hasGlobalContext = filterSummary.length > 0;
  const sectorCounts = useMemo(() => getSkuSectorCounts(rows), [rows]);
  const sectorRows = useMemo(
    () => (selectedSector ? getRowsForSkuSector(rows, selectedSector) : []),
    [rows, selectedSector],
  );

  useEffect(() => {
    if (!open) setSelectedSector(null);
  }, [open]);

  const exportSectorCounts = () => downloadCsv(
    "auditops-sku-por-setor.csv",
    ["Setor / classe raiz", "Itens (códigos únicos por setor)", "Registros", "Participação dos registros (%)"],
    sectorCounts.map((item) => [item.setor, item.quantidadeItens, item.quantidadeRegistros, item.participacaoRegistros]),
    [getGlobalFilterSummary(globalFilters, globalQuery).length ? `Filtros globais: ${getGlobalFilterSummary(globalFilters, globalQuery).join(" · ")}` : "Filtros globais: nenhum filtro aplicado"],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="audit-detail-dialog flex h-[min(90vh,920px)] w-[calc(100vw-1.5rem)] max-w-[1440px] flex-col gap-0 overflow-hidden rounded-2xl border-border p-0 shadow-2xl sm:w-[calc(100vw-3rem)]">
        <div className="border-b border-border bg-gradient-to-r from-primary/[0.09] via-background to-background px-5 py-5 pr-14 sm:px-7 sm:py-6">
          <DialogHeader className="text-left">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
                <PackageSearch className="size-5" />
              </span>
              <div className="min-w-0 flex-1 space-y-1.5">
                <DialogTitle className="text-lg font-bold leading-tight sm:text-xl">
                  {selectedSector ? `Itens do setor · ${selectedSector}` : "SKU da base · quantidade por setor"}
                </DialogTitle>
                <DialogDescription className="max-w-4xl text-sm leading-relaxed">
                  {selectedSector
                    ? "Registros individuais associados a esta classe de produto raiz. A consulta não altera nenhum indicador da auditoria."
                    : hasGlobalContext
                    ? "Distribuição dos registros que correspondem aos filtros globais. O KPI SKU da base permanece com o total original e não é recalculado por este recorte."
                    : "Distribuição de itens por Classe de Produto Raiz usando todos os registros disponíveis, sem filtrar por situação de pendência."}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          {!selectedSector ? (
            <div className="mt-4 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background/90 px-3 py-1.5 text-xs font-semibold text-foreground">
                  <span className="size-1.5 rounded-full bg-primary" />
                  SKU da base informado: {skuBase.toLocaleString("pt-BR")}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background/90 px-3 py-1.5 text-xs font-semibold text-foreground">
                  {rows.length.toLocaleString("pt-BR")} registros detalhados
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background/90 px-3 py-1.5 text-xs font-semibold text-foreground">
                  {sectorCounts.length.toLocaleString("pt-BR")} classes encontradas
                </span>
              </div>
              {hasGlobalContext ? <p className="text-xs leading-relaxed text-muted-foreground"><strong className="text-foreground">Recorte ativo:</strong> {filterSummary.join(" · ")}</p> : null}
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-7 sm:py-6">
          {selectedSector ? (
            <div className="space-y-4">
              <Button variant="outline" onClick={() => setSelectedSector(null)}>
                <ArrowLeft className="mr-2 size-4" /> Voltar à distribuição por setor
              </Button>
              <div className="rounded-lg border bg-muted/25 p-3 text-sm text-muted-foreground">
                <strong className="text-foreground">{sectorRows.length.toLocaleString("pt-BR")} registros</strong> · {new Set(sectorRows.map((row) => row.codigo.trim()).filter(Boolean)).size.toLocaleString("pt-BR")} códigos de produto identificados.
              </div>
              <AuditDetailTable rows={sectorRows} emptyMessage="Não há registros para esta classe de produto raiz." />
            </div>
          ) : rows.length === 0 ? (
            <div className="mx-auto flex max-w-2xl items-start gap-3 rounded-xl border border-dashed border-border bg-muted/30 p-5 text-sm leading-relaxed text-muted-foreground">
              <PackageSearch className="mt-0.5 size-5 shrink-0" />
              <p>Esta auditoria não possui registros individuais salvos para montar a distribuição por setor. Reimporte a planilha para habilitar o detalhamento. O valor de SKU da base continua preservado, mas não é possível distribuir esse total por classe sem os registros individuais.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
                  “Itens” conta códigos únicos dentro de cada setor; “Registros” conta as linhas detalhadas da planilha. O total de SKU informado na importação não é recalculado por esta janela.
                </p>
                <Button variant="outline" onClick={exportSectorCounts}>
                  <Download className="mr-2 size-4" /> Exportar distribuição
                </Button>
              </div>
              <div className="audit-table-scroll">
                <table className="audit-table">
                  <thead>
                    <tr>
                      <th>Posição</th>
                      <th>Setor / classe raiz</th>
                      <th className="text-right">Itens</th>
                      <th className="text-right">Registros</th>
                      <th>Participação dos registros</th>
                      <th>Detalhes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sectorCounts.map((item, index) => (
                      <tr key={item.setor}>
                        <td className="w-20 text-muted-foreground">#{index + 1}</td>
                        <td className="font-semibold">{item.setor}</td>
                        <td className="text-right font-semibold text-tabular">{item.quantidadeItens.toLocaleString("pt-BR")}</td>
                        <td className="text-right text-tabular">{item.quantidadeRegistros.toLocaleString("pt-BR")}</td>
                        <td>
                          <div className="flex min-w-36 items-center gap-3">
                            <div className="h-2.5 w-full max-w-64 overflow-hidden rounded-full bg-muted">
                              <div className="h-full rounded-full bg-primary" style={{ width: `${item.participacaoRegistros}%` }} />
                            </div>
                            <span className="w-16 shrink-0 text-right text-xs font-semibold text-tabular text-muted-foreground">{item.participacaoRegistros.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</span>
                          </div>
                        </td>
                        <td><Button size="sm" variant="outline" onClick={() => setSelectedSector(item.setor)}>Ver produtos</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/25 px-5 py-3 text-xs text-muted-foreground sm:px-7">
          <span>AuditOps · Distribuição da base por setor</span>
          <span>Feche esta janela para voltar à Visão geral</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
