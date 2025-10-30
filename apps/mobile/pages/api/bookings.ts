import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import dayjs from "dayjs";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { resequenceWaitlist } from "@/lib/waitlist";

type ActorInput = {
  actorClientId?: string | null;
  actorStaffId?: string | null;
  actorInstructorId?: string | null;
};

type BookingEventType = "CREATED" | "CANCELLED" | "REBOOKED" | "CHECKED_IN" | "CHECKED_OUT";

type AllocatedPlan = {
  id: string;
  name: string | null;
  previousRemaining: number;
  remaining: number;
};

const TODAY = () => dayjs().format("YYYY-MM-DD");

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
      return { error: `Esta reserva se habilita a partir del ${unlock.format("YYYY-MM-DD")}` as const };
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

function parseActors(body: Record<string, unknown>): ActorInput {
  return {
    actorClientId: typeof body.actorClientId === "string" ? body.actorClientId : undefined,
    actorStaffId: typeof body.actorStaffId === "string" ? body.actorStaffId : undefined,
    actorInstructorId: typeof body.actorInstructorId === "string" ? body.actorInstructorId : undefined,
  };
}

async function tryAllocateSpecificPlan(planId: string, clientId: string, today: string): Promise<AllocatedPlan | null> {
  const { data: plan, error } = await supabaseAdmin
    .from("plan_purchases")
    .select("id, modality, remaining_classes, plan_types(name)")
    .eq("id", planId)
    .eq("client_id", clientId)
    .eq("status", "ACTIVE")
    .lte("start_date", today)
    .or(`expires_at.is.null,expires_at.gte.${today}`)
    .maybeSingle();

  if (error || !plan) return null;
  if (plan.modality !== "FLEXIBLE") return null;
  if ((plan.remaining_classes ?? 0) <= 0) return null;

  const previousRemaining = plan.remaining_classes ?? 0;
  const { data: updated } = await supabaseAdmin
    .from("plan_purchases")
    .update({ remaining_classes: previousRemaining - 1 })
    .eq("id", plan.id)
    .eq("remaining_classes", previousRemaining)
    .select("id, remaining_classes")
    .maybeSingle();

  if (!updated) return null;

  return {
    id: plan.id,
    name: plan.plan_types?.name ?? null,
    previousRemaining,
    remaining: updated.remaining_classes ?? previousRemaining - 1,
  };
}

async function allocatePlanPurchaseForBooking(
  clientId: string,
  sessionId: string,
  preferredPlanId?: string | null
): Promise<AllocatedPlan | null> {
  const today = TODAY();
  const tried = new Set<string>();

  if (preferredPlanId) {
    const preferred = await tryAllocateSpecificPlan(preferredPlanId, clientId, today);
    if (preferred) return preferred;
    tried.add(preferredPlanId);
  }

  const { data: planOptions } = await supabaseAdmin
    .from("plan_purchases")
    .select("id")
    .eq("client_id", clientId)
    .eq("status", "ACTIVE")
    .lte("start_date", today)
    .or(`expires_at.is.null,expires_at.gte.${today}`)
    .gt("remaining_classes", 0)
    .eq("modality", "FLEXIBLE")
    .order("expires_at", { ascending: true, nullsFirst: true })
    .order("purchased_at", { ascending: true })
    .limit(10);

  for (const option of planOptions ?? []) {
    if (!option?.id) continue;
    if (tried.has(option.id)) continue;
    const allocated = await tryAllocateSpecificPlan(option.id, clientId, today);
    if (allocated) return allocated;
    tried.add(option.id);
  }

  return null;
}

async function attachPlanPurchase({
  bookingId,
  clientId,
  sessionId,
  preferredPlanId,
}: {
  bookingId: string;
  clientId: string;
  sessionId: string;
  preferredPlanId?: string | null;
}) {
  const allocated = await allocatePlanPurchaseForBooking(clientId, sessionId, preferredPlanId);
  if (!allocated) return null;

  try {
    await supabaseAdmin.from("bookings").update({ plan_purchase_id: allocated.id }).eq("id", bookingId);

    await supabaseAdmin.from("plan_usages").insert({
      plan_purchase_id: allocated.id,
      booking_id: bookingId,
      session_id: sessionId,
      credit_delta: 1,
      notes: "Reserva auto-asignada",
    });
  } catch (error) {
    await supabaseAdmin
      .from("plan_purchases")
      .update({ remaining_classes: allocated.previousRemaining })
      .eq("id", allocated.id);
    throw error;
  }

  return allocated;
}

async function refundPlanUsage(
  bookingId: string,
  planPurchaseId: string | null,
  sessionId: string
) {
  if (!planPurchaseId) return;
  const { data: plan } = await supabaseAdmin
    .from("plan_purchases")
    .select("remaining_classes")
    .eq("id", planPurchaseId)
    .maybeSingle();
  if (!plan) return;

  const currentRemaining = plan.remaining_classes ?? 0;
  await supabaseAdmin
    .from("plan_purchases")
    .update({ remaining_classes: currentRemaining + 1 })
    .eq("id", planPurchaseId);

  await supabaseAdmin.from("plan_usages").insert({
    plan_purchase_id: planPurchaseId,
    booking_id: bookingId,
    session_id: sessionId,
    credit_delta: -1,
    notes: "Cancelación de reserva",
  });
}

