import type { NextApiRequest, NextApiResponse } from "next";
import { madridDayjs } from "@/lib/timezone";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Tables, TablesInsert } from "@/types/database";

type SessionPayload = Tables<"sessions"> & {
  class_types: Pick<Tables<"class_types">, "id" | "name" | "description"> | null;
  instructors: Pick<Tables<"instructors">, "id" | "full_name" | "bio"> | null;
  rooms: Pick<Tables<"rooms">, "id" | "name" | "capacity"> | null;
  courses: Pick<Tables<"courses">, "id" | "title" | "session_duration_minutes"> | null;
};

type SuccessResponse = {
  message: string;
  session: SessionPayload;
};

type ErrorResponse = { error: string };

type PostBody = {
  classTypeId?: string;
  instructorId?: string;
  roomId?: string;
  date?: string;
  startTime?: string;
  durationMinutes?: number;
  capacity?: number;
};

const SESSION_SELECT =
  "id, course_id, start_time, end_time, capacity, current_occupancy, class_type_id, class_types(id, name, description), instructors(id, full_name, bio), rooms(id, name, capacity), courses(id, title, session_duration_minutes)";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SuccessResponse | ErrorResponse>
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Metodo no permitido" });
  }

  try {
    const {
      classTypeId,
      instructorId,
      roomId,
      date,
      startTime,
      durationMinutes,
      capacity,
    } = req.body as PostBody;

    if (!classTypeId) {
      return res.status(400).json({ error: "Debes indicar un tipo de clase" });
    }
    if (!instructorId) {
      return res.status(400).json({ error: "Debes seleccionar un instructor" });
    }
    if (!roomId) {
      return res.status(400).json({ error: "Debes seleccionar un salon" });
    }
    if (!date || !startTime) {
      return res.status(400).json({ error: "Fecha y hora son obligatorias" });
    }

    const duration =
      typeof durationMinutes === "number" && durationMinutes > 0 ? durationMinutes : 60;
    const sessionCapacity =
      typeof capacity === "number" && capacity > 0 ? Math.floor(capacity) : 1;

    const start = madridDayjs(`${date}T${startTime}`);
    if (!start.isValid()) {
      return res.status(400).json({ error: "Fecha u hora invalidas" });
    }
    const end = start.add(duration, "minute");

    const payload: TablesInsert<"sessions"> = {
      class_type_id: classTypeId,
      instructor_id: instructorId,
      room_id: roomId,
      course_id: null,
      capacity: sessionCapacity,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from("sessions")
      .insert(payload)
      .select(SESSION_SELECT)
      .returns<SessionPayload>()
      .single();

    if (error || !data) {
      console.error("/api/classes/single insert", error);
      return res
        .status(500)
        .json({ error: "No se pudo crear la sesion 1:1, intenta nuevamente." });
    }

    return res.status(200).json({
      message: "Sesion 1:1 creada",
      session: data,
    });
  } catch (error) {
    console.error("/api/classes/single", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return res.status(500).json({ error: message });
  }
}