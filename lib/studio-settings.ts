import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  DEFAULT_STUDIO_TIMEZONE,
  getStudioTimezone,
  isValidTimezone,
  setStudioTimezone,
} from "@/lib/timezone";
import {
  DEFAULT_MEMBERSHIPS_ENABLED,
  DEFAULT_PHONE_COUNTRY,
  type StudioPhoneCountry,
} from "@/lib/studio-settings-shared";

export {
  DEFAULT_MEMBERSHIPS_ENABLED,
  DEFAULT_PHONE_COUNTRY,
  type StudioPhoneCountry,
} from "@/lib/studio-settings-shared";

export type StudioSettings = {
  scheduleTimezone: string;
  phoneCountry: StudioPhoneCountry;
  membershipsEnabled: boolean;
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

function normalizeMembershipsEnabledCandidate(candidate: unknown): boolean {
  if (typeof candidate === "boolean") {
    return candidate;
  }
  return DEFAULT_MEMBERSHIPS_ENABLED;
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
  cachedSettings = {
    scheduleTimezone: timezone,
    phoneCountry: DEFAULT_PHONE_COUNTRY,
    membershipsEnabled: DEFAULT_MEMBERSHIPS_ENABLED,
  };
  return cachedSettings;
}

type StudioSettingsRow = {
  schedule_timezone: string | null;
  phone_country?: string | null;
  memberships_enabled?: boolean | null;
};

async function fetchStudioSettings(): Promise<StudioSettings> {
  let record: StudioSettingsRow | null = null;
  let fetchError: unknown = null;
  let phoneColumnMissing = false;
  let membershipsColumnMissing = false;

  const initial = await supabaseAdmin
    .from("studio_settings")
    .select("schedule_timezone, phone_country, memberships_enabled")
    .eq("key", SETTINGS_KEY)
    .maybeSingle<StudioSettingsRow>();

  if (!initial.error) {
    record = initial.data ?? null;
  } else if (isMissingColumnError(initial.error)) {
    // Fall back to loading the available columns individually to remain backward compatible.
    const timezoneFallback = await supabaseAdmin
      .from("studio_settings")
      .select("schedule_timezone")
      .eq("key", SETTINGS_KEY)
      .maybeSingle<{ schedule_timezone: string | null }>();

    if (!timezoneFallback.error) {
      record = { schedule_timezone: timezoneFallback.data?.schedule_timezone ?? null };
    } else {
      fetchError = timezoneFallback.error;
      record = { schedule_timezone: null };
    }

    const phoneFallback = await supabaseAdmin
      .from("studio_settings")
      .select("phone_country")
      .eq("key", SETTINGS_KEY)
      .maybeSingle<{ phone_country: string | null }>();

    if (!phoneFallback.error) {
      record.phone_country = phoneFallback.data?.phone_country ?? null;
    } else if (isMissingColumnError(phoneFallback.error)) {
      phoneColumnMissing = true;
      console.warn(
        "[studio-settings] phone_country column not found. Run the latest migration to enable phone settings."
      );
    } else {
      console.error("[studio-settings] failed to fetch phone_country", phoneFallback.error);
    }

    const membershipsFallback = await supabaseAdmin
      .from("studio_settings")
      .select("memberships_enabled")
      .eq("key", SETTINGS_KEY)
      .maybeSingle<{ memberships_enabled: boolean | null }>();

    if (!membershipsFallback.error) {
      record.memberships_enabled = membershipsFallback.data?.memberships_enabled ?? null;
    } else if (isMissingColumnError(membershipsFallback.error)) {
      membershipsColumnMissing = true;
      console.warn(
        "[studio-settings] memberships_enabled column not found. Run the latest migration to enable membership controls."
      );
    } else {
      console.error("[studio-settings] failed to fetch memberships_enabled", membershipsFallback.error);
    }
  } else {
    fetchError = initial.error;
  }

  if (fetchError && !isMissingColumnError(fetchError)) {
    console.error("[studio-settings] fetch failed", fetchError);
  }

  const scheduleTimezone = normalizeTimezoneCandidate(record?.schedule_timezone);
  const phoneCountry = phoneColumnMissing
    ? DEFAULT_PHONE_COUNTRY
    : normalizePhoneCountryCandidate(record?.phone_country);
  const membershipsEnabled = membershipsColumnMissing
    ? DEFAULT_MEMBERSHIPS_ENABLED
    : normalizeMembershipsEnabledCandidate(record?.memberships_enabled);

  setStudioTimezone(scheduleTimezone);
  cachedSettings = { scheduleTimezone, phoneCountry, membershipsEnabled };
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
  membershipsEnabled?: boolean;
  updatedBy?: string | null;
};

export async function updateStudioSettings(options: UpdateSettingsPayload): Promise<StudioSettings> {
  const { timezone, phoneCountry, membershipsEnabled, updatedBy } = options;

  const nextTimezone = timezone ? normalizeTimezoneCandidate(timezone) : undefined;
  if (nextTimezone && !isValidTimezone(nextTimezone)) {
    throw new Error("Invalid timezone value");
  }

  const nextPhoneCountry =
    phoneCountry !== undefined ? normalizePhoneCountryCandidate(phoneCountry) : undefined;

  const nextMembershipsEnabled =
    membershipsEnabled !== undefined ? Boolean(membershipsEnabled) : undefined;

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
  if (nextMembershipsEnabled !== undefined) {
    payload.memberships_enabled = nextMembershipsEnabled;
  }

  let upsertError: unknown = null;
  let upsertPayload = payload;
  let phoneColumnMissing = false;
  let membershipsColumnMissing = false;

  const attemptUpsert = async (body: Record<string, unknown>) => {
    const { error } = await supabaseAdmin.from("studio_settings").upsert(body, { onConflict: "key" });
    return error;
  };

  upsertError = await attemptUpsert(upsertPayload);

  if (upsertError && isMissingColumnError(upsertError) && "memberships_enabled" in upsertPayload) {
    const { memberships_enabled: _legacyMembershipsEnabled, ...rest } = upsertPayload;
    void _legacyMembershipsEnabled;
    upsertPayload = rest;
    upsertError = await attemptUpsert(upsertPayload);
    membershipsColumnMissing = true;
    if (!upsertError) {
      console.warn(
        "[studio-settings] memberships_enabled column missing. Saved other fields only; run migrations to enable membership controls."
      );
    }
  }

  if (upsertError && isMissingColumnError(upsertError) && "phone_country" in upsertPayload) {
    const { phone_country: _legacyPhoneCountry, ...rest } = upsertPayload;
    void _legacyPhoneCountry;
    upsertPayload = rest;
    upsertError = await attemptUpsert(upsertPayload);
    phoneColumnMissing = true;
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
        phoneColumnMissing || !nextPhoneCountry ? DEFAULT_PHONE_COUNTRY : nextPhoneCountry,
      membershipsEnabled:
        membershipsColumnMissing || nextMembershipsEnabled === undefined
          ? DEFAULT_MEMBERSHIPS_ENABLED
          : nextMembershipsEnabled,
    };
  } else {
    cachedSettings = {
      scheduleTimezone: nextTimezone ?? cachedSettings.scheduleTimezone,
      phoneCountry:
        phoneColumnMissing || !nextPhoneCountry ? cachedSettings.phoneCountry : nextPhoneCountry,
      membershipsEnabled:
        membershipsColumnMissing || nextMembershipsEnabled === undefined
          ? cachedSettings.membershipsEnabled
          : nextMembershipsEnabled,
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
