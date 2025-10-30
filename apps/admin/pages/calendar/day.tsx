import Link from "next/link";
import dayjs from "dayjs";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import AdminLayout from "@/components/admin/AdminLayout";
import CalendarViewSelect from "@/components/admin/calendar/CalendarViewSelect";
import DayAgendaBoard from "@/components/admin/calendar/DayAgendaBoard";
import type { CalendarFilterOption, CalendarSession, CalendarSessionRow, MiniCalendarDay } from "@/components/admin/calendar/types";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchSessionOccupancy } from "@/lib/session-occupancy";


type PageProps = {
  selectedDateISO: string;
  prevDateISO: string;
  nextDateISO: string;
  todayISO: string;
  miniCalendarMonthLabel: string;
  miniCalendarDays: MiniCalendarDay[];
  initialSessions: CalendarSession[];
  filterOptions: {
    instructors: CalendarFilterOption[];
    rooms: CalendarFilterOption[];
    classTypes: CalendarFilterOption[];
  };
};

function startOfWeekSunday(date: dayjs.Dayjs) {
  return date.startOf("week");
}

function endOfWeekSunday(date: dayjs.Dayjs) {
  return date.endOf("week");
}

export const getServerSideProps: GetServerSideProps<PageProps> = async (ctx) => {
  const dateParam = typeof ctx.query.date === "string" ? ctx.query.date : undefined;
  const anchor = dateParam ? dayjs(dateParam) : dayjs();
  const selected = anchor.isValid() ? anchor.startOf("day") : dayjs().startOf("day");
  const startOfDay = selected.startOf("day");
  const endOfDay = selected.endOf("day");

  const [sessionsResp, instructorsResp, roomsResp, classTypesResp] = await Promise.all([
    supabaseAdmin
      .from("sessions")
      .select(
        "id, start_time, end_time, capacity, current_occupancy, class_type_id, instructor_id, room_id, class_types(id, name), instructors(id, full_name), rooms(id, name)"
      )
      .gte("start_time", startOfDay.toISOString())
      .lte("start_time", endOfDay.toISOString())
      .order("start_time", { ascending: true })
      .returns<CalendarSessionRow[]>(),
    supabaseAdmin.from("instructors").select("id, full_name").order("full_name"),
    supabaseAdmin.from("rooms").select("id, name").order("name"),
    supabaseAdmin.from("class_types").select("id, name").order("name"),
  ]);

  if (sessionsResp.error) throw sessionsResp.error;
  if (instructorsResp.error) throw instructorsResp.error;
  if (roomsResp.error) throw roomsResp.error;
  if (classTypesResp.error) throw classTypesResp.error;

  const sessionRows = (sessionsResp.data ?? []) as CalendarSessionRow[];
  const occupancyMap = await fetchSessionOccupancy(sessionRows.map((session) => session.id));

  const initialSessions: CalendarSession[] = sessionRows.map((session) => ({
    id: session.id,
    startISO: session.start_time,
    endISO: session.end_time,
    title: session.class_types?.name ?? "Clase",
    classTypeId: session.class_type_id ?? null,
    classTypeName: session.class_types?.name ?? null,
    instructorId: session.instructor_id ?? null,
    instructorName: session.instructors?.full_name ?? null,
    roomId: session.room_id ?? null,
    roomName: session.rooms?.name ?? null,
    capacity: session.capacity ?? 0,
    occupancy: occupancyMap[session.id] ?? 0,
  }));

  const monthStart = selected.startOf("month");
  const monthEnd = selected.endOf("month");
  const displayStart = startOfWeekSunday(monthStart);
  const displayEnd = endOfWeekSunday(monthEnd);
  const miniCalendarDays: MiniCalendarDay[] = [];

  let cursor = displayStart.clone();
  while (cursor.isBefore(displayEnd) || cursor.isSame(displayEnd, "day")) {
    miniCalendarDays.push({
      isoDate: cursor.format("YYYY-MM-DD"),
      label: cursor.format("D"),
      isCurrentMonth: cursor.month() === monthStart.month(),
      isSelected: cursor.isSame(selected, "day"),
    });
    cursor = cursor.add(1, "day");
  }

  const filterOptions = {
    instructors: (instructorsResp.data ?? []).map((row) => ({ id: row.id, label: row.full_name })),
    rooms: (roomsResp.data ?? []).map((row) => ({ id: row.id, label: row.name })),
    classTypes: (classTypesResp.data ?? []).map((row) => ({ id: row.id, label: row.name })),
  };

  return {
    props: {
      selectedDateISO: selected.format("YYYY-MM-DD"),
      prevDateISO: selected.subtract(1, "day").format("YYYY-MM-DD"),
      nextDateISO: selected.add(1, "day").format("YYYY-MM-DD"),
      todayISO: dayjs().format("YYYY-MM-DD"),
      miniCalendarMonthLabel: monthStart.format("MMMM YYYY"),
      miniCalendarDays,
      initialSessions,
      filterOptions,
    },
  };
};

export default function DayCalendarPage({
  selectedDateISO,
  prevDateISO,
  nextDateISO,
  todayISO,
  miniCalendarMonthLabel,
  miniCalendarDays,
  initialSessions,
  filterOptions,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <AdminLayout
      title="Calendario"
      active="calendar"
      headerToolbar={(
        <div className="flex items-center gap-3">
          <CalendarViewSelect mode="day" dateISO={selectedDateISO} />
          <Link
            href={{ pathname: "/calendar/day", query: { date: prevDateISO } }}
            className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Día anterior
          </Link>
          <Link
            href={{ pathname: "/calendar/day", query: { date: todayISO } }}
            className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Hoy
          </Link>
          <Link
            href={{ pathname: "/calendar/day", query: { date: nextDateISO } }}
            className="rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
          >
            Siguiente día
          </Link>
        </div>
      )}
    >
      <DayAgendaBoard
        selectedDateISO={selectedDateISO}
        todayISO={todayISO}
        miniCalendarMonthLabel={miniCalendarMonthLabel}
        miniCalendarDays={miniCalendarDays}
        initialSessions={initialSessions}
        filterOptions={filterOptions}
      />
    </AdminLayout>
  );
}
