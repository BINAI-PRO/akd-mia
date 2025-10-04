import type { NextApiRequest, NextApiResponse } from "next";
import dayjs from "dayjs";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Tables, TablesInsert } from "@/types/database";

type SessionPayload = Tables<"sessions"> & {
  class_types: Pick<Tables<"class_types">, "id" | "name" | "description"> | null;
  instructors: Pick<Tables<"instructors">, "id" | "full_name" | "bio"> | null;
  rooms: Pick<Tables<"rooms">, "id" | "name" | "capacity"> | null;
};

type ClassTypeSummary = Pick<Tables<"class_types">, "id" | "name" | "description">;
type InstructorSummary = Pick<Tables<"instructors">, "id" | "full_name" | "bio">;
type RoomSummary = { id: string; name: string; capacity: number | null };

type SuccessResponse = {
  message: string;
  session: SessionPayload;
  classType?: ClassTypeSummary;
  instructor?: InstructorSummary;
  room?: RoomSummary;
};

type ErrorResponse = { error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<SuccessResponse | ErrorResponse>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    const {
      classTypeId,
      classTypeName,
      classDescription,
      instructorId,
      instructorName,
      instructorBio,
      roomId,
      roomName,
      roomCapacity,
      capacity,
      date,
      startTime,
      durationMinutes,
    } = req.body as {
      classTypeId?: string | null;
      classTypeName?: string | null;
      classDescription?: string | null;
      instructorId?: string | null;
      instructorName?: string | null;
      instructorBio?: string | null;
      roomId?: string | null;
      roomName?: string | null;
      roomCapacity?: string | number | null;
      capacity?: number;
      date?: string;
      startTime?: string;
      durationMinutes?: number;
    };

    if (!date || !startTime) {
      return res.status(400).json({ error: "Fecha y hora son obligatorias" });
    }

    if ((!classTypeId || classTypeId.length === 0) && !classTypeName) {
      return res.status(400).json({ error: "Debes indicar un tipo de clase" });
    }
    if ((!instructorId || instructorId.length === 0) && !instructorName) {
      return res.status(400).json({ error: "Debes indicar un instructor" });
    }
    if ((!roomId || roomId.length === 0) && !roomName) {
      return res.status(400).json({ error: "Debes indicar un salón" });
    }
    if (!capacity || capacity <= 0) {
      return res.status(400).json({ error: "La capacidad debe ser mayor a cero" });
    }

    const start = dayjs(`${date}T${startTime}`);
    if (!start.isValid()) {
      return res.status(400).json({ error: "Fecha u hora inválidas" });
    }
    const duration = durationMinutes && durationMinutes > 0 ? durationMinutes : 60;
    const end = start.add(duration, "minute");

    let classTypeRecord: ClassTypeSummary | null = null;
    if (classTypeId) {
      classTypeRecord = { id: classTypeId, name: "", description: null };
    } else if (classTypeName) {
      const { data, error } = await supabaseAdmin
        .from("class_types")
        .insert({ name: classTypeName, description: classDescription })
        .select("id, name, description")
        .single();
      if (error || !data) throw error ?? new Error("No se pudo crear el tipo de clase");
      classTypeRecord = data;
    }

    let instructorRecord: InstructorSummary | null = null;
    if (instructorId) {
      instructorRecord = { id: instructorId, full_name: "", bio: null };
    } else if (instructorName) {
      const { data, error } = await supabaseAdmin
        .from("instructors")
        .insert({ full_name: instructorName, bio: instructorBio })
        .select("id, full_name, bio")
        .single();
      if (error || !data) throw error ?? new Error("No se pudo crear el instructor");
      instructorRecord = data;
    }

    let roomRecord: RoomSummary | null = null;
    if (roomId) {
      roomRecord = { id: roomId, name: "", capacity: null };
    } else if (roomName) {
      const parsed = Number(roomCapacity);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return res.status(400).json({ error: "Debes indicar una capacidad valida para el salon" });
      }
      const insertPayload: TablesInsert<"rooms"> = { name: roomName, capacity: parsed };
      const { data, error } = await supabaseAdmin
        .from("rooms")
        .insert(insertPayload)
        .select("id, name, capacity")
        .single();
      if (error || !data) throw error ?? new Error("No se pudo crear el salon");
      roomRecord = data;
    }


    if (!classTypeRecord || !instructorRecord || !roomRecord) {
      throw new Error("Faltan referencias para crear la sesión");
    }

    const sessionInsert: TablesInsert<"sessions"> = {
      class_type_id: classTypeRecord.id,
      instructor_id: instructorRecord.id,
      room_id: roomRecord.id,
      capacity,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
    };

    const { data: session, error: sessionError } = await supabaseAdmin
      .from("sessions")
      .insert(sessionInsert)
      .select(
        "id, start_time, end_time, capacity, current_occupancy, class_types(id, name, description), instructors(id, full_name, bio), rooms(id, name, capacity)"
      )
      .returns<SessionPayload>()
      .single();

    if (sessionError || !session) {
      throw sessionError ?? new Error("No se pudo crear la sesión");
    }

    return res.status(200).json({
      message: "Clase creada",
      session,
      classType: classTypeRecord,
      instructor: instructorRecord,
      room: roomRecord,
    });
  } catch (error) {
    console.error("/api/admin/classes", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return res.status(500).json({ error: message });
  }
}
