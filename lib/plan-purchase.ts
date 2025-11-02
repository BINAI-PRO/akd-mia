import crypto from "crypto";
import dayjs from "dayjs";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Tables } from "@/types/database";

type PlanTypeRow = Pick<Tables<"plan_types">, "id" | "name" | "class_count" | "price" | "currency" | "validity_days"> & {
  privileges?: string | null;
};

type ClientRow = Pick<Tables<"clients">, "id" | "email" | "full_name">;

type MembershipRow = {
  id: string;
  end_date: string | null;
  status: string | null;
};

export type PlanPurchasePayload = {
  clientId: string;
  planTypeId: string;
  modality: "FLEXIBLE" | "FIXED";
  courseId?: string | null;
  startDate?: string | null;
  notes?: string | null;
};

export type PlanPurchasePrepared = {
  client: ClientRow;
  planType: PlanTypeRow;
  membership: MembershipRow;
  modality: "FLEXIBLE" | "FIXED";
  courseId?: string | null;
  notes?: string | null;
  startIso: string;
  expiresAt: string | null;
  initialClasses: number;
};

export type PlanPaymentPayload = {
  status: "SUCCESS" | "FAILED" | "REFUNDED" | "PENDING";
  providerRef?: string | null;
  notes?: string | null;
  paidAt?: string | null;
};

type MemberSnapshot = Record<string, unknown>;

async function logBookingEvent(
  bookingId: string,
  clientId: string,
  eventType: "CREATED" | "CANCELLED" | "REBOOKED" | "CHECKED_IN" | "CHECKED_OUT",
  metadata: Record<string, unknown>
) {
  await supabaseAdmin.from("booking_events").insert({
    booking_id: bookingId,
    actor_client_id: clientId,
    actor_staff_id: null,
    actor_instructor_id: null,
    event_type: eventType,
    metadata,
  });
}

async function countSessionOccupancy(sessionId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("bookings")
    .select("id", { head: true, count: "exact" })
    .eq("session_id", sessionId)
    .neq("status", "CANCELLED");

  if (error) {
    throw new Error("No se pudo validar la disponibilidad de una sesion del curso");
  }

  return count ?? 0;
}

async function generateQrToken(bookingId: string, sessionStart: string) {
  const token = crypto.randomBytes(6).toString("base64url").slice(0, 10).toUpperCase();
  const expires = dayjs(sessionStart).add(6, "hour").toISOString();

  const { error } = await supabaseAdmin
    .from("qr_tokens")
    .upsert({ booking_id: bookingId, token, expires_at: expires }, { onConflict: "booking_id" });

  if (error) {
    throw new Error("No se pudo generar el codigo QR para la reserva automatica");
  }

  return token;
}

async function generateFixedPlanBookings(params: {
  planPurchaseId: string;
  clientId: string;
  classCount: number;
  courseId: string;
  startDateIso: string;
}) {
  const { planPurchaseId, clientId, classCount, courseId, startDateIso } = params;

  const { data: sessions, error: sessionsError } = await supabaseAdmin
    .from("sessions")
    .select("id, start_time, capacity")
    .eq("course_id", courseId)
    .gte("start_time", startDateIso)
    .order("start_time", { ascending: true })
    .limit(classCount * 5);

  if (sessionsError) {
    throw new Error("No se pudieron consultar las sesiones del curso seleccionado");
  }

  const eligible = (sessions ?? []).slice(0, classCount) as Array<{
    id: string;
    start_time: string;
    capacity: number;
  }>;

  if (eligible.length < classCount) {
    throw new Error("El curso no tiene suficientes sesiones futuras para cubrir todas las clases del plan");
  }

  for (const session of eligible) {
    const { data: dup } = await supabaseAdmin
      .from("bookings")
      .select("id, status")
      .eq("session_id", session.id)
      .eq("client_id", clientId)
      .maybeSingle();

    if (dup?.id && dup.status !== "CANCELLED") {
      throw new Error("El cliente ya tiene una reserva en alguna de las sesiones del curso");
    }

    const occupied = await countSessionOccupancy(session.id);
    if (occupied >= session.capacity) {
      throw new Error("Una de las sesiones del curso ya no tiene lugares disponibles");
    }
  }

  const createdBookingIds: string[] = [];
  for (const session of eligible) {
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .insert({
        session_id: session.id,
        client_id: clientId,
        status: "CONFIRMED",
        plan_purchase_id: planPurchaseId,
      })
      .select("id")
      .single();

    if (bookingError || !booking) {
      throw new Error("No se pudieron crear las reservas automaticas del plan");
    }

    await generateQrToken(booking.id, session.start_time);

    createdBookingIds.push(booking.id);
    await logBookingEvent(booking.id, clientId, "CREATED", { planPurchaseId, autoAssigned: true });
  }

  return createdBookingIds;
}

