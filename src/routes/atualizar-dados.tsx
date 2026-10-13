import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Database,
  FileSpreadsheet,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { PageHeader, PageTransition } from "@/components/PageTransition";
import { SectionCard } from "@/components/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuditParseError, inspectWorkbookFile, parseWorkbookFile, MAX_WORKBOOK_SIZE_BYTES, type WorkbookPreview } from "@/lib/audit/parse";
import { createSqlCalendarSlot, fetchCalendar, saveAuditToSql, type CalendarEvent } from "@/lib/audit/database-client";
import { getLocalIsoDate, getWeeklyScheduleForDate, startOfIsoWeek, addIsoDays, formatIsoDatePtBr } from "@/lib/audit/schedule";
import { loadDemoResult, setAuditResult } from "@/lib/audit/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/atualizar-dados")({
  head: () => ({
    meta: [
      { title: "Calendário semanal · AuditOps" },
      { name: "description", content: "Calendário inteligente de auditorias e processamento de planilhas vinculado ao banco SQL local." },
      { property: "og:title", content: "Calendário semanal · AuditOps" },
      { property: "og:description", content: "Agenda semanal, janelas de auditoria e importação automática por dia." },
    ],
  }),
  component: CalendarPage,
});

const weekdayShort = ["dom.", "seg.", "ter.", "qua.", "qui.", "sex.", "sáb."];
const prettyDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
const fullDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

