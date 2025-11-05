import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  DEFAULT_STUDIO_TIMEZONE,
  getStudioTimezone,
  isValidTimezone,
  setStudioTimezone,
} from "@/lib/timezone";

export type StudioSettings = {
  scheduleTimezone: string;
};

const SETTINGS_KEY = "default";

let cachedSettings: StudioSettings | null = null;
let lastLoadedAt = 0;
const CACHE_TTL_MS = 60_000;

function normalizeTimezoneCandidate(candidate: unknown): string {
  if (!candidate || typeof candidate !== "string") {
    return DEFAULT_STUDIO_TIMEZONE;
  }
  return candidate;
}

export function getCachedStudioSettings(): StudioSettings {
  if (cachedSettings) {
    return cachedSettings;
  }
  const timezone = getStudioTimezone() || DEFAULT_STUDIO_TIMEZONE;
  cachedSettings = { scheduleTimezone: timezone };
  return cachedSettings;
}

async function fetchStudioSettings(): Promise<StudioSettings> {
  const { data, error } = await supabaseAdmin
    .from("studio_settings")
    .select("schedule_timezone")
    .eq("key", SETTINGS_KEY)
    .maybeSingle<{ schedule_timezone: string | null }>();

  if (error) {
    console.error("[studio-settings] fetch failed", error);
  }

  const scheduleTimezone = normalizeTimezoneCandidate(data?.schedule_timezone);
  setStudioTimezone(scheduleTimezone);
  cachedSettings = { scheduleTimezone };
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

export async function updateStudioTimezone(
  timezone: string,
  opts?: { updatedBy?: string | null }
): Promise<StudioSettings> {
  const scheduleTimezone = normalizeTimezoneCandidate(timezone);
  if (!isValidTimezone(scheduleTimezone)) {
    throw new Error("Invalid timezone value");
  }

  const payload: Record<string, unknown> = {
    key: SETTINGS_KEY,
    schedule_timezone: scheduleTimezone,
  };

  if (opts?.updatedBy) {
    payload.updated_by = opts.updatedBy;
  } else {
    payload.updated_by = null;
  }

  const { error } = await supabaseAdmin
    .from("studio_settings")
    .upsert(payload, { onConflict: "key" });

  if (error) {
    console.error("[studio-settings] failed to update", error);
    throw new Error("No se pudo guardar la configuracion de horario");
  }

  setStudioTimezone(scheduleTimezone);
  cachedSettings = { scheduleTimezone };
  lastLoadedAt = Date.now();
  return cachedSettings;
}