export async function preparePlanPurchase(payload: PlanPurchasePayload): Promise<PlanPurchasePrepared> {
  const { clientId, planTypeId, modality, courseId, startDate, notes } = payload;

  const { data: client, error: clientError } = await supabaseAdmin
    .from("clients")
    .select("id, email, full_name")
    .eq("id", clientId)
    .maybeSingle<ClientRow>();

  if (clientError || !client) {
    throw Object.assign(new Error("Cliente no encontrado"), { status: 400 });
  }

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from("memberships")
    .select("id, end_date, status")
    .eq("client_id", clientId)
    .eq("status", "ACTIVE")
    .order("end_date", { ascending: false })
    .limit(1)
    .maybeSingle<MembershipRow>();

  if (membershipError) {
    throw Object.assign(new Error("No se pudo verificar la membresia del cliente"), { status: 500 });
  }

  if (!membership) {
    throw Object.assign(new Error("El cliente no tiene una membresia activa"), { status: 400 });
  }

  if (membership.end_date && dayjs(membership.end_date).isBefore(dayjs(), "day")) {
    throw Object.assign(new Error("La membresia del cliente esta vencida"), { status: 400 });
  }

  const { data: planType, error: planTypeError } = await supabaseAdmin
    .from("plan_types")
    .select("id, name, class_count, price, currency, validity_days, privileges")
    .eq("id", planTypeId)
    .single<PlanTypeRow>();

  if (planTypeError || !planType) {
    throw Object.assign(new Error("El plan seleccionado no existe"), { status: 400 });
  }

  if (modality === "FIXED" && !courseId) {
    throw Object.assign(new Error("Selecciona el curso que se asignara al plan fijo"), { status: 400 });
  }

  const startReference = startDate ? dayjs(startDate) : dayjs();
  if (!startReference.isValid()) {
    throw Object.assign(new Error("Fecha de inicio invalida"), { status: 400 });
  }
  const startIso = startReference.startOf("day").format("YYYY-MM-DD");

  let expiresAt: string | null = null;
  if (modality === "FLEXIBLE" && typeof planType.validity_days === "number" && planType.validity_days > 0) {
    expiresAt = startReference.startOf("day").add(planType.validity_days, "day").format("YYYY-MM-DD");
  }

  const initialClasses = Number(planType.class_count ?? 0);
  if (!Number.isFinite(initialClasses) || initialClasses <= 0) {
    throw Object.assign(new Error("El plan seleccionado no tiene clases configuradas"), { status: 400 });
  }

  return {
    client,
    planType,
    membership,
    modality,
    courseId: courseId ?? null,
    notes: notes ?? null,
    startIso,
    expiresAt,
    initialClasses,
  };
}

export async function commitPlanPurchase(
  prepared: PlanPurchasePrepared,
  payment: PlanPaymentPayload
): Promise<{ planPurchaseId: string; memberSnapshot: MemberSnapshot }> {
  const { client, planType, modality, courseId, notes, startIso, expiresAt, initialClasses } = prepared;

  if (payment.providerRef) {
    const { data: existingPayment, error: existingPaymentError } = await supabaseAdmin
      .from("plan_payments")
      .select("plan_purchase_id")
      .eq("provider_ref", payment.providerRef)
      .maybeSingle();

    if (existingPaymentError) {
      throw Object.assign(new Error("No se pudo verificar pagos anteriores"), { status: 500 });
    }

    if (existingPayment?.plan_purchase_id) {
      const memberSnapshot = await fetchMemberSnapshot(client.id);
      return {
        planPurchaseId: existingPayment.plan_purchase_id,
        memberSnapshot,
      };
    }
  }

  const { data: purchase, error: purchaseError } = await supabaseAdmin
    .from("plan_purchases")
    .insert({
      client_id: client.id,
      plan_type_id: planType.id,
      status: "ACTIVE",
      purchased_at: dayjs().toISOString(),
      start_date: startIso,
      expires_at: expiresAt,
      initial_classes: initialClasses,
      remaining_classes: initialClasses,
      modality,
      notes,
    })
    .select("id")
    .single();

  if (purchaseError || !purchase) {
    throw Object.assign(new Error("No se pudo registrar la compra del plan"), { status: 500 });
  }

  if (modality === "FIXED" && courseId) {
    try {
      await generateFixedPlanBookings({
        planPurchaseId: purchase.id,
        clientId: client.id,
        classCount: initialClasses,
        courseId,
        startDateIso: dayjs(startIso).startOf("day").toISOString(),
      });
    } catch (fixedError) {
      await supabaseAdmin.from("plan_purchases").delete().eq("id", purchase.id);
      throw fixedError;
    }
  }

  const amount = Number(planType.price ?? 0);
  const currency = planType.currency ?? "MXN";

  if (Number.isFinite(amount) && amount >= 0) {
    const { error: paymentError } = await supabaseAdmin.from("plan_payments").insert({
      plan_purchase_id: purchase.id,
      amount,
      currency,
      paid_at: payment.paidAt ?? dayjs().toISOString(),
      status: payment.status,
      provider_ref: payment.providerRef ?? null,
      notes: payment.notes ?? null,
    });

    if (paymentError) {
      console.error("plan_payments insert", paymentError);
      throw Object.assign(new Error("El plan fue creado, pero el pago no se registro correctamente"), { status: 500 });
    }
  }

  const memberSnapshot = await fetchMemberSnapshot(client.id);

  return {
    planPurchaseId: purchase.id,
    memberSnapshot,
  };
}

async function fetchMemberSnapshot(clientId: string): Promise<MemberSnapshot> {
  const { data: memberSnapshot, error: fetchError } = await supabaseAdmin
    .from("clients")
    .select(`
      id,
      full_name,
      email,
      phone,
      created_at,
      client_profiles(
        status,
        avatar_url,
        birthdate,
        occupation,
        notes,
        emergency_contact_name,
        emergency_contact_phone,
        preferred_apparatus
      ),
      memberships(
        id,
        status,
        start_date,
        end_date,
        next_billing_date,
        notes,
        term_years,
        privileges_snapshot,
        membership_types(name, privileges),
        membership_payments(amount, currency, paid_at, period_start, period_end, period_years)
      ),
      plan_purchases(
        id,
        status,
        start_date,
        expires_at,
        initial_classes,
        remaining_classes,
        modality,
        plan_types(name, privileges)
      )
    `)
    .eq("id", clientId)
    .single();

  if (fetchError || !memberSnapshot) {
    throw Object.assign(new Error("El plan fue registrado, pero no se pudo refrescar la informacion del cliente"), {
      status: 500,
    });
  }

  return memberSnapshot as MemberSnapshot;
}
