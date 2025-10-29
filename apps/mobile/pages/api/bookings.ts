import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabase-admin";
import crypto from "crypto";
import dayjs from "dayjs";

type ActorInput = {
  actorClientId?: string | null;
  actorStaffId?: string | null;
  actorInstructorId?: string | null;
};

const BOOKING_EVENT_TYPES = ["CREATED", "CANCELLED", "REBOOKED", "CHECKED_IN", "CHECKED_OUT"] as const;
type BookingEventType = (typeof BOOKING_EVENT_TYPES)[number];

async function logBookingEvent(
  bookingId: string,
  eventType: BookingEventType,
  actors: ActorInput,
  notes?: string,
  metadata?: Record<string, unknown>
) {
  await supabaseAdmin.from("booking_events").insert({
    booking_id: bookingId,
    actor_client_id: actors.actorClientId ?? null,
    actor_staff_id: actors.actorStaffId ?? null,
    actor_instructor_id: actors.actorInstructorId ?? null,
    event_type: eventType,
    notes: notes ?? null,
    metadata: metadata ?? {},
  });
}

async function ensureSession(sessionId: string) {
  const { data: session, error } = await supabaseAdmin
    .from("sessions")
    .select("id, capacity, start_time, end_time, course_id")
    .eq("id", sessionId)
    .single();
  return { session, error };
}

async function ensureBookingWindow(session: { start_time: string; course_id: string | null }) {
  if (!session.course_id) return null;
  const { data: course, error } = await supabaseAdmin
    .from("courses")
    .select("booking_window_days")
    .eq("id", session.course_id)
    .maybeSingle();
  if (error) return { error: "Course lookup failed" as const };

  if (course?.booking_window_days !== null && course?.booking_window_days !== undefined) {
    const windowDays = Math.max(0, Number(course.booking_window_days));
    const unlock = dayjs(session.start_time).subtract(windowDays, "day").startOf("day");
    if (unlock.isAfter(dayjs())) {
      return {
        error: `Esta reserva se habilita a partir del ${unlock.format("YYYY-MM-DD")}` as const,
      };
    }
  }
  return null;
}

async function ensureClientId(clientId?: string | null, clientHint?: string | null) {
  if (clientId) return clientId;
  const name = (clientHint || "Angie").toString();
  const { data: found } = await supabaseAdmin.from("clients").select("id").eq("full_name", name).maybeSingle();
  if (found?.id) return found.id;

  const { data: ins, error } = await supabaseAdmin
    .from("clients")
    .insert({ full_name: name })
    .select("id")
    .single();
  if (error || !ins) throw new Error("Could not create client");
  return ins.id;
}

async function ensureAvailability(sessionId: string) {
  const { count: occupied, error } = await supabaseAdmin
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .neq("status", "CANCELLED");
  if (error) throw new Error("Count failed");
  return occupied ?? 0;
}

async function generateQrToken(bookingId: string, sessionStart: string) {
  const token = crypto.randomBytes(6).toString("base64url").slice(0, 10).toUpperCase();
  const expires = dayjs(sessionStart).add(6, "hour").toISOString();
  const { error } = await supabaseAdmin
    .from("qr_tokens")
    .insert({ booking_id: bookingId, token, expires_at: expires });
  if (error) throw new Error("Insert token failed");
  return token;
}

async function createBooking({
  sessionId,
  clientId,
  clientHint,
  actors,
}: {
  sessionId: string;
  clientId?: string | null;
  clientHint?: string | null;
  actors: ActorInput;
}) {
  const { session, error: sessionError } = await ensureSession(sessionId);
  if (sessionError || !session) {
    throw Object.assign(new Error("Session not found"), { status: 404 });
  }

  const windowCheck = await ensureBookingWindow(session);
  if (windowCheck?.error) {
    throw Object.assign(new Error(windowCheck.error), { status: 403 });
  }

  const cid = await ensureClientId(clientId, clientHint);

  const { data: dup } = await supabaseAdmin
    .from("bookings")
    .select("id, status")
    .eq("session_id", sessionId)
    .eq("client_id", cid)
    .maybeSingle();
  if (dup?.id && dup.status !== "CANCELLED") {
    return { bookingId: dup.id, duplicated: true as const };
  }

  const occupied = await ensureAvailability(sessionId);
  if (occupied >= session.capacity) {
    throw Object.assign(new Error("Session full"), { status: 409 });
  }

  const { data: booking, error: insertError } = await supabaseAdmin
    .from("bookings")
    .insert({ session_id: sessionId, client_id: cid, status: "CONFIRMED" })
    .select("id")
    .single();
  if (insertError || !booking) throw new Error("Insert booking failed");

  const token = await generateQrToken(booking.id, session.start_time);

  await logBookingEvent(booking.id, "CREATED", { actorClientId: cid, ...actors });

  return { bookingId: booking.id, token };
}

