import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseServer } from "@/lib/supabase-server";
import dayjs from "dayjs";

/** Fila que devuelve el SELECT con relaciones anidadas */
type SessionRow = {
  id: string;
  start_time: string;
  end_time: string;
  capacity: number;
  class_types: { name?: string } | null;
  rooms: { name?: string } | null;
  instructors: { full_name?: string } | null;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const date = (req.query.date as string) || dayjs().format("YYYY-MM-DD");
    const start = dayjs(date).startOf("day").toISOString();
    const end   = dayjs(date).endOf("day").toISOString();

    // 1) Sesiones del día con relaciones
    const { data, error } = await supabaseServer
      .from("sessions")
      .select(`
        id, start_time, end_time, capacity,
        class_types ( name ),
        rooms       ( name ),
        instructors ( full_name )
      `)
      .gte("start_time", start)
      .lte("start_time", end)
      .order("start_time", { ascending: true });

    if (error) throw error;

    // Forzamos el tipo de las filas para que TS conozca la forma
    const sessions: SessionRow[] = (data ?? []) as unknown as SessionRow[];

    // 2) Ocupación por sesión (CONFIRMED + CHECKED_IN)
    const ids = sessions.map(s => s.id);
    const occ: Record<string, number> = {};
    if (ids.length) {
      const { data: rows, error: e2 } = await supabaseServer
        .from("bookings")
        .select("session_id, status")
        .in("session_id", ids)
        .in("status", ["CONFIRMED", "CHECKED_IN"]);
      if (e2) throw e2;
      rows?.forEach(r => { occ[r.session_id] = (occ[r.session_id] ?? 0) + 1; });
    }

    // 3) Dar forma para el front
    const out = sessions.map(s => ({
      id: s.id,
      classType: s.class_types?.name ?? "Clase",
      room: s.rooms?.name ?? "",
      instructor: s.instructors?.full_name ?? "",
      start: s.start_time,
      end: s.end_time,
      capacity: s.capacity,
      current_occupancy: occ[s.id] ?? 0,
    }));

    res.status(200).json(out);
  } catch (error: unknown) {
    console.error(error);
    const message = error instanceof Error ? error.message : "calendar failed";
    res.status(500).json({ error: message });
  }
}
