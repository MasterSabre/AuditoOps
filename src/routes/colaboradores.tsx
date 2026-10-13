import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Download, Users } from "lucide-react";
import { PageHeader, PageTransition } from "@/components/PageTransition";
import { downloadCsv } from "@/components/AuditDetailTable";
import { AuditDetailDialog } from "@/components/AuditDetailDialog";
import { RequireAudit } from "@/components/RequireAudit";
import { SectionCard } from "@/components/SectionCard";
import { RankingBars } from "@/components/charts/RankingBars";
import { useGlobalAuditFilters, useSearchQuery } from "@/lib/search-store";
import { applyGlobalAuditFilters, getGlobalCollaboratorRows, getGlobalFilterSummary, hasActiveGlobalFilters } from "@/lib/audit/global-filters";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/colaboradores")({
  head: () => ({ meta: [{ title: "Colaboradores · AuditOps" }, { name: "description", content: "Ranking e detalhamento das leituras por colaborador." }] }),
  component: ColaboradoresPage,
});

function ColaboradoresPage() {
  const query = useSearchQuery();
  const globalFilters = useGlobalAuditFilters();
  const [selectedName, setSelectedName] = useState<string | null>(null);
  return <RequireAudit>{(result) => {
    const hasFilters = hasActiveGlobalFilters(globalFilters, query);
    const rows = getGlobalCollaboratorRows(result, globalFilters, query);
    const totalLeituras = rows.reduce((sum, row) => sum + row.qtd, 0);
    const details = applyGlobalAuditFilters(result.detalhesRegistros ?? [], globalFilters, query).filter((row) => row.usuario === selectedName);
    const filterSummary = getGlobalFilterSummary(globalFilters, query);
    return <PageTransition>
      <PageHeader
        title="Colaboradores"
        subtitle={`${result.colaboradoresAtivos} colaboradores ativos nesta auditoria`}
        action={<Button variant="outline" onClick={() => downloadCsv(
          "auditops-relatorio-colaboradores.csv",
          ["Posição", "Colaborador", "Leituras", "Participação"],
          rows.map((row, index) => [index + 1, row.nome, row.qtd, totalLeituras ? Number(((row.qtd / totalLeituras) * 100).toFixed(2)) : 0]),
          [filterSummary.length ? `Filtros globais: ${filterSummary.join(" · ")}` : "Filtros globais: nenhum filtro aplicado"],
        )}><Download className="mr-2 size-4"/>Exportar ranking</Button>}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="surface-card p-5"><p className="text-sm text-muted-foreground">Colaboradores ativos</p><p className="mt-2 text-3xl font-bold text-tabular">{result.colaboradoresAtivos.toLocaleString("pt-BR")}</p><p className="mt-1 text-xs text-muted-foreground">Usuários distintos registrados na planilha.</p></div>
        <div className="surface-card p-5"><p className="text-sm text-muted-foreground">{hasFilters ? "Leituras no recorte" : "Leituras atribuídas"}</p><p className="mt-2 text-3xl font-bold text-tabular">{totalLeituras.toLocaleString("pt-BR")}</p><p className="mt-1 text-xs text-muted-foreground">{hasFilters ? "Soma dos registros que correspondem ao recorte." : "Soma das leituras do ranking original."}</p></div>
        <div className="surface-card p-5"><p className="text-sm text-muted-foreground">Maior volume</p><p className="mt-2 truncate text-xl font-bold">{rows[0]?.nome ?? "Sem dados"}</p><p className="mt-1 text-xs text-muted-foreground">{rows[0]?.qtd.toLocaleString("pt-BR") ?? "0"} leituras {hasFilters ? "no recorte" : "registradas"}.</p></div>
      </div>
      <SectionCard title="Ranking de leituras" description={hasFilters ? "Este ranking reflete os registros correspondentes aos filtros globais; a participação é calculada dentro deste recorte, não sobre o total de SKU." : "A participação é calculada sobre a soma das leituras atribuídas aos usuários, não sobre o total de SKU."}>
        {rows.length > 0 ? <RankingBars data={rows} valueLabel="Leituras" color="var(--link)"/> : <p className="py-10 text-center text-sm text-muted-foreground">Nenhum colaborador encontrado para a busca.</p>}
        <div className="audit-table-scroll mt-6"><table className="audit-table"><thead><tr><th>Posição</th><th>Colaborador</th><th className="text-right">Leituras</th><th className="text-right">Participação</th><th>Ação</th></tr></thead><tbody>
          {rows.map((row) => { const rank = rows.findIndex((item) => item.nome === row.nome) + 1; const selected = row.nome === selectedName; const share = totalLeituras ? (row.qtd / totalLeituras) * 100 : 0; return <tr key={row.nome} className={selected ? "bg-accent" : ""}><td className="text-muted-foreground">#{rank}</td><td className="font-semibold">{row.nome}</td><td className="text-right font-semibold text-tabular">{row.qtd.toLocaleString("pt-BR")}</td><td className="text-right text-tabular">{share.toFixed(2)}%</td><td><Button size="sm" variant={selected ? "audit" : "outline"} onClick={() => setSelectedName(selected ? null : row.nome)}>{selected ? "Fechar detalhes" : "Ver leituras"}</Button></td></tr>; })}
          {rows.length === 0 ? <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">Sem registros.</td></tr> : null}
        </tbody></table></div>
      </SectionCard>
      {!selectedName ? <div className="flex items-start gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground"><Users className="mt-0.5 size-4 shrink-0"/><p>{hasFilters ? "O ranking, as leituras exibidas e a exportação respeitam os filtros globais ativos. Os indicadores principais da auditoria permanecem originais." : "Selecione “Ver leituras” no ranking para abrir uma janela de consulta sem sair da página. Este relatório é independente do relatório de itens críticos."}</p></div> : null}
      <AuditDetailDialog
        open={selectedName !== null}
        onOpenChange={(open) => { if (!open) setSelectedName(null); }}
        title={`Leituras de ${selectedName ?? "colaborador"}`}
        description={`${details.length.toLocaleString("pt-BR")} registros vinculados a este usuário, incluindo situação, local e horário quando disponíveis.`}
        rows={details}
        recordsAvailable={Boolean(result.detalhesRegistros)}
        legacyMessage="Esta auditoria foi salva antes do detalhamento individual. Reimporte a planilha atual para consultar as linhas vinculadas aos colaboradores."
        emptyMessage="Não foram encontrados registros individuais para este colaborador."
      />
    </PageTransition>;
  }}</RequireAudit>;
}
