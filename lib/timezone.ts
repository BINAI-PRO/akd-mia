import dayjs, { type ConfigType, type Dayjs } from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import "dayjs/locale/es";

export const DEFAULT_STUDIO_TIMEZONE = "Etc/GMT-1";

let configured = false;
let studioTimezone = DEFAULT_STUDIO_TIMEZONE;

const FIXED_GMT_REGEX = /^Etc\/GMT(?:(?<sign>[+-])(?<hours>\d{1,2}))?$/i;
const MIN_GMT_OFFSET = -14;
const MAX_GMT_OFFSET = 14;

function ensureConfigured() {
  if (configured) return;
  dayjs.extend(utc);
  dayjs.extend(timezone);
  dayjs.locale("es");
  configured = true;
  if (dayjs.tz) {
    dayjs.tz.setDefault(studioTimezone);
  }
}

export function setStudioTimezone(tz: string) {
  if (!tz || typeof tz !== "string") return;
  studioTimezone = tz;
  ensureConfigured();
  if (dayjs.tz) {
    dayjs.tz.setDefault(tz);
  }
}

export function getStudioTimezone(): string {
  return studioTimezone;
}

function createFallback(keepLocalTime: boolean): Dayjs {
  const base = dayjs();
  if (base.tz) {
    return base.tz(studioTimezone, keepLocalTime);
  }
  return base;
}

export function studioDayjs(value?: ConfigType, keepLocalTime = false): Dayjs {
  ensureConfigured();
  if (value === undefined || value === null) {
    return createFallback(keepLocalTime);
  }

  const candidate = dayjs(value);
  if (!candidate.isValid()) {
    return createFallback(keepLocalTime);
  }

  if (candidate.tz) {
    return candidate.tz(studioTimezone, keepLocalTime);
  }

  const parsed = dayjs(value);
  if (!parsed.isValid()) {
    return createFallback(keepLocalTime);
  }

  return keepLocalTime ? parsed : parsed.add(getTimezoneOffsetMinutes(studioTimezone) ?? 0, "minute");
}

export function studioStartOfDay(value?: ConfigType): Dayjs {
  if (value === undefined || value === null) {
    return studioDayjs().startOf("day");
  }
  return studioDayjs(value, true).startOf("day");
}

export function studioEndOfDay(value?: ConfigType): Dayjs {
  if (value === undefined || value === null) {
    return studioDayjs().endOf("day");
  }
  return studioDayjs(value, true).endOf("day");
}

export function studioIso(value?: ConfigType): string {
  return studioDayjs(value).toISOString();
}

function parseFixedGmtOffsetMinutes(tz: string): number | null {
  const match = FIXED_GMT_REGEX.exec(tz);
  if (!match) return null;
  const sign = match.groups?.sign ?? "";
  const hoursRaw = match.groups?.hours ?? "0";
  const hours = Number(hoursRaw);
  if (!Number.isFinite(hours) || hours > MAX_GMT_OFFSET) return null;
  if (hours === 0) return 0;
  const realHours = sign === "+" ? -hours : sign === "-" ? hours : 0;
  if (realHours < MIN_GMT_OFFSET || realHours > MAX_GMT_OFFSET) return null;
  return realHours * 60;
}

export function isValidTimezone(tz: string): boolean {
  if (!tz || typeof tz !== "string") return false;
  ensureConfigured();
  const fixed = parseFixedGmtOffsetMinutes(tz);
  if (fixed !== null) return true;
  try {
    if (dayjs.tz?.zone?.(tz)) return true;
    const probe = dayjs.tz?.("2000-01-01T00:00:00Z", tz);
    return Boolean(probe?.isValid?.());
  } catch {
    return false;
  }
}

export function getTimezoneOffsetMinutes(tz: string, value?: ConfigType): number | null {
  const fixed = parseFixedGmtOffsetMinutes(tz);
  if (fixed !== null) return fixed;
  if (!isValidTimezone(tz)) return null;
  ensureConfigured();
  const base = value !== undefined ? dayjs(value) : dayjs();
  if (!base.isValid() || !base.tz) return null;
  return base.tz(tz, true).utcOffset();
}

export function formatOffsetLabel(offsetMinutes: number): string {
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteMinutes = Math.abs(offsetMinutes);
  const hours = Math.floor(absoluteMinutes / 60);
  const minutes = absoluteMinutes % 60;
  return `GMT${sign}${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

export const madridDayjs = studioDayjs;
export const madridStartOfDay = studioStartOfDay;
export const madridEndOfDay = studioEndOfDay;
export const madridIso = studioIso;
