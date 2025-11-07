import Head from "next/head";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import AdminLayout from "@/components/admin/AdminLayout";
import SessionDetailsModal from "@/components/admin/sessions/SessionDetailsModal";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Tables } from "@/types/database";
import { studioDayjs } from "@/lib/timezone";

type ScheduledSession = {
  id: string;
  courseId: string;
  startTime: string;
  endTime: string;
  instructorName: string | null;
  roomName: string | null;
};

type SchedulerCourse = {
  id: string;
  title: string;
  classType: string | null;
  sessionCount: number;
  scheduledSessions: number;
  estado: string;
  sessionDurationMinutes: number | null;
  leadInstructorId: string | null;
  leadInstructorName: string | null;
  defaultRoomId: string | null;
  defaultRoomName: string | null;
  defaultRoomCapacity: number | null;
  sessions: ScheduledSession[];
};

type SessionsRow = Pick<Tables<"sessions">, "id" | "course_id" | "start_time" | "end_time"> & {
  instructors: Pick<Tables<"instructors">, "full_name"> | null;
  rooms: Pick<Tables<"rooms">, "name"> | null;
};

type CoursesRow = {
  id: string;
  title: string;
  session_count: number | null;
  status: string | null;
  session_duration_minutes: number | null;
  lead_instructor_id: string | null;
  default_room_id?: string | null;
  class_types: { name: string | null } | null;
  instructors: { full_name: string | null } | null;
  rooms?: { id: string; name: string; capacity: number | null } | null;
};

type InstructorRow = Pick<Tables<"instructors">, "id" | "full_name">;

type InstructorOption = {
  id: string;
  name: string;
};

type ApiInsertedSession = {
  id: string;
  start_time: string;
  end_time: string;
  instructor_id: string;
};

type PageProps = {
  courses: SchedulerCourse[];
  instructors: InstructorOption[];
};

type Frequency = "recurring" | "once";

type DraftSession = {
  id: string;
  date: string;
  startTime: string;
  duration: string;
  instructorId: string | null;
  isStartTimeEdited: boolean;
  isDurationEdited: boolean;
  isInstructorEdited: boolean;
};

const DEFAULT_DAYS = ["mon", "tue", "wed", "thu", "fri"];

const DAY_LABELS: Record<string, string> = {
  sun: "Dom",
  mon: "Lun",
  tue: "Mar",
  wed: "Mie",
  thu: "Jue",
  fri: "Vie",
  sat: "Sab",
};

const ORDERED_DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const DAY_TO_INDEX: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

const UPCOMING_PREVIEW_LIMIT = 5;
const DEFAULT_TIME = "08:00";

const sortSessionsByStartTime = (a: ScheduledSession, b: ScheduledSession) => {
  const aTime = a.startTime ? studioDayjs(a.startTime).valueOf() : Number.MAX_SAFE_INTEGER;
  const bTime = b.startTime ? studioDayjs(b.startTime).valueOf() : Number.MAX_SAFE_INTEGER;
  return aTime - bTime;
};

const computeRecurringDates = (startDate: string, selectedDays: string[], count: number) => {
  const start = studioDayjs(startDate, true).startOf("day");
  if (!start.isValid() || selectedDays.length === 0 || count <= 0) return [];

  const selectedDayNumbers = new Set(selectedDays.map((day) => DAY_TO_INDEX[day] ?? -1));
  const dates: string[] = [];
  let cursor = start.clone();
  let safety = 0;

  while (dates.length < count && safety < 2000) {
    if (selectedDayNumbers.has(cursor.day())) {
      dates.push(cursor.format("YYYY-MM-DD"));
    }
    cursor = cursor.add(1, "day");
    safety += 1;
  }

  return dates;
};

