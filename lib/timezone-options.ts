import { formatOffsetLabel, getTimezoneOffsetMinutes, isValidTimezone } from "@/lib/timezone";

export type TimezoneOption = {
  value: string;
  label: string;
  group: "FIXED_GMT" | "REGION";
};

function buildFixedOffsetOptions(): TimezoneOption[] {
  const options: TimezoneOption[] = [];
  for (let hours = -12; hours <= 14; hours += 1) {
    const tzValue = hours === 0 ? "Etc/GMT" : hours > 0 ? `Etc/GMT-${hours}` : `Etc/GMT+${Math.abs(hours)}`;
    const offsetMinutes = hours * 60;
    options.push({
      value: tzValue,
      label: `${formatOffsetLabel(offsetMinutes)} (Offset fijo)`,
      group: "FIXED_GMT",
    });
  }
  return options;
}

const REGIONAL_PRESETS: TimezoneOption[] = [
  { value: "UTC", label: "UTC", group: "REGION" },
  { value: "Europe/Madrid", label: "Europe/Madrid (España peninsular)", group: "REGION" },
  { value: "Europe/Paris", label: "Europe/Paris", group: "REGION" },
  { value: "Europe/Rome", label: "Europe/Rome", group: "REGION" },
  { value: "America/Mexico_City", label: "America/Mexico_City (CDMX)", group: "REGION" },
  { value: "America/Bogota", label: "America/Bogota", group: "REGION" },
  { value: "America/Guatemala", label: "America/Guatemala", group: "REGION" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles (PST/PDT)", group: "REGION" },
  { value: "America/New_York", label: "America/New_York (EST/EDT)", group: "REGION" },
  { value: "America/Santiago", label: "America/Santiago", group: "REGION" },
  { value: "America/Sao_Paulo", label: "America/Sao_Paulo", group: "REGION" },
  { value: "America/Lima", label: "America/Lima", group: "REGION" },
  { value: "Europe/London", label: "Europe/London (UK)", group: "REGION" },
  { value: "Asia/Dubai", label: "Asia/Dubai", group: "REGION" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo", group: "REGION" },
  { value: "Asia/Singapore", label: "Asia/Singapore", group: "REGION" },
  { value: "Australia/Sydney", label: "Australia/Sydney", group: "REGION" },
];

export const FIXED_GMT_OPTIONS = buildFixedOffsetOptions();

export const STUDIO_TIMEZONE_SUGGESTIONS: TimezoneOption[] = [...FIXED_GMT_OPTIONS, ...REGIONAL_PRESETS];

export function enhanceTimezoneLabel(value: string): string {
  if (!isValidTimezone(value)) return value;
  const offsetMinutes = getTimezoneOffsetMinutes(value);
  if (offsetMinutes === null) return value;
  const offsetLabel = formatOffsetLabel(offsetMinutes);
  return `${offsetLabel} — ${value}`;
}
