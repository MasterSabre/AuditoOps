import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ArchiveRestore, Clock3, Download, GitCompare, History, Trash2 } from "lucide-react";
import { PageHeader, PageTransition } from "@/components/PageTransition";
import { SectionCard } from "@/components/SectionCard";
import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/components/AuditDetailTable";
import { useGlobalAuditFilters, useSearchQuery } from "@/lib/search-store";
import { getGlobalCollaboratorRows, getGlobalCorridorRows, getGlobalFilterSummary, getGlobalSectorRows, hasActiveGlobalFilters } from "@/lib/audit/global-filters";
import { useAuditHistory, removeAuditHistoryEntry, clearAuditHistory, setAuditResult, type AuditHistoryEntry } from "@/lib/audit/store";

export const Route = createFileRoute("/historico")({
  head: () => ({ meta: [{ title: "Histórico local do painel · AuditOps" }, { name: "description", content: "Instantâneos locais do painel para restaurar e comparar versões recentes." }] }),
  component: HistoricoPage,
});

const formatDate = (value: string) => new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
const difference = (current: number, previous: number) => current - previous;
const signed = (value: number, decimals = 0) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
const number = (value: number, decimals = 0) => value.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

function HistorySelect({ label, entries, value, onChange }: { label: string; entries: AuditHistoryEntry[]; value: string; onChange: (value: string) => void }) {
  return <label className="space-y-2 text-sm font-medium">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="h-12 w-full rounded-md border border-input bg-background px-3 text-foreground">{entries.map((entry) => <option key={entry.id} value={entry.id}>{formatDate(entry.savedAt)} · {entry.result.auditoria} · {entry.result.origem}</option>)}</select></label>;
}