const formatSessionDateLabel = (dateISO: string) => {
  const date = studioDayjs(dateISO);
  if (!date.isValid()) return "Sin fecha";
  const dayKey = ORDERED_DAYS[date.day()];
  const dayLabel = DAY_LABELS[dayKey] ?? "";
  return `${dayLabel} ${date.format("DD/MM/YY")}`.trim();
};
export const getServerSideProps: GetServerSideProps<PageProps> = async () => {
  const COURSE_SELECT_WITH_ROOM = "id, title, session_count, status, session_duration_minutes, lead_instructor_id, default_room_id, class_types:class_type_id (name), instructors:lead_instructor_id (full_name), rooms:default_room_id (id, name, capacity)";
  const COURSE_SELECT_FALLBACK = "id, title, session_count, status, session_duration_minutes, lead_instructor_id, class_types:class_type_id (name), instructors:lead_instructor_id (full_name)";

  const coursesResp = await supabaseAdmin
    .from("courses")
    .select(COURSE_SELECT_WITH_ROOM)
    .order("title");

  let courseRows: CoursesRow[] = (coursesResp.data as CoursesRow[]) ?? [];
  if (coursesResp.error) {
    console.warn("/courses/scheduler fallback sin default_room_id", coursesResp.error.message);
    const fallback = await supabaseAdmin
      .from("courses")
      .select(COURSE_SELECT_FALLBACK)
      .order("title");
    if (fallback.error) {
      console.error("/courses/scheduler courses query", fallback.error);
      courseRows = [];
    } else {
      const fallbackRows = (fallback.data ?? []) as CoursesRow[];
      courseRows = fallbackRows.map((row) => ({
        ...row,
        default_room_id: null,
        rooms: null,
      }));
    }
  }

  const [sessionsResp, instructorsResp] = await Promise.all([
    supabaseAdmin
      .from("sessions")
      .select("id, course_id, start_time, end_time, instructors:instructor_id (full_name), rooms:room_id (name)")
      .returns<SessionsRow[]>(),
    supabaseAdmin.from("instructors").select("id, full_name").order("full_name").returns<InstructorRow[]>(),
  ]);

  const sessionsByCourse = new Map<string, ScheduledSession[]>();
  (sessionsResp.data ?? []).forEach((session) => {
    if (!session.course_id) return;
    const list = sessionsByCourse.get(session.course_id) ?? [];
    list.push({
      id: session.id,
      courseId: session.course_id,
      startTime: session.start_time ?? "",
      endTime: session.end_time ?? "",
      instructorName: session.instructors?.full_name ?? null,
      roomName: session.rooms?.name ?? null,
    });
    sessionsByCourse.set(session.course_id, list);
  });

  const courses: SchedulerCourse[] = courseRows.map((course) => {
    const sessions = [...(sessionsByCourse.get(course.id) ?? [])].sort(sortSessionsByStartTime);
    return {
      id: course.id,
      title: course.title,
      classType: course.class_types?.name ?? null,
      sessionCount: Number(course.session_count ?? 0),
      scheduledSessions: sessions.length,
      estado: course.status ?? "DRAFT",
      sessionDurationMinutes: course.session_duration_minutes ?? null,
      leadInstructorId: course.lead_instructor_id ?? null,
      leadInstructorName: course.instructors?.full_name ?? null,
      defaultRoomId: course.default_room_id ?? null,
      defaultRoomName: course.rooms?.name ?? null,
      defaultRoomCapacity: course.rooms?.capacity ?? null,
      sessions,
    };
  });

  const instructors: InstructorOption[] = (instructorsResp.data ?? []).map((row) => ({
    id: row.id,
    name: row.full_name,
  }));

  return {
    props: {
      courses,
      instructors,
    },
  };
};

