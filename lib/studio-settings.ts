import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  DEFAULT_STUDIO_TIMEZONE,
  getStudioTimezone,
  isValidTimezone,
  setStudioTimezone,
} from "@/lib/timezone";

export type StudioPhoneCountry = "MX" | "ES";

export type StudioSettings = {
  scheduleTimezone: string;
  phoneCountry: StudioPhoneCountry;
};

const SETTINGS_KEY = "default";
export const DEFAULT_PHONE_COUNTRY: StudioPhoneCountry = "MX";

let cachedSettings: StudioSettings | null = null;
let lastLoadedAt = 0;
const CACHE_TTL_MS = 60_000;

function normalizeTimezoneCandidate(candidate: unknown): string {
  if (!candidate || typeof candidate !== "string") {
    return DEFAULT_STUDIO_TIMEZONE;
  }
  return candidate;
}

function normalizePhoneCountryCandidate(candidate: unknown): StudioPhoneCountry {
  if (typeof candidate !== "string") return DEFAULT_PHONE_COUNTRY;
  const upper = candidate.toUpperCase();
  return upper === "ES" ? "ES" : "MX";
}

export function getCachedStudioSettings(): StudioSettings {
  if (cachedSettings) {
    return cachedSettings;
  }
  const timezone = getStudioTimezone() || DEFAULT_STUDIO_TIMEZONE;
  cachedSettings = { scheduleTimezone: timezone, phoneCountry: DEFAULT_PHONE_COUNTRY };
  return cachedSettings;
}

async function fetchStudioSettings(): Promise<StudioSettings> {
  const { data, error } = await supabaseAdmin
    .from("studio_settings")
    .select("schedule_timezone, phone_country")
    .eq("key", SETTINGS_KEY)
    .maybeSingle<{ schedule_timezone: string | null; phone_country: string | null }>();

  if (error) {
    console.error("[studio-settings] fetch failed", error);
  }

  const scheduleTimezone = normalizeTimezoneCandidate(data?.schedule_timezone);
  const phoneCountry = normalizePhoneCountryCandidate(data?.phone_country);
  setStudioTimezone(scheduleTimezone);
  cachedSettings = { scheduleTimezone, phoneCountry };
  lastLoadedAt = Date.now();
  return cachedSettings;
}

export async function loadStudioSettings(options?: { refresh?: boolean }): Promise<StudioSettings> {
  const refresh = options?.refresh ?? false;
  const now = Date.now();
  if (!refresh && cachedSettings && now - lastLoadedAt < CACHE_TTL_MS) {
    return cachedSettings;
  }
  return fetchStudioSettings();
}

type UpdateSettingsPayload = {
  timezone?: string;
  phoneCountry?: StudioPhoneCountry;
  updatedBy?: string | null;
};

export async function updateStudioSettings(options: UpdateSettingsPayload): Promise<StudioSettings> {
  const { timezone, phoneCountry, updatedBy } = options;

  const nextTimezone = timezone ? normalizeTimezoneCandidate(timezone) : undefined;
  if (nextTimezone && !isValidTimezone(nextTimezone)) {
    throw new Error("Invalid timezone value");
  }

  const nextPhoneCountry =
    phoneCountry !== undefined ? normalizePhoneCountryCandidate(phoneCountry) : undefined;

  const payload: Record<string, unknown> = {
    key: SETTINGS_KEY,
    updated_by: updatedBy ?? null,
  };

  if (nextTimezone) {
    payload.schedule_timezone = nextTimezone;
  }
  if (nextPhoneCountry) {
    payload.phone_country = nextPhoneCountry;
  }

  const { error } = await supabaseAdmin.from("studio_settings").upsert(payload, { onConflict: "key" });

  if (error) {
    console.error("[studio-settings] failed to update", error);
    throw new Error("No se pudo guardar la configuracion");
  }

  if (!cachedSettings) {
    cachedSettings = {
      scheduleTimezone: nextTimezone ?? getStudioTimezone() ?? DEFAULT_STUDIO_TIMEZONE,
      phoneCountry: nextPhoneCountry ?? DEFAULT_PHONE_COUNTRY,
    };
  } else {
    cachedSettings = {
      scheduleTimezone: nextTimezone ?? cachedSettings.scheduleTimezone,
      phoneCountry: nextPhoneCountry ?? cachedSettings.phoneCountry,
    };
  }

  if (nextTimezone) {
    setStudioTimezone(nextTimezone);
  }

  lastLoadedAt = Date.now();
  return cachedSettings;
}

export async function updateStudioTimezone(
  timezone: string,
  opts?: { updatedBy?: string | null }
): Promise<StudioSettings> {
  return updateStudioSettings({ timezone, updatedBy: opts?.updatedBy ?? null });
}
