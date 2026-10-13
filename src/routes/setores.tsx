import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useState } from "react";
import { ArrowUpRight, Filter } from "lucide-react";
import { PageHeader, PageTransition } from "@/components/PageTransition";
import { AuditDetailDialog } from "@/components/AuditDetailDialog";
import { RequireAudit } from "@/components/RequireAudit";
import { SectionCard } from "@/components/SectionCard";
import { useGlobalAuditFilters, useSearchQuery } from "@/lib/search-store";
import { applyGlobalAuditFilters, getGlobalSectorRows, hasActiveGlobalFilters } from "@/lib/audit/global-filters";
import { SITUACAO_PENDENCIA } from "@/lib/audit/types";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/setores")({
  head: () => ({ meta: [{ title: "Setores · AuditOps" }, { name: "description", content: "Pendências e detalhamento de produtos por classe de produto raiz." }] }),
  component: SetoresPage,
});

function SetoresPage() {
  const query = useSearchQuery();
  const globalFilters = useGlobalAuditFilters();
  const [selectedSector, setSelectedSector] = useState<string | null>(null);

  return <RequireAudit>{(result) => {
    const hasFilters = hasActiveGlobalFilters(globalFilters, query);
    const rows = getGlobalSectorRows(result, globalFilters, query);
    const max = Math.max(1, ...rows.map((row) => row.qtd));
    const pendingRows = (result.detalhesRegistros ?? []).filter((row) => row.situacao === SITUACAO_PENDENCIA[result.auditoria]);
    const scopedPending = applyGlobalAuditFilters(pendingRows, globalFilters, query);
    const details = scopedPending.filter((row) => row.classeRaiz === selectedSector);

    return <PageTransition>
      <PageHeader title="Setores" subtitle={`Pendências por classe de produto raiz · auditoria de ${result.auditoria}`} />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="surface-card p-5"><p className="text-sm text-muted-foreground">Pendências contabilizadas</p><p className="mt-2 text-3xl font-bold text-tabular">{result.naoLidos.toLocaleString("pt-BR")}</p><p className="mt-1 text-xs text-muted-foreground">Base utilizada no cálculo de representatividade.</p></div>
        <div className="surface-card p-5"><p className="text-sm text-muted-foreground">Classes no ranking</p><p className="mt-2 text-3xl font-bold text-tabular">{rows.length}</p><p className="mt-1 text-xs text-muted-foreground">{hasFilters ? "Classes presentes no recorte atual." : "Categorias e regras originais mantidas."}</p></div>
        <div className="surface-card p-5"><p className="text-sm text-muted-foreground">Registros disponíveis para detalhe</p><p className="mt-2 text-3xl font-bold text-tabular">{(result.detalhesRegistros ?? []).filter((row) => row.situacao === SITUACAO_PENDENCIA[result.auditoria]).length.toLocaleString("pt-BR")}</p><p className="mt-1 text-xs text-muted-foreground">Registros individuais da situação de pendência.</p></div>
      </div>
      <SectionCard title="Ranking de pendências" description={hasFilters ? `Recorte atual: ${scopedPending.length.toLocaleString("pt-BR")} registros pendentes correspondentes aos filtros globais. Os KPIs acima continuam mostrando os totais originais.` : `Base: ${result.naoLidos.toLocaleString("pt-BR")} itens não lidos. Selecione uma classe para abrir os produtos associados.`}>
        <div className="audit-table-scroll"><table className="audit-table"><thead><tr><th>Posição</th><th>Setor / classe raiz</th><th className="text-right">Quantidade</th><th>Representatividade da base</th><th>Detalhes</th></tr></thead>
          <tbody>{rows.map((row) => {
            const index = rows.findIndex((item) => item.setor === row.setor);
            const selected = selectedSector === row.setor;
            return <motion.tr key={row.setor} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2, delay: Math.min(index * 0.015, 0.3) }} className={`border-b border-border/60 transition-colors last:border-0 hover:bg-accent/60 ${selected ? "bg-accent" : ""}`}>
              <td className="w-20 text-muted-foreground">#{index + 1}</td>
              <td className="font-semibold">{row.setor}</td>
              <td className="text-right font-semibold text-tabular">{row.qtd.toLocaleString("pt-BR")}</td>
              <td><div className="flex items-center gap-3"><div className="h-2.5 w-full max-w-64 overflow-hidden rounded-full bg-muted"><motion.div initial={{ width: 0 }} animate={{ width: `${(row.qtd / max) * 100}%` }} transition={{ duration: 0.6, delay: Math.min(index * .015, .3) }} className="h-full rounded-full btn-gradient" /></div><span className="w-16 shrink-0 text-right text-xs font-semibold text-tabular text-muted-foreground">{row.representatividade.toFixed(2)}%</span></div></td>
              <td><Button size="sm" variant={selected ? "audit" : "outline"} onClick={() => setSelectedSector(selected ? null : row.setor)} aria-haspopup="dialog">{selected ? "Fechar" : "Ver produtos"}<ArrowUpRight className="ml-1.5 size-3.5" /></Button></td>
            </motion.tr>;
          })}
          {rows.length === 0 ? <tr><td colSpan={5} className="py-8 text-center text-sm text-muted-foreground">Nenhum setor encontrado para a busca.</td></tr> : null}
          </tbody></table></div>
      </SectionCard>
      {!selectedSector ? <div className="flex items-start gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground"><Filter className="mt-0.5 size-4 shrink-0"/><p>{hasFilters ? "O ranking e as consultas refletem os filtros globais ativos. Os números originais da auditoria não são alterados." : "Selecione “Ver produtos” em uma classe para abrir os registros em uma janela sobreposta, sem deslocar o ranking."}</p></div> : null}
      <AuditDetailDialog
        open={selectedSector !== null}
        onOpenChange={(open) => { if (!open) setSelectedSector(null); }}
        title={`Produtos · ${selectedSector ?? "setor"}`}
        description={`${details.length.toLocaleString("pt-BR")} registros encontrados na situação de pendência. Os totais do ranking continuam usando as regras originais.`}
        rows={details}
        recordsAvailable={Boolean(result.detalhesRegistros)}
        legacyMessage="Esta auditoria foi salva antes da expansão do detalhamento. Reimporte a planilha para habilitar a lista completa de produtos desta classe."
        emptyMessage="Não há registros individuais para esta classe na situação de pendência."
      />
    </PageTransition>;
  }}</RequireAudit>;
}
