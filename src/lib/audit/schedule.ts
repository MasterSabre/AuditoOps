import type { AuditType } from "./types";

export interface WeeklyAuditSchedule {
  weekday: number;
  weekdayLabel: string;
  startTime: string;
  endTime: string;
  type: AuditType;
  actionLabel: string;
}

/** Weekly operating windows. Weekday uses JavaScript convention: Sunday=0, Monday=1. */
export const WEEKLY_AUDIT_SCHEDULE: Record<number, WeeklyAuditSchedule> = {
  1: { weekday: 1, weekdayLabel: "Segunda-feira", startTime: "08:00", endTime: "20:00", type: "Etiqueta", actionLabel: "Criar" },
  2: { weekday: 2, weekdayLabel: "Terça-feira", startTime: "08:00", endTime: "18:00", type: "Presença", actionLabel: "Criar" },
  3: { weekday: 3, weekdayLabel: "Quarta-feira", startTime: "08:00", endTime: "18:00", type: "Ruptura", actionLabel: "Criar" },
  4: { weekday: 4, weekdayLabel: "Quinta-feira", startTime: "08:00", endTime: "20:00", type: "Etiqueta", actionLabel: "Criar" },
};

/** Parse YYYY-MM-DD in local-calendar terms, avoiding UTC date shifts. */
export function getLocalIsoDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getWeeklyScheduleForDate(date: string): WeeklyAuditSchedule | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const weekday = new Date(`${date}T12:00:00`).getDay();
  return WEEKLY_AUDIT_SCHEDULE[weekday] ?? null;
}

export function addIsoDays(date: string, amount: number): string {
  const parsed = new Date(`${date}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + amount);
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}-${String(parsed.getUTCDate()).padStart(2, "0")}`;
}

export function startOfIsoWeek(date: string): string {
  const parsed = new Date(`${date}T12:00:00Z`);
  const weekday = parsed.getUTCDay();
  return addIsoDays(date, -((weekday + 6) % 7));
}

export function formatIsoDatePtBr(date: string): string {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}
