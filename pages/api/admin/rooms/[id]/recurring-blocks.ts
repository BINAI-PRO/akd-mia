import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Tables, TablesInsert } from "@/types/database";

type RoomRecurringRow = Tables<"room_recurring_blocks">;

type UpsertRecurringBody = {
  ranges: {
    weekday: number;
    startTime: string;
    endTime: string;
    reason?: string | null;
    note?: string | null;
  }[];
};

const normalizeRecurring = (row: RoomRecurringRow) => ({
  id: row.id,
  weekday: row.weekday,
  startTime: row.start_time,
  endTime: row.end_time,
  reason: row.reason,
  note: row.note,
});

const isValidTime = (value: string) => /^\d{2}:\d{2}$/.test(value);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query as { id: string };
  if (!id) {
    return res.status(400).json({ error: "El id es obligatorio" });
  }

  if (req.method !== "PUT") {
    res.setHeader("Allow", "PUT");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { ranges } = req.body as UpsertRecurringBody;
    if (!Array.isArray(ranges)) {
      return res.status(400).json({ error: "Se requiere ranges" });
    }

    const sanitized = ranges
      .map((item) => ({
        weekday: Number(item.weekday),
        startTime: typeof item.startTime === "string" ? item.startTime : "",
        endTime: typeof item.endTime === "string" ? item.endTime : "",
        reason: item.reason ? item.reason.trim() : null,
        note: item.note ? item.note.trim() : null,
      }))
      .filter((item) => {
        if (!Number.isInteger(item.weekday) || item.weekday < 0 || item.weekday > 6) return false;
        if (!isValidTime(item.startTime) || !isValidTime(item.endTime)) return false;
        return item.startTime < item.endTime;
      });

    const { error: deleteError } = await supabaseAdmin
      .from("room_recurring_blocks")
      .delete()
      .eq("room_id", id);
    if (deleteError) throw deleteError;

    if (sanitized.length > 0) {
      const rows: TablesInsert<"room_recurring_blocks">[] = sanitized.map((item) => ({
        room_id: id,
        weekday: item.weekday,
        start_time: item.startTime,
        end_time: item.endTime,
        reason: item.reason,
        note: item.note,
      }));
      const { error: insertError } = await supabaseAdmin.from("room_recurring_blocks").insert(rows);
      if (insertError) throw insertError;
    }

    const { data, error } = await supabaseAdmin
      .from("room_recurring_blocks")
      .select("id, room_id, weekday, start_time, end_time, reason, note, created_at")
      .eq("room_id", id)
      .order("weekday", { ascending: true })
      .order("start_time", { ascending: true })
      .returns<RoomRecurringRow[]>();
    if (error) throw error;

    return res.status(200).json((data ?? []).map(normalizeRecurring));
  } catch (err: any) {
    console.error("[API][admin/rooms/:id/recurring-blocks]", err);
    return res.status(500).json({ error: err?.message ?? "Unexpected server error" });
  }
}
