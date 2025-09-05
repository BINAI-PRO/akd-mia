import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabase-admin";
import crypto from "crypto";
import dayjs from "dayjs";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { sessionId, clientId, clientHint } = req.body || {};
    if (!sessionId) return res.status(400).json({ error: "Missing sessionId" });

    // 1) Sesión
    const { data: session, error: e1 } = await supabaseAdmin
      .from("sessions")
      .select("id, capacity, start_time, end_time")
      .eq("id", sessionId)
      .single();
    if (e1 || !session) return res.status(404).json({ error: "Session not found" });

    // 2) Cliente (si no viene clientId, usamos/creamos por nombre)
    let cid: string | undefined = clientId;
    if (!cid) {
      const name = (clientHint || "Angie").toString();
      const { data: found } = await supabaseAdmin.from("clients").select("id").eq("full_name", name).maybeSingle();
      if (found?.id) cid = found.id;
      else {
        const { data: ins, error: eIns } = await supabaseAdmin
          .from("clients")
          .insert({ full_name: name })
          .select("id")
          .single();
        if (eIns) return res.status(500).json({ error: "Could not create client" });
        cid = ins.id;
      }
    }

    // 3) Evitar duplicado
    const { data: dup } = await supabaseAdmin
      .from("bookings")
      .select("id")
      .eq("session_id", sessionId)
      .eq("client_id", cid!)
      .maybeSingle();
    if (dup?.id) return res.status(200).json({ bookingId: dup.id, duplicated: true });

    // 4) Aforo
    const { count: occupied, error: eCnt } = await supabaseAdmin
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId)
      .neq("status", "CANCELLED");
    if (eCnt) return res.status(500).json({ error: "Count failed" });
    if ((occupied ?? 0) >= session.capacity) return res.status(409).json({ error: "Session full" });

    // 5) Crear booking
    const { data: booking, error: eBk } = await supabaseAdmin
      .from("bookings")
      .insert({ session_id: sessionId, client_id: cid!, status: "CONFIRMED" })
      .select("id")
      .single();
    if (eBk) return res.status(500).json({ error: "Insert booking failed" });

    // 6) Token QR
    const token = crypto.randomBytes(6).toString("base64url").slice(0, 10).toUpperCase();
    const expires = dayjs(session.start_time).add(6, "hour").toISOString();
    const { error: eQr } = await supabaseAdmin
      .from("qr_tokens")
      .insert({ booking_id: booking.id, token, expires_at: expires });
    if (eQr) return res.status(500).json({ error: "Insert token failed" });

    return res.status(200).json({ bookingId: booking.id, token });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Server error" });
  }
}
