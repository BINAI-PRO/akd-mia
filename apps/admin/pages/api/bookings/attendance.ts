import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { madridDayjs } from "@/lib/timezone";
import { loadStudioSettings } from "@/lib/studio-settings";
import { requireAdminFeature } from "@/lib/api/require-admin-feature";

type SuccessResponse = {
  bookingId: string;
  status: string;
  present: boolean;
  client: { id: string | null; fullName: string; role?: "CLIENT" | "INSTRUCTOR" };
  session: { id: string; startTime: string | null; classType: string | null };
  message: string;
};

type ErrorResponse = { error: string };

type BookingRow = {
  id: string;
  status: string | null;
  session_id: string;
  clients: { id: string | null; full_name: string | null } | null;
  sessions: {
    id: string;
    start_time: string | null;
    class_types: { name: string | null } | null;
  } | null;
};

const ALLOWED_STATUSES = new Set(["CONFIRMED", "CHECKED_IN", "CHECKED_OUT", "REBOOKED"]);

type InstructorTokenRow = {
  id: string;
  instructor_id: string;
  session_id: string;
  expires_at: string;
  consumed_at: string | null;
  instructors: { id: string; full_name: string | null } | null;
  sessions: {
    id: string;
    start_time: string | null;
    class_types: { name: string | null } | null;
  } | null;
};

async function resolveBookingIdFromToken(token: string) {
  const cleaned = token.trim().toUpperCase();
  const { data, error } = await supabaseAdmin
    .from("qr_tokens")
    .select("booking_id, expires_at")
    .eq("token", cleaned)
    .maybeSingle<{ booking_id: string; expires_at: string | null }>();

  if (error) {
    throw Object.assign(new Error("No se pudo validar el codigo QR"), { status: 500 });
  }
  if (!data) {
    throw Object.assign(new Error("Codigo QR no encontrado"), { status: 404 });
  }
  if (data.expires_at) {
    const expiry = madridDayjs(data.expires_at);
    if (expiry.isValid() && expiry.isBefore(madridDayjs())) {
      throw Object.assign(new Error("El codigo QR ha expirado"), { status: 410 });
    }
  }
  return data.booking_id;
}

