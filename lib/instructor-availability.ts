// lib/instructor-availability.ts
// Utilities to handle instructor availability serialization between DB and UI.

import type { Database } from "@/types/database";

export const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DayKey = (typeof DAY_KEYS)[number];

export const DAY_LABELS: Record<DayKey, string> = {
  mon: "Lunes",
  tue: "Martes",
  wed: "Miercoles",
  thu: "Jueves",
  fri: "Viernes",
  sat: "Sabado",
  sun: "Domingo",
};

export type AvailabilityRange = { start: string; end: string };

export type WeeklyAvailability = Record<DayKey, AvailabilityRange[]>;

export type OverrideWeek = {
  id: string | null;
  weekKey: string;
  weekStartDate: string;
  label: string | null;
  notes: string | null;
  days: WeeklyAvailability;
};

export type InstructorAvailability = {
  weekly: WeeklyAvailability;
  overrides: OverrideWeek[];
};

type WeeklyRow = Database["public"]["Tables"]["instructor_weekly_availability"]["Row"];
type OverrideRow = Database["public"]["Tables"]["instructor_week_overrides"]["Row"];
type OverrideSlotRow = Database["public"]["Tables"]["instructor_week_override_slots"]["Row"];
export type OverrideRowWithSlots = OverrideRow & {
  instructor_week_override_slots: OverrideSlotRow[] | null;
};

export const WEEKDAY_KEY_TO_NUMBER: Record<DayKey, number> = {
  mon: 0,
  tue: 1,
  wed: 2,
  thu: 3,
  fri: 4,
  sat: 5,
  sun: 6,
};

export const WEEKDAY_NUMBER_TO_KEY: Record<number, DayKey> = {
  0: "mon",
  1: "tue",
  2: "wed",
  3: "thu",
  4: "fri",
  5: "sat",
  6: "sun",
};

export const createEmptyWeek = (): WeeklyAvailability => ({
  mon: [],
  tue: [],
  wed: [],
  thu: [],
  fri: [],
  sat: [],
  sun: [],
});

export const cloneWeek = (week: WeeklyAvailability): WeeklyAvailability => ({
  mon: [...week.mon],
  tue: [...week.tue],
  wed: [...week.wed],
  thu: [...week.thu],
  fri: [...week.fri],
  sat: [...week.sat],
  sun: [...week.sun],
});

export const normalizeWeek = (week: WeeklyAvailability): WeeklyAvailability => {
  const normalized = createEmptyWeek();
  DAY_KEYS.forEach((key) => {
    normalized[key] = [...week[key]].sort((a, b) => a.start.localeCompare(b.start));
  });
  return normalized;
};

const ISO_DAY_MS = 24 * 60 * 60 * 1000;

export const weekKeyFromStartDate = (weekStartDate: string): string => {
  const date = new Date(`${weekStartDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  const dayNumber = date.getUTCDay() || 7;
  // Move to Thursday to compute ISO week
  date.setUTCDate(date.getUTCDate() + 4 - dayNumber);
  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / ISO_DAY_MS + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
};

export const weekStartDateFromKey = (weekKey: string): string => {
  const match = /^([0-9]{4})-W([0-9]{2})$/.exec(weekKey);
  if (!match) return "";
  const year = Number(match[1]);
  const week = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(week) || week <= 0) return "";
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const dayNumber = simple.getUTCDay() || 7;
  simple.setUTCDate(simple.getUTCDate() + 1 - dayNumber);
  return simple.toISOString().slice(0, 10);
};

export const groupWeeklyByInstructor = (rows: WeeklyRow[] | null | undefined) => {
  const map = new Map<string, WeeklyAvailability>();
  (rows ?? []).forEach((row) => {
    if (!row.instructor_id) return;
    const dayKey = WEEKDAY_NUMBER_TO_KEY[row.weekday];
    if (!dayKey) return;
    let week = map.get(row.instructor_id);
    if (!week) {
      week = createEmptyWeek();
      map.set(row.instructor_id, week);
    }
    week[dayKey].push({ start: row.start_time, end: row.end_time });
  });
  map.forEach((week, instructorId) => {
    map.set(instructorId, normalizeWeek(week));
  });
  return map;
};

export const groupOverridesByInstructor = (rows: OverrideRowWithSlots[] | null | undefined) => {
  const map = new Map<string, OverrideWeek[]>();
  (rows ?? []).forEach((row) => {
    if (!row.instructor_id) return;
    const override: OverrideWeek = {
      id: row.id,
      weekStartDate: row.week_start_date,
      weekKey: weekKeyFromStartDate(row.week_start_date),
      label: row.label ?? null,
      notes: row.notes ?? null,
      days: createEmptyWeek(),
    };
    (row.instructor_week_override_slots ?? []).forEach((slot) => {
      const dayKey = WEEKDAY_NUMBER_TO_KEY[slot.weekday];
      if (!dayKey) return;
      override.days[dayKey].push({ start: slot.start_time, end: slot.end_time });
    });
    override.days = normalizeWeek(override.days);
    const list = map.get(row.instructor_id) ?? [];
    list.push(override);
    map.set(row.instructor_id, list);
  });
  map.forEach((list, instructorId) => {
    list.sort((a, b) => a.weekStartDate.localeCompare(b.weekStartDate));
    map.set(instructorId, list);
  });
  return map;
};

export const cloneOverrideWeek = (override: OverrideWeek): OverrideWeek => ({
  id: override.id,
  weekKey: override.weekKey,
  weekStartDate: override.weekStartDate,
  label: override.label,
  notes: override.notes,
  days: cloneWeek(override.days),
});

export const serializeWeeklyForInsert = (week: WeeklyAvailability, instructorId: string) => {
  const payload: Array<{ instructor_id: string; weekday: number; start_time: string; end_time: string }> = [];
  DAY_KEYS.forEach((key) => {
    week[key].forEach((range) => {
      if (!range.start || !range.end || range.start >= range.end) return;
      payload.push({
        instructor_id: instructorId,
        weekday: WEEKDAY_KEY_TO_NUMBER[key],
        start_time: range.start,
        end_time: range.end,
      });
    });
  });
  return payload;
};

export type OverrideInsertPayload = {
  instructor_id: string;
  week_start_date: string;
  label: string | null;
  notes: string | null;
  slots: Array<{ weekday: number; start_time: string; end_time: string }>;
};

export const serializeOverridesForInsert = (overrides: OverrideWeek[], instructorId: string) => {
  const payload: OverrideInsertPayload[] = [];
  overrides.forEach((override) => {
    const weekStart = override.weekStartDate || weekStartDateFromKey(override.weekKey);
    if (!weekStart) return;
    const slots: OverrideInsertPayload["slots"] = [];
    DAY_KEYS.forEach((key) => {
      override.days[key].forEach((range) => {
        if (!range.start || !range.end || range.start >= range.end) return;
        slots.push({
          weekday: WEEKDAY_KEY_TO_NUMBER[key],
          start_time: range.start,
          end_time: range.end,
        });
      });
    });
    payload.push({
      instructor_id: instructorId,
      week_start_date: weekStart,
      label: override.label ?? null,
      notes: override.notes ?? null,
      slots,
    });
  });
  return payload;
};