function HistoricoPage() {
  const history = useAuditHistory();
  const filters = useGlobalAuditFilters();
  const query = useSearchQuery();
  const [baseId, setBaseId] = useState("");
  const [targetId, setTargetId] = useState("");
  const baseEntry = history.find((entry) => entry.id === baseId) ?? history[1] ?? history[0];
  const targetEntry = history.find((entry) => entry.id === targetId) ?? history[0];
  const base = baseEntry?.result;
  const target = targetEntry?.result;
  const hasFilters = hasActiveGlobalFilters(filters, query);
  const filterSummary = getGlobalFilterSummary(filters, query);

  type ComparisonValuePair = { label: string; before: number; after: number; decimals?: number; direction: "neutral" | "lower" | "higher" };
  const valuePairs: ComparisonValuePair[] = base && target ? [
    { label: "SKU da base", before: base.sku, after: target.sku, direction: "neutral" },
    { label: "Itens não lidos", before: base.naoLidos, after: target.naoLidos, direction: "lower" },
    { label: "Lidos com estoque", before: base.lidosComEstoque, after: target.lidosComEstoque, direction: "higher" },
    { label: "Lidos sem estoque", before: base.lidosSemEstoque, after: target.lidosSemEstoque, direction: "neutral" },
    { label: "Etiquetas desatualizadas", before: base.etiquetasDesatualizadas, after: target.etiquetasDesatualizadas, direction: "lower" },
    { label: "Itens lidos não pertencentes", before: base.lidosNaoPertence, after: target.lidosNaoPertence, direction: "lower" },
    { label: "Colaboradores ativos", before: base.colaboradoresAtivos, after: target.colaboradoresAtivos, direction: "neutral" },
    { label: "Parcial de pendências (%)", before: base.parcial, after: target.parcial, decimals: 2, direction: "lower" },
  ] : [];

  const baseSectors = base ? getGlobalSectorRows(base, filters, query) : [];
  const targetSectors = target ? getGlobalSectorRows(target, filters, query) : [];
  const sectorNames = Array.from(new Set([...baseSectors.map((item) => item.setor), ...targetSectors.map((item) => item.setor)])).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const baseCollaborators = base ? getGlobalCollaboratorRows(base, filters, query) : [];
  const targetCollaborators = target ? getGlobalCollaboratorRows(target, filters, query) : [];
  const collaboratorNames = Array.from(new Set([...baseCollaborators.map((item) => item.nome), ...targetCollaborators.map((item) => item.nome)])).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const baseCorridors = base ? getGlobalCorridorRows(base, filters, query) : [];
  const targetCorridors = target ? getGlobalCorridorRows(target, filters, query) : [];
  const corridorNames = Array.from(new Set([...baseCorridors.map((item) => item.nome), ...targetCorridors.map((item) => item.nome)])).sort((a, b) => a.localeCompare(b, "pt-BR"));

  const exportComparison = () => {
    if (!base || !target) return;
    const rows: Array<Array<unknown>> = [];
    valuePairs.forEach((item) => rows.push(["Indicador", item.label, item.before, item.after, item.after - item.before]));
    sectorNames.forEach((name) => {
      const before = baseSectors.find((item) => item.setor === name)?.qtd ?? 0;
      const after = targetSectors.find((item) => item.setor === name)?.qtd ?? 0;
      rows.push(["Setor", name, before, after, after - before]);
    });
    collaboratorNames.forEach((name) => {
      const before = baseCollaborators.find((item) => item.nome === name)?.qtd ?? 0;
      const after = targetCollaborators.find((item) => item.nome === name)?.qtd ?? 0;
      rows.push(["Colaborador", name, before, after, after - before]);
    });
    corridorNames.forEach((name) => {
      const before = baseCorridors.find((item) => item.nome === name)?.qtd ?? 0;
      const after = targetCorridors.find((item) => item.nome === name)?.qtd ?? 0;
      rows.push(["Corredor / local", name, before, after, after - before]);
    });
    downloadCsv(
      "auditops-comparacao-auditorias.csv",
      ["Grupo", "Indicador / nome", `Base · ${formatDate(baseEntry!.savedAt)}`, `Comparação · ${formatDate(targetEntry!.savedAt)}`, "Variação"],
      rows,
      [
        `Auditoria base: ${base.origem} · salva em ${formatDate(baseEntry!.savedAt)}`,
        `Auditoria de comparação: ${target.origem} · salva em ${formatDate(targetEntry!.savedAt)}`,
        filterSummary.length ? `Filtros globais: ${filterSummary.join(" · ")}` : "Filtros globais: nenhum filtro aplicado",
      ],
    );
  };

  return <PageTransition>
    <PageHeader title="Histórico local do painel" subtitle="Esta página guarda instantâneos recentes no navegador para restauração e comparação. O histórico completo de planilhas fica em Análise de Auditorias, salvo no banco SQL local." action={<Button variant="outline" disabled={history.length === 0} onClick={() => { if (window.confirm("Apagar todo o histórico local? A auditoria atual continuará carregada.")) clearAuditHistory(); }}><Trash2 className="mr-2 size-4"/>Limpar histórico</Button>} />
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="surface-card p-5"><p className="text-sm text-muted-foreground">Auditorias guardadas</p><p className="mt-2 text-3xl font-bold text-tabular">{history.length}</p><p className="mt-1 text-xs text-muted-foreground">Mantém até 8 instantâneos; o limite pode cair se o navegador ficar sem espaço.</p></div>
      <div className="surface-card p-5"><p className="text-sm text-muted-foreground">Armazenamento</p><p className="mt-2 text-xl font-bold">Este navegador</p><p className="mt-1 text-xs text-muted-foreground">Não sincroniza automaticamente com outros usuários ou computadores.</p></div>
      <div className="surface-card p-5"><p className="text-sm text-muted-foreground">Mais recente</p><p className="mt-2 text-xl font-bold">{history[0] ? formatDate(history[0].savedAt) : "Sem registros"}</p><p className="mt-1 truncate text-xs text-muted-foreground">{history[0]?.result.origem ?? "Processe uma planilha para iniciar o histórico."}</p></div>
    </div>

    <SectionCard title="Auditorias salvas" description="Restaure uma auditoria anterior ou remova um registro específico. Restaurar cria um novo registro no histórico.">
      {history.length === 0 ? <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center"><History className="size-8 text-muted-foreground"/><p className="font-semibold">Ainda não há auditorias processadas no histórico.</p><p className="max-w-lg text-sm text-muted-foreground">Ao processar uma planilha no Calendário semanal, o AuditOps salva um instantâneo local dos indicadores. Para consultar todas as execuções persistidas em SQL, abra Análise de Auditorias.</p></div> : <div className="space-y-3">
        {history.map((entry, index) => { const demo = entry.result.origem.toLocaleLowerCase("pt-BR").includes("demonstração") || entry.result.origem.toLocaleLowerCase("pt-BR").includes("exemplo"); return <article key={entry.id} className="flex flex-col gap-4 rounded-xl border p-4 transition-colors hover:bg-accent/30 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted"><Clock3 className="size-5"/></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{entry.result.origem}</h3>{index === 0 ? <span className="rounded-full bg-success/10 px-2 py-1 text-xs font-semibold text-success">Mais recente</span> : null}{demo ? <span className="rounded-full bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">Demonstração</span> : null}</div><p className="mt-1 text-sm text-muted-foreground">Salvo em {formatDate(entry.savedAt)} · Auditoria {entry.result.auditoria} · Data auditada {entry.result.dataAuditoria}</p><p className="mt-2 text-sm">{entry.result.naoLidos.toLocaleString("pt-BR")} não lidos <span className="px-1 text-muted-foreground">·</span>{entry.result.parcial.toFixed(2)}% parcial <span className="px-1 text-muted-foreground">·</span>{entry.result.colaboradoresAtivos} colaboradores</p></div></div>
          <div className="flex shrink-0 flex-wrap gap-2"><Button size="sm" variant="audit" onClick={() => { setAuditResult(entry.result); window.location.href = "/"; }}><ArchiveRestore className="mr-1.5 size-4"/>Restaurar</Button><Button size="sm" variant="outline" onClick={() => { if (window.confirm("Remover esta auditoria do histórico?")) removeAuditHistoryEntry(entry.id); }}><Trash2 className="mr-1.5 size-4"/>Remover</Button></div>
        </article>; })}
      </div>}
    </SectionCard>

    {history.length >= 2 ? <SectionCard title="Comparação entre auditorias" description="Escolha a auditoria base e a auditoria de comparação. Os KPIs são os valores originais salvos; filtros globais refinam os rankings detalhados.">
      <div className="grid gap-4 lg:grid-cols-2"><HistorySelect label="Auditoria base" entries={history} value={baseEntry?.id ?? ""} onChange={setBaseId}/><HistorySelect label="Auditoria de comparação" entries={history} value={targetEntry?.id ?? ""} onChange={setTargetId}/></div>
      {base && target ? <>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/25 p-3">
          <div className="min-w-0 text-sm"><p className="font-semibold">{baseEntry ? formatDate(baseEntry.savedAt) : "Base"} <span className="px-1 text-muted-foreground">→</span> {targetEntry ? formatDate(targetEntry.savedAt) : "Comparação"}</p><p className="mt-1 text-xs text-muted-foreground">Base: {base.origem} · Comparação: {target.origem}</p></div>
          <Button variant="audit" onClick={exportComparison}><Download className="mr-2 size-4"/>Exportar comparação CSV</Button>
        </div>
        {base.auditoria !== target.auditoria ? <p className="mt-4 rounded-lg border border-critical/30 bg-critical/5 p-3 text-sm text-critical">Atenção: os tipos de auditoria são diferentes ({base.auditoria} e {target.auditoria}). Os indicadores são mostrados lado a lado; compare-os com cautela, pois os critérios não são equivalentes.</p> : null}
        {hasFilters ? <p className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs leading-relaxed text-muted-foreground"><strong className="text-foreground">Filtros globais nos detalhamentos:</strong> {filterSummary.join(" · ")}. A tabela de indicadores principais continua exibindo os valores integrais de cada auditoria.</p> : null}

        <div className="audit-table-scroll mt-5"><table className="audit-table"><thead><tr><th>Indicador</th><th className="text-right">Base</th><th className="text-right">Comparação</th><th className="text-right">Variação</th></tr></thead><tbody>{valuePairs.map((item) => { const delta = difference(item.after, item.before); const tone = delta === 0 || item.direction === "neutral" ? "text-muted-foreground" : (item.direction === "lower" ? delta < 0 : delta > 0) ? "text-success" : "text-critical"; return <tr key={item.label}><td className="font-semibold">{item.label}</td><td className="text-right text-tabular">{number(item.before, item.decimals ?? 0)}{item.decimals ? "%" : ""}</td><td className="text-right text-tabular">{number(item.after, item.decimals ?? 0)}{item.decimals ? "%" : ""}</td><td className={`text-right font-semibold text-tabular ${tone}`}>{signed(delta, item.decimals ?? 0)}{item.decimals ? " p.p." : ""}</td></tr>; })}</tbody></table></div>

        <div className="mt-7"><div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><h3 className="font-semibold">Variação por setor</h3><p className="text-xs text-muted-foreground">Contagens de pendências por classe raiz.</p></div><span className="text-xs text-muted-foreground">{sectorNames.length} setores no comparativo</span></div><div className="audit-table-scroll"><table className="audit-table"><thead><tr><th>Setor</th><th className="text-right">Base</th><th className="text-right">Comparação</th><th className="text-right">Variação</th></tr></thead><tbody>{sectorNames.map((name) => { const before = baseSectors.find((item) => item.setor === name)?.qtd ?? 0; const after = targetSectors.find((item) => item.setor === name)?.qtd ?? 0; const delta = after - before; return <tr key={name}><td className="font-semibold">{name}</td><td className="text-right text-tabular">{number(before)}</td><td className="text-right text-tabular">{number(after)}</td><td className={`text-right font-semibold text-tabular ${delta > 0 ? "text-critical" : delta < 0 ? "text-success" : "text-muted-foreground"}`}>{signed(delta)}</td></tr>; })}{sectorNames.length === 0 ? <tr><td colSpan={4} className="py-6 text-center text-sm text-muted-foreground">Nenhum setor corresponde aos filtros selecionados.</td></tr> : null}</tbody></table></div></div>

        <div className="mt-7"><div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><h3 className="font-semibold">Variação por colaborador</h3><p className="text-xs text-muted-foreground">Comparação dos totais de leitura por usuário nos dois instantâneos.</p></div><span className="text-xs text-muted-foreground">{collaboratorNames.length} colaboradores</span></div><div className="audit-table-scroll"><table className="audit-table"><thead><tr><th>Colaborador</th><th className="text-right">Base</th><th className="text-right">Comparação</th><th className="text-right">Variação</th></tr></thead><tbody>{collaboratorNames.map((name) => { const before = baseCollaborators.find((item) => item.nome === name)?.qtd ?? 0; const after = targetCollaborators.find((item) => item.nome === name)?.qtd ?? 0; const delta = after - before; return <tr key={name}><td className="font-semibold">{name}</td><td className="text-right text-tabular">{number(before)}</td><td className="text-right text-tabular">{number(after)}</td><td className={`text-right font-semibold text-tabular ${delta > 0 ? "text-link" : delta < 0 ? "text-critical" : "text-muted-foreground"}`}>{signed(delta)}</td></tr>; })}{collaboratorNames.length === 0 ? <tr><td colSpan={4} className="py-6 text-center text-sm text-muted-foreground">Nenhum colaborador corresponde aos filtros selecionados.</td></tr> : null}</tbody></table></div></div>

        <div className="mt-7"><div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><h3 className="font-semibold">Variação por corredor / local</h3><p className="text-xs text-muted-foreground">O ranking original guarda até 15 locais por auditoria; com filtros, o ranking é calculado sobre o recorte disponível.</p></div><span className="text-xs text-muted-foreground">{corridorNames.length} locais</span></div><div className="audit-table-scroll"><table className="audit-table"><thead><tr><th>Corredor / local</th><th className="text-right">Base</th><th className="text-right">Comparação</th><th className="text-right">Variação</th></tr></thead><tbody>{corridorNames.map((name) => { const before = baseCorridors.find((item) => item.nome === name)?.qtd ?? 0; const after = targetCorridors.find((item) => item.nome === name)?.qtd ?? 0; const delta = after - before; return <tr key={name}><td className="font-semibold">{name}</td><td className="text-right text-tabular">{number(before)}</td><td className="text-right text-tabular">{number(after)}</td><td className={`text-right font-semibold text-tabular ${delta > 0 ? "text-critical" : delta < 0 ? "text-success" : "text-muted-foreground"}`}>{signed(delta)}</td></tr>; })}{corridorNames.length === 0 ? <tr><td colSpan={4} className="py-6 text-center text-sm text-muted-foreground">Nenhum corredor corresponde aos filtros selecionados.</td></tr> : null}</tbody></table></div></div>
      </> : null}
    </SectionCard> : <div className="flex items-start gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground"><GitCompare className="mt-0.5 size-4 shrink-0"/><p>Depois de processar duas ou mais auditorias, você poderá comparar indicadores, setores, colaboradores e corredores.</p></div>}
  </PageTransition>;
}
