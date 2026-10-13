import { describe, expect, it } from "vitest";
import { addIsoDays, getLocalIsoDate, getWeeklyScheduleForDate, startOfIsoWeek } from "@/lib/audit/schedule";

describe("weekly audit calendar", () => {
  it("defines the requested Monday through Thursday audit windows", () => {
    expect(getWeeklyScheduleForDate("2026-10-12")).toMatchObject({ type: "Etiqueta", startTime: "08:00", endTime: "20:00", actionLabel: "Criar" });
    expect(getWeeklyScheduleForDate("2026-10-13")).toMatchObject({ type: "Presença", startTime: "08:00", endTime: "18:00" });
    expect(getWeeklyScheduleForDate("2026-10-14")).toMatchObject({ type: "Ruptura", startTime: "08:00", endTime: "18:00" });
    expect(getWeeklyScheduleForDate("2026-10-15")).toMatchObject({ type: "Etiqueta", startTime: "08:00", endTime: "20:00" });
  });

  it("leaves Friday through Sunday without a recurring slot", () => {
    expect(getWeeklyScheduleForDate("2026-10-16")).toBeNull();
    expect(getWeeklyScheduleForDate("2026-10-17")).toBeNull();
    expect(getWeeklyScheduleForDate("2026-10-18")).toBeNull();
  });

  it("moves between weeks without shifting dates through UTC", () => {
    expect(startOfIsoWeek("2026-10-14")).toBe("2026-10-12");
    expect(addIsoDays("2026-10-12", 6)).toBe("2026-10-18");
    expect(getLocalIsoDate(new Date(2026, 9, 12, 12, 0, 0))).toBe("2026-10-12");
  });
});
