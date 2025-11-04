import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { madridDayjs, madridStartOfDay, madridEndOfDay } from "@/lib/timezone";

type WaitlistRow = {
  id: string;
  session_id: string;
  client_id: string;
  position: number;
  status: string;
  created_at: string;
};

type SessionRow = {
  id: string;
  start_time: string;
  end_time: string;
  capacity: number;
  class_types: { name?: string } | null;
  rooms: { name?: string } | null;
  instructors: { full_name?: string } | null;
  courses?: { booking_window_days?: number | null } | null;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const date = (req.query.date as string) || madridDayjs().format("YYYY-MM-DD");
    const clientId = typeof req.query.clientId === "string" ? req.query.clientId : null;
    const start = madridStartOfDay(date).toISOString();
    const end = madridEndOfDay(date).toISOString();

    const { data, error } = await supabaseAdmin
      .from("sessions")
      .select(`
        id, start_time, end_time, capacity,
        class_types ( name ),
        rooms       ( name ),
        instructors ( full_name ),
        courses:course_id ( booking_window_days )
      `)
      .gte("start_time", start)
      .lte("start_time", end)
      .order("start_time", { ascending: true });

    if (error) throw error;

    const sessions: SessionRow[] = (data ?? []) as unknown as SessionRow[];

    const ids = sessions.map((session) => session.id);
    const occ: Record<string, number> = {};
    let waitlist: WaitlistRow[] = [];

    if (ids.length) {
      const { data: rows, error: bookingsError } = await supabaseAdmin
        .from("bookings")
        .select("session_id, status")
        .in("session_id", ids)
        .in("status", ["CONFIRMED", "CHECKED_IN"]);

      if (bookingsError) throw bookingsError;
      rows?.forEach((row) => {
        occ[row.session_id] = (occ[row.session_id] ?? 0) + 1;
      });

      const { data: waitRows, error: waitError } = await supabaseAdmin
        .from("session_waitlist")
        .select("id, session_id, client_id, position, status, created_at")
        .in("session_id", ids);

      if (waitError) throw waitError;
      waitlist = (waitRows ?? []) as WaitlistRow[];
    }

    const now = madridDayjs();

    const out = sessions.map((session) => {
      const bookingWindow = session.courses?.booking_window_days;
      let canBook = true;
      let availableFrom: string | null = null;

      if (typeof bookingWindow === "number" && Number.isFinite(bookingWindow) && bookingWindow >= 0) {
        const unlock = madridDayjs(session.start_time, true).subtract(bookingWindow, "day").startOf("day");
        availableFrom = unlock.toISOString();
        if (unlock.isAfter(now)) {
          canBook = false;
        }
      }

      const sessionWaitlist = waitlist.filter((entry) => entry.session_id === session.id);
      const pendingWaitlist = sessionWaitlist
        .filter((entry) => entry.status === "PENDING")
        .sort((a, b) => {
          if (a.position === b.position) {
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          }
          return a.position - b.position;
        });

      let userWaitlistEntry: WaitlistRow | undefined;
      let userWaitlistPosition: number | null = null;

      if (clientId) {
        userWaitlistEntry = sessionWaitlist.find(
          (entry) => entry.client_id === clientId && entry.status !== "CANCELLED"
        );
        if (userWaitlistEntry?.status === "PENDING") {
          const index = pendingWaitlist.findIndex((entry) => entry.id === userWaitlistEntry.id);
          userWaitlistPosition = index >= 0 ? index + 1 : null;
        }
      }

      return {
        id: session.id,
        classType: session.class_types?.name ?? "Clase",
        room: session.rooms?.name ?? "",
        instructor: session.instructors?.full_name ?? "",
        start: session.start_time,
        end: session.end_time,
        capacity: session.capacity,
        current_occupancy: occ[session.id] ?? 0,
        canBook,
        availableFrom,
        waitlistCount: pendingWaitlist.length,
        waitlistEntryId: userWaitlistEntry?.id ?? null,
        waitlistStatus: userWaitlistEntry?.status ?? null,
        waitlistPosition: userWaitlistPosition,
      };
    });

    res.status(200).json(out);
  } catch (error: unknown) {
    console.error(error);
    const message = error instanceof Error ? error.message : "calendar failed";
    res.status(500).json({ error: message });
  }
}
