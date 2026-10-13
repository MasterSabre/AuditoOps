import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { MapPin } from "lucide-react";
import { PageHeader, PageTransition } from "@/components/PageTransition";
import { AuditDetailDialog } from "@/components/AuditDetailDialog";
import { RequireAudit } from "@/components/RequireAudit";
import { SectionCard } from "@/components/SectionCard";
import { RankingBars } from "@/components/charts/RankingBars";
import { useGlobalAuditFilters, useSearchQuery } from "@/lib/search-store";
import { applyGlobalAuditFilters, getGlobalCorridorRows, hasActiveGlobalFilters } from "@/lib/audit/global-filters";
import { SITUACAO_PENDENCIA } from "@/lib/audit/types";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/corredores")({
  head: () => ({ meta: [{ title: "Corredores · AuditOps" }, { name: "description", content: "Ranking dos locais com mais pendências e consulta detalhada dos produtos." }] }),
  component: CorredoresPage,
});

function CorredoresPage() {
  const query = useSearchQuery();
  const globalFilters = useGlobalAuditFilters();
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  return <RequireAudit>{(result) => {
    const hasFilters = hasActiveGlobalFilters(globalFilters, query);
    const rows = getGlobalCorridorRows(result, globalFilters, query);
    const pendingRows = (result.detalhesRegistros ?? []).filter((row) => row.situacao === SITUACAO_PENDENCIA[result.auditoria]);
    const scopedPending = applyGlobalAuditFilters(pendingRows, globalFilters, query);
    const details = scopedPending.filter((row) => row.local === selectedLocation);
    const totalTop = rows.reduce((sum, row) => sum + row.qtd, 0);
    return <PageTransition>
      <PageHeader title="Corredores" subtitle="Top 15 locais com mais itens pendentes de leitura" />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="surface-card p-5"><p className="text-sm text-muted-foreground">{hasFilters ? "Locais no recorte" : "Locais no ranking"}</p><p className="mt-2 text-3xl font-bold text-tabular">{rows.length}</p><p className="mt-1 text-xs text-muted-foreground">{hasFilters ? "Top 15 do recorte filtrado." : "Mantém o limite original de 15 locais."}</p></div>
        <div className="surface-card p-5"><p className="text-sm text-muted-foreground">Pendências nesses locais</p><p className="mt-2 text-3xl font-bold text-tabular">{totalTop.toLocaleString("pt-BR")}</p><p className="mt-1 text-xs text-muted-foreground">Soma do ranking apresentado.</p></div>
        <div className="surface-card p-5"><p className="text-sm text-muted-foreground">Participação do top 15</p><p className="mt-2 text-3xl font-bold text-tabular">{result.naoLidos ? ((totalTop / result.naoLidos) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "0"}%</p><p className="mt-1 text-xs text-muted-foreground">Sobre o total de itens não lidos.</p></div>
      </div>
      <SectionCard title="Concentração de pendências" description={hasFilters ? `Top 15 locais no recorte: ${scopedPending.length.toLocaleString("pt-BR")} registros correspondem à busca/filtros. Os KPIs gerais continuam inalterados.` : "Os 15 locais com mais itens na situação de pendência. Selecione um local para ver todos os registros disponíveis nele."}>
        {rows.length > 0 ? <RankingBars data={rows} valueLabel="Sem leitura" color="var(--critical)"/> : <p className="py-10 text-center text-sm text-muted-foreground">Nenhum corredor encontrado para a busca.</p>}
        <div className="audit-table-scroll mt-6"><table className="audit-table"><thead><tr><th>Posição</th><th>Local</th><th className="text-right">Pendências</th><th className="text-right">Participação da base</th><th>Detalhes</th></tr></thead><tbody>
          {rows.map((row) => { const rank = rows.findIndex((item) => item.nome === row.nome) + 1; const selected = selectedLocation === row.nome; const share = result.naoLidos ? (row.qtd / result.naoLidos) * 100 : 0; return <tr key={row.nome} className={selected ? "bg-accent" : ""}><td className="text-muted-foreground">#{rank}</td><td className="font-semibold">{row.nome}</td><td className="text-right font-semibold text-tabular">{row.qtd.toLocaleString("pt-BR")}</td><td className="text-right text-tabular">{share.toFixed(2)}%</td><td><Button size="sm" variant={selected ? "audit" : "outline"} onClick={() => setSelectedLocation(selected ? null : row.nome)}>{selected ? "Fechar" : "Ver produtos"}</Button></td></tr>; })}
        </tbody></table></div>
      </SectionCard>
      {!selectedLocation ? <div className="flex items-start gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground"><MapPin className="mt-0.5 size-4 shrink-0"/><p>{hasFilters ? "A lista e os modais respeitam os filtros globais; os totais originais da auditoria não são recalculados." : "Selecione “Ver produtos” em um corredor para abrir os produtos em uma janela própria. O ranking continua limitado aos 15 locais originais."}</p></div> : null}
      <AuditDetailDialog
        open={selectedLocation !== null}
        onOpenChange={(open) => { if (!open) setSelectedLocation(null); }}
        title={`Produtos no corredor · ${selectedLocation ?? "local"}`}
        description={`${details.length.toLocaleString("pt-BR")} registros na situação de pendência para este local.`}
        rows={details}
        recordsAvailable={Boolean(result.detalhesRegistros)}
        legacyMessage="Esta auditoria histórica não tem registros individuais salvos. Reimporte a planilha para consultar os produtos deste local."
        emptyMessage="Nenhuma linha detalhada encontrada para este local na situação de pendência."
      />
    </PageTransition>;
  }}</RequireAudit>;
}
