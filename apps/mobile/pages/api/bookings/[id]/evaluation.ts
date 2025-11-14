import type { NextApiRequest, NextApiResponse } from "next";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { madridDayjs } from "@/lib/timezone";
import type { Tables, TablesInsert } from "@/types/database";

const REQUIRED_FIELDS = [
  "reserva",
  "recepcion",
  "limpieza",
  "iluminacion",
  "clima",
  "ruido",
  "salon",
  "equipoCondicion",
  "equipoDisponibilidad",
  "instTrato",
  "instClaridad",
  "instTecnica",
] as const;

type RatingField = (typeof REQUIRED_FIELDS)[number];

type RatingsPayload = Record<RatingField, number>;

type EvaluationRow = Tables<"session_evaluations">;

type BookingRow = Tables<"bookings"> & {
  sessions: Pick<
    Tables<"sessions">,
    "id" | "class_type_id" | "instructor_id" | "room_id" | "start_time" | "end_time"
  > | null;
};

const SELECT_BOOKING = `
  id,
  client_id,
  status,
  session_id,
  sessions:session_id (
    id,
    class_type_id,
    instructor_id,
    room_id,
    start_time,
    end_time
  )
`;

function average(values: number[]): number {
  if (!values.length) return 0;
  return Math.round((values.reduce((acc, value) => acc + value, 0) / values.length) * 100) / 100;
}

function normalizeRating(value: unknown, field: RatingField): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`La calificación de "${field}" es inválida.`);
  }
  const rounded = Math.round(numeric);
  if (rounded < 1 || rounded > 5) {
    throw new Error(`La calificación de "${field}" debe estar entre 1 y 5.`);
  }
  return rounded;
}

function sanitizeComment(value: unknown, max = 1500): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function sanitizeNotes(value: unknown, max = 1000): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function mapEvaluation(row: EvaluationRow) {
  const ratings: RatingsPayload = {
    reserva: row.rating_reservation_process,
    recepcion: row.rating_reception,
    limpieza: row.rating_cleanliness,
    iluminacion: row.rating_lighting,
    clima: row.rating_climate,
    ruido: row.rating_noise,
    salon: row.rating_room_comfort,
    equipoCondicion: row.rating_equipment_condition,
    equipoDisponibilidad: row.rating_equipment_availability,
    instTrato: row.rating_instructor_respect,
    instClaridad: row.rating_instructor_clarity,
    instTecnica: row.rating_instructor_technique,
  };

  return {
    id: row.id,
    bookingId: row.booking_id,
    sessionId: row.session_id,
    clientId: row.client_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ratings,
    discomfort: {
      value: row.discomfort,
      notes: row.discomfort_notes ?? null,
    },
    nps: row.nps_score ?? null,
    comment: row.comment ?? null,
    summary: {
      recepcion: row.summary_reception,
      ambiente: row.summary_environment,
      equipo: row.summary_equipment,
      instructor: row.summary_instructor,
      global: row.summary_global,
    },
  };
}

async function fetchClientId(authUserId: string) {
  const { data, error } = await supabaseAdmin
    .from("clients")
    .select("id")
    .eq("auth_user_id", authUserId)
    .maybeSingle<{ id: string }>();

  if (error) {
    throw error;
  }

  return data?.id ?? null;
}