async function tryResolveInstructorToken(token: string, actorStaffId: string | null) {
  const cleaned = token.trim().toUpperCase();
  const { data, error } = await supabaseAdmin
    .from("instructor_qr_tokens")
    .select(
      `
        id,
        instructor_id,
        session_id,
        expires_at,
        consumed_at,
        instructors ( id, full_name ),
        sessions ( id, start_time, class_types ( name ) )
      `
    )
    .eq("token", cleaned)
    .maybeSingle<InstructorTokenRow>();

  if (error) {
    throw Object.assign(new Error("No se pudo validar el codigo del instructor"), { status: 500 });
  }

  if (!data) {
    return null;
  }

  if (data.consumed_at) {
    throw Object.assign(new Error("El codigo ya fue usado"), { status: 409 });
  }

  if (data.expires_at) {
    const expiry = madridDayjs(data.expires_at);
    if (expiry.isValid() && expiry.isBefore(madridDayjs())) {
      throw Object.assign(new Error("El codigo del instructor expirA3"), { status: 410 });
    }
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabaseAdmin
    .from("instructor_qr_tokens")
    .update({ consumed_at: now, consumed_by_staff: actorStaffId ?? null })
    .eq("id", data.id);

  if (updateError) {
    throw Object.assign(new Error("No se pudo registrar el ingreso"), { status: 500 });
  }

  await supabaseAdmin.from("instructor_attendance").upsert({
    instructor_id: data.instructor_id,
    session_id: data.session_id,
    checked_in_at: now,
    checked_in_by_staff: actorStaffId ?? null,
  });

  return {
    instructorId: data.instructor_id,
    instructorName: data.instructors?.full_name ?? "Instructor",
    sessionId: data.session_id,
    sessionStart: data.sessions?.start_time ?? null,
    classType: data.sessions?.class_types?.name ?? null,
  };
}

async function fetchBookingRecord(bookingId: string) {
  const { data, error } = await supabaseAdmin
    .from("bookings")
    .select(
      `
        id,
        status,
        session_id,
        clients:clients!bookings_client_id_fkey ( id, full_name ),
        sessions:sessions!bookings_session_id_fkey (
          id,
          start_time,
          class_types ( name )
        )
      `
    )
    .eq("id", bookingId)
    .maybeSingle<BookingRow>();

  if (error) {
    throw Object.assign(new Error("No se pudo cargar la reservacion"), { status: 500 });
  }

  if (!data) {
    throw Object.assign(new Error("Reservacion no encontrada"), { status: 404 });
  }

  return data;
}

async function updateAttendance(options: {
  bookingId: string;
  present: boolean;
  actorStaffId?: string | null;
  source: "qr-scan" | "manual";
}) {
  const { bookingId, present, actorStaffId, source } = options;

  const booking = await fetchBookingRecord(bookingId);

  const currentStatus = (booking.status ?? "").toUpperCase();
  if (!ALLOWED_STATUSES.has(currentStatus)) {
    throw Object.assign(new Error("La reservacion no se puede actualizar en su estado actual"), {
      status: 409,
    });
  }

  const targetStatus = present ? "CHECKED_IN" : "CONFIRMED";

  if (currentStatus === targetStatus) {
    return { booking, changed: false, status: targetStatus };
  }

  const { error } = await supabaseAdmin
    .from("bookings")
    .update({ status: targetStatus, updated_at: new Date().toISOString() })
    .eq("id", bookingId);

  if (error) {
    throw Object.assign(new Error("No se pudo actualizar la reservacion"), { status: 500 });
  }

  await supabaseAdmin.from("booking_events").insert({
    booking_id: bookingId,
    actor_staff_id: actorStaffId ?? null,
    event_type: present ? "CHECKED_IN" : "CHECKED_OUT",
    metadata: {
      source,
    },
  });

  return { booking, changed: true, status: targetStatus };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SuccessResponse | ErrorResponse>
) {
  if (req.method !== "POST" && req.method !== "PATCH") {
    res.setHeader("Allow", "POST, PATCH");
    return res.status(405).json({ error: "Metodo no permitido" });
  }

  const access = await requireAdminFeature(req, res, "attendance", "EDIT");
  if (!access) return;

  try {
    await loadStudioSettings();

    const { bookingId: rawBookingId, token, present: rawPresent } =
      (req.body ?? {}) as Record<string, unknown>;

    let bookingId =
      typeof rawBookingId === "string" && rawBookingId
        ? rawBookingId
        : null;

    const hasToken = typeof token === "string" && token.trim().length > 0;

    if (!bookingId && hasToken) {
      const instructorCheck = await tryResolveInstructorToken(token as string, access.staffId);
      if (instructorCheck) {
        return res.status(200).json({
          bookingId: instructorCheck.sessionId,
          status: "INSTRUCTOR_CHECKED_IN",
          present: true,
          client: {
            id: instructorCheck.instructorId,
            fullName: instructorCheck.instructorName,
            role: "INSTRUCTOR",
          },
          session: {
            id: instructorCheck.sessionId,
            startTime: instructorCheck.sessionStart,
            classType: instructorCheck.classType,
          },
          message: "Asistencia del instructor registrada",
        });
      }

      bookingId = await resolveBookingIdFromToken(token as string);
    }

    if (!bookingId) {
      return res.status(400).json({ error: "Falta el identificador de la reserva o el codigo QR" });
    }

    let present: boolean | undefined;
    if (typeof rawPresent === "boolean") {
      present = rawPresent;
    } else if (hasToken) {
      present = true;
    }

    if (typeof present !== "boolean") {
      return res
        .status(400)
        .json({ error: "Debes indicar si la asistencia se marca o se revierte" });
    }

    const result = await updateAttendance({
      bookingId,
      present,
      actorStaffId: access.staffId,
      source: hasToken ? "qr-scan" : "manual",
    });

    const { booking, status } = result;
    const client = {
      id: booking.clients?.id ?? null,
      fullName: booking.clients?.full_name ?? "Cliente",
      role: "CLIENT" as const,
    };
    const session = {
      id: booking.sessions?.id ?? booking.session_id,
      startTime: booking.sessions?.start_time ?? null,
      classType: booking.sessions?.class_types?.name ?? null,
    };

    const message =
      result.changed && present
        ? "Asistencia registrada correctamente"
        : result.changed && !present
        ? "Asistencia revertida"
        : present
        ? "La asistencia ya estaba registrada"
        : "La asistencia ya estaba desmarcada";

    return res.status(200).json({
      bookingId,
      status,
      present,
      client,
      session,
      message,
    });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    const message = error instanceof Error ? error.message : "Error inesperado";
    return res.status(status).json({ error: message });
  }
}
