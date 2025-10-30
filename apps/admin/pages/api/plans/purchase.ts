import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import dayjs from "dayjs";
import { supabaseAdmin } from "@/lib/supabase-admin";

type BookingEventType = "CREATED" | "CANCELLED" | "REBOOKED" | "CHECKED_IN" | "CHECKED_OUT";

type FixedPlanSession = {
  id: string;
  start_time: string;
  capacity: number;
};

const VALID_MODALITIES = new Set<"FLEXIBLE" | "FIXED">(["FLEXIBLE", "FIXED"]);

function normalizeModality(value: unknown): "FLEXIBLE" | "FIXED" {
  if (typeof value === "string") {
    const upper = value.toUpperCase();
    if (upper === "FIXED") return "FIXED";
  }
  return "FLEXIBLE";
}

async function logBookingEvent(
  bookingId: string,
  clientId: string,
  eventType: BookingEventType,
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
    throw new Error("No se pudo validar la disponibilidad de una sesión del curso");
  }

  return count ?? 0;
}

async function generateQrToken(bookingId: string, sessionStart: string) {
  const token = crypto.randomBytes(6).toString("base64url").slice(0, 10).toUpperCase();
  const expires = dayjs(sessionStart).add(6, "hour").toISOString();

  const { error } = await supabaseAdmin
    .from("qr_tokens")
    .insert({ booking_id: bookingId, token, expires_at: expires });

  if (error) {
    throw new Error("No se pudo generar el código QR para la reserva automática");
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

  const eligible = (sessions ?? []).slice(0, classCount) as FixedPlanSession[];
  if (eligible.length < classCount) {
    throw new Error("El curso no tiene suficientes sesiones futuras para cubrir todas las clases del plan");
  }

  // Validar disponibilidad antes de reservar
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
  try {
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
        throw new Error("No se pudo crear una de las reservas automáticas del plan fijo");
      }

      createdBookingIds.push(booking.id);

      await generateQrToken(booking.id, session.start_time);
      await logBookingEvent(booking.id, clientId, "CREATED", {
        planPurchaseId,
        modality: "FIXED",
        auto: true,
      });
      const { error: usageError } = await supabaseAdmin.from("plan_usages").insert({
        plan_purchase_id: planPurchaseId,
        booking_id: booking.id,
        session_id: session.id,
        credit_delta: 1,
        notes: "Reserva fija auto-generada",
      });
      if (usageError) {
        throw new Error("No se pudo registrar el uso del plan fijo");
      }
    }
  } catch (error) {
    if (createdBookingIds.length > 0) {
      await supabaseAdmin.from("plan_usages").delete().in("booking_id", createdBookingIds);
      await supabaseAdmin.from("qr_tokens").delete().in("booking_id", createdBookingIds);
      await supabaseAdmin.from("booking_events").delete().in("booking_id", createdBookingIds);
      await supabaseAdmin.from("bookings").delete().in("id", createdBookingIds);
    }
    throw error;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Metodo no permitido" });
  }

  try {
    const {
      clientId,
      planTypeId,
      startDate,
      notes,
      modality: rawModality,
      courseId,
    } = req.body as {
      clientId?: string;
      planTypeId?: string;
      startDate?: string;
      notes?: string | null;
      modality?: string;
      courseId?: string | null;
    };

    if (!clientId || !planTypeId) {
      return res.status(400).json({ error: "Cliente y plan son obligatorios" });
    }

    const modality = normalizeModality(rawModality);
    if (!VALID_MODALITIES.has(modality)) {
      return res.status(400).json({ error: "Modalidad de plan inválida" });
    }

    if (modality === "FIXED" && !courseId) {
      return res.status(400).json({ error: "Selecciona el curso que se asignará al plan fijo" });
    }

    const { data: activeMembership, error: membershipLookupError } = await supabaseAdmin
      .from("memberships")
      .select("id, end_date, status")
      .eq("client_id", clientId)
      .eq("status", "ACTIVE")
      .order("end_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (membershipLookupError) {
      console.error("/api/plans/purchase membership lookup", membershipLookupError);
      return res.status(500).json({ error: "No se pudo verificar la membresia del cliente" });
    }

    if (!activeMembership) {
      return res.status(400).json({ error: "El cliente no tiene una membresia activa" });
    }

    const membershipExpired = dayjs(activeMembership.end_date).isBefore(dayjs(), "day");
    if (membershipExpired) {
      return res.status(400).json({ error: "La membresia del cliente esta vencida" });
    }

    const { data: planType, error: planTypeError } = await supabaseAdmin
      .from("plan_types")
      .select("id, class_count, price, currency, validity_days, privileges")
      .eq("id", planTypeId)
      .single();

    if (planTypeError || !planType) {
      console.error("/api/plans/purchase planType", planTypeError);
      return res.status(400).json({ error: "El plan seleccionado no existe" });
    }

    const startReference = startDate ? dayjs(startDate) : dayjs();
    if (!startReference.isValid()) {
      return res.status(400).json({ error: "Fecha de inicio invalida" });
    }
    const startIso = startReference.startOf("day").format("YYYY-MM-DD");

    let expiresAt: string | null = null;
    if (modality === "FLEXIBLE" && typeof planType.validity_days === "number" && planType.validity_days > 0) {
      expiresAt = startReference.startOf("day").add(planType.validity_days, "day").format("YYYY-MM-DD");
    }

    const initialClasses = Number(planType.class_count ?? 0);
    if (!Number.isFinite(initialClasses) || initialClasses <= 0) {
      return res.status(400).json({ error: "El plan seleccionado no tiene clases configuradas" });
    }

    const { data: purchase, error: purchaseError } = await supabaseAdmin
      .from("plan_purchases")
      .insert({
        client_id: clientId,
        plan_type_id: planTypeId,
        status: "ACTIVE",
        purchased_at: dayjs().toISOString(),
        start_date: startIso,
        expires_at: expiresAt,
        initial_classes: initialClasses,
        remaining_classes: modality === "FIXED" ? 0 : initialClasses,
        modality,
        notes: notes ?? null,
      })
      .select("id")
      .single();

    if (purchaseError || !purchase) {
      console.error("/api/plans/purchase insert", purchaseError);
      return res.status(500).json({ error: "No se pudo registrar la compra del plan" });
    }

    if (modality === "FIXED") {
      try {
        await generateFixedPlanBookings({
          planPurchaseId: purchase.id,
          clientId,
          classCount: initialClasses,
          courseId: courseId!,
          startDateIso: dayjs(startIso).startOf("day").toISOString(),
        });
      } catch (fixedError) {
        await supabaseAdmin.from("plan_purchases").delete().eq("id", purchase.id);
        const message =
          fixedError instanceof Error
            ? fixedError.message
            : "No se pudieron generar las reservas automáticas para el plan fijo";
        return res.status(400).json({ error: message });
      }
    }

    const amount = Number(planType.price ?? 0);
    if (Number.isFinite(amount) && amount >= 0) {
      const { error: paymentError } = await supabaseAdmin.from("plan_payments").insert({
        plan_purchase_id: purchase.id,
        amount,
        currency: planType.currency ?? "MXN",
        paid_at: dayjs().toISOString(),
        status: "SUCCESS",
        notes: notes ?? null,
      });

      if (paymentError) {
        console.error("/api/plans/purchase payment", paymentError);
        return res.status(500).json({ error: "No se pudo registrar el pago del plan" });
      }
    }

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
      console.error("/api/plans/purchase fetch", fetchError);
      return res.status(500).json({
        error: "El plan fue registrado, pero no se pudo refrescar la informacion del cliente",
      });
    }

    return res.status(200).json({
      message: "Plan registrado correctamente",
      member: memberSnapshot,
    });
  } catch (error) {
    console.error("/api/plans/purchase", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return res.status(500).json({ error: message });
  }
}
