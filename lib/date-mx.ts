import { studioDayjs } from "@/lib/timezone";

export const MONTH_ABBR_ES = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
export const DOW_ABBR_ES = ["DOM", "LUN", "MAR", "MIE", "JUE", "VIE", "SAB"];
export const MONTH_LONG_ES = [
  "ENERO",
  "FEBRERO",
  "MARZO",
  "ABRIL",
  "MAYO",
  "JUNIO",
  "JULIO",
  "AGOSTO",
  "SEPTIEMBRE",
  "OCTUBRE",
  "NOVIEMBRE",
  "DICIEMBRE",
];
export const DOW_LONG_ES = ["DOMINGO", "LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO"];

export function startOfWeekMX(iso: string) {
  return studioDayjs(iso).startOf("week"); // Domingo
}

export function weekDaysMX(iso: string): string[] {
  const start = startOfWeekMX(iso);
  return Array.from({ length: 7 }, (_, index) => start.add(index, "day").format("YYYY-MM-DD"));
}

export function saturdayOfWeek(iso: string) {
  return startOfWeekMX(iso).add(6, "day");
}

export function isTodayMX(iso: string) {
  const candidate = studioDayjs(iso);
  const now = studioDayjs();
  return candidate.format("YYYY-MM-DD") === now.format("YYYY-MM-DD");
}

export function formatSelectedBarMX(iso: string) {
  const date = studioDayjs(iso);
  const dow = DOW_LONG_ES[date.day()];
  const day = date.date();
  const month = MONTH_LONG_ES[date.month()];
  return `${dow} ${day} DE ${month}`;
}

export function earliestAnchor(): string {
  // domingo de la semana actual, en ISO
  const today = studioDayjs().format("YYYY-MM-DD");
  return startOfWeekMX(today).format("YYYY-MM-DD");
}

export function latestAnchor(): string {
  // ultimo dia del mes (mes actual + 11), y su domingo de semana
  const lastIso = studioDayjs().add(11, "month").endOf("month").format("YYYY-MM-DD");
  return startOfWeekMX(lastIso).format("YYYY-MM-DD");
}

export function clampAnchor(iso: string): string {
  // fuerza a que el anchor quede dentro [earliest, latest]
  const earliest = studioDayjs(earliestAnchor(), true);
  const latest = studioDayjs(latestAnchor(), true);
  const candidate = startOfWeekMX(iso);

  if (candidate.isBefore(earliest)) return earliest.format("YYYY-MM-DD");
  if (candidate.isAfter(latest)) return latest.format("YYYY-MM-DD");
  return candidate.format("YYYY-MM-DD");
}
