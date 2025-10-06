import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Tables, TablesInsert } from "@/types/database";

type RoomRow = Tables<"rooms">;

type CreateRoomBody = {
  name: string;
  capacity: number;
  location?: string | null;
};

const LOCATION_MISSING_CODE = "42703";

const getRowLocation = (row: any): string | null =>
  Object.prototype.hasOwnProperty.call(row, "location") ? row.location ?? null : null;

const normalizeRoom = (row: RoomRow & { location?: string | null }) => ({
  id: row.id,
  name: row.name,
  capacity: row.capacity,
  location: getRowLocation(row),
  createdAt: row.created_at,
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === "GET") {
      const { data, error } = await supabaseAdmin
        .from("rooms")
        .select("*")
        .order("name", { ascending: true })
        .returns<RoomRow[]>();
      if (error) throw error;

      return res.status(200).json((data ?? []).map(normalizeRoom));
    }

    if (req.method === "POST") {
      const { name, capacity, location } = req.body as CreateRoomBody;
      if (!name || typeof name !== "string") {
        return res.status(400).json({ error: "El nombre es obligatorio" });
      }
      const parsedCapacity = Number(capacity);
      if (!Number.isFinite(parsedCapacity) || parsedCapacity <= 0) {
        return res.status(400).json({ error: "La capacidad debe ser un numero mayor a 0" });
      }

      const trimmedName = name.trim();
      const trimmedLocation = location ? location.trim() : null;

      const insertRoom = async (includeLocation: boolean) => {
        const payload: TablesInsert<"rooms"> = {
          name: trimmedName,
          capacity: parsedCapacity,
        };
        if (includeLocation) {
          payload.location = trimmedLocation;
        }
        return supabaseAdmin.from("rooms").insert(payload).select("*").single<RoomRow>();
      };

      let { data, error } = await insertRoom(true);
      if (error && error.code === LOCATION_MISSING_CODE) {
        ({ data, error } = await insertRoom(false));
      }
      if (error) throw error;
      if (!data) throw new Error("No se pudo crear la sala");

      return res.status(201).json(normalizeRoom(data));
    }

    res.setHeader("Allow", "GET,POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (err: any) {
    console.error("[API][admin/rooms]", err);
    return res.status(500).json({ error: err?.message ?? "Unexpected server error" });
  }
}
