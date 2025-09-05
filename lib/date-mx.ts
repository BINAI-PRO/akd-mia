import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import tz from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(tz);
dayjs.tz.setDefault("America/Mexico_City");

export const MONTH_ABBR_ES = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];
export const DOW_ABBR_ES   = ["DOM","LUN","MAR","MIÉ","JUE","VIE","SÁB"];
export const MONTH_LONG_ES  = ["ENERO","FEBRERO","MARZO","ABRIL","MAYO","JUNIO","JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE"];
export const DOW_LONG_ES    = ["DOMINGO","LUNES","MARTES","MIÉRCOLES","JUEVES","VIERNES","SÁBADO"];

export function startOfWeekMX(iso: string) {
  return dayjs.tz(iso).startOf("week"); // DOM
}
export function weekDaysMX(iso: string): string[] {
  const s = startOfWeekMX(iso);
  return Array.from({ length: 7 }, (_, i) => s.add(i, "day").format("YYYY-MM-DD"));
}
export function saturdayOfWeek(iso: string) {
  return startOfWeekMX(iso).add(6, "day");
}
export function isTodayMX(iso: string) {
  const a = dayjs.tz(iso);
  const b = dayjs.tz();
  return a.format("YYYY-MM-DD") === b.format("YYYY-MM-DD");
}
export function formatSelectedBarMX(iso: string) {
  const d = dayjs.tz(iso);
  const dow = DOW_LONG_ES[d.day()];
  const day = d.date();
  const month = MONTH_LONG_ES[d.month()];
  return `${dow} ${day} DE ${month}`;
}
// (deja el resto del archivo igual)

export function earliestAnchor(): string {
  // domingo de la semana actual, en ISO
  const nowIso = dayjs.tz().format("YYYY-MM-DD");
  return startOfWeekMX(nowIso).format("YYYY-MM-DD");
}

export function latestAnchor(): string {
  // último día del mes (mes actual + 11), y su domingo de semana
  const lastIso = dayjs.tz().add(11, "month").endOf("month").format("YYYY-MM-DD");
  return startOfWeekMX(lastIso).format("YYYY-MM-DD");
}

export function clampAnchor(iso: string): string {
  // fuerza a que el anchor quede dentro [earliest, latest]
  const e = dayjs(earliestAnchor());
  const l = dayjs(latestAnchor());
  const d = startOfWeekMX(iso); // Dayjs del domingo de esa semana

  if (d.isBefore(e)) return e.format("YYYY-MM-DD");
  if (d.isAfter(l))  return l.format("YYYY-MM-DD");
  return d.format("YYYY-MM-DD");
}


