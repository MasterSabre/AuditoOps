import { Filter, RotateCcw, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AuditResult } from "@/lib/audit/types";
import { countActiveStructuredFilters, getGlobalFilterSummary } from "@/lib/audit/global-filters";
import { clearGlobalAuditFilters, setGlobalAuditFilters, useGlobalAuditFilters, useSearchQuery } from "@/lib/search-store";

function uniqueSorted(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
}

function FilterSelect({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: string;
  values: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="min-w-0 space-y-1.5 text-xs font-semibold text-muted-foreground">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm font-normal text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary"
      >
        <option value="">Todos</option>
        {values.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
    </label>
  );
}

export function GlobalFilterToggle({
  open,
  onClick,
}: {
  open: boolean;
  onClick: () => void;
}) {
  const filters = useGlobalAuditFilters();
  const active = countActiveStructuredFilters(filters);
  return (
    <Button type="button" variant="audit" onClick={onClick} aria-expanded={open} aria-controls="auditops-global-filters" className="relative shrink-0">
      {open ? <SlidersHorizontal className="mr-2 size-4" /> : <Filter className="mr-2 size-4" />}
      Filtros
      {active > 0 ? <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-primary-foreground px-1.5 py-0.5 text-[10px] font-bold text-primary">{active}</span> : null}
    </Button>
  );
}

export function GlobalFilterPanel({
  open,
  result,
}: {
  open: boolean;
  result: AuditResult | null;
}) {
  const filters = useGlobalAuditFilters();
  const query = useSearchQuery();
  if (!open) return null;

  const details = result?.detalhesRegistros ?? [];
  const sectors = uniqueSorted([...(result?.setores.map((row) => row.setor) ?? []), ...details.map((row) => row.classeRaiz)]);
  const corridors = uniqueSorted([...(result?.corredores.map((row) => row.nome) ?? []), ...details.map((row) => row.local)]);
  const collaborators = uniqueSorted([...(result?.colaboradores.map((row) => row.nome) ?? []), ...details.map((row) => row.usuario)]);
  const situations = uniqueSorted(details.map((row) => row.situacao));
  const summary = getGlobalFilterSummary(filters, query);
  const activeFilterCount = countActiveStructuredFilters(filters);

  return (
    <div id="auditops-global-filters" className="border-t border-chrome-foreground/10 bg-card text-foreground shadow-[var(--shadow-card)]">
      <div className="app-filter-panel mx-auto max-w-[1800px] px-4 py-4 sm:px-6 lg:px-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="size-4 text-primary" />
            <p className="text-sm font-semibold">Filtros globais</p>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">Afetam listas, rankings detalhados e exportações</span>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={clearGlobalAuditFilters} disabled={activeFilterCount === 0}>
            <RotateCcw className="mr-1.5 size-3.5" />Limpar filtros
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <FilterSelect label="Setor / classe raiz" value={filters.setor} values={sectors} onChange={(setor) => setGlobalAuditFilters({ setor })} />
          <FilterSelect label="Corredor / local" value={filters.corredor} values={corridors} onChange={(corredor) => setGlobalAuditFilters({ corredor })} />
          <FilterSelect label="Colaborador / matrícula" value={filters.colaborador} values={collaborators} onChange={(colaborador) => setGlobalAuditFilters({ colaborador })} />
          <FilterSelect label="Situação registrada" value={filters.situacao} values={situations} onChange={(situacao) => setGlobalAuditFilters({ situacao })} />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {summary.length ? `Aplicado: ${summary.join(" · ")}.` : "Nenhum filtro de campo selecionado. A busca no cabeçalho continua funcionando como pesquisa global."} Os cartões de indicadores mantêm os totais calculados originalmente; o recorte afeta apenas as consultas e visualizações detalhadas.
        </p>
        {details.length === 0 && result ? <p className="mt-2 text-xs text-critical">Esta auditoria não tem registros individuais guardados; filtros por corredor, situação e produto podem não estar disponíveis.</p> : null}
      </div>
    </div>
  );
}
