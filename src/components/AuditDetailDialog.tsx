import { FileSearch, PackageSearch } from "lucide-react";
import { AuditDetailTable } from "@/components/AuditDetailTable";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AuditDetailRow } from "@/lib/audit/types";
import { getGlobalFilterSummary } from "@/lib/audit/global-filters";
import { useGlobalAuditFilters, useSearchQuery } from "@/lib/search-store";

export function AuditDetailDialog({
  open,
  onOpenChange,
  title,
  description,
  rows,
  emptyMessage,
  recordsAvailable = true,
  legacyMessage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  rows: AuditDetailRow[];
  emptyMessage: string;
  recordsAvailable?: boolean;
  legacyMessage?: string;
}) {
  const filters = useGlobalAuditFilters();
  const query = useSearchQuery();
  const filterSummary = getGlobalFilterSummary(filters, query);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="audit-detail-dialog flex h-[min(90vh,920px)] w-[calc(100vw-1.5rem)] max-w-[1440px] flex-col gap-0 overflow-hidden rounded-2xl border-border p-0 shadow-2xl sm:w-[calc(100vw-3rem)]">
        <div className="border-b border-border bg-gradient-to-r from-primary/[0.09] via-background to-background px-5 py-5 pr-14 sm:px-7 sm:py-6">
          <DialogHeader className="text-left">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
                {title.toLocaleLowerCase("pt-BR").includes("leituras") ? <FileSearch className="size-5" /> : <PackageSearch className="size-5" />}
              </span>
              <div className="min-w-0 flex-1 space-y-1.5">
                <DialogTitle className="text-lg font-bold leading-tight sm:text-xl">{title}</DialogTitle>
                <DialogDescription className="max-w-4xl text-sm leading-relaxed">{description}</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background/90 px-3 py-1.5 text-xs font-semibold text-foreground">
              <span className="size-1.5 rounded-full bg-primary" />
              {recordsAvailable ? `${rows.length.toLocaleString("pt-BR")} registros disponíveis` : "Detalhamento indisponível"}
            </span>
            <span className="text-xs text-muted-foreground">Use a busca, ordenação ou exportação para analisar os resultados.</span>
          </div>
          {filterSummary.length ? <p className="mt-2 max-w-5xl text-xs leading-relaxed text-muted-foreground"><strong className="text-foreground">Filtros globais:</strong> {filterSummary.join(" · ")}</p> : null}
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-7 sm:py-6">
          {!recordsAvailable ? (
            <div className="mx-auto flex max-w-2xl items-start gap-3 rounded-xl border border-dashed border-border bg-muted/30 p-5 text-sm leading-relaxed text-muted-foreground">
              <FileSearch className="mt-0.5 size-5 shrink-0" />
              <p>{legacyMessage ?? "Esta auditoria foi salva antes do detalhamento individual. Reimporte a planilha para consultar os registros completos."}</p>
            </div>
          ) : (
            <AuditDetailTable rows={rows} emptyMessage={emptyMessage} />
          )}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/25 px-5 py-3 text-xs text-muted-foreground sm:px-7">
          <span>AuditOps · Consulta detalhada</span>
          <span>Feche esta janela para voltar à lista</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