async function cancelBooking({
  bookingId,
  actors,
  notes,
  metadata,
}: {
  bookingId: string;
  actors: ActorInput;
  notes?: string;
  metadata?: Record<string, unknown>;
}) {
  const now = new Date().toISOString();
  const { data: booking, error } = await supabaseAdmin
    .from("bookings")
    .select("id, status, session_id, client_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (error || !booking) {
    throw Object.assign(new Error("Booking not found"), { status: 404 });
  }

  if (booking.status === "CANCELLED") {
    return { alreadyCancelled: true as const };
  }

  const { error: cancelError } = await supabaseAdmin
    .from("bookings")
    .update({
      status: "CANCELLED",
      cancelled_at: now,
      cancelled_by: actors.actorClientId ?? null,
    })
    .eq("id", bookingId);
  if (cancelError) throw new Error("Cancel booking failed");

  await logBookingEvent(
    bookingId,
    "CANCELLED",
    {
      actorClientId: actors.actorClientId,
      actorStaffId: actors.actorStaffId,
      actorInstructorId: actors.actorInstructorId,
    },
    notes,
    metadata
  );

  return { cancelled: true as const, booking };
}

function parseActors(body: Record<string, unknown>): ActorInput {
  return {
    actorClientId: typeof body.actorClientId === "string" ? body.actorClientId : undefined,
    actorStaffId: typeof body.actorStaffId === "string" ? body.actorStaffId : undefined,
    actorInstructorId: typeof body.actorInstructorId === "string" ? body.actorInstructorId : undefined,
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === "POST") {
      const { sessionId, clientId, clientHint, ...actorRest } = req.body || {};
      if (!sessionId) return res.status(400).json({ error: "Missing sessionId" });

      const actors = parseActors(actorRest);
      const result = await createBooking({ sessionId, clientId, clientHint, actors });
      return res.status(200).json(result);
    }

    if (req.method === "DELETE") {
      const { bookingId, notes, metadata, ...actorRest } = req.body || {};
      if (!bookingId) return res.status(400).json({ error: "Missing bookingId" });
      const actors = parseActors(actorRest);
      const result = await cancelBooking({
        bookingId,
        actors,
        notes,
        metadata: metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : undefined,
      });
      return res.status(200).json(result);
    }

    if (req.method === "PATCH") {
      const { action, bookingId, newSessionId, notes, metadata, ...actorRest } = req.body || {};
      if (action !== "rebook") return res.status(400).json({ error: "Unsupported action" });
      if (!bookingId || !newSessionId) return res.status(400).json({ error: "Missing bookingId or newSessionId" });

      const actors = parseActors(actorRest);

      const { data: original, error: originalError } = await supabaseAdmin
        .from("bookings")
        .select("id, client_id, session_id")
        .eq("id", bookingId)
        .maybeSingle();
      if (originalError || !original) {
        return res.status(404).json({ error: "Booking not found" });
      }

      const newBooking = await createBooking({
        sessionId: newSessionId,
        clientId: original.client_id,
        clientHint: null,
        actors,
      });

      await supabaseAdmin
        .from("bookings")
        .update({ rebooked_from_booking_id: original.id })
        .eq("id", newBooking.bookingId);

      await cancelBooking({
        bookingId: original.id,
        actors,
        notes: notes ?? "Rebooked",
        metadata: { ...(metadata as Record<string, unknown> | undefined), rebookedTo: newBooking.bookingId },
      });

      await logBookingEvent(
        newBooking.bookingId,
        "REBOOKED",
        actors,
        notes,
        { ...(metadata as Record<string, unknown> | undefined), rebookedFrom: original.id }
      );

      return res.status(200).json({ ...newBooking, rebookedFrom: original.id });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    const message = err instanceof Error ? err.message : "Server error";
    return res.status(status).json({ error: message });
  }
}
