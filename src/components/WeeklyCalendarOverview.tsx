import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, CalendarDays, CheckCircle2, Clock3, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchCalendar, type CalendarEvent } from "@/lib/audit/database-client";
import { addIsoDays, getLocalIsoDate, getWeeklyScheduleForDate, startOfIsoWeek } from "@/lib/audit/schedule";
import { cn } from "@/lib/utils";

const dayNames = ["dom.", "seg.", "ter.", "qua.", "qui.", "sex.", "sáb."];
const localDateLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

export function WeeklyCalendarOverview() {
  const navigate = useNavigate();
  const today = getLocalIsoDate();
  const start = useMemo(() => startOfIsoWeek(today), [today]);
  const end = useMemo(() => addIsoDays(start, 6), [start]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let canceled = false;
    fetchCalendar(start, end).then((data) => {
      if (!canceled) {
        setEvents(data);
        setAvailable(true);
      }
    }).catch(() => {
      if (!canceled) setAvailable(false);
    });
    return () => { canceled = true; };
  }, [start, end]);

  const eventMap = useMemo(() => new Map(events.map((event) => [event.date, event])), [events]);
  const days = [0, 1, 2, 3].map((index) => addIsoDays(start, index));

  return <section className="rounded-xl border bg-card p-5 shadow-[var(--shadow-card)]">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3"><span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><CalendarDays className="size-5" /></span><div><h2 className="font-semibold">Calendário semanal</h2><p className="mt-1 text-sm text-muted-foreground">Janelas previstas e status das auditorias desta semana.</p><p className="mt-1 text-xs text-muted-foreground">{localDateLabel(start)} – {localDateLabel(end)}</p></div></div>
      <Button variant="audit" onClick={() => navigate({ to: "/atualizar-dados" })}>Abrir calendário<ArrowRight className="ml-2 size-4" /></Button>
    </div>
    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {days.map((date) => {
        const schedule = getWeeklyScheduleForDate(date);
        const event = eventMap.get(date);
        const todayCard = date === today;
        const closed = Boolean(event?.hasUpload && event.status === "Fechada");
        if (!schedule) return null;
        return <article key={date} className={cn("rounded-lg border p-3", todayCard ? "border-primary/40 bg-primary/5" : "bg-background", closed ? "border-success/30" : "")}>
          <div className="flex items-start justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{dayNames[new Date(`${date}T12:00:00`).getDay()]}</p><p className="mt-1 text-lg font-bold text-tabular">{localDateLabel(date)}</p></div>{todayCard ? <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary">HOJE</span> : null}</div>
          <span className="mt-2 inline-flex rounded-full border bg-muted/50 px-2.5 py-1 text-xs font-semibold">{schedule.type}</span>
          <p className="mt-3 flex items-center gap-1.5 text-sm font-medium"><Clock3 className="size-3.5 text-muted-foreground" />{schedule.startTime} – {schedule.endTime}</p>
          <p className={cn("mt-2 text-xs", closed ? "font-semibold text-success" : "text-muted-foreground")}>{closed ? <><CheckCircle2 className="mr-1 inline size-3.5" />Planilha processada</> : event?.status === "Aberta" ? "Aguardando planilha" : available ? "Pronta para importar" : "Agenda prevista"}</p>
        </article>;
      })}
    </div>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4"><span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Database className="size-3.5" />{available ? "Status sincronizado com o SQL local" : "Janelas semanais definidas automaticamente"}</span><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => navigate({ to: "/analise-auditorias" })}>Análise de Auditorias</Button><Button variant="ghost" size="sm" onClick={() => navigate({ to: "/historico" })}>Histórico local</Button></div></div>
  </section>;
}
