import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  DEFAULT_STUDIO_TIMEZONE,
  getStudioTimezone,
  isValidTimezone,
  setStudioTimezone,
} from "@/lib/timezone";
import {
  DEFAULT_PHONE_COUNTRY,
  type StudioPhoneCountry,
} from "@/lib/studio-settings-shared";

export { DEFAULT_PHONE_COUNTRY, type StudioPhoneCountry } from "@/lib/studio-settings-shared";

export type StudioSettings = {
  scheduleTimezone: string;
  phoneCountry: StudioPhoneCountry;
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

function normalizePhoneCountryCandidate(candidate: unknown): StudioPhoneCountry {
  if (typeof candidate !== "string") return DEFAULT_PHONE_COUNTRY;
  const upper = candidate.toUpperCase();
  return upper === "ES" ? "ES" : "MX";
}

function isMissingColumnError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: string }).code;
  return code === "42703";
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

  let record = data;
  let fetchError = error;

  if (fetchError && isMissingColumnError(fetchError)) {
    // Older schema without phone_country column.
    console.warn(
      "[studio-settings] phone_country column not found. Run the latest migration to enable phone settings."
    );
    const fallback = await supabaseAdmin
      .from("studio_settings")
      .select("schedule_timezone")
      .eq("key", SETTINGS_KEY)
      .maybeSingle<{ schedule_timezone: string | null }>();
    record = fallback.data ?? null;
    fetchError = fallback.error;
  }

  if (fetchError) {
    console.error("[studio-settings] fetch failed", fetchError);
  }

  const scheduleTimezone = normalizeTimezoneCandidate(record?.schedule_timezone);
  const phoneCountry =
    fetchError && isMissingColumnError(fetchError)
      ? DEFAULT_PHONE_COUNTRY
      : normalizePhoneCountryCandidate((record as { phone_country?: string | null } | null)?.phone_country);
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

  let upsertError: unknown = null;
  let upsertPayload = payload;
  let retryPerformed = false;

  const attemptUpsert = async (body: Record<string, unknown>) => {
    const { error } = await supabaseAdmin.from("studio_settings").upsert(body, { onConflict: "key" });
    return error;
  };

  upsertError = await attemptUpsert(upsertPayload);

  if (upsertError && isMissingColumnError(upsertError) && "phone_country" in upsertPayload) {
    const { phone_country, ...rest } = upsertPayload;
    upsertPayload = rest;
    upsertError = await attemptUpsert(upsertPayload);
    retryPerformed = true;
    if (!upsertError) {
      console.warn(
        "[studio-settings] phone_country column missing. Saved timezone only; run migrations to enable phone settings."
      );
    }
  }

  if (upsertError) {
    console.error("[studio-settings] failed to update", upsertError);
    throw new Error("No se pudo guardar la configuracion");
  }

  if (!cachedSettings) {
    cachedSettings = {
      scheduleTimezone: nextTimezone ?? getStudioTimezone() ?? DEFAULT_STUDIO_TIMEZONE,
      phoneCountry:
        retryPerformed || !nextPhoneCountry ? DEFAULT_PHONE_COUNTRY : nextPhoneCountry,
    };
  } else {
    cachedSettings = {
      scheduleTimezone: nextTimezone ?? cachedSettings.scheduleTimezone,
      phoneCountry:
        retryPerformed || !nextPhoneCountry ? cachedSettings.phoneCountry : nextPhoneCountry,
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
