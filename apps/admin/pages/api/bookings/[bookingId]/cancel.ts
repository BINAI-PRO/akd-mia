import type { NextApiRequest, NextApiResponse } from "next";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { cancelBooking, type ActorInput } from "@/apps/mobile/pages/api/bookings";

async function requireStaffId(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<string | null> {
  const supabase = createSupabaseServerClient({ req, res });
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session?.user) {
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
    res.status(403).json({ error: "Acceso restringido al personal autorizado" });
    return null;
  }

  return staffRow.id;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    return res.status(405).json({ error: "Método no permitido" });
  }

  const staffId = await requireStaffId(req, res);
  if (!staffId) return;

  const { bookingId } = req.query;
  if (typeof bookingId !== "string" || bookingId.length === 0) {
    return res.status(400).json({ error: "Identificador de reserva inválido" });
  }

  try {
    const actors: ActorInput = { actorStaffId: staffId };
    const result = await cancelBooking({
      bookingId,
      actors,
      metadata: { source: "admin-session-detail" },
      notes: "Cancelado desde panel admin",
      forceRefund: false,
    });

    return res.status(200).json({
      cancelled: result.cancelled,
      booking: result.booking,
    });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    const message = error instanceof Error ? error.message : "No se pudo cancelar la reserva";
    return res.status(status).json({ error: message });
  }
}

