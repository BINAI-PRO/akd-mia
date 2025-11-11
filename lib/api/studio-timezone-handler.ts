import type { NextApiRequest, NextApiResponse } from "next";
import {
  loadStudioSettings,
  updateStudioSettings,
  type StudioPhoneCountry,
  type StudioSettings,
} from "@/lib/studio-settings";
import { STUDIO_TIMEZONE_SUGGESTIONS, type TimezoneOption } from "@/lib/timezone-options";
import { formatOffsetLabel, getTimezoneOffsetMinutes, isValidTimezone } from "@/lib/timezone";

type SuccessPayload = {
  timezone: string;
  offsetMinutes: number | null;
  offsetLabel: string | null;
  phoneCountry: StudioPhoneCountry;
  membershipsEnabled: boolean;
  suggestions: TimezoneOption[];
};

type ErrorPayload = {
  error: string;
};

const PHONE_COUNTRY_OPTIONS: StudioPhoneCountry[] = ["MX", "ES"];

function buildSuccessPayload(settings: StudioSettings): SuccessPayload {
  const offsetMinutes = getTimezoneOffsetMinutes(settings.scheduleTimezone);
  const offsetLabel = offsetMinutes === null ? null : formatOffsetLabel(offsetMinutes);
  return {
    timezone: settings.scheduleTimezone,
    offsetMinutes,
    offsetLabel,
    phoneCountry: settings.phoneCountry,
    membershipsEnabled: settings.membershipsEnabled,
    suggestions: STUDIO_TIMEZONE_SUGGESTIONS,
  };
}

export async function studioSettingsApiHandler(
  req: NextApiRequest,
  res: NextApiResponse<SuccessPayload | ErrorPayload>
) {
  try {
    if (req.method === "GET") {
      const settings = await loadStudioSettings();
      return res.status(200).json(buildSuccessPayload(settings));
    }

    if (req.method === "PUT" || req.method === "PATCH") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {};

      const timezoneCandidate =
        typeof body?.timezone === "string" ? body.timezone.trim() : undefined;
      if (timezoneCandidate && !isValidTimezone(timezoneCandidate)) {
        return res.status(400).json({ error: "El identificador de horario no es valido" });
      }

      const phoneCandidate =
        typeof body?.phoneCountry === "string" ? (body.phoneCountry.toUpperCase() as StudioPhoneCountry) : undefined;
      if (phoneCandidate && !PHONE_COUNTRY_OPTIONS.includes(phoneCandidate)) {
        return res.status(400).json({ error: "El identificador de teléfono no es válido" });
      }

      const membershipsEnabledCandidate =
        typeof body?.membershipsEnabled === "boolean" ? body.membershipsEnabled : undefined;

      const updated = await updateStudioSettings({
        timezone: timezoneCandidate,
        phoneCountry: phoneCandidate,
        membershipsEnabled: membershipsEnabledCandidate,
      });
      return res.status(200).json(buildSuccessPayload(updated));
    }

    res.setHeader("Allow", "GET,PUT,PATCH");
    return res.status(405).json({ error: "Metodo no permitido" });
  } catch (error) {
    console.error("[studio-settings] handler error", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return res.status(500).json({ error: message });
  }
}

export const studioTimezoneApiHandler = studioSettingsApiHandler;
