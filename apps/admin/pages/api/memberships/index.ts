import type { NextApiRequest, NextApiResponse } from "next";
import dayjs from "dayjs";
import { supabaseAdmin } from "@/lib/supabase-admin";

type MemberSnapshot = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  created_at: string | null;
  client_profiles: {
    status: string;
    avatar_url: string | null;
    birthdate: string | null;
    occupation: string | null;
    notes: string | null;
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
    preferred_apparatus: string[] | null;
  } | null;
  memberships: Array<{
    id: string;
    status: string;
    start_date: string;
    end_date: string;
    next_billing_date: string | null;
    notes: string | null;
    term_years: number;
    privileges_snapshot: string | null;
    membership_types: {
      name: string | null;
      privileges: string | null;
    } | null;
    membership_payments: Array<{
      amount: number;
      currency: string;
      paid_at: string;
      period_start: string;
      period_end: string;
      period_years: number;
    }>;
  }> | null;
  plan_purchases: Array<{
    id: string;
    status: string;
    start_date: string;
    expires_at: string | null;
    initial_classes: number;
    remaining_classes: number;
    plan_types: {
      name: string | null;
      privileges: string | null;
    } | null;
  }> | null;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Metodo no permitido" });
  }

  try {
    const {
      clientId,
      membershipTypeId,
      startDate,
      termYears,
      notes,
    } = req.body as {
      clientId?: string;
      membershipTypeId?: string;
      startDate?: string;
      termYears?: number | string;
      notes?: string | null;
    };

    if (!clientId || !membershipTypeId) {
      return res.status(400).json({ error: "Cliente y tipo de membresia son obligatorios" });
    }

    const { data: membershipType, error: membershipTypeError } = await supabaseAdmin
      .from("membership_types")
      .select("id, price, currency, privileges, allow_multi_year, max_prepaid_years")
      .eq("id", membershipTypeId)
      .single();

    if (membershipTypeError || !membershipType) {
      console.error("/api/memberships POST membershipType", membershipTypeError);
      return res.status(400).json({ error: "El tipo de membresia seleccionado no existe" });
    }

    const pricePerYear = Number(membershipType.price ?? 0);
    if (!Number.isFinite(pricePerYear) || pricePerYear < 0) {
      return res.status(400).json({ error: "El tipo de membresia no tiene un precio valido" });
    }

    const parsedTerm = Math.max(
      1,
      Number.isFinite(Number(termYears)) ? Number(termYears) : 1
    );

    if (membershipType.max_prepaid_years && parsedTerm > membershipType.max_prepaid_years) {
      return res.status(400).json({
        error: `Esta membresia admite hasta ${membershipType.max_prepaid_years} aÃ±os por pago`,
      });
    }

    if (!membershipType.allow_multi_year && parsedTerm > 1) {
      return res.status(400).json({
        error: "Esta membresia solo permite pagar un aÃ±o a la vez",
      });
    }

    const start = startDate ? dayjs(startDate) : dayjs();
    if (!start.isValid()) {
      return res.status(400).json({ error: "Fecha de inicio invalida" });
    }

    const normalizedStart = start.startOf("day");
    const normalizedEnd = normalizedStart.add(parsedTerm, "year").subtract(1, "day");

    const startIso = normalizedStart.format("YYYY-MM-DD");
    const endIso = normalizedEnd.format("YYYY-MM-DD");
    const amount = Number(pricePerYear * parsedTerm);

    // marcar membresias activas previas como inactivas para mantener historial limpio
    await supabaseAdmin
      .from("memberships")
      .update({ status: "INACTIVE" })
      .eq("client_id", clientId)
      .eq("status", "ACTIVE");

    const { data: membershipInsert, error: membershipInsertError } = await supabaseAdmin
      .from("memberships")
      .insert({
        client_id: clientId,
        membership_type_id: membershipTypeId,
        status: "ACTIVE",
        start_date: startIso,
        end_date: endIso,
        next_billing_date: endIso,
        auto_renew: false,
        remaining_classes: null,
        notes: notes ?? null,
        term_years: parsedTerm,
        privileges_snapshot: membershipType.privileges ?? null,
      })
      .select("id")
      .single();

    if (membershipInsertError || !membershipInsert) {
      console.error("/api/memberships POST insert", membershipInsertError);
      return res.status(500).json({ error: "No se pudo registrar la membresia" });
    }

    const { error: paymentError } = await supabaseAdmin.from("membership_payments").insert({
      membership_id: membershipInsert.id,
      amount,
      currency: membershipType.currency ?? "MXN",
      paid_at: dayjs().toISOString(),
      period_start: startIso,
      period_end: endIso,
      period_years: parsedTerm,
      status: "SUCCESS",
      notes: notes ?? null,
    });

    if (paymentError) {
      console.error("/api/memberships POST payment", paymentError);
      return res.status(500).json({ error: "No se pudo registrar el pago de la membresia" });
    }

    await supabaseAdmin
      .from("client_profiles")
      .update({ status: "ACTIVE" })
      .eq("client_id", clientId);

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
      .single<MemberSnapshot>();

    if (fetchError || !memberSnapshot) {
      console.error("/api/memberships POST fetch", fetchError);
      return res.status(500).json({ error: "La membresia se registrÃ³, pero no pudimos refrescar la informaciÃ³n" });
    }

    return res.status(200).json({
      message: "Membresia registrada correctamente",
      member: memberSnapshot,
    });
  } catch (error) {
    console.error("/api/memberships POST", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return res.status(500).json({ error: message });
  }
}