async function createBooking({
  sessionId,
  clientId,
  clientHint,
  actors,
  preferredPlanId,
}: {
  sessionId: string;
  clientId?: string | null;
  clientHint?: string | null;
  actors: ActorInput;
  preferredPlanId?: string | null;
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

  const plan = await attachPlanPurchase({
    bookingId: booking.id,
    clientId: cid,
    sessionId,
    preferredPlanId,
  });

  if (!plan) {
    const { data: fixedPlan } = await supabaseAdmin
      .from("plan_purchases")
      .select("id")
      .eq("client_id", cid)
      .eq("status", "ACTIVE")
      .eq("modality", "FIXED")
      .lte("start_date", TODAY())
      .maybeSingle();

    if (fixedPlan?.id) {
      throw Object.assign(
        new Error("Tu plan fijo ya tiene las clases asignadas. Contacta a recepcion si necesitas cambios."),
        { status: 409 }
      );
    }
  }

  await logBookingEvent(
    booking.id,
    "CREATED",
    { actorClientId: cid, ...actors },
    undefined,
    { planPurchaseId: plan?.id ?? null }
  );

  return {
    bookingId: booking.id,
    token,
    planPurchaseId: plan?.id ?? null,
    planName: plan?.name ?? null,
  };
}

async function promoteFromWaitlist(sessionId: string): Promise<void> {
  try {
    const { data: candidate, error } = await supabaseAdmin
      .from("session_waitlist")
      .select("id, client_id")
      .eq("session_id", sessionId)
      .eq("status", "PENDING")
      .order("position", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error || !candidate) {
      return;
    }

    const claimTime = new Date().toISOString();
    const { data: claimed, error: claimError } = await supabaseAdmin
      .from("session_waitlist")
      .update({ status: "PROMOTED", updated_at: claimTime })
      .eq("id", candidate.id)
      .eq("status", "PENDING")
      .select("id, client_id")
      .maybeSingle();

    if (claimError || !claimed) {
      return;
    }

    try {
      const result = await createBooking({
        sessionId,
        clientId: claimed.client_id,
        clientHint: null,
        actors: { actorClientId: claimed.client_id },
      });

      if ((result as { duplicated?: boolean }).duplicated) {
        await supabaseAdmin
          .from("session_waitlist")
          .update({ status: "CANCELLED", updated_at: new Date().toISOString() })
          .eq("id", claimed.id);
        await resequenceWaitlist(sessionId);
        await promoteFromWaitlist(sessionId);
        return;
      }

      await supabaseAdmin
        .from("session_waitlist")
        .update({ notified_at: new Date().toISOString() })
        .eq("id", claimed.id);
    } catch {
      await supabaseAdmin
        .from("session_waitlist")
        .update({ status: "CANCELLED", updated_at: new Date().toISOString() })
        .eq("id", claimed.id);
      await resequenceWaitlist(sessionId);
      await promoteFromWaitlist(sessionId);
      return;
    }

    await resequenceWaitlist(sessionId);
  } catch {
    // ignore waitlist promotion failures
  }
}

async function cancelBooking({
  bookingId,
  actors,
  notes,
  metadata,
  forceRefund = false,
}: {
  bookingId: string;
  actors: ActorInput;
  notes?: string;
  metadata?: Record<string, unknown>;
  forceRefund?: boolean;
}) {
  const now = new Date().toISOString();
  const { data: booking, error } = await supabaseAdmin
    .from("bookings")
    .select(
      `id, status, session_id, client_id, plan_purchase_id,
       sessions:session_id ( start_time, course_id, courses ( cancellation_window_hours ) ),
       plan_purchases:plan_purchase_id ( modality )`
    )
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
      cancelled_by: actors.actorClientId ?? booking.client_id ?? null,
    })
    .eq("id", bookingId);
  if (cancelError) throw new Error("Cancel booking failed");

  const sessionInfo = (booking.sessions ??
    null) as
    | {
        start_time?: string;
        course_id?: string | null;
        courses?: { cancellation_window_hours?: number | null } | null;
      }
    | null;
  const planInfo = (booking.plan_purchases ?? null) as { modality?: string } | null;

  const windowHours = Number(sessionInfo?.courses?.cancellation_window_hours ?? 24);
  const sessionStart = sessionInfo?.start_time ? dayjs(sessionInfo.start_time) : null;
  const allowRefund =
    !!booking.plan_purchase_id &&
    (forceRefund ||
      (planInfo?.modality === "FLEXIBLE" &&
        sessionStart !== null &&
        sessionStart.diff(dayjs(now), "hour", true) >= windowHours));

  if (allowRefund) {
    await refundPlanUsage(bookingId, booking.plan_purchase_id ?? null, booking.session_id);
  }

  await logBookingEvent(
    bookingId,
    "CANCELLED",
    actors,
    notes,
    {
      ...metadata,
      planPurchaseId: booking.plan_purchase_id,
      refundedCredit: allowRefund,
      cancellationWindowHours: windowHours,
    }
  );

  await promoteFromWaitlist(booking.session_id);

  return { cancelled: true as const, booking };
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
      const { bookingId, notes, metadata, forceRefund, ...actorRest } = req.body || {};
      if (!bookingId) return res.status(400).json({ error: "Missing bookingId" });
      const actors = parseActors(actorRest);
      const result = await cancelBooking({
        bookingId,
        actors,
        notes,
        metadata: metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : undefined,
        forceRefund: forceRefund === true,
      });
      return res.status(200).json(result);
    }

    if (req.method === "PATCH") {
      const { action, bookingId, newSessionId, notes, metadata, preferredPlanId, ...actorRest } = req.body || {};
      if (action !== "rebook") return res.status(400).json({ error: "Unsupported action" });
      if (!bookingId || !newSessionId) return res.status(400).json({ error: "Missing bookingId or newSessionId" });

      const actors = parseActors(actorRest);

      const { data: original, error: originalError } = await supabaseAdmin
        .from("bookings")
        .select("id, client_id, session_id, plan_purchase_id")
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
        preferredPlanId: (preferredPlanId as string | undefined) ?? original.plan_purchase_id ?? undefined,
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
        forceRefund: true,
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