const ATYPICAL_WEEKS = [
  {
    id: "summer-break",
    label: "Semana del 15 de julio",
    note: "Vacaciones de verano - se omiten sesiónes jueves y viernes",
  },
  {
    id: "instructor-change",
    label: "Semana del 12 de agosto",
    note: "Cambio temporal de instructor: Carla por Mariana",
  },
];
export default function CourseSchedulerPage({
  courses,
  instructors,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const schedulerSectionRef = useRef<HTMLDivElement | null>(null);
  const [coursesState, setCoursesState] = useState<SchedulerCourse[]>(courses);
  const [frequency, setFrequency] = useState<Frequency>("recurring");
  const [selectedDays, setSelectedDays] = useState<string[]>(DEFAULT_DAYS);
  const [recurringStartDate, setRecurringStartDate] = useState(studioDayjs().format("YYYY-MM-DD"));
  const [recurringStartTime, setRecurringStartTime] = useState(DEFAULT_TIME);
  const [recurringCount, setRecurringCount] = useState(1);
  const [singleDate, setSingleDate] = useState(studioDayjs().format("YYYY-MM-DD"));
  const [singleBaseTime, setSingleBaseTime] = useState(DEFAULT_TIME);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [draftSessions, setDraftSessions] = useState<DraftSession[]>([]);
  const [planStatus, setPlanStatus] = useState<"idle" | "success">("idle");
  const [planMessage, setPlanMessage] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);
  const [sessionDetailId, setSessionDetailId] = useState<string | null>(null);
  const [sessionDetailOpen, setSessionDetailOpen] = useState(false);

  useEffect(() => {
    setCoursesState(courses);
  }, [courses]);

  const pendingCourses = useMemo(
    () => coursesState.filter((course) => course.scheduledSessions < course.sessionCount),
    [coursesState]
  );

  const totalPendingSessions = useMemo(
    () =>
      pendingCourses.reduce(
        (sum, course) => sum + Math.max(course.sessionCount - course.scheduledSessions, 0),
        0
      ),
    [pendingCourses]
  );

  const defaultSelectedCourseId = useMemo(() => {
    if (pendingCourses.length > 0) return pendingCourses[0].id;
    return coursesState[0]?.id ?? null;
  }, [pendingCourses, coursesState]);

  useEffect(() => {
    if (!selectedCourseId && defaultSelectedCourseId) {
      setSelectedCourseId(defaultSelectedCourseId);
    }
  }, [selectedCourseId, defaultSelectedCourseId]);

  const selectedCourse = useMemo(
    () => coursesState.find((course) => course.id === selectedCourseId) ?? null,
    [coursesState, selectedCourseId]
  );

  useEffect(() => {
    setPlanStatus("idle");
    setPlanMessage(null);
    setPlanError(null);
  }, [selectedCourseId]);

  const pendingSessionsForSelectedCourse = selectedCourse
    ? Math.max(selectedCourse.sessionCount - selectedCourse.scheduledSessions, 0)
    : 0;

  const defaultDuration = useMemo(() => {
    if (!selectedCourse) return "60";
    if (selectedCourse.sessionDurationMinutes && selectedCourse.sessionDurationMinutes > 0) {
      return String(selectedCourse.sessionDurationMinutes);
    }
    return "60";
  }, [selectedCourse]);

  const defaultInstructorId = selectedCourse?.leadInstructorId ?? null;

  const instructorNameById = useMemo(() => {
    const map = new Map<string, string>();
    instructors.forEach((instructor) => map.set(instructor.id, instructor.name));
    return map;
  }, [instructors]);

  useEffect(() => {
    if (!selectedCourse) {
      setDraftSessions([]);
      return;
    }
    setPlanError(null);
    setIsPlanning(false);
    setSelectedDays(DEFAULT_DAYS);
    setRecurringStartDate(studioDayjs().format("YYYY-MM-DD"));
    setRecurringStartTime(DEFAULT_TIME);
    const autoRecurring =
      pendingSessionsForSelectedCourse > 0 ? Math.min(pendingSessionsForSelectedCourse, 3) : 1;
    setRecurringCount(autoRecurring);
    setSingleDate(studioDayjs().format("YYYY-MM-DD"));
    setSingleBaseTime(DEFAULT_TIME);
    setDraftSessions([]);
  }, [selectedCourseId, selectedCourse, pendingSessionsForSelectedCourse]);

  const scrollToScheduler = () => {
    if (typeof window === "undefined") return;
    requestAnimationFrame(() => {
      schedulerSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const handleSelectCourse = (courseId: string, options?: { scroll?: boolean }) => {
    setSelectedCourseId(courseId);
    if (options?.scroll) {
      scrollToScheduler();
    }
  };

  const toggleDay = (day: string) => {
    setSelectedDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  };
  const maxRecurringSessions = frequency === "recurring" ? pendingSessionsForSelectedCourse : 0;

  useEffect(() => {
    if (frequency !== "recurring" || !selectedCourse) return;

    if (pendingSessionsForSelectedCourse === 0) {
      setDraftSessions([]);
      return;
    }

    if (maxRecurringSessions > 0 && recurringCount > maxRecurringSessions) {
      setRecurringCount(maxRecurringSessions);
    }

    if (selectedDays.length === 0 || maxRecurringSessions === 0) {
      setDraftSessions([]);
      return;
    }

    const totalSessions = Math.min(recurringCount, maxRecurringSessions);
    const dateList = computeRecurringDates(recurringStartDate, selectedDays, totalSessions);

    setDraftSessions((prev) =>
      dateList.map((dateISO, index) => {
        const existing = prev[index];
        const startTime = existing
          ? existing.isStartTimeEdited
            ? existing.startTime
            : recurringStartTime
          : recurringStartTime;
        const duration = existing
          ? existing.isDurationEdited
            ? existing.duration
            : defaultDuration
          : defaultDuration;
        const instructorId = existing
          ? existing.isInstructorEdited
            ? existing.instructorId
            : defaultInstructorId
          : defaultInstructorId;
        return {
          id: `recurring-${index}`,
          date: dateISO,
          startTime,
          duration,
          instructorId: instructorId ?? null,
          isStartTimeEdited: existing?.isStartTimeEdited ?? false,
          isDurationEdited: existing?.isDurationEdited ?? false,
          isInstructorEdited: existing?.isInstructorEdited ?? false,
        };
      })
    );
  }, [
    frequency,
    selectedCourse,
    recurringStartDate,
    selectedDays,
    recurringCount,
    maxRecurringSessions,
    recurringStartTime,
    defaultDuration,
    defaultInstructorId,
    pendingSessionsForSelectedCourse,
  ]);

  useEffect(() => {
    if (frequency !== "once" || !selectedCourse) return;

    if (pendingSessionsForSelectedCourse === 0) {
      setDraftSessions([]);
      return;
    }

    setDraftSessions((prev) => {
      const existing = prev[0];
      const startTime = existing
        ? existing.isStartTimeEdited
          ? existing.startTime
          : singleBaseTime
        : singleBaseTime;
      const duration = existing
        ? existing.isDurationEdited
          ? existing.duration
          : defaultDuration
        : defaultDuration;
      const instructorId = existing
        ? existing.isInstructorEdited
          ? existing.instructorId
          : defaultInstructorId
        : defaultInstructorId;

      const next: DraftSession = {
        id: "single-0",
        date: singleDate,
        startTime,
        duration,
        instructorId: instructorId ?? null,
        isStartTimeEdited: existing?.isStartTimeEdited ?? false,
        isDurationEdited: existing?.isDurationEdited ?? false,
        isInstructorEdited: existing?.isInstructorEdited ?? false,
      };

      return [next];
    });
  }, [
    frequency,
    selectedCourse,
    singleDate,
    singleBaseTime,
    defaultDuration,
    defaultInstructorId,
    pendingSessionsForSelectedCourse,
  ]);

  const updateDraftSession = (index: number, field: "startTime" | "duration" | "instructorId", value: string) => {
    setDraftSessions((prev) =>
      prev.map((session, idx) => {
        if (idx !== index) return session;
        if (field === "startTime") {
          if (frequency === "once" && index === 0) {
            setSingleBaseTime(value);
          }
          return { ...session, startTime: value, isStartTimeEdited: true };
        }
        if (field === "duration") {
          const sanitized = Number(value) > 0 ? value : session.duration;
          return { ...session, duration: sanitized, isDurationEdited: true };
        }
        if (field === "instructorId") {
          const nextValue = value === "" ? null : value;
          return { ...session, instructorId: nextValue, isInstructorEdited: true };
        }
        return session;
      })
    );
  };

  const upcomingSessions = useMemo(() => {
    if (!selectedCourse) return [] as ScheduledSession[];
    const now = studioDayjs();
    const future = selectedCourse.sessions.filter(
      (session) => session.startTime && studioDayjs(session.startTime).isAfter(now)
    );
    const source = future.length > 0 ? future : selectedCourse.sessions;
    return source.slice(0, UPCOMING_PREVIEW_LIMIT);
  }, [selectedCourse]);

  const openSessionDetails = useCallback((sessionId: string) => {
    setSessionDetailId(sessionId);
    setSessionDetailOpen(true);
  }, []);

  const closeSessionDetails = useCallback(() => {
    setSessionDetailOpen(false);
  }, []);

  const hasValidDrafts =
    draftSessions.length > 0 &&
    draftSessions.every((session) => session.date && session.startTime && Number(session.duration) > 0);

  const missingInstructor = draftSessions.some((session) => !(session.instructorId ?? defaultInstructorId));

  const canPlan =
    Boolean(
      selectedCourse &&
        hasValidDrafts &&
        pendingSessionsForSelectedCourse > 0 &&
        selectedCourse.defaultRoomId &&
        !missingInstructor
    ) && !isPlanning;

  const planButtonLabel = isPlanning
    ? "Programando..."
    : frequency === "once"
    ? "Programar sesión"
    : "Programar sesiónes";

  const handlePlanSessions = async () => {
    if (!selectedCourse) return;
    setPlanError(null);
    setPlanStatus("idle");

    if (!selectedCourse.defaultRoomId) {
      setPlanError("Asigna una sala predeterminada al horario antes de programar.");
      return;
    }

    if (pendingSessionsForSelectedCourse === 0) {
      setPlanError("Este horario ya tiene todas las sesiónes programadas.");
      return;
    }

    const preparedSessions = draftSessions.map((session) => {
      const durationMinutes = Number(session.duration) > 0 ? Number(session.duration) : Number(defaultDuration);
      return {
        date: session.date,
        startTime: session.startTime,
        duration: durationMinutes,
        instructorId: session.instructorId ?? defaultInstructorId,
      };
    });

    if (preparedSessions.length === 0) {
      setPlanError("Configura al menos una sesión para programar.");
      return;
    }

    for (let index = 0; index < preparedSessions.length; index += 1) {
      const item = preparedSessions[index];
      if (!item.date || !item.startTime) {
        setPlanError(`Completa la fecha y hora para la sesión ${index + 1}.`);
        return;
      }
      if (!item.duration || item.duration <= 0) {
        setPlanError(`Define una duracion valida para la sesión ${index + 1}.`);
        return;
      }
      if (!item.instructorId) {
        setPlanError(`Asigna un instructor para la sesión ${index + 1}.`);
        return;
      }
    }

    if (preparedSessions.length > pendingSessionsForSelectedCourse) {
      setPlanError(`Solo quedan ${pendingSessionsForSelectedCourse} sesiónes pendientes para este horario.`);
      return;
    }

    setIsPlanning(true);

    try {
      const response = await fetch("/api/courses/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: selectedCourse.id,
          sessions: preparedSessions,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        setPlanError(result?.error ?? "No se pudo programar las sesiónes.");
        return;
      }

      const insertedSessionsData: ApiInsertedSession[] = result.sessions ?? [];
      const insertedSessions: ScheduledSession[] = insertedSessionsData.map((session) => ({
        id: session.id,
        courseId: selectedCourse.id,
        startTime: session.start_time,
        endTime: session.end_time,
        instructorName:
          instructorNameById.get(session.instructor_id) ?? selectedCourse.leadInstructorName ?? null,
        roomName: selectedCourse.defaultRoomName,
      }));

      const scheduledTotal =
        typeof result?.scheduledTotal === "number"
          ? result.scheduledTotal
          : selectedCourse.scheduledSessions + insertedSessions.length;

      setCoursesState((prev) =>
        prev.map((course) => {
          if (course.id !== selectedCourse.id) return course;
          const mergedSessions = [...course.sessions, ...insertedSessions].sort(sortSessionsByStartTime);
          return {
            ...course,
            scheduledSessions: scheduledTotal,
            sessions: mergedSessions,
          };
        })
      );

      setPlanStatus("success");
      setPlanMessage(result?.message ?? `Se programaron ${insertedSessions.length} sesiónes.`);
      setPlanError(null);
      setDraftSessions([]);
    } catch (error) {
      console.error("schedule sessions", error);
      setPlanError("Ocurrio un error inesperado al programar las sesiónes.");
    } finally {
      setIsPlanning(false);
    }
  };
  return (
    <AdminLayout title="Programador de sesiónes" active="courseScheduler">
      <Head>
        <title>PilatesTime Admin - Programador de sesiónes</title>
      </Head>
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex flex-col gap-3">
              <div>
                <h1 className="text-lg font-semibold text-slate-900">Resumen de horarios</h1>
                <p className="text-sm text-slate-500">Identifica que horarios necesitan programacion adicional.</p>
              </div>
              {coursesState.length > 0 && (
                pendingCourses.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
                      {pendingCourses.length} horarios con pendientes
                    </span>
                    <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-700">
                      {totalPendingSessions} sesiónes sin programar
                    </span>
                  </div>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
                    Todos los horarios estan al dia
                  </span>
                )
              )}
            </div>
            <Link
              href="/courses"
              className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              <span className="material-icons-outlined text-base">arrow_back</span>
              Volver a Horarios
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Horario</th>
                  <th className="px-4 py-3 text-left">Tipo</th>
                  <th className="px-4 py-3 text-center">Programadas</th>
                  <th className="px-4 py-3 text-center">Pendientes</th>
                  <th className="px-4 py-3 text-left">Estado</th>
                  <th className="px-4 py-3 text-center">Accion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {coursesState.map((course) => {
                  const pending = Math.max(course.sessionCount - course.scheduledSessions, 0);
                  const isSelected = course.id === selectedCourseId;
                  return (
                    <tr
                      key={course.id}
                      onClick={() => handleSelectCourse(course.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? "bg-brand-50" : "hover:bg-slate-50"
                      }`}
                    >
                      <td className="px-4 py-3 font-medium text-slate-800">{course.title}</td>
                      <td className="px-4 py-3 text-slate-600">{course.classType ?? "Sin tipo definido"}</td>
                      <td className="px-4 py-3 text-center text-slate-700">
                        {course.scheduledSessions} / {course.sessionCount}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {pending > 0 ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                            {pending} pendientes
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            Completo
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{course.estado}</td>
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleSelectCourse(course.id, { scroll: true });
                          }}
                          className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white p-2 text-brand-600 shadow-sm transition-colors hover:border-brand-500 hover:text-brand-700"
                          aria-label="Abrir programador para este horario"
                          title="Abrir programador para este horario"
                        >
                          <span className="material-icons-outlined text-base">event_note</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {coursesState.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500">
                      No se encontraron horarios.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Programacion semanal</h2>
          <p className="text-sm text-slate-500">Define sesiónes recurrentes o unicas. Aun no se guardan cambios en la base.</p>

          <div ref={schedulerSectionRef} className="mt-6 grid gap-4 lg:grid-cols-3">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Curso a programar</label>
                <select
                  value={selectedCourseId ?? ""}
                  onChange={(event) => handleSelectCourse(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="" disabled>
                    Selecciona un horario
                  </option>
                  {coursesState.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.title}
                    </option>
                  ))}
                </select>
              </div>

              {selectedCourse && (
                <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-md bg-white px-2 py-1 text-xs font-medium text-slate-600">
                      Programadas: {selectedCourse.scheduledSessions} / {selectedCourse.sessionCount}
                    </span>
                    <span
                      className={`rounded-md px-2 py-1 text-xs font-medium ${
                        pendingSessionsForSelectedCourse > 0
                          ? "bg-amber-100 text-amber-700"
                          : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      Pendientes: {pendingSessionsForSelectedCourse}
                    </span>
                  </div>
                  {selectedCourse.classType && (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="material-icons-outlined text-base">category</span>
                      Tipo: {selectedCourse.classType}
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="material-icons-outlined text-base">person</span>
                    Instructor titular: {selectedCourse.leadInstructorName ?? "Sin definir"}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="material-icons-outlined text-base">schedule</span>
                    Duracion: {defaultDuration} min
                  </div>
                  {selectedCourse.defaultRoomName ? (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="material-icons-outlined text-base">meeting_room</span>
                      Sala: {selectedCourse.defaultRoomName}
                      {selectedCourse.defaultRoomCapacity ? ` (capacidad ${selectedCourse.defaultRoomCapacity})` : ""}
                    </div>
                  ) : (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      Asigna una sala predeterminada al horario para programar sesiónes automaticamente.
                    </div>
                  )}
                  {pendingSessionsForSelectedCourse === 0 && (
                    <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                      Este horario no tiene sesiónes pendientes, pero puedes ajustar la programacion si es necesario.
                    </div>
                  )}
                </div>
              )}

              <div>
                <span className="block text-sm font-medium text-slate-700">Frecuencia</span>
                <div className="mt-2 grid grid-cols-1 gap-2 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="frequency"
                      value="recurring"
                      checked={frequency === "recurring"}
                      onChange={() => setFrequency("recurring")}
                    />
                    Recurrente (cada semana)
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="frequency"
                      value="once"
                      checked={frequency === "once"}
                      onChange={() => setFrequency("once")}
                    />
                    Unica ocasion
                  </label>
                </div>
              </div>

              {frequency === "recurring" && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Fecha de inicio</label>
                    <input
                      type="date"
                      value={recurringStartDate}
                      onChange={(event) => setRecurringStartDate(event.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <span className="block text-sm font-medium text-slate-700">Repetir en</span>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {ORDERED_DAYS.map((day) => {
                        const active = selectedDays.includes(day);
                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => toggleDay(day)}
                            className={`rounded-full px-3 py-1 text-xs font-medium ${
                              active ? "bg-brand-600 text-white" : "border border-slate-200 text-slate-600"
                            }`}
                          >
                            {DAY_LABELS[day]}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-slate-700">Hora</label>
                      <input
                        type="time"
                        value={recurringStartTime}
                        onChange={(event) => setRecurringStartTime(event.target.value)}
                        className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700">Sesiónes</label>
                      <select
                        value={recurringCount}
                        onChange={(event) => setRecurringCount(Math.max(1, Number(event.target.value)))}
                        className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                        disabled={maxRecurringSessions === 0}
                      >
                        {maxRecurringSessions === 0 && <option value={1}>Sin pendientes</option>}
                        {Array.from({ length: maxRecurringSessions }, (_, index) => index + 1).map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </>
              )}

              {frequency === "once" && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Fecha</label>
                    <input
                      type="date"
                      value={singleDate}
                      onChange={(event) => setSingleDate(event.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Hora</label>
                    <input
                      type="time"
                      value={singleBaseTime}
                      onChange={(event) => setSingleBaseTime(event.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="lg:col-span-2">
              {(!selectedCourse || draftSessions.length === 0) && (
                <div className="rounded-md border border-dashed border-slate-300 p-6 text-sm text-slate-500">
                  {selectedCourse
                    ? selectedCourse.defaultRoomId
                      ? pendingSessionsForSelectedCourse === 0
                        ? "Este horario no tiene sesiónes pendientes."
                        : "Configura los parametros para generar sesiónes."
                      : "Asigna una sala predeterminada al horario para activar el programador."
                    : "Selecciona un horario para comenzar."}
                </div>
              )}

              {selectedCourse && draftSessions.length > 0 && (
                <div className="space-y-4">
                  {draftSessions.map((session, index) => {
                    const instructorLabel = session.instructorId
                      ? instructorNameById.get(session.instructorId) ?? "Instructor desconocido"
                      : defaultInstructorId
                      ? instructorNameById.get(defaultInstructorId) ?? "Instructor titular"
                      : "Sin instructor asignado";
                    return (
                      <div key={session.id} className="rounded-md border border-slate-200 p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-slate-700">
                            {formatSessionDateLabel(session.date)}
                          </h3>
                          <span className="text-xs text-slate-400">Sesión {index + 1}</span>
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-600">Hora de inicio</label>
                            <input
                              type="time"
                              value={session.startTime}
                              onChange={(event) => updateDraftSession(index, "startTime", event.target.value)}
                              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600">Duracion (min)</label>
                            <input
                              type="number"
                              min={10}
                              value={session.duration}
                              onChange={(event) => updateDraftSession(index, "duration", event.target.value)}
                              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600">Instructor</label>
                            <select
                              value={session.instructorId ?? ""}
                              onChange={(event) => updateDraftSession(index, "instructorId", event.target.value)}
                              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                            >
                              <option value="">{defaultInstructorId ? "Usar instructor titular" : "Sin instructor"}</option>
                              {instructors.map((instructor) => (
                                <option key={instructor.id} value={instructor.id}>
                                  {instructor.name}
                                </option>
                              ))}
                            </select>
                            <p className="mt-1 text-[11px] text-slate-400">Actual: {instructorLabel}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-col gap-2">
                      {planStatus === "success" && planMessage && (
                        <div className="inline-flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                          <span className="material-icons-outlined text-base">check_circle</span>
                          {planMessage}
                        </div>
                      )}
                      {planError && (
                        <div className="inline-flex items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                          <span className="material-icons-outlined text-base">error</span>
                          {planError}
                        </div>
                      )}
                      {missingInstructor && (
                        <div className="inline-flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                          <span className="material-icons-outlined text-base">info</span>
                          Define un instructor para cada sesión antes de programar.
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handlePlanSessions}
                      disabled={!canPlan}
                      className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors ${
                        canPlan ? "bg-brand-600 hover:bg-brand-700" : "bg-slate-300 cursor-not-allowed"
                      }`}
                    >
                      <span className="material-icons-outlined text-base">play_arrow</span>
                      {planButtonLabel}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {selectedCourse && (
            <div className="mt-6 rounded-md border border-slate-200 p-4 text-sm text-slate-600">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700">Sesiónes programadas</h3>
                <span className="text-xs text-slate-500">{selectedCourse.sessions.length} en total</span>
              </div>
              {selectedCourse.sessions.length === 0 ? (
                <p className="text-xs text-slate-500">Todavia no hay sesiónes programadas para Este horario.</p>
              ) : (
                <ul className="space-y-2">
                  {upcomingSessions.map((session) => {
                    const start = session.startTime ? studioDayjs(session.startTime) : null;
                    const end = session.endTime ? studioDayjs(session.endTime) : null;
                    const hasValidStart = start?.isValid();
                    return (
                      <li
                        key={session.id}
                        className="flex flex-col gap-1 rounded-md border border-slate-100 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <div className="font-medium text-slate-700">
                            {hasValidStart ? start!.format("DD MMM YYYY HH:mm") : "Sin fecha"}
                          </div>
                          <div className="text-xs text-slate-500">
                            {session.instructorName ? `Instructor: ${session.instructorName}` : "Sin instructor definido"}
                            {session.roomName ? ` - Salon: ${session.roomName}` : ""}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          {end && end.isValid() && (
                            <span className="text-xs text-slate-500">Termina {end.format("HH:mm")}</span>
                          )}
                          <button
                            type="button"
                            onClick={() => openSessionDetails(session.id)}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                          >
                            <span className="material-icons-outlined text-sm" aria-hidden="true">
                              visibility
                            </span>
                            Ver
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {selectedCourse.sessions.length > upcomingSessions.length && upcomingSessions.length > 0 && (
                <p className="mt-3 text-xs text-slate-400">
                  Mostrando las proximas {upcomingSessions.length} sesiónes de {selectedCourse.sessions.length}.
                </p>
              )}
            </div>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Semanas atipicas</h2>
          <p className="text-sm text-slate-500">
            Usa esta lista para anotar excepciones (vacaciones, cambios de instructor, etc.).
          </p>
          <ul className="mt-4 space-y-3 text-sm text-slate-600">
            {ATYPICAL_WEEKS.map((week) => (
              <li key={week.id} className="rounded-md border border-dashed border-slate-300 p-3">
                <div className="font-medium text-slate-800">{week.label}</div>
                <div className="text-xs text-slate-500">{week.note}</div>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <SessionDetailsModal
        sessionId={sessionDetailId}
        open={sessionDetailOpen}
        onClose={closeSessionDetails}
      />
    </AdminLayout>
  );
}














