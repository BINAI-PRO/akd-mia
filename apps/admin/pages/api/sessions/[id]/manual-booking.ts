import type { NextApiRequest, NextApiResponse } from "next";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { loadStudioSettings } from "@/lib/studio-settings";
import { createBooking, type ActorInput } from "@/apps/mobile/pages/api/bookings";

type SuccessResponse = {
  bookingId: string;
  planPurchaseId: string | null;
  planName: string | null;
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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SuccessResponse | ErrorResponse>
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido" });
  }

  const staff = await requireStaffContext(req, res);
  if (!staff) return;

  await loadStudioSettings();

  const { id } = req.query;
  if (typeof id !== "string" || !id) {
    return res.status(400).json({ error: "Identificador de sesión inválido" });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {};
  const planPurchaseId =
    typeof body?.planPurchaseId === "string" && body.planPurchaseId.trim().length > 0
      ? body.planPurchaseId.trim()
      : null;

  if (!planPurchaseId) {
    return res.status(400).json({ error: "Debes seleccionar un plan activo" });
  }

  const { data: planRow, error: planError } = await supabaseAdmin
    .from("plan_purchases")
    .select("id, client_id")
    .eq("id", planPurchaseId)
    .maybeSingle<{ id: string; client_id: string | null }>();

  if (planError) {
    return res.status(500).json({ error: "No se pudo validar el plan seleccionado" });
  }

  if (!planRow?.id || !planRow.client_id) {
    return res.status(404).json({ error: "Plan activo no encontrado" });
  }

  const actors: ActorInput = {
    actorStaffId: staff.staffId,
  };

  try {
    const booking = await createBooking({
      sessionId: id,
      clientId: planRow.client_id,
      clientHint: null,
      actors,
      preferredPlanId: planRow.id,
    });

    if ((booking as { duplicated?: boolean }).duplicated) {
      return res.status(409).json({
        error: "El miembro ya cuenta con una reserva activa en esta sesión",
      });
    }

    return res.status(200).json({
      bookingId: booking.bookingId,
      planPurchaseId: booking.planPurchaseId ?? planRow.id,
      planName: booking.planName ?? null,
    });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    const message =
      error instanceof Error ? error.message : "No se pudo crear la reserva manualmente";
    return res.status(status).json({ error: message });
  }
}

