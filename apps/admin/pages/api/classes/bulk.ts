import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Tables } from "@/types/database";

type SessionRow = Tables<'sessions'> & {
  instructors: Pick<Tables<'instructors'>, 'id' | 'full_name'> | null;
  rooms: Pick<Tables<'rooms'>, 'id' | 'name' | 'capacity'> | null;
};

type SuccessResponse = {
  message: string;
  sessions?: SessionRow[];
  removedIds?: string[];
};

type ErrorResponse = { error: string };

type BulkBody = {
  action?: 'update' | 'reschedule';
  sessionIds?: string[];
  instructorId?: string | null;
  roomId?: string | null;
};

const SESSION_SELECT =
  "id, course_id, start_time, end_time, capacity, current_occupancy, instructors(id, full_name), rooms(id, name, capacity)";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SuccessResponse | ErrorResponse>
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Metodo no permitido' });
  }

  try {
    const { action, sessionIds, instructorId, roomId } = req.body as BulkBody;
    if (!action || !Array.isArray(sessionIds) || sessionIds.length === 0) {
      return res.status(400).json({ error: 'Debes seleccionar sesiones para aplicar la accion' });
    }

    const { data: sessions, error: lookupError } = await supabaseAdmin
      .from('sessions')
      .select('id, current_occupancy, room_id')
      .in('id', sessionIds);

    if (lookupError) {
      console.error('/api/classes/bulk lookup', lookupError);
      return res.status(500).json({ error: 'No se pudieron validar las sesiones seleccionadas' });
    }
    if (!sessions || sessions.length !== sessionIds.length) {
      return res.status(404).json({ error: 'No se encontraron todas las sesiones seleccionadas' });
    }

    if (action === 'reschedule') {
      const invalid = sessions.filter((row) => (row.current_occupancy ?? 0) > 0);
      if (invalid.length > 0) {
        return res.status(400).json({ error: 'No puedes reprogramar sesiones con reservaciones activas' });
      }

      const { error: deleteError } = await supabaseAdmin
        .from('sessions')
        .delete()
        .in('id', sessionIds);

      if (deleteError) {
        console.error('/api/classes/bulk delete', deleteError);
        return res.status(500).json({ error: 'No se pudieron reprogramar las sesiones seleccionadas' });
      }

      return res.status(200).json({
        message: 'Sesiones enviadas a reprogramacion',
        removedIds: sessionIds,
      });
    }

    if (action === 'update') {
      const hasBookings = sessions.some((row) => (row.current_occupancy ?? 0) > 0);
      if (!instructorId && !roomId) {
        return res.status(400).json({ error: 'Selecciona un instructor o un salon para actualizar' });
      }
      if (hasBookings && roomId && sessions.some((row) => row.room_id !== roomId)) {
        return res.status(400).json({ error: 'No puedes cambiar el salon cuando hay reservaciones activas' });
      }

      const payload: Record<string, unknown> = {};
      if (typeof instructorId !== 'undefined') {
        payload.instructor_id = instructorId && instructorId.length > 0 ? instructorId : null;
      }
      if (typeof roomId !== 'undefined') {
        payload.room_id = roomId && roomId.length > 0 ? roomId : null;
      }

      const { data: updatedSessions, error: updateError } = await supabaseAdmin
        .from('sessions')
        .update(payload)
        .in('id', sessionIds)
        .select(SESSION_SELECT)
        .returns<SessionRow[]>();

      if (updateError || !updatedSessions) {
        console.error('/api/classes/bulk update', updateError);
        return res.status(500).json({ error: 'No se pudieron actualizar las sesiones' });
      }

      return res.status(200).json({ message: 'Sesiones actualizadas', sessions: updatedSessions });
    }

    return res.status(400).json({ error: 'Accion no valida' });
  } catch (error) {
    console.error('/api/classes/bulk', error);
    const message = error instanceof Error ? error.message : 'Error inesperado';
    return res.status(500).json({ error: message });
  }
}




