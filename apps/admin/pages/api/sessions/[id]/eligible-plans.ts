import type { NextApiRequest, NextApiResponse } from "next";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { madridDayjs } from "@/lib/timezone";

type EligiblePlanResult = {
  planPurchaseId: string;
  clientId: string;
  clientName: string;
  clientEmail: string | null;
  clientPhone: string | null;
  planName: string | null;
  remainingClasses: number | null;
  unlimited: boolean;
};

type SuccessResponse = {
  results: EligiblePlanResult[];
};

type ErrorResponse = { error: string };

type StaffContext = {
  staffId: string;
};

async function requireStaffContext(
  req: NextApiRequest,
  res: NextApiResponse<ErrorResponse>
): Promise<StaffContext | null> {
  const supabase = createSupabaseServerClient({ req, res });
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    res.status(500).json({ error: error.message });
    return null;
  }

  if (!session?.user) {
    res.status(401).json({ error: "No autenticado" });
    return null;
  }

  const { data: staffRow, error: staffError } = await supabaseAdmin
    .from("staff")
    .select("id")
    .eq("auth_user_id", session.user.id)
    .maybeSingle<{ id: string }>();

  if (staffError) {
    res.status(500).json({ error: staffError.message });
    return null;
  }

  if (!staffRow?.id) {
    res.status(403).json({ error: "Acceso restringido al equipo autorizado" });
    return null;
  }

  return { staffId: staffRow.id };
}

function normalizeQuery(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, 80);
}

function buildSearchFilter(term: string): string {
  const escaped = term.replace(/[%_]/g, "\\$&");
  return `full_name.ilike.%${escaped}%,email.ilike.%${escaped}%,phone.ilike.%${escaped}%`;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SuccessResponse | ErrorResponse>
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Método no permitido" });
  }

  if (!(await requireStaffContext(req, res))) return;

  const { id } = req.query;
  if (typeof id !== "string" || !id) {
    return res.status(400).json({ error: "Identificador de sesión inválido" });
  }

  const today = madridDayjs().format("YYYY-MM-DD");

  const { data: sessionRow, error: sessionError } = await supabaseAdmin
    .from("sessions")
    .select("id, course_id, start_time, courses:course_id(category)")
    .eq("id", id)
    .maybeSingle<{ id: string; start_time: string | null; courses: { category: string | null } | null }>();

  if (sessionError) {
    return res.status(500).json({ error: "No se pudo cargar la sesión" });
  }

  if (!sessionRow) {
    return res.status(404).json({ error: "Sesión no encontrada" });
  }

  const sessionCategory = sessionRow.courses?.category ?? null;

  const { data: existingBookings, error: existingError } = await supabaseAdmin
    .from("bookings")
    .select("client_id, status")
    .eq("session_id", id)
    .returns<Array<{ client_id: string | null; status: string | null }>>();

  if (existingError) {
    return res.status(500).json({ error: "No se pudieron consultar las reservaciones actuales" });
  }

  const bookedClientIds = new Set(
    (existingBookings ?? [])
      .filter((entry) => entry.client_id && entry.status?.toUpperCase() !== "CANCELLED")
      .map((entry) => entry.client_id as string)
  );

  const queryTerm = normalizeQuery(req.query.q);

  let clientQuery = supabaseAdmin
    .from("clients")
    .select(
      `
        id,
        full_name,
        email,
        phone,
        plan_purchases (
          id,
          status,
          modality,
          remaining_classes,
          start_date,
          expires_at,
          plan_types:plan_type_id (
            name,
            category,
            class_count,
            app_only
          )
        )
      `
    )
    .order("full_name")
    .limit(12);

  if (queryTerm) {
    clientQuery = clientQuery.or(buildSearchFilter(queryTerm));
  }

  const { data: clients, error: clientsError } = await clientQuery.returns<
    Array<{
      id: string;
      full_name: string | null;
      email: string | null;
      phone: string | null;
      plan_purchases: Array<{
        id: string;
        status: string | null;
        modality: string | null;
        remaining_classes: number | null;
        start_date: string | null;
        expires_at: string | null;
        plan_types: {
          name: string | null;
          category: string | null;
          class_count: number | null;
          app_only: boolean | null;
        } | null;
      }> | null;
    }>
  >();

  if (clientsError) {
    return res.status(500).json({ error: "No se pudieron consultar los miembros elegibles" });
  }

  const results: EligiblePlanResult[] = [];

  for (const client of clients ?? []) {
    if (bookedClientIds.has(client.id)) {
      continue;
    }

    const plans = client.plan_purchases ?? [];
    for (const plan of plans) {
      if (plan.status !== "ACTIVE") continue;
      if (plan.modality !== "FLEXIBLE") continue;
      const planType = plan.plan_types;
      if (!planType) continue;
      if (planType.app_only) continue;

      if (plan.start_date && plan.start_date > today) continue;
      if (plan.expires_at && plan.expires_at < today) continue;

      const unlimited = planType.class_count === null;
      const remaining = plan.remaining_classes ?? 0;
      if (!unlimited && remaining <= 0) continue;

      const matchesCategory =
        sessionCategory === null || !planType.category || planType.category === sessionCategory;
      if (!matchesCategory) continue;

      results.push({
        planPurchaseId: plan.id,
        clientId: client.id,
        clientName: client.full_name ?? "Miembro sin nombre",
        clientEmail: client.email ?? null,
        clientPhone: client.phone ?? null,
        planName: planType.name ?? null,
        remainingClasses: unlimited ? null : remaining,
        unlimited,
      });
    }
  }

  results.sort((a, b) => a.clientName.localeCompare(b.clientName, "es"));

  return res.status(200).json({ results: results.slice(0, 20) });
}
