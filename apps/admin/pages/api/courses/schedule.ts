import type { NextApiRequest, NextApiResponse } from "next";
import dayjs from "dayjs";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Tables, TablesInsert } from "@/types/database";

type ScheduleSessionInput = {
  date?: string;
  startTime?: string;
  duration?: number;
  instructorId?: string | null;
};

type ScheduleRequestBody = {
  courseId?: string;
  sessions?: ScheduleSessionInput[];
};

type CourseQueryRow = Pick<
  Tables<"courses">,
  "id" | "class_type_id" | "lead_instructor_id" | "default_room_id" | "session_duration_minutes" | "session_count"
> & {
  rooms: Pick<Tables<"rooms">, "id" | "name" | "capacity"> | null;
};

type InsertedSessionRow = {
  id: string;
  start_time: string;
  end_time: string;
  instructor_id: string;
};

type SuccessResponse = {
  message: string;
  created: number;
  scheduledTotal: number;
  pendingRemaining: number;
  sessions: InsertedSessionRow[];
};

type ErrorResponse = { error: string };

type SessionInsertPayload = TablesInsert<"sessions">;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SuccessResponse | ErrorResponse>
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Metodo no permitido" });
  }

  const { courseId, sessions } = req.body as ScheduleRequestBody;

  if (!courseId) {
    return res.status(400).json({ error: "Debes indicar un curso" });
  }

  if (!Array.isArray(sessions) || sessions.length === 0) {
    return res.status(400).json({ error: "Debes indicar al menos una sesion a programar" });
  }

  const { data: course, error: courseError } = await supabaseAdmin
    .from("courses")
    .select(
      "id, class_type_id, lead_instructor_id, default_room_id, session_duration_minutes, session_count, rooms:default_room_id (id, name, capacity)"
    )
    .eq("id", courseId)
    .single<CourseQueryRow>();

  if (courseError || !course) {
    console.error("/api/courses/schedule course lookup", courseError);
    return res.status(400).json({ error: "El curso seleccionado no existe" });
  }

  if (!course.class_type_id) {
    return res.status(400).json({ error: "El curso no tiene una clase asignada" });
  }

  if (!course.default_room_id || !course.rooms) {
    return res.status(400).json({ error: "El curso requiere una sala predeterminada para programar sesiones" });
  }

  const roomCapacity = course.rooms.capacity ?? 0;
  if (!Number.isFinite(roomCapacity) || roomCapacity <= 0) {
    return res.status(400).json({ error: "La sala predeterminada no tiene una capacidad valida" });
  }

  const { count: scheduledCount, error: countError } = await supabaseAdmin
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("course_id", courseId);

  if (countError) {
    console.error("/api/courses/schedule count", countError);
    return res.status(500).json({ error: "No se pudo verificar las sesiones existentes" });
  }

  const existing = scheduledCount ?? 0;
  const sessionQuota = Number(course.session_count ?? 0);
  const pending = Math.max(sessionQuota - existing, 0);

  if (pending <= 0) {
    return res.status(400).json({ error: "Este curso ya no tiene sesiones pendientes" });
  }

  if (sessions.length > pending) {
    return res
      .status(400)
      .json({ error: `Solo puedes programar ${pending} sesiones adicionales para este curso` });
  }

  const inserts: SessionInsertPayload[] = [];

  for (let index = 0; index < sessions.length; index += 1) {
    const session = sessions[index];
    const durationSource = Number(session.duration ?? course.session_duration_minutes ?? 0);
    const durationMinutes = Number.isFinite(durationSource) ? durationSource : 0;

    if (!session.date || !session.startTime) {
      return res.status(400).json({ error: `Fecha y hora son obligatorias (sesion ${index + 1})` });
    }

    if (durationMinutes <= 0) {
      return res.status(400).json({ error: `La duracion debe ser mayor a cero (sesion ${index + 1})` });
    }

    const start = dayjs(`${session.date}T${session.startTime}`);
    if (!start.isValid()) {
      return res.status(400).json({ error: `Fecha u hora invalidas (sesion ${index + 1})` });
    }

    const end = start.add(durationMinutes, "minute");
    const instructorId = session.instructorId ?? course.lead_instructor_id;

    if (!instructorId) {
      return res.status(400).json({ error: `Debes asignar un instructor para la sesion ${index + 1}` });
    }

    const payload: SessionInsertPayload = {
      class_type_id: course.class_type_id,
      instructor_id: instructorId,
      room_id: course.default_room_id,
      course_id: course.id,
      capacity: roomCapacity,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
    };

    inserts.push(payload);
  }

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("sessions")
    .insert(inserts)
    .select("id, start_time, end_time, instructor_id")
    .returns<InsertedSessionRow[]>();

  if (insertError || !inserted) {
    console.error("/api/courses/schedule insert", insertError);
    return res.status(500).json({ error: "No se pudieron crear las sesiones" });
  }

  const scheduledTotal = existing + inserted.length;
  const pendingRemaining = Math.max(sessionQuota - scheduledTotal, 0);

  return res.status(200).json({
    message: `Se programaron ${inserted.length} sesiones.`,
    created: inserted.length,
    scheduledTotal,
    pendingRemaining,
    sessions: inserted,
  });
}



