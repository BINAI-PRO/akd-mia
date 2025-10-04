import type { NextApiRequest, NextApiResponse } from "next";
import dayjs from "dayjs";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { CalendarSession } from "@/components/admin/calendar/types";

function startOfWeek(date: dayjs.Dayjs) {
  const day = date.day();
  const offset = (day + 6) % 7;
  return date.subtract(offset, "day").startOf("day");
}

type SessionQueryRow = {
  id: string;
  start_time: string;
  end_time: string;
  capacity: number | null;
  current_occupancy: number | null;
  class_type_id: string | null;
  instructor_id: string | null;
  room_id: string | null;
  class_types: { name?: string | null } | null;
  instructors: { full_name?: string | null } | null;
  rooms: { name?: string | null } | null;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { date, instructorId, roomId, classTypeId } = req.query;

    const anchor = typeof date === "string" ? dayjs(date) : dayjs();
    const normalized = anchor.isValid() ? anchor.startOf("day") : dayjs().startOf("day");
    const weekStart = startOfWeek(normalized);
    const weekEnd = weekStart.add(6, "day").endOf("day");

    let query = supabaseAdmin
      .from("sessions")
      .select(
        "id, start_time, end_time, capacity, current_occupancy, class_type_id, instructor_id, room_id, class_types(name), instructors(full_name), rooms(name)"
      )
      .gte("start_time", weekStart.toISOString())
      .lte("start_time", weekEnd.toISOString())
      .order("start_time", { ascending: true });

    if (typeof instructorId === "string" && instructorId.length > 0) {
      query = query.eq("instructor_id", instructorId);
    }
    if (typeof roomId === "string" && roomId.length > 0) {
      query = query.eq("room_id", roomId);
    }
    if (typeof classTypeId === "string" && classTypeId.length > 0) {
      query = query.eq("class_type_id", classTypeId);
    }

    const { data, error } = await query.returns<SessionQueryRow[]>();

    if (error) {
      throw error;
    }

    const sessions: CalendarSession[] = (data ?? []).map((session) => ({
      id: session.id,
      startISO: session.start_time,
      endISO: session.end_time,
      title: session.class_types?.name ?? "Clase",
      classTypeId: session.class_type_id,
      classTypeName: session.class_types?.name ?? null,
      instructorId: session.instructor_id,
      instructorName: session.instructors?.full_name ?? null,
      roomId: session.room_id,
      roomName: session.rooms?.name ?? null,
      capacity: session.capacity ?? 0,
      occupancy: session.current_occupancy ?? 0,
    }));

    const searchTerm = typeof req.query.search === "string" ? req.query.search.trim().toLowerCase() : "";
    const filtered = searchTerm
      ? sessions.filter((session) => {
          const haystack = [
            session.classTypeName ?? session.title ?? "",
            session.title ?? "",
            session.instructorName ?? "",
            session.roomName ?? "",
          ]
            .join(" ")
            .toLowerCase();
          return haystack.includes(searchTerm);
        })
      : sessions;

    res.status(200).json({ sessions: filtered });
  } catch (error: any) {
    console.error("/api/admin/calendar/week", error);
    res.status(500).json({ error: error?.message ?? "Unexpected error" });
  }
}