async function fetchBooking(bookingId: string) {
  const { data, error } = await supabaseAdmin
    .from("bookings")
    .select(SELECT_BOOKING)
    .eq("id", bookingId)
    .maybeSingle<BookingRow>();

  if (error) {
    throw error;
  }

  return data ?? null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const bookingId = typeof req.query.id === "string" ? req.query.id : null;
  if (!bookingId) {
    return res.status(400).json({ error: "Identificador de reserva inválido" });
  }

  const supabase = createSupabaseServerClient({ req, res });
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.user) {
    return res.status(401).json({ error: "No autenticado" });
  }

  let clientId: string | null = null;
  try {
    clientId = await fetchClientId(session.user.id);
  } catch (error) {
    console.error("/api/bookings/[id]/evaluation fetchClient", error);
    return res.status(500).json({ error: "No se pudo validar al cliente" });
  }

  if (!clientId) {
    return res.status(403).json({ error: "Perfil de cliente no encontrado" });
  }

  let booking: BookingRow | null = null;
  try {
    booking = await fetchBooking(bookingId);
  } catch (error) {
    console.error("/api/bookings/[id]/evaluation fetchBooking", error);
    return res.status(500).json({ error: "No se pudo obtener la reserva" });
  }

  if (!booking) {
    return res.status(404).json({ error: "Reserva no encontrada" });
  }

  if (booking.client_id !== clientId) {
    return res.status(403).json({ error: "No puedes evaluar esta reserva" });
  }

  const sessionInfo = booking.sessions;
  const sessionEndISO = sessionInfo?.end_time ?? null;
  const now = madridDayjs();
  const allowed =
    !!sessionEndISO && madridDayjs(sessionEndISO).isBefore(now) && booking.status !== "CANCELLED";

  if (req.method === "GET") {
    try {
      const { data, error } = await supabaseAdmin
        .from("session_evaluations")
        .select("*")
        .eq("booking_id", bookingId)
        .maybeSingle<EvaluationRow>();

      if (error) {
        throw error;
      }

      return res.status(200).json({
        evaluation: data ? mapEvaluation(data) : null,
        allowed,
        availableAt: sessionEndISO,
      });
    } catch (error) {
      console.error("/api/bookings/[id]/evaluation getEvaluation", error);
      return res.status(500).json({ error: "No se pudo consultar la evaluación" });
    }
  }

  if (req.method === "PUT") {
    if (!allowed) {
      return res.status(409).json({ error: "La evaluación se activa al finalizar la clase" });
    }

    let ratingsPayload: RatingsPayload;
    try {
      const source = req.body?.ratings ?? {};
      ratingsPayload = REQUIRED_FIELDS.reduce((acc, field) => {
        acc[field] = normalizeRating(source[field], field);
        return acc;
      }, {} as RatingsPayload);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Calificaciones inválidas";
      return res.status(400).json({ error: message });
    }

    const discomfortValue = Boolean(req.body?.discomfort?.value);
    const discomfortNotes = discomfortValue ? sanitizeNotes(req.body?.discomfort?.notes) : null;

    const rawNps = req.body?.nps;
    let nps: number | null = null;
    if (rawNps !== null && rawNps !== undefined && rawNps !== "") {
      const numeric = typeof rawNps === "number" ? rawNps : Number(rawNps);
      if (!Number.isFinite(numeric)) {
        return res.status(400).json({ error: "La puntuación NPS es inválida" });
      }
      const rounded = Math.round(numeric);
      if (rounded < 0 || rounded > 10) {
        return res.status(400).json({ error: "La puntuación NPS debe estar entre 0 y 10" });
      }
      nps = rounded;
    }

    const comment = sanitizeComment(req.body?.comment);

    const summary = {
      recepcion: average([ratingsPayload.reserva, ratingsPayload.recepcion]),
      ambiente: average([
        ratingsPayload.limpieza,
        ratingsPayload.iluminacion,
        ratingsPayload.clima,
        ratingsPayload.ruido,
        ratingsPayload.salon,
      ]),
      equipo: average([ratingsPayload.equipoCondicion, ratingsPayload.equipoDisponibilidad]),
      instructor: average([
        ratingsPayload.instTrato,
        ratingsPayload.instClaridad,
        ratingsPayload.instTecnica,
      ]),
    } as const;
    const summaryGlobal = average([
      summary.recepcion,
      summary.ambiente,
      summary.equipo,
      summary.instructor,
    ]);

    const upsertPayload: TablesInsert<"session_evaluations"> = {
      booking_id: bookingId,
      session_id: booking.session_id,
      client_id: clientId,
      class_type_id: sessionInfo?.class_type_id ?? null,
      instructor_id: sessionInfo?.instructor_id ?? null,
      room_id: sessionInfo?.room_id ?? null,
      session_start: sessionInfo?.start_time ?? null,
      session_end: sessionInfo?.end_time ?? null,
      rating_reservation_process: ratingsPayload.reserva,
      rating_reception: ratingsPayload.recepcion,
      rating_cleanliness: ratingsPayload.limpieza,
      rating_lighting: ratingsPayload.iluminacion,
      rating_climate: ratingsPayload.clima,
      rating_noise: ratingsPayload.ruido,
      rating_room_comfort: ratingsPayload.salon,
      rating_equipment_condition: ratingsPayload.equipoCondicion,
      rating_equipment_availability: ratingsPayload.equipoDisponibilidad,
      rating_instructor_respect: ratingsPayload.instTrato,
      rating_instructor_clarity: ratingsPayload.instClaridad,
      rating_instructor_technique: ratingsPayload.instTecnica,
      discomfort: discomfortValue,
      discomfort_notes: discomfortNotes,
      nps_score: nps,
      comment,
      summary_reception: summary.recepcion,
      summary_environment: summary.ambiente,
      summary_equipment: summary.equipo,
      summary_instructor: summary.instructor,
      summary_global: summaryGlobal,
    };

    try {
      const { data, error } = await supabaseAdmin
        .from("session_evaluations")
        .upsert(upsertPayload, { onConflict: "booking_id" })
        .select("*")
        .maybeSingle<EvaluationRow>();

      if (error) {
        throw error;
      }

      if (!data) {
        return res.status(500).json({ error: "No se guardó la evaluación" });
      }

      return res.status(200).json({ evaluation: mapEvaluation(data), allowed: true });
    } catch (error) {
      console.error("/api/bookings/[id]/evaluation upsert", error);
      return res.status(500).json({ error: "No se pudo guardar la evaluación" });
    }
  }

  res.setHeader("Allow", "GET,PUT");
  return res.status(405).json({ error: "Método no permitido" });
}
