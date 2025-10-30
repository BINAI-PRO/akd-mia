import type { NextApiRequest, NextApiResponse } from "next";
import dayjs from "dayjs";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Tables } from "@/types/database";

type SessionRow = Tables<"sessions"> & {
  class_types: Pick<Tables<"class_types">, "id" | "name"> | null;
  instructors: Pick<Tables<"instructors">, "id" | "full_name"> | null;
  rooms: Pick<Tables<"rooms">, "id" | "name"> | null;
  courses: Pick<Tables<"courses">, "id" | "title"> | null;
};

type BookingRow = {
  id: string;
  status: string | null;
  reserved_at: string | null;
  plan_purchase_id: string | null;
  clients: Pick<Tables<"clients">, "id" | "full_name" | "email" | "phone"> | null;
  plan_purchases: (Pick<Tables<"plan_purchases">, "id" | "modality"> & {
    plan_types: Pick<Tables<"plan_types">, "name"> | null;
  }) | null;
};

type WaitlistRow = {
  id: string;
  status: string | null;
  position: number | null;
  created_at: string | null;
  clients: Pick<Tables<"clients">, "id" | "full_name" | "email" | "phone"> | null;
};

type SessionDetailsResponse = {
  session: {
    id: string;
    title: string | null;
    startISO: string | null;
    endISO: string | null;
    durationMinutes: number | null;
    capacity: number | null;
    occupancy: number;
    availableSpots: number | null;
    classTypeName: string | null;
    courseTitle: string | null;
    instructorName: string | null;
    instructorId: string | null;
    roomName: string | null;
    roomId: string | null;
  };
  participants: Array<{
    bookingId: string;
    status: string;
    reservedAt: string | null;
    client: {
      id: string | null;
      fullName: string;
      email: string | null;
      phone: string | null;
    };
    plan: {
      id: string;
      modality: string | null;
      name: string | null;
    } | null;
  }>;
  waitlist: Array<{
    id: string;
    status: string | null;
    position: number | null;
    createdAt: string | null;
    client: {
      id: string | null;
      fullName: string;
      email: string | null;
      phone: string | null;
    };
  }>;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Metodo no permitido" });
  }

  const { id } = req.query;
  if (typeof id !== "string" || !id) {
    return res.status(400).json({ error: "Identificador de sesion invalido" });
  }

  const { data: sessionRow, error: sessionError } = await supabaseAdmin
    .from("sessions")
    .select(
      `
        id,
        start_time,
        end_time,
        capacity,
        current_occupancy,
        class_type_id,
        instructor_id,
        room_id,
        class_types ( id, name ),
        instructors ( id, full_name ),
        rooms ( id, name ),
        courses ( id, title )
      `
    )
    .eq("id", id)
    .maybeSingle<SessionRow>();

  if (sessionError) {
    console.error("/api/sessions/[id] session", sessionError);
    return res.status(500).json({ error: "No se pudo obtener la sesión" });
  }

  if (!sessionRow) {
    return res.status(404).json({ error: "Sesión no encontrada" });
  }

  const { data: bookingRows, error: bookingsError } = await supabaseAdmin
    .from("bookings")
    .select(
      `
        id,
        status,
        reserved_at,
        plan_purchase_id,
        clients:clients!bookings_client_id_fkey ( id, full_name, email, phone ),
        plan_purchases (
          id,
          modality,
          plan_types ( name )
        )
      `
    )
    .eq("session_id", id)
    .order("reserved_at", { ascending: true })
    .returns<BookingRow[]>();

  if (bookingsError) {
    console.error("/api/sessions/[id] bookings", bookingsError);
    return res.status(500).json({ error: "No se pudieron obtener las reservaciones" });
  }

  const { data: waitlistRows, error: waitlistError } = await supabaseAdmin
    .from("session_waitlist")
    .select(
      `
        id,
        status,
        position,
        created_at,
        clients ( id, full_name, email, phone )
      `
    )
    .eq("session_id", id)
    .order("position", { ascending: true })
    .returns<WaitlistRow[]>();

  if (waitlistError) {
    console.error("/api/sessions/[id] waitlist", waitlistError);
    return res.status(500).json({ error: "No se pudo obtener la lista de espera" });
  }

  const bookingData = (bookingRows ?? []) as BookingRow[];
  const participants =
    bookingData.map((row) => {
      const client = row.clients;
      const plan = row.plan_purchases;
      return {
        bookingId: row.id,
        status: row.status ?? "UNKNOWN",
        reservedAt: row.reserved_at ?? null,
        client: {
          id: client?.id ?? null,
          fullName: client?.full_name ?? "Cliente sin nombre",
          email: client?.email ?? null,
          phone: client?.phone ?? null,
        },
        plan: plan
          ? {
              id: plan.id,
              modality: plan.modality ?? null,
              name: plan.plan_types?.name ?? null,
            }
          : null,
      };
    });

  const activeOccupancy = participants.filter(
    (participant) => participant.status.toUpperCase() !== "CANCELLED"
  ).length;

  const waitlistData = (waitlistRows ?? []) as WaitlistRow[];
  const waitlist =
    waitlistData.map((row) => {
      const client = row.clients;
      return {
        id: row.id,
        status: row.status ?? null,
        position: typeof row.position === "number" ? row.position : null,
        createdAt: row.created_at ?? null,
        client: {
          id: client?.id ?? null,
          fullName: client?.full_name ?? "Cliente sin nombre",
          email: client?.email ?? null,
          phone: client?.phone ?? null,
        },
      };
    });

  const start = sessionRow.start_time ? dayjs(sessionRow.start_time) : null;
  const end = sessionRow.end_time ? dayjs(sessionRow.end_time) : null;
  const durationMinutes =
    start && end && start.isValid() && end.isValid() ? Math.max(end.diff(start, "minute"), 0) : null;

  const capacity = sessionRow.capacity ?? null;
  const occupancy = activeOccupancy;
  const availableSpots =
    capacity !== null && Number.isFinite(capacity) ? Math.max(capacity - occupancy, 0) : null;

  const payload: SessionDetailsResponse = {
    session: {
      id: sessionRow.id,
      title: sessionRow.class_types?.name ?? sessionRow.courses?.title ?? "Sesión",
      startISO: sessionRow.start_time ?? null,
      endISO: sessionRow.end_time ?? null,
      durationMinutes,
      capacity,
      occupancy,
      availableSpots,
      classTypeName: sessionRow.class_types?.name ?? null,
      courseTitle: sessionRow.courses?.title ?? null,
      instructorName: sessionRow.instructors?.full_name ?? null,
      instructorId: sessionRow.instructor_id ?? null,
      roomName: sessionRow.rooms?.name ?? null,
      roomId: sessionRow.room_id ?? null,
    },
    participants,
    waitlist,
  };

  return res.status(200).json(payload);
}
