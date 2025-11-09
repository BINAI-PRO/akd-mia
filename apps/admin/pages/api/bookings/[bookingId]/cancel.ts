import type { NextApiRequest, NextApiResponse } from "next";
import { cancelBooking, type ActorInput } from "@/apps/mobile/pages/api/bookings";
import { requireAdminFeature } from "@/lib/api/require-admin-feature";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    return res.status(405).json({ error: "Método no permitido" });
  }

  const access = await requireAdminFeature(req, res, "classes", "EDIT");
  if (!access) return;

  const { bookingId } = req.query;
  if (typeof bookingId !== "string" || bookingId.length === 0) {
    return res.status(400).json({ error: "Identificador de reserva inválido" });
  }

  try {
    const actors: ActorInput = { actorStaffId: access.staffId };
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
