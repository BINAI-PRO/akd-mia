import dayjs, { type ConfigType, type Dayjs } from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

const MADRID_TZ = "Europe/Madrid";

let configured = false;

function ensureConfigured() {
  if (configured) return;
  dayjs.extend(utc);
  dayjs.extend(timezone);
  configured = true;
}

export function madridDayjs(value?: ConfigType, keepLocalTime = false): Dayjs {
  ensureConfigured();
  if (value === undefined || value === null) {
    return dayjs().tz ? dayjs().tz(MADRID_TZ, keepLocalTime) : dayjs();
  }

  const candidate = dayjs(value);
  if (!candidate.isValid()) {
    return dayjs().tz ? dayjs().tz(MADRID_TZ, keepLocalTime) : dayjs();
  }

  return candidate.tz ? candidate.tz(MADRID_TZ, keepLocalTime) : candidate;
}

export function madridStartOfDay(value?: ConfigType): Dayjs {
  if (value === undefined || value === null) {
    return madridDayjs().startOf("day");
  }
  return madridDayjs(value, true).startOf("day");
}

export function madridEndOfDay(value?: ConfigType): Dayjs {
  if (value === undefined || value === null) {
    return madridDayjs().endOf("day");
  }
  return madridDayjs(value, true).endOf("day");
}

export function madridIso(value?: ConfigType): string {
  return madridDayjs(value).toISOString();
}

export { MADRID_TZ };
