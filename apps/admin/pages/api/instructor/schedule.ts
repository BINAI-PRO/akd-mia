import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminFeature } from "@/lib/api/require-admin-feature";
import { madridDayjs, madridEndOfDay, madridStartOfDay } from "@/lib/timezone";
import { fetchInstructorByStaffId } from "@/lib/instructors";

type ScheduleSession = {
  id: string;
  startTime: string;
  endTime: string;
  classType: string;
  room: string;
  instructor: { id: string | null; name: string };
  attendees: Array<{ id: string | null; name: string }>;
  capacity: number;
  statusLabel: string;
};

type SuccessResponse = {
  date: string;
  sessions: ScheduleSession[];
};

type ErrorResponse = { error: string };

type SessionRow = {
  id: string;
  start_time: string;
  end_time: string;
  capacity: number;
  class_types: { name: string | null } | null;
  rooms: { name: string | null } | null;
  instructors: { id: string | null; full_name: string | null } | null;
  instructor_id: string;
  bookings: Array<{
    id: string;
    status: string | null;
    clients: { id: string | null; full_name: string | null } | null;
  }> | null;
};

function mapSession(row: SessionRow): ScheduleSession {
  const attendees =
    row.bookings
      ?.filter((booking) => booking.status?.toUpperCase() !== "CANCELLED")
      .map((booking) => ({
        id: booking.clients?.id ?? booking.id,
        name: booking.clients?.full_name ?? "Cliente sin nombre",
      })) ?? [];

  const occupancy = attendees.length;
  const pct =
    row.capacity > 0 ? Math.round((occupancy / row.capacity) * 100).toString().concat("%") : "0%";

  return {
    id: row.id,
    startTime: row.start_time,
    endTime: row.end_time,
    classType: row.class_types?.name ?? "Clase",
    room: row.rooms?.name ?? "-",
    instructor: {
      id: row.instructors?.id ?? row.instructor_id ?? null,
      name: row.instructors?.full_name ?? "Instructor",
    },
    attendees,
    capacity: row.capacity ?? 0,
    statusLabel: `${occupancy}/${row.capacity ?? 0} (${pct})`,
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SuccessResponse | ErrorResponse>
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Metodo no permitido" });
  }

  const access = await requireAdminFeature(req, res, "instructorApp", "READ");
  if (!access) return;

  const view = req.query.view === "all" ? "all" : "personal";
  const dateParam =
    typeof req.query.date === "string" && req.query.date ? req.query.date : madridDayjs().format("YYYY-MM-DD");
  const dayStart = madridStartOfDay(dateParam).toISOString();
  const dayEnd = madridEndOfDay(dateParam).toISOString();

  let instructorId: string | null = null;
  try {
    if (view === "personal") {
      const instructor = await fetchInstructorByStaffId(access.staffId);
      if (!instructor) {
        return res.status(404).json({ error: "No se encontrA3 el perfil de instructor asociado a tu cuenta" });
      }
      instructorId = instructor.id;
    } else if (typeof req.query.instructorId === "string" && req.query.instructorId.length > 0) {
      instructorId = req.query.instructorId;
    }
  } catch (error) {
    console.error("/api/instructor/schedule fetch instructor", error);
    return res.status(500).json({ error: "No se pudo consultar el instructor" });
  }

  try {
    let query = supabaseAdmin
      .from("sessions")
      .select(
        `
        id,
        instructor_id,
        start_time,
        end_time,
        capacity,
        class_types ( name ),
        rooms ( name ),
        instructors ( id, full_name ),
        bookings (
          id,
          status,
          clients ( id, full_name )
        )
      `
      )
      .gte("start_time", dayStart)
      .lte("start_time", dayEnd)
      .order("start_time", { ascending: true });

    if (instructorId) {
      query = query.eq("instructor_id", instructorId);
    }

    const { data, error } = await query.returns<SessionRow[]>();
    if (error) {
      throw error;
    }

    return res.status(200).json({
      date: dateParam,
      sessions: (data ?? []).map(mapSession),
    });
  } catch (error) {
    console.error("/api/instructor/schedule", error);
    return res.status(500).json({ error: "No se pudo consultar el calendario" });
  }
}
