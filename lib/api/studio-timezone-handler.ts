import type { NextApiRequest, NextApiResponse } from "next";
import { loadStudioSettings, updateStudioTimezone } from "@/lib/studio-settings";
import { STUDIO_TIMEZONE_SUGGESTIONS, type TimezoneOption } from "@/lib/timezone-options";
import { formatOffsetLabel, getTimezoneOffsetMinutes, isValidTimezone } from "@/lib/timezone";

type SuccessPayload = {
  timezone: string;
  offsetMinutes: number | null;
  offsetLabel: string | null;
  suggestions: TimezoneOption[];
};

type ErrorPayload = {
  error: string;
};

function buildSuccessPayload(timezone: string): SuccessPayload {
  const offsetMinutes = getTimezoneOffsetMinutes(timezone);
  const offsetLabel = offsetMinutes === null ? null : formatOffsetLabel(offsetMinutes);
  return {
    timezone,
    offsetMinutes,
    offsetLabel,
    suggestions: STUDIO_TIMEZONE_SUGGESTIONS,
  };
}

export async function studioTimezoneApiHandler(req: NextApiRequest, res: NextApiResponse<SuccessPayload | ErrorPayload>) {
  try {
    if (req.method === "GET") {
      const settings = await loadStudioSettings();
      return res.status(200).json(buildSuccessPayload(settings.scheduleTimezone));
    }

    if (req.method === "PUT" || req.method === "PATCH") {
      const timezoneCandidate =
        typeof req.body === "string" ? req.body : typeof req.body?.timezone === "string" ? req.body.timezone : "";

      const timezone = timezoneCandidate.trim();
      if (!isValidTimezone(timezone)) {
        return res.status(400).json({ error: "El identificador de horario no es valido" });
      }

      const updated = await updateStudioTimezone(timezone);
      return res.status(200).json(buildSuccessPayload(updated.scheduleTimezone));
    }

    res.setHeader("Allow", "GET,PUT,PATCH");
    return res.status(405).json({ error: "Metodo no permitido" });
  } catch (error) {
    console.error("[studio-timezone] handler error", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return res.status(500).json({ error: message });
  }
}