function CalendarPage() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLDivElement>(null);
  const today = getLocalIsoDate();
  const [data, setData] = useState(today);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<WorkbookPreview | null>(null);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [calendarVersion, setCalendarVersion] = useState(0);
  const expectedSchedule = getWeeklyScheduleForDate(data);
  const hasTypeMismatch = Boolean(preview && expectedSchedule && preview.auditoria !== expectedSchedule.type);

  const weekStart = useMemo(() => addIsoDays(startOfIsoWeek(today), weekOffset * 7), [today, weekOffset]);
  const weekEnd = useMemo(() => addIsoDays(weekStart, 6), [weekStart]);
  const calendarDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addIsoDays(weekStart, index)), [weekStart]);
  const eventsByDate = useMemo(() => new Map(calendarEvents.map((event) => [event.date, event])), [calendarEvents]);

  useEffect(() => {
    let canceled = false;
    setCalendarLoading(true);
    setCalendarError(null);
    fetchCalendar(weekStart, weekEnd).then((events) => {
      if (!canceled) setCalendarEvents(events);
    }).catch((err: unknown) => {
      if (!canceled) setCalendarError(err instanceof Error ? err.message : "Não foi possível carregar o calendário SQL.");
    }).finally(() => {
      if (!canceled) setCalendarLoading(false);
    });
    return () => { canceled = true; };
  }, [weekStart, weekEnd, calendarVersion]);

  const inspectFileForDate = async (candidate: File, targetDate: string) => {
    if (candidate.size > MAX_WORKBOOK_SIZE_BYTES) {
      setFile(null);
      setPreview(null);
      setError("O arquivo excede o limite de 50 MB. Reduza o tamanho da planilha e tente novamente.");
      toast.error("Planilha maior que 50 MB");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    if (!candidate.name.toLocaleLowerCase("pt-BR").endsWith(".xlsx")) {
      setError("Formato inválido: envie um arquivo .xlsx exportado da auditoria.");
      setPreview(null);
      toast.error("Envie um arquivo .xlsx");
      return;
    }
    setError(null);
    setDone(false);
    try {
      const planned = getWeeklyScheduleForDate(targetDate);
      const inspected = await inspectWorkbookFile(candidate, planned?.type);
      setPreview(inspected);
      if (planned && inspected.auditoria !== planned.type) {
        setError(`Este dia está programado para ${planned.type}, mas a planilha foi identificada como ${inspected.auditoria}. Confira a data ou selecione o arquivo correto.`);
      }
    } catch (err) {
      setPreview(null);
      const message = err instanceof AuditParseError ? err.message : "Não foi possível inspecionar a planilha selecionada.";
      setError(message);
    }
  };

  const pickFile = async (candidate: File | null | undefined) => {
    if (!candidate) return;
    if (candidate.size > MAX_WORKBOOK_SIZE_BYTES) {
      setFile(null);
      setPreview(null);
      setError("O arquivo excede o limite de 50 MB. Reduza o tamanho da planilha e tente novamente.");
      toast.error("Planilha maior que 50 MB");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setFile(candidate);
    await inspectFileForDate(candidate, data);
  };

  const selectCalendarDay = async (date: string, createScheduledSlot = false) => {
    if (createScheduledSlot) {
      try {
        await createSqlCalendarSlot(date);
        setCalendarVersion((version) => version + 1);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Não foi possível criar a auditoria no banco SQL.";
        setError(message);
        toast.error("Não foi possível criar a auditoria", { description: message });
        return;
      }
    }
    setData(date);
    setError(null);
    setDone(false);
    if (file) await inspectFileForDate(file, date);
    uploadRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const process = async () => {
    if (!file) {
      setError("Selecione a planilha .xlsx do dia da auditoria.");
      return;
    }
    if (!data) {
      setError("Informe a data da auditoria.");
      return;
    }
    if (hasTypeMismatch) {
      setError(`A data selecionada espera ${expectedSchedule?.type}; a planilha enviada é de ${preview?.auditoria}.`);
      return;
    }
    setBusy(true);
    setError(null);
    setProgress(12);
    const timer = setInterval(() => setProgress((value) => value < 88 ? value + 7 : value), 120);

    try {
      const result = await parseWorkbookFile(file, data, expectedSchedule?.type);
      if (expectedSchedule && result.auditoria !== expectedSchedule.type) {
        throw new AuditParseError(`O calendário espera ${expectedSchedule.type}, mas a aba selecionada é ${result.auditoria}.`);
      }
      // Persist all audit values and row-level details in the local SQLite database first.
      const saved = await saveAuditToSql(result, expectedSchedule?.type ?? result.auditoria);
      clearInterval(timer);
      setProgress(100);
      window.setTimeout(() => setProgress(0), 900);
      setAuditResult(result);
      setDone(true);
      setCalendarVersion((version) => version + 1);
      toast.success(`Auditoria de ${result.auditoria} processada e salva no SQL`, {
        description: `${result.sku.toLocaleString("pt-BR")} SKUs · ${saved.savedDetails.toLocaleString("pt-BR")} registros detalhados · pendência ${result.parcial.toFixed(2)}%`,
      });
      setFile(null);
      setPreview(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (err) {
      clearInterval(timer);
      setProgress(0);
      const message = err instanceof AuditParseError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Não foi possível processar e salvar a planilha. Verifique o arquivo e o banco SQL.";
      setError(message);
      toast.error("Não foi possível concluir o processamento", { description: message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageTransition>
      <PageHeader
        title="Calendário semanal"
        subtitle="A agenda identifica o tipo da auditoria pela data. Ao processar a planilha, os indicadores e os registros de produto ficam salvos no banco SQL local."
        action={<Button variant="outline" onClick={() => navigate({ to: "/analise-auditorias" })}><Database className="mr-2 size-4" /> Análise de Auditorias</Button>}
      />

      <SectionCard title="Agenda de auditorias" description="Janelas recorrentes por dia da semana. As datas mudam automaticamente conforme a semana selecionada; uma planilha processada fecha a ocorrência. ">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2"><CalendarDays className="size-5 text-primary" /><div><p className="font-semibold">{weekOffset === 0 ? "Esta semana" : weekOffset === 1 ? "Próxima semana" : weekOffset === -1 ? "Semana anterior" : `${prettyDate(weekStart)} – ${prettyDate(weekEnd)}`}</p><p className="text-xs text-muted-foreground">{prettyDate(weekStart)} – {prettyDate(weekEnd)}</p></div></div>
          <div className="flex gap-2"><Button variant="outline" size="icon" aria-label="Semana anterior" onClick={() => setWeekOffset((value) => value - 1)}><ChevronLeft className="size-4" /></Button><Button variant="outline" onClick={() => setWeekOffset(0)}>Hoje</Button><Button variant="outline" size="icon" aria-label="Próxima semana" onClick={() => setWeekOffset((value) => value + 1)}><ChevronRight className="size-4" /></Button></div>
        </div>

        {calendarError ? <div className="mb-4 flex items-start gap-2 rounded-md border border-critical/30 bg-critical/5 p-3 text-sm text-critical"><AlertCircle className="mt-0.5 size-4 shrink-0" /><div><p className="font-semibold">Não foi possível conectar ao banco SQL.</p><p className="mt-1">{calendarError}</p><p className="mt-1 text-xs">Confira se o AuditOps está sendo executado pelo servidor local Node.js.</p></div></div> : null}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
          {calendarDays.map((date) => {
            const event = eventsByDate.get(date);
            const scheduled = getWeeklyScheduleForDate(date);
            const dayLabel = weekdayShort[new Date(`${date}T12:00:00`).getDay()];
            const isToday = date === today;
            const closed = Boolean(event?.hasUpload && event.status === "Fechada");
            return <article key={date} className={cn("flex min-h-52 flex-col rounded-xl border p-4 transition-all", isToday ? "border-primary/50 bg-primary/5 shadow-sm" : "bg-card", closed ? "border-success/30" : "")}>
              <div className="flex items-start justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{dayLabel}</p><p className="mt-1 text-xl font-bold text-tabular">{prettyDate(date)}</p></div>{isToday ? <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary">HOJE</span> : null}</div>
              {scheduled || event?.hasUpload ? <>
                <div className="mt-4 flex items-center gap-2 text-sm"><Clock3 className="size-4 text-muted-foreground" /><span className="font-medium">{scheduled ? "Janela" : "Importação"}</span></div>
                <p className="mt-1 text-sm font-semibold text-tabular">{scheduled ? `${scheduled.startTime} – ${scheduled.endTime}` : "Avulsa"}</p>
                <span className="mt-3 inline-flex w-fit rounded-full border bg-muted/50 px-2.5 py-1 text-xs font-semibold">{scheduled?.type ?? event?.type}</span>
                {closed ? <div className="mt-3 text-xs text-success"><CheckCircle2 className="mr-1 inline size-3.5" /> Planilha processada</div> : <div className="mt-3 text-xs text-muted-foreground">{calendarLoading ? "Verificando status…" : event?.status === "Aberta" ? "Aguardando planilha" : "Pronta para importar"}</div>}
                {event?.sourceFile ? <p className="mt-1 truncate text-[11px] text-muted-foreground" title={event.sourceFile}>{event.sourceFile}</p> : null}
                <Button className="mt-auto w-full" size="sm" variant={closed ? "outline" : "audit"} onClick={() => closed ? navigate({ to: "/analise-auditorias" }) : void selectCalendarDay(date, Boolean(scheduled))}>{closed ? "Ver análise" : event?.id ? "Continuar" : "Criar"}</Button>
              </> : <><p className="mt-5 text-sm font-medium">Sem auditoria agendada</p><p className="mt-1 text-xs text-muted-foreground">Você ainda pode selecionar uma data para processar um arquivo histórico.</p><Button className="mt-auto w-full" size="sm" variant="outline" onClick={() => void selectCalendarDay(date)}>Importar data</Button></>}
            </article>;
          })}
        </div>
        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground"><span><span className="mr-1.5 inline-block size-2 rounded-full bg-primary" /> Dia atual</span><span><span className="mr-1.5 inline-block size-2 rounded-full bg-success" /> Planilha processada</span><span><span className="mr-1.5 inline-block size-2 rounded-full bg-muted-foreground/40" /> Aguardando planilha</span></div>
      </SectionCard>

      <div ref={uploadRef} className="scroll-mt-36">
        <SectionCard title="Processar planilha do dia" description="Selecione a planilha do dia escolhido. O tipo previsto pelo calendário é aplicado automaticamente e validado antes de gravar a auditoria no banco SQL.">
          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border bg-card p-3"><p className="text-xs text-muted-foreground">Data selecionada</p><p className="mt-1 font-semibold">{fullDate(data)}</p></div>
            <div className="rounded-lg border bg-card p-3"><p className="text-xs text-muted-foreground">Tipo definido pelo calendário</p><p className="mt-1 font-semibold">{expectedSchedule?.type ?? "Detectado pela planilha"}</p></div>
            <div className="rounded-lg border bg-card p-3"><p className="text-xs text-muted-foreground">Janela</p><p className="mt-1 font-semibold">{expectedSchedule ? `${expectedSchedule.startTime} – ${expectedSchedule.endTime}` : "Sem janela fixa"}</p></div>
          </div>

          <div
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => { event.preventDefault(); setDragging(false); void pickFile(event.dataTransfer.files?.[0]); }}
            onClick={() => inputRef.current?.click()}
            className={cn("upload-zone flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-all duration-300", dragging ? "border-primary bg-primary/10 scale-[1.01] shadow-[var(--shadow-card-hover)] animate-pulse-soft" : "border-border hover:border-primary hover:bg-accent/70")}
          >
            <AnimatePresence mode="wait">
              {done ? <motion.span key="done" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 420, damping: 12 }} className="text-success"><CheckCircle2 className="size-10" /></motion.span> : <motion.span key="idle" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={cn("text-muted-foreground", dragging ? "animate-float text-primary" : "")}>{file ? <FileSpreadsheet className="size-10 text-link" /> : <UploadCloud className="size-10" />}</motion.span>}
            </AnimatePresence>
            <div><p className="text-sm font-semibold">{file ? file.name : "Arraste a planilha aqui ou clique para selecionar"}</p><p className="mt-1 text-xs text-muted-foreground">Abas reconhecidas: Itens da Auditoria de Etiqueta, Presença ou Ruptura</p></div>
            <input ref={inputRef} type="file" accept=".xlsx" className="hidden" onChange={(event) => void pickFile(event.target.files?.[0])} />
          </div>

          {file ? <div className="mt-5 rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold">Conferência do arquivo</p><p className="mt-1 break-all text-sm text-muted-foreground">{file.name} · {(file.size / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} MB</p></div>{preview ? <span className="rounded-full border border-success/30 bg-success/5 px-3 py-1 text-xs font-semibold text-success">Aba reconhecida</span> : <span className="rounded-full border bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">Inspecionando…</span>}</div>
            {preview ? <>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><div className="rounded-md bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Tipo identificado</p><p className="mt-1 font-semibold">{preview.auditoria}</p></div><div className="rounded-md bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Registros na aba</p><p className="mt-1 font-semibold text-tabular">{preview.totalRows.toLocaleString("pt-BR")}</p></div><div className="rounded-md bg-muted/50 p-3"><p className="text-xs text-muted-foreground">SKUs únicos (Código)</p><p className="mt-1 font-semibold text-tabular">{preview.skuCount.toLocaleString("pt-BR")}</p></div><div className="rounded-md bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Aba selecionada</p><p className="mt-1 break-words font-semibold">{preview.sheetName}</p></div></div>
              <p className="mt-4 text-sm font-semibold">Colunas encontradas</p><div className="mt-2 flex flex-wrap gap-2">{preview.headers.map((header) => <span key={header} className="rounded-full bg-muted px-2.5 py-1 text-xs">{header}</span>)}</div>
              {preview.missingColumns.length ? <p className="mt-3 rounded-md border border-critical/30 bg-critical/5 p-3 text-sm text-critical">Atenção: colunas esperadas que não apareceram no cabeçalho: {preview.missingColumns.join(", ")}. Confira o arquivo antes de processar.</p> : <p className="mt-3 text-sm text-success">As principais colunas para o relatório estão presentes.</p>}
              {preview.optionalColumnsMissing.length ? <p className="mt-2 text-sm text-muted-foreground">Campos complementares não encontrados: {preview.optionalColumnsMissing.join(", ")}.</p> : null}
              <p className="mt-2 text-xs text-muted-foreground">Prévia das primeiras linhas. Os indicadores serão calculados no processamento; os registros detalhados serão guardados no SQL.</p>
              <div className="audit-table-scroll mt-2"><table className="audit-table"><thead><tr>{preview.headers.slice(0, 6).map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{preview.previewRows.map((row, rowIndex) => <tr key={rowIndex}>{preview.headers.slice(0, 6).map((header) => <td key={header}>{String((row as Record<string, unknown>)[header] ?? "—")}</td>)}</tr>)}</tbody></table></div>
            </> : null}
          </div> : null}

          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="sku">Quantidade de SKU (automática)</Label><Input id="sku" value={preview ? preview.skuCount.toLocaleString("pt-BR") : ""} readOnly placeholder="Calculada a partir da coluna Código" aria-describedby="sku-help" /><p id="sku-help" className="text-xs text-muted-foreground">Conta códigos únicos; linhas repetidas não aumentam o total.</p></div>
            <div className="space-y-1.5"><Label htmlFor="data">Data da auditoria</Label><Input id="data" type="date" value={data} onChange={(event) => { const nextDate = event.target.value; setData(nextDate); setError(null); if (file && nextDate) void inspectFileForDate(file, nextDate); }} /></div>
          </div>

          {busy || progress > 0 ? <div className="mt-5 h-2 overflow-hidden rounded-full bg-muted"><motion.div animate={{ width: `${progress}%` }} transition={{ duration: 0.25 }} className="h-full btn-gradient" /></div> : null}
          {error ? <motion.p initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="mt-4 rounded-md border border-critical/30 bg-critical/8 px-3 py-2 text-sm font-medium text-critical">{error}</motion.p> : null}

          <div className="mt-7 flex flex-wrap gap-3">
            <Button variant="audit" onClick={process} disabled={busy || (Boolean(file) && !preview) || hasTypeMismatch || Boolean(calendarError)} className="min-w-48">{busy ? "Processando e salvando…" : "Processar planilha"}</Button>
            <Button variant="outline" onClick={() => { loadDemoResult(); toast.success("Dados de exemplo carregados no painel local", { description: "Demonstração não é gravada no banco SQL histórico." }); navigate({ to: "/" }); }} className="font-semibold transition-transform duration-150 active:scale-95"><Sparkles className="mr-1.5 size-4" />Carregar dados de exemplo</Button>
            {done ? <Button variant="outline" onClick={() => navigate({ to: "/analise-auditorias" })}>Abrir Análise de Auditorias</Button> : null}
          </div>
        </SectionCard>
      </div>
    </PageTransition>
  );
}
