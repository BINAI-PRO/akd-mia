import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminFeature } from "@/lib/api/require-admin-feature";

type QrTokenResponse = {
  token: string;
  imageUrl: string;
  downloadUrl: string;
  expiresAt: string | null;
};

function resolveBaseUrl(req: NextApiRequest): string {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const host = req.headers["x-forwarded-host"] ?? req.headers.host;
  const protocol =
    typeof forwardedProto === "string"
      ? forwardedProto
      : host && host?.includes("localhost")
      ? "http"
      : "https";
  return `${protocol}://${host ?? "localhost:3000"}`;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<QrTokenResponse | { error: string }>
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Método no permitido" });
  }

  const access = await requireAdminFeature(req, res, "classes", "EDIT");
  if (!access) return;

  const { bookingId } = req.query;
  if (typeof bookingId !== "string" || bookingId.length === 0) {
    return res.status(400).json({ error: "Identificador de reserva inválido" });
  }

  const { data: bookingRow, error: bookingError } = await supabaseAdmin
    .from("bookings")
    .select("id")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingError) {
    console.error("/api/bookings/[bookingId]/qr-token booking lookup", bookingError);
    return res.status(500).json({ error: "No se pudo consultar la reserva" });
  }

  if (!bookingRow) {
    return res.status(404).json({ error: "Reserva no encontrada" });
  }

  const { data: tokenRow, error: tokenError } = await supabaseAdmin
    .from("qr_tokens")
    .select("token, expires_at")
    .eq("booking_id", bookingId)
    .maybeSingle<{ token: string; expires_at: string | null }>();

  if (tokenError) {
    console.error("/api/bookings/[bookingId]/qr-token token lookup", tokenError);
    return res.status(500).json({ error: "No se pudo recuperar el QR" });
  }

  if (!tokenRow?.token) {
    return res.status(404).json({ error: "Esta reserva no cuenta con un QR disponible" });
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || resolveBaseUrl(req);
  const imageUrl = `${baseUrl}/api/qr/${tokenRow.token}`;
  const downloadUrl = `${imageUrl}?download=1`;

  return res.status(200).json({
    token: tokenRow.token,
    imageUrl,
    downloadUrl,
    expiresAt: tokenRow.expires_at ?? null,
  });
}
