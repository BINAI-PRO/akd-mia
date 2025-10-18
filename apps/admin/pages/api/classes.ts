import type { NextApiRequest, NextApiResponse } from "next";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Tables, TablesInsert, TablesUpdate } from "@/types/database";

dayjs.extend(utc);

type SessionPayload = Tables<'sessions'> & {
  class_types: Pick<Tables<'class_types'>, 'id' | 'name' | 'description'> | null;
  instructors: Pick<Tables<'instructors'>, 'id' | 'full_name' | 'bio'> | null;
  rooms: Pick<Tables<'rooms'>, 'id' | 'name' | 'capacity'> | null;
  courses: Pick<Tables<'courses'>, 'id' | 'title' | 'session_duration_minutes'> | null;
};

type InstructorSummary = Pick<Tables<'instructors'>, 'id' | 'full_name' | 'bio'>;
type RoomSummary = { id: string; name: string; capacity: number | null };

type SuccessResponse = {
  message: string;
  session: SessionPayload;
  instructor?: InstructorSummary;
  room?: RoomSummary;
};

type ErrorResponse = { error: string };

type PostBody = {
  courseId?: string | null;
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

type PatchBody = {
  sessionId?: string;
  instructorId?: string | null;
  roomId?: string | null;
  date?: string | null;
  startTime?: string | null;
};

const SESSION_SELECT =
  "id, course_id, start_time, end_time, capacity, current_occupancy, class_type_id, class_types(id, name, description), instructors(id, full_name, bio), rooms(id, name, capacity), courses(id, title, session_duration_minutes)";
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SuccessResponse | ErrorResponse>
) {
  if (req.method === 'PATCH') {
    try {
      const { sessionId, instructorId, roomId, date, startTime } = req.body as PatchBody;
      if (!sessionId) {
        return res.status(400).json({ error: 'Debes indicar la sesión a actualizar' });
      }

      const { data: current, error: fetchError } = await supabaseAdmin
        .from('sessions')
        .select('id, course_id, start_time, end_time, room_id, instructor_id, current_occupancy, courses(session_duration_minutes)')
        .eq('id', sessionId)
        .single();

      if (fetchError || !current) {
        console.error('/api/classes PATCH lookup', fetchError);
        return res.status(404).json({ error: 'La sesión seleccionada no existe' });
      }

      const updates: TablesUpdate<'sessions'> = {};
      const occupancy = Number(current.current_occupancy ?? 0);
      const hasBookings = occupancy > 0;

      const originalStart = dayjs.utc(current.start_time);
      const originalEnd = dayjs.utc(current.end_time);
      let durationMinutes = originalEnd.diff(originalStart, 'minute');
      if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
        durationMinutes = Number(current.courses?.session_duration_minutes ?? 60);
      }
      if (durationMinutes <= 0) durationMinutes = 60;

      if (date || startTime) {
        if (hasBookings) {
          return res.status(400).json({ error: 'No puedes cambiar fecha u hora porque hay reservaciones activas' });
        }
        const newDate = date ?? originalStart.format('YYYY-MM-DD');
        const newTime = startTime ?? originalStart.format('HH:mm');
        const newStart = dayjs.utc(`${newDate}T${newTime}`);
        if (!newStart.isValid()) {
          return res.status(400).json({ error: 'Fecha u hora no validas' });
        }
        const newEnd = newStart.add(durationMinutes, 'minute');
        updates.start_time = newStart.toISOString();
        updates.end_time = newEnd.toISOString();
      }

      if (typeof instructorId !== 'undefined') {
        updates.instructor_id = instructorId && instructorId.length > 0 ? instructorId : null;
      }

      if (typeof roomId !== 'undefined') {
        if (hasBookings && roomId !== current.room_id) {
          return res.status(400).json({ error: 'Con reservaciones activas solo puedes cambiar instructor' });
        }
        updates.room_id = roomId && roomId.length > 0 ? roomId : null;
      }

      if (Object.keys(updates).length === 0) {
        const { data: sessionSnapshot, error: snapshotError } = await supabaseAdmin
          .from('sessions')
          .select(SESSION_SELECT)
          .eq('id', sessionId)
          .single<SessionPayload>();
        if (snapshotError || !sessionSnapshot) {
          console.error('/api/classes PATCH fetch', snapshotError);
          return res.status(500).json({ error: 'No se pudo obtener la Sesión actualizada' });
        }
        return res.status(200).json({ message: 'Sesión actualizada', session: sessionSnapshot });
      }

      const { data: updatedSession, error: updateError } = await supabaseAdmin
        .from('sessions')
        .update(updates)
        .eq('id', sessionId)
        .select(SESSION_SELECT)
        .single<SessionPayload>();

      if (updateError || !updatedSession) {
        console.error('/api/classes PATCH update', updateError);
        return res.status(500).json({ error: 'No se pudo actualizar la sesión' });
      }

      return res.status(200).json({ message: 'Sesión actualizada', session: updatedSession });
    } catch (error) {
      console.error('/api/classes PATCH', error);
      const message = error instanceof Error ? error.message : 'Error inesperado';
      return res.status(500).json({ error: message });
    }
  }

  if (req.method === 'POST') {
    try {
      const {
        courseId,
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
      } = req.body as PostBody;

      if (!courseId) {
        return res.status(400).json({ error: 'Debes indicar un curso' });
      }

      const { data: course, error: courseError } = await supabaseAdmin
        .from('courses')
        .select('id, session_duration_minutes, class_type_id')
        .eq('id', courseId)
        .single();
      if (courseError || !course) {
        console.error('/api/classes POST course lookup', courseError);
        return res.status(400).json({ error: 'El curso seleccionado no existe' });
      }

      if (!course.class_type_id) {
        return res.status(400).json({ error: 'El curso seleccionado no tiene una clase configurada' });
      }

      if (!date || !startTime) {
        return res.status(400).json({ error: 'Fecha y hora son obligatorias' });
      }

      if ((!instructorId || instructorId.length === 0) && !instructorName) {
        return res.status(400).json({ error: 'Debes indicar un instructor' });
      }
      if ((!roomId || roomId.length === 0) && !roomName) {
        return res.status(400).json({ error: 'Debes indicar un salon' });
      }
      if (!capacity || capacity <= 0) {
        return res.status(400).json({ error: 'La capacidad debe ser mayor a cero' });
      }

      const start = dayjs.utc(`${date}T${startTime}`);
      if (!start.isValid()) {
        return res.status(400).json({ error: 'Fecha u hora invalidas' });
      }
      const rawDuration = durationMinutes && durationMinutes > 0 ? durationMinutes : course.session_duration_minutes;
      const effectiveDuration = rawDuration && rawDuration > 0 ? rawDuration : 60;
      const end = start.add(effectiveDuration, 'minute');

      let instructorRecord: InstructorSummary | null = null;
      if (instructorId) {
        instructorRecord = { id: instructorId, full_name: '', bio: null };
      } else if (instructorName) {
        const { data, error } = await supabaseAdmin
          .from('instructors')
          .insert({ full_name: instructorName, bio: instructorBio })
          .select('id, full_name, bio')
          .single();
        if (error || !data) throw error ?? new Error('No se pudo crear el instructor');
        instructorRecord = data;
      }

      let roomRecord: RoomSummary | null = null;
      if (roomId) {
        roomRecord = { id: roomId, name: '', capacity: null };
      } else if (roomName) {
        const parsed = Number(roomCapacity);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          return res.status(400).json({ error: 'Debes indicar una capacidad valida para el salon' });
        }
        const insertPayload: TablesInsert<'rooms'> = { name: roomName, capacity: parsed };
        const { data, error } = await supabaseAdmin
          .from('rooms')
          .insert(insertPayload)
          .select('id, name, capacity')
          .single();
        if (error || !data) throw error ?? new Error('No se pudo crear el salon');
        roomRecord = data;
      }

      if (!instructorRecord || !roomRecord) {
        throw new Error('Faltan referencias para crear la sesion');
      }

      const sessionInsert: TablesInsert<'sessions'> = {
        class_type_id: course.class_type_id,
        instructor_id: instructorRecord.id,
        room_id: roomRecord.id,
        course_id: course.id,
        capacity,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
      };

      const { data: session, error: sessionError } = await supabaseAdmin
        .from('sessions')
        .insert(sessionInsert)
        .select(SESSION_SELECT)
        .returns<SessionPayload>()
        .single();

      if (sessionError || !session) {
        throw sessionError ?? new Error('No se pudo crear la sesion');
      }

      return res.status(200).json({
        message: 'Sesión creada',
        session,
        instructor: instructorRecord,
        room: roomRecord,
      });
    } catch (error) {
      console.error('/api/classes POST', error);
      const message = error instanceof Error ? error.message : 'Error inesperado';
      return res.status(500).json({ error: message });
    }
  }

  res.setHeader('Allow', 'POST, PATCH');
  return res.status(405).json({ error: 'Metodo no permitido' });
}







