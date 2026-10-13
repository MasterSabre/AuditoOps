import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Archive, AlertTriangle, CheckCircle2, Clock3, Database, Download, HardDrive, RefreshCw, RotateCcw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, PageTransition } from "@/components/PageTransition";
import { SectionCard } from "@/components/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createDatabaseBackup, downloadDatabaseBackup, fetchDatabaseBackups, restoreDatabaseBackup, type AuditBackup } from "@/lib/audit/database-client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/seguranca-dados")({
  head: () => ({ meta: [{ title: "Segurança e recuperação · AuditOps" }, { name: "description", content: "Crie, baixe, verifique e restaure backups do histórico SQL do AuditOps." }] }),
  component: DataSafetyPage,
});

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" });
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} MB`;
}

function DataSafetyPage() {
  const [backups, setBackups] = useState<AuditBackup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<AuditBackup | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [lastRestore, setLastRestore] = useState<{ backup: string; safety: string; counts: { schedules: number; audits: number; details: number } } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadBackups = useCallback(async (showSpinner = true) => {
    if (showSpinner) setRefreshing(true);
    setError(null);
    try {
      setBackups(await fetchDatabaseBackups());
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não foi possível consultar os backups.";
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadBackups(false); }, [loadBackups]);

  const createBackup = async () => {
    setCreating(true);
    try {
      const created = await createDatabaseBackup();
      toast.success("Backup criado com sucesso", { description: `${created.fileName} · ${formatBytes(created.bytes)}` });
      await loadBackups(false);
    } catch (err) {
      toast.error("Não foi possível criar o backup", { description: err instanceof Error ? err.message : "Erro desconhecido." });
    } finally {
      setCreating(false);
    }
  };

  const downloadBackup = async (backup: AuditBackup) => {
    setDownloadingId(backup.id);
    try {
      await downloadDatabaseBackup(backup.id);
      toast.success("Download do backup iniciado", { description: backup.fileName });
    } catch (err) {
      toast.error("Falha ao baixar o backup", { description: err instanceof Error ? err.message : "Erro desconhecido." });
    } finally {
      setDownloadingId(null);
    }
  };

  const restore = async () => {
    if (!restoreTarget || confirmation !== "RESTAURAR") return;
    setRestoring(true);
    try {
      const result = await restoreDatabaseBackup(restoreTarget.id);
      setLastRestore({ backup: result.restoredBackupId, safety: result.safetyBackupId, counts: result.restored });
      setRestoreTarget(null);
      setConfirmation("");
      toast.success("Histórico restaurado", { description: `Backup de segurança criado: ${result.safetyBackupId}.` });
      await loadBackups(false);
    } catch (err) {
      toast.error("Não foi possível restaurar o backup", { description: err instanceof Error ? err.message : "Erro desconhecido." });
    } finally {
      setRestoring(false);
    }
  };

  const latest = backups[0];
  const totalBytes = backups.reduce((sum, backup) => sum + backup.bytes, 0);

  return <PageTransition>
    <PageHeader title="Segurança e recuperação" subtitle="Proteja o histórico do AuditOps com snapshots consistentes do SQLite, downloads e restauração validada." action={<Button variant="outline" onClick={() => void loadBackups()} disabled={refreshing}><RefreshCw className={cn("mr-2 size-4", refreshing ? "animate-spin" : "")} />Atualizar lista</Button>} />

    <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <article className="surface-card min-w-0 p-5"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Archive className="size-4" />Backups disponíveis</div><p className="mt-3 text-3xl font-bold tracking-tight text-tabular">{loading ? "…" : backups.length.toLocaleString("pt-BR")}</p><p className="mt-1 text-xs text-muted-foreground">Cópias armazenadas neste servidor</p></article>
      <article className="surface-card min-w-0 p-5"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Clock3 className="size-4" />Último backup</div><p className="mt-3 text-base font-bold">{latest ? formatDate(latest.createdAt) : loading ? "Carregando…" : "Nenhum backup"}</p><p className="mt-1 text-xs text-muted-foreground">{latest?.fileName ?? "Crie a primeira cópia de segurança"}</p></article>
      <article className="surface-card min-w-0 p-5"><div className="flex items-center gap-2 text-sm text-muted-foreground"><HardDrive className="size-4" />Espaço dos backups</div><p className="mt-3 text-3xl font-bold tracking-tight text-tabular">{formatBytes(totalBytes)}</p><p className="mt-1 text-xs text-muted-foreground">Soma dos arquivos de backup</p></article>
      <article className="surface-card min-w-0 p-5"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Database className="size-4" />Banco principal</div><p className="mt-3 text-base font-bold">SQLite local</p><p className="mt-1 break-all text-xs text-muted-foreground">data/auditops.sqlite</p></article>
    </div>

    <SectionCard className="mt-5" title="Criar cópia de segurança" description="O sistema usa um snapshot consistente do SQLite para que os dados relacionados sejam guardados juntos, mesmo com o aplicativo em uso." action={<Button variant="audit" onClick={() => void createBackup()} disabled={creating}><Archive className={cn("mr-2 size-4", creating ? "animate-pulse" : "")} />{creating ? "Criando backup…" : "Criar backup agora"}</Button>}>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border p-4"><CheckCircle2 className="size-5 text-success" /><p className="mt-2 font-semibold">Snapshot consistente</p><p className="mt-1 text-sm text-muted-foreground">Agenda, execuções e registros de produtos copiados como uma unidade lógica.</p></div>
        <div className="rounded-lg border p-4"><ShieldCheck className="size-5 text-success" /><p className="mt-2 font-semibold">Validação antes de restaurar</p><p className="mt-1 text-sm text-muted-foreground">O arquivo passa pela verificação de integridade e validação das tabelas essenciais.</p></div>
        <div className="rounded-lg border p-4"><RotateCcw className="size-5 text-success" /><p className="mt-2 font-semibold">Ponto de retorno automático</p><p className="mt-1 text-sm text-muted-foreground">Antes de cada restauração, outra cópia do estado atual é criada automaticamente.</p></div>
      </div>
    </SectionCard>

    {error ? <div className="mt-5 flex gap-3 rounded-lg border border-critical/30 bg-critical/5 p-4 text-sm text-critical"><AlertTriangle className="size-5 shrink-0" /><div><p className="font-semibold">Não foi possível carregar os backups</p><p className="mt-1">{error}</p></div></div> : null}

    {lastRestore ? <div className="mt-5 rounded-lg border border-success/30 bg-success/5 p-4 text-sm"><div className="flex items-center gap-2 font-semibold text-success"><CheckCircle2 className="size-4" />Restauração concluída</div><p className="mt-2">Fonte: <code>{lastRestore.backup}.sqlite</code></p><p>Backup preventivo criado: <code>{lastRestore.safety}.sqlite</code></p><p className="mt-1 text-muted-foreground">Restaurados: {lastRestore.counts.schedules.toLocaleString("pt-BR")} agendas · {lastRestore.counts.audits.toLocaleString("pt-BR")} auditorias · {lastRestore.counts.details.toLocaleString("pt-BR")} detalhes. Ao voltar às telas de análise, atualize os dados para reler o histórico restaurado.</p></div> : null}

    <SectionCard className="mt-5" title="Histórico de backups" description="Baixe uma cópia para guardar em outro disco ou restaure uma versão anterior do histórico." action={<span className="rounded-full border bg-muted/60 px-3 py-1 text-xs font-semibold">{backups.length.toLocaleString("pt-BR")} arquivo(s)</span>}>
      {loading ? <div className="p-8 text-center text-sm text-muted-foreground">Consultando backups…</div> : backups.length === 0 ? <div className="rounded-xl border border-dashed p-10 text-center"><Archive className="mx-auto size-9 text-muted-foreground" /><p className="mt-3 font-semibold">Nenhum backup criado</p><p className="mt-1 text-sm text-muted-foreground">Crie sua primeira cópia de segurança antes de fazer mudanças importantes ou atualizar o sistema.</p><Button className="mt-4" variant="audit" onClick={() => void createBackup()} disabled={creating}>Criar primeiro backup</Button></div> : <div className="audit-table-scroll"><table className="audit-table"><thead><tr><th>Data de criação</th><th>Arquivo</th><th>Tamanho</th><th className="text-right">Ações</th></tr></thead><tbody>{backups.map((backup) => <tr key={backup.id}><td>{formatDate(backup.createdAt)}</td><td className="max-w-80 break-all font-mono text-xs" title={backup.fileName}>{backup.fileName}</td><td className="text-tabular">{formatBytes(backup.bytes)}</td><td><div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => void downloadBackup(backup)} disabled={downloadingId === backup.id}><Download className="mr-1.5 size-3.5" />{downloadingId === backup.id ? "Preparando…" : "Baixar"}</Button><Button size="sm" variant="outline" onClick={() => { setRestoreTarget(backup); setConfirmation(""); }}><RotateCcw className="mr-1.5 size-3.5" />Restaurar</Button></div></td></tr>)}</tbody></table></div>}
    </SectionCard>

    <div className="mt-5 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm"><AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" /><div><p className="font-semibold">Recomendação importante</p><p className="mt-1 text-muted-foreground">Os backups guardados apenas no mesmo computador não protegem contra falha física do disco. Baixe cópias periódicas para outro disco ou local seguro. A restauração substitui o histórico atual; por isso, o sistema cria uma cópia preventiva antes de aplicar o backup escolhido.</p></div></div>

    {restoreTarget ? <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !restoring) setRestoreTarget(null); }}><section role="dialog" aria-modal="true" aria-labelledby="restore-title" className="w-full max-w-lg rounded-xl border bg-card p-5 shadow-2xl"><div className="flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600"><AlertTriangle className="size-5" /></span><div><h2 id="restore-title" className="text-lg font-bold">Restaurar histórico do AuditOps?</h2><p className="mt-1 text-sm text-muted-foreground">O histórico ativo será substituído pelos dados de <strong>{restoreTarget.fileName}</strong>. Uma cópia preventiva do estado atual será criada primeiro.</p></div></div><div className="mt-5 space-y-2"><Label htmlFor="restore-confirmation">Digite RESTAURAR para confirmar</Label><Input id="restore-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" placeholder="RESTAURAR" disabled={restoring} /></div><div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={() => setRestoreTarget(null)} disabled={restoring}>Cancelar</Button><Button variant="destructive" onClick={() => void restore()} disabled={restoring || confirmation !== "RESTAURAR"}><RotateCcw className="mr-2 size-4" />{restoring ? "Restaurando…" : "Restaurar histórico"}</Button></div></section></div> : null}
  </PageTransition>;
}
