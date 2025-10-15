import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Tables, TablesInsert } from "@/types/database";

type RoomBlockRow = Tables<"room_blocks">;

type CreateBlockBody = {
  startsAt: string;
  endsAt: string;
  reason?: string | null;
  note?: string | null;
};

const normalizeBlock = (row: RoomBlockRow) => ({
  id: row.id,
  startsAt: row.starts_at,
  endsAt: row.ends_at,
  reason: row.reason,
  note: row.note,
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query as { id: string };
  if (!id) {
    return res.status(400).json({ error: "El id es obligatorio" });
  }

  try {
    if (req.method === "POST") {
      const { startsAt, endsAt, reason, note } = req.body as CreateBlockBody;
      if (!startsAt || !endsAt) {
        return res.status(400).json({ error: "Se requieren fechas de inicio y fin" });
      }
      const start = new Date(startsAt);
      const end = new Date(endsAt);
      if (!Number.isFinite(start.valueOf()) || !Number.isFinite(end.valueOf())) {
        return res.status(400).json({ error: "Formato de fecha invalido" });
      }
      if (start >= end) {
        return res.status(400).json({ error: "La fecha de fin debe ser posterior al inicio" });
      }

      const payload: TablesInsert<"room_blocks"> = {
        room_id: id,
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        reason: reason ? reason.trim() : null,
        note: note ? note.trim() : null,
      };

      const { data, error } = await supabaseAdmin
        .from("room_blocks")
        .insert(payload)
        .select("id, room_id, starts_at, ends_at, reason, note, created_at")
        .single<RoomBlockRow>();
      if (error) throw error;

      return res.status(201).json(normalizeBlock(data));
    }

    if (req.method === "DELETE") {
      const { blockId } = req.query as { blockId?: string };
      if (!blockId) {
        return res.status(400).json({ error: "blockId es obligatorio" });
      }

      const { error } = await supabaseAdmin
        .from("room_blocks")
        .delete()
        .eq("id", blockId)
        .eq("room_id", id);
      if (error) throw error;

      return res.status(204).end();
    }

    res.setHeader("Allow", "POST,DELETE");
    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (err: unknown) {
    console.error("[API][admin/rooms/:id/blocks]", err);
    const message = err instanceof Error ? err.message : "Unexpected server error";
    return res.status(500).json({ error: message });
  }
}
