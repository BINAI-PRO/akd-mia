import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Tables, TablesInsert, TablesUpdate } from "@/types/database";

type RoomRow = Tables<"rooms">;
type RoomWithMaybeLocation = RoomRow & { location?: string | null };
type RoomAppRow = Tables<"room_apparatus"> & {
  apparatus: Pick<Tables<"apparatus">, "id" | "name"> | null;
};
type RoomBlockRow = Tables<"room_blocks">;
type RoomRecurringRow = Tables<"room_recurring_blocks">;

type UpdateBody = {
  name: string;
  capacity: number;
  location?: string | null;
  apparatus: { apparatusId: string; quantity: number }[];
};

const LOCATION_MISSING_CODE = "42703";
const RELATION_MISSING_CODES = new Set(["PGRST205", "42P01"]);

const isRelationMissing = (error: unknown) => {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? (error as { code?: string }).code : undefined;
  const message = "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  return (code ? RELATION_MISSING_CODES.has(code) : false) || /does not exist/i.test(message);
};

const getRowLocation = (row: RoomWithMaybeLocation): string | null => row.location ?? null;

const normalizeBlock = (row: RoomBlockRow) => ({
  id: row.id,
  startsAt: row.starts_at,
  endsAt: row.ends_at,
  reason: row.reason,
  note: row.note,
});

const normalizeRecurring = (row: RoomRecurringRow) => ({
  id: row.id,
  weekday: row.weekday,
  startTime: row.start_time,
  endTime: row.end_time,
  reason: row.reason,
  note: row.note,
});

const normalizeApparatus = (row: RoomAppRow) => ({
  id: row.id,
  apparatusId: row.apparatus_id,
  apparatusName: row.apparatus?.name ?? null,
  quantity: row.quantity,
});

const fetchRoomDetail = async (
  roomId: string,
  options?: { supportsApparatus?: boolean }
) => {
  const { data: room, error: roomError } = await supabaseAdmin
    .from("rooms")
    .select("*")
    .eq("id", roomId)
    .single<RoomRow>();
  if (roomError) throw roomError;
  if (!room) throw Object.assign(new Error("Sala no encontrada"), { statusCode: 404 });

  let supportsApparatus = options?.supportsApparatus ?? true;
  let apparatusRows: RoomAppRow[] = [];
  if (supportsApparatus) {
    const { data, error } = await supabaseAdmin
      .from("room_apparatus")
      .select("id, room_id, apparatus_id, quantity, created_at, apparatus:apparatus_id (id, name)")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true })
      .returns<RoomAppRow[]>();
    if (error) {
      if (isRelationMissing(error)) {
        supportsApparatus = false;
      } else {
        throw error;
      }
    } else {
      apparatusRows = data ?? [];
    }
  }

  const { data: blockRows, error: blocksError } = await supabaseAdmin
    .from("room_blocks")
    .select("id, room_id, starts_at, ends_at, reason, note, created_at")
    .eq("room_id", roomId)
    .order("starts_at", { ascending: false })
    .returns<RoomBlockRow[]>();
  if (blocksError) throw blocksError;

  const { data: recurringRows, error: recurringError } = await supabaseAdmin
    .from("room_recurring_blocks")
    .select("id, room_id, weekday, start_time, end_time, reason, note, created_at")
    .eq("room_id", roomId)
    .order("weekday", { ascending: true })
    .order("start_time", { ascending: true })
    .returns<RoomRecurringRow[]>();
  if (recurringError) throw recurringError;

  return {
    id: room.id,
    name: room.name,
    capacity: room.capacity,
    location: getRowLocation(room),
    createdAt: room.created_at,
    supportsApparatus,
    apparatus: supportsApparatus ? (apparatusRows ?? []).map(normalizeApparatus) : [],
    blocks: (blockRows ?? []).map(normalizeBlock),
    recurringBlocks: (recurringRows ?? []).map(normalizeRecurring),
  };
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query as { id: string };

  if (!id) {
    return res.status(400).json({ error: "El id es obligatorio" });
  }

  try {
    if (req.method === "GET") {
      try {
        const detail = await fetchRoomDetail(id);
        return res.status(200).json(detail);
      } catch (error: unknown) {
        const statusCode = typeof error === "object" && error !== null && "statusCode" in error
          ? (error as { statusCode?: number }).statusCode
          : undefined;
        if (statusCode === 404) {
          return res.status(404).json({ error: "Sala no encontrada" });
        }
        throw error;
      }
    }

    if (req.method === "PUT") {
      const { name, capacity, location, apparatus } = req.body as UpdateBody;
      if (!name || typeof name !== "string") {
        return res.status(400).json({ error: "El nombre es obligatorio" });
      }
      const parsedCapacity = Number(capacity);
      if (!Number.isFinite(parsedCapacity) || parsedCapacity <= 0) {
        return res.status(400).json({ error: "La capacidad debe ser un numero mayor a 0" });
      }

      const trimmedName = name.trim();
      const trimmedLocation = location ? location.trim() : null;

      const updateRoom = async (includeLocation: boolean) => {
        const payload: TablesUpdate<"rooms"> = {
          name: trimmedName,
          capacity: parsedCapacity,
        };
        if (includeLocation) {
          payload.location = trimmedLocation;
        }
        return supabaseAdmin.from("rooms").update(payload).eq("id", id);
      };

      let { error: updateError } = await updateRoom(true);
      if (updateError && updateError.code === LOCATION_MISSING_CODE) {
        ({ error: updateError } = await updateRoom(false));
      }
      if (updateError) throw updateError;

      const apparatusList = Array.isArray(apparatus) ? apparatus : [];
      const filtered = apparatusList
        .map((item) => ({ apparatusId: item.apparatusId, quantity: Number(item.quantity) }))
        .filter((item) => item.apparatusId && Number.isFinite(item.quantity) && item.quantity > 0);

      let supportsApparatus = true;
      if (supportsApparatus) {
        const { error: deleteError } = await supabaseAdmin
          .from("room_apparatus")
          .delete()
          .eq("room_id", id);
        if (deleteError) {
          if (isRelationMissing(deleteError)) {
            supportsApparatus = false;
          } else {
            throw deleteError;
          }
        }

        if (supportsApparatus && filtered.length > 0) {
          const rows: TablesInsert<"room_apparatus">[] = filtered.map((item) => ({
            room_id: id,
            apparatus_id: item.apparatusId,
            quantity: item.quantity,
          }));
          const { error: insertError } = await supabaseAdmin.from("room_apparatus").insert(rows);
          if (insertError) {
            if (isRelationMissing(insertError)) {
              supportsApparatus = false;
            } else {
              throw insertError;
            }
          }
        }
      }

      const detail = await fetchRoomDetail(id, { supportsApparatus });
      return res.status(200).json(detail);
    }

    res.setHeader("Allow", "GET,PUT");
    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (err: unknown) {
    console.error("[API][admin/rooms/:id]", err);
    const message = err instanceof Error ? err.message : "Unexpected server error";
    return res.status(500).json({ error: message });
  }
}


