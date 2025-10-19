import type { NextApiRequest, NextApiResponse } from "next";
import dayjs from "dayjs";
import { supabaseAdmin } from "@/lib/supabase-admin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Metodo no permitido" });
  }

  try {
    const { clientId, planTypeId, startDate, notes } = req.body as {
      clientId?: string;
      planTypeId?: string;
      startDate?: string;
      notes?: string | null;
    };

    if (!clientId || !planTypeId) {
      return res.status(400).json({ error: "Cliente y plan son obligatorios" });
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

    const now = startDate ? dayjs(startDate) : dayjs();
    if (!now.isValid()) {
      return res.status(400).json({ error: "Fecha de inicio invalida" });
    }
    const startIso = now.startOf("day").format("YYYY-MM-DD");

    let expiresAt: string | null = null;
    if (typeof planType.validity_days === "number" && planType.validity_days > 0) {
      expiresAt = now.startOf("day").add(planType.validity_days, "day").format("YYYY-MM-DD");
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
        remaining_classes: initialClasses,
        notes: notes ?? null,
      })
      .select("id")
      .single();

    if (purchaseError || !purchase) {
      console.error("/api/plans/purchase insert", purchaseError);
      return res.status(500).json({ error: "No se pudo registrar la compra del plan" });
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

