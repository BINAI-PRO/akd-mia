import Head from "next/head";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import AdminLayout from "@/components/admin/AdminLayout";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Tables } from "@/types/database";

dayjs.extend(utc);

type CourseOption = {
  id: string;
  title: string;
  sessionDurationMinutes: number;
  classTypeId: string | null;
  classTypeName: string | null;
};

type CourseQueryRow = Tables<'courses'> & {
  class_types: Pick<Tables<'class_types'>, 'id' | 'name'> | null;
};

type SessionQueryRow = Tables<'sessions'> & {
  class_types: Pick<Tables<'class_types'>, 'id' | 'name'> | null;
  instructors: Pick<Tables<'instructors'>, 'id' | 'full_name'> | null;
  rooms: Pick<Tables<'rooms'>, 'id' | 'name' | 'capacity'> | null;
  courses: Pick<Tables<'courses'>, 'id' | 'title' | 'session_duration_minutes'> | null;
};

type InstructorOption = { id: string; full_name: string; bio?: string | null };
type RoomOption = { id: string; name: string; capacity?: number | null };
type ClassTypeOption = { id: string; name: string; description: string | null };

type ClassRow = {
  id: string;
  courseId: string | null;
  courseTitle: string;
  className: string;
  classTypeId: string | null;
  instructorId: string | null;
  instructor: string;
  roomId: string | null;
  room: string;
  scheduleLabel: string;
  startISO: string;
  endISO: string;
  capacity: number;
  occupancy: number;
  durationMinutes: number;
};

type PageProps = {
  initialClasses: ClassRow[];
  courses: CourseOption[];
  instructors: InstructorOption[];
  rooms: RoomOption[];
  classTypes: ClassTypeOption[];
};

type DetailState = {
  startDate: string;
  startTime: string;
  instructorId: string;
  roomId: string;
};

type SingleSessionForm = {
  classTypeId: string;
  instructorId: string;
  roomId: string;
  date: string;
  startTime: string;
  durationMinutes: string;
  capacity: string;
};

const sortClasses = (rows: ClassRow[]) =>
  [...rows].sort((a, b) => dayjs.utc(a.startISO).valueOf() - dayjs.utc(b.startISO).valueOf());

export const getServerSideProps: GetServerSideProps<PageProps> = async () => {
  const [sessionsResp, coursesResp, instructorsResp, roomsResp, classTypesResp] = await Promise.all([
    supabaseAdmin
      .from('sessions')
      .select(
        'id, course_id, start_time, end_time, capacity, current_occupancy, class_type_id, class_types(id, name), instructors(id, full_name), rooms(id, name, capacity), courses(id, title, session_duration_minutes)'
      )
      .order('start_time', { ascending: true })
      .limit(200),
    supabaseAdmin
      .from('courses')
      .select('id, title, session_duration_minutes, class_type_id, class_types:class_type_id (id, name)')
      .order('title'),
    supabaseAdmin.from('instructors').select('id, full_name, bio').order('full_name'),
    supabaseAdmin.from('rooms').select('id, name, capacity').order('name'),
    supabaseAdmin.from('class_types').select('id, name, description').order('name'),
  ]);

  const sessionRows = (sessionsResp.data ?? []) as SessionQueryRow[];
  const courseRows = (coursesResp.data ?? []) as CourseQueryRow[];

  const initialClasses: ClassRow[] = sortClasses(
    sessionRows.map((row) => {
      const start = dayjs.utc(row.start_time);
      const end = dayjs.utc(row.end_time);
      const durationMinutes = Math.max(end.diff(start, 'minute'), 1);
      return {
        id: row.id,
        courseId: row.course_id ?? null,
        courseTitle: row.courses?.title ?? 'Sin curso',
        className: row.class_types?.name ?? 'Clase',
        classTypeId: row.class_types?.id ?? null,
        instructorId: row.instructors?.id ?? null,
        instructor: row.instructors?.full_name ?? '-',
        roomId: row.rooms?.id ?? null,
        room: row.rooms?.name ?? '-',
        scheduleLabel: `${start.format('ddd DD MMM, HH:mm')} - ${end.format('HH:mm')}`,
        startISO: row.start_time,
        endISO: row.end_time,
        capacity: row.capacity ?? 0,
        occupancy: row.current_occupancy ?? 0,
        durationMinutes,
      };
    })
  );

  const courses: CourseOption[] = courseRows.map((row) => ({
    id: row.id,
    title: row.title,
    sessionDurationMinutes: Number(row.session_duration_minutes ?? 0),
    classTypeId: row.class_type_id ?? null,
    classTypeName: row.class_types?.name ?? null,
  }));

  const instructors: InstructorOption[] = ((instructorsResp.data ?? []) as Tables<'instructors'>[]).map(({ id, full_name, bio }) => ({
    id,
    full_name,
    bio: bio ?? null,
  }));

  const rooms: RoomOption[] = (roomsResp.data ?? []).map(({ id, name, capacity }) => ({
    id,
    name,
    capacity,
  }));

  const classTypes: ClassTypeOption[] = ((classTypesResp.data ?? []) as Tables<'class_types'>[]).map(
    ({ id, name, description }) => ({
      id,
      name,
      description: description ?? null,
    })
  );

  return {
    props: {
      initialClasses,
      courses,
      instructors,
      rooms,
      classTypes,
    },
  };
};
export default function AdminClassesPage({
  initialClasses,
  courses,
  instructors,
  rooms,
  classTypes,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [classes, setClasses] = useState<ClassRow[]>(initialClasses);
  const [statusFilter, setStatusFilter] = useState<'all' | 'upcoming' | 'past'>('all');
  const [courseFilter, setCourseFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeClassId, setActiveClassId] = useState<string | null>(null);
  const [detailState, setDetailState] = useState<DetailState | null>(null);
  const [detailMessage, setDetailMessage] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [updatingDetail, setUpdatingDetail] = useState(false);
  const [bulkInstructorId, setBulkInstructorId] = useState<string>('');
  const [bulkRoomId, setBulkRoomId] = useState<string>('');
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [bulkProcessing, setBulkProcessing] = useState(false);

  const instructorOptions = instructors;
  const roomOptions = rooms;
  const classTypeOptions = classTypes;

  const buildSingleDefaults = useCallback((): SingleSessionForm => {
    const nextHour = dayjs().add(1, 'hour').minute(0).second(0);
    return {
      classTypeId: classTypeOptions[0]?.id ?? '',
      instructorId: instructorOptions[0]?.id ?? '',
      roomId: roomOptions[0]?.id ?? '',
      date: nextHour.format('YYYY-MM-DD'),
      startTime: nextHour.format('HH:mm'),
      durationMinutes: '60',
      capacity: '1',
    };
  }, [classTypeOptions, instructorOptions, roomOptions]);

  const [singleModalOpen, setSingleModalOpen] = useState(false);
  const [singleForm, setSingleForm] = useState<SingleSessionForm>(() => buildSingleDefaults());
  const [singleError, setSingleError] = useState<string | null>(null);
  const [singleSubmitting, setSingleSubmitting] = useState(false);
  const canCreateSingle = classTypeOptions.length > 0 && instructorOptions.length > 0 && roomOptions.length > 0;

  const activeClass = useMemo(
    () => classes.find((row) => row.id === activeClassId) ?? null,
    [classes, activeClassId]
  );

  useEffect(() => {
    if (!activeClass) {
      setDetailState(null);
      setDetailMessage(null);
      setDetailError(null);
      return;
    }
    setDetailState({
      startDate: dayjs.utc(activeClass.startISO).format('YYYY-MM-DD'),
      startTime: dayjs.utc(activeClass.startISO).format('HH:mm'),
      instructorId: activeClass.instructorId ?? '',
      roomId: activeClass.roomId ?? '',
    });
    setDetailMessage(null);
    setDetailError(null);
  }, [activeClass]);

  useEffect(() => {
    if (singleModalOpen) {
      setSingleForm(buildSingleDefaults());
      setSingleError(null);
    }
  }, [singleModalOpen, buildSingleDefaults]);

  const filteredClasses = useMemo(() => {
    const dayFilter = dateFilter ? dayjs.utc(dateFilter) : null;
    const nowUtc = dayjs.utc();

    return classes.filter((row) => {
      if (courseFilter !== 'all' && row.courseId !== courseFilter) return false;

      const start = dayjs.utc(row.startISO);
      const end = dayjs.utc(row.endISO);

      if (dayFilter && !start.isSame(dayFilter, 'day')) return false;
      if (statusFilter === 'upcoming' && start.isBefore(nowUtc)) return false;
      if (statusFilter === 'past' && end.isAfter(nowUtc)) return false;
      return true;
    });
  }, [classes, courseFilter, dateFilter, statusFilter]);

  const toggleSelection = (sessionId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const openSingleModal = () => setSingleModalOpen(true);
  const closeSingleModal = () => {
    setSingleModalOpen(false);
    setSingleError(null);
  };

  const handleSingleChange =
    (field: keyof SingleSessionForm) =>
    (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const { value } = event.target;
      setSingleForm((prev) => ({ ...prev, [field]: value }));
    };

  const handleCreateSingleSession = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSingleError(null);

    if (!singleForm.classTypeId) {
      setSingleError('Selecciona un tipo de clase.');
      return;
    }
    if (!singleForm.instructorId) {
      setSingleError('Selecciona un instructor.');
      return;
    }
    if (!singleForm.roomId) {
      setSingleError('Selecciona un salon.');
      return;
    }
    if (!singleForm.date || !singleForm.startTime) {
      setSingleError('Fecha y hora son obligatorias.');
      return;
    }

    const durationMinutes = Number(singleForm.durationMinutes);
    const capacity = Number(singleForm.capacity);

    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      setSingleError('La duracion debe ser mayor a cero.');
      return;
    }
    if (!Number.isFinite(capacity) || capacity <= 0) {
      setSingleError('La capacidad debe ser mayor a cero.');
      return;
    }

    setSingleSubmitting(true);
    try {
      const response = await fetch('/api/classes/single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classTypeId: singleForm.classTypeId,
          instructorId: singleForm.instructorId,
          roomId: singleForm.roomId,
          date: singleForm.date,
          startTime: singleForm.startTime,
          durationMinutes,
          capacity,
        }),
      });

      const body = await response.json();
      if (!response.ok) {
        throw new Error(body?.error ?? 'No se pudo crear la sesion 1:1');
      }

      const created = body.session as SessionQueryRow;
      const start = dayjs.utc(created.start_time);
      const end = dayjs.utc(created.end_time);
      const duration = Math.max(end.diff(start, 'minute'), 1);

      const newRow: ClassRow = {
        id: created.id,
        courseId: created.course_id ?? null,
        courseTitle: created.courses?.title ?? 'Sesion 1:1',
        className: created.class_types?.name ?? 'Clase',
        classTypeId: created.class_type_id ?? null,
        instructorId: created.instructors?.id ?? null,
        instructor: created.instructors?.full_name ?? '-',
        roomId: created.rooms?.id ?? null,
        room: created.rooms?.name ?? '-',
        scheduleLabel: `${start.format('ddd DD MMM, HH:mm')} - ${end.format('HH:mm')}`,
        startISO: created.start_time,
        endISO: created.end_time,
        capacity: created.capacity ?? capacity,
        occupancy: created.current_occupancy ?? 0,
        durationMinutes: duration,
      };

      setClasses((prev) => sortClasses([...prev, newRow]));
      clearSelection();
      setActiveClassId(created.id);
      closeSingleModal();
    } catch (error) {
      setSingleError(error instanceof Error ? error.message : 'No se pudo crear la sesion 1:1');
    } finally {
      setSingleSubmitting(false);
    }
  };

  const handleDetailChange = (field: keyof DetailState) =>
    (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      if (!detailState) return;
      const value = event.target.value;
      setDetailState((prev) => (prev ? { ...prev, [field]: value } : prev));
    };

  const handleDetailSave = async () => {
    if (!activeClass || !detailState) return;
    setUpdatingDetail(true);
    setDetailMessage(null);
    setDetailError(null);

    try {
      const payload: Record<string, unknown> = {
        sessionId: activeClass.id,
        instructorId: detailState.instructorId || null,
        roomId: detailState.roomId || null,
      };

      const originalDate = dayjs.utc(activeClass.startISO).format('YYYY-MM-DD');
      const originalTime = dayjs.utc(activeClass.startISO).format('HH:mm');
      if (detailState.startDate !== originalDate) payload.date = detailState.startDate;
      if (detailState.startTime !== originalTime) payload.startTime = detailState.startTime;

      const response = await fetch('/api/classes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const body = await response.json();
      if (!response.ok) {
        throw new Error(body?.error ?? 'No se pudo actualizar la sesión');
      }

      const updated = body.session as SessionQueryRow;
      const start = dayjs.utc(updated.start_time);
      const end = dayjs.utc(updated.end_time);
      const durationMinutes = Math.max(end.diff(start, 'minute'), 1);

      setClasses((prev) =>
        sortClasses(
          prev.map((row) =>
            row.id === activeClass.id
              ? {
                  ...row,
                  instructor: updated.instructors?.full_name ?? row.instructor,
                  instructorId: updated.instructors?.id ?? row.instructorId,
                  room: updated.rooms?.name ?? row.room,
                  roomId: updated.rooms?.id ?? row.roomId,
                  startISO: updated.start_time,
                  endISO: updated.end_time,
                  scheduleLabel: `${start.format('ddd DD MMM, HH:mm')} - ${end.format('HH:mm')}`,
                  durationMinutes,
                }
              : row
          )
        )
      );

      setDetailMessage(body?.message ?? 'Sesión actualizada');
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : 'Error al actualizar la sesión');
    } finally {
      setUpdatingDetail(false);
    }
  };
  const handleBulkUpdate = async () => {
    setBulkError(null);
    setBulkMessage(null);
    if (selectedIds.size === 0) return;
    if (!bulkInstructorId && !bulkRoomId) {
      setBulkError('Selecciona un instructor o un salon para actualizar.');
      return;
    }

    setBulkProcessing(true);
    try {
      const response = await fetch('/api/classes/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          sessionIds: Array.from(selectedIds),
          instructorId: bulkInstructorId || null,
          roomId: bulkRoomId || null,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body?.error ?? 'No se pudieron actualizar las sesiones seleccionadas');
      }

      const updatedRows: SessionQueryRow[] = body.sessions ?? [];
      setClasses((prev) =>
        sortClasses(
          prev.map((row) => {
            const updated = updatedRows.find((item) => item.id === row.id);
            if (!updated) return row;
            return {
              ...row,
              instructor: updated.instructors?.full_name ?? row.instructor,
              instructorId: updated.instructors?.id ?? row.instructorId,
              room: updated.rooms?.name ?? row.room,
              roomId: updated.rooms?.id ?? row.roomId,
            };
          })
        )
      );

      setBulkMessage(body?.message ?? 'Sesiones actualizadas');
      clearSelection();
      setBulkInstructorId('');
      setBulkRoomId('');
    } catch (error) {
      setBulkError(error instanceof Error ? error.message : 'No se pudieron actualizar las sesiones');
    } finally {
      setBulkProcessing(false);
    }
  };

  const handleBulkReschedule = async () => {
    setBulkError(null);
    setBulkMessage(null);
    if (selectedIds.size === 0) return;
    if (!globalThis.confirm('Seguro que deseas enviar estas sesiones a reprogramacion? Esta accion las eliminara.')) {
      return;
    }

    setBulkProcessing(true);
    try {
      const response = await fetch('/api/classes/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reschedule', sessionIds: Array.from(selectedIds) }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body?.error ?? 'No se pudieron reprogramar las sesiones seleccionadas');
      }

      const removedIds: string[] = body.removedIds ?? [];
      if (removedIds.length > 0) {
        setClasses((prev) => prev.filter((row) => !removedIds.includes(row.id)));
      }
      if (removedIds.includes(activeClassId ?? '')) {
        setActiveClassId(null);
      }
      clearSelection();
      setBulkMessage(body?.message ?? 'Sesiones enviadas a reprogramacion');
    } catch (error) {
      setBulkError(error instanceof Error ? error.message : 'No se pudieron reprogramar las sesiones');
    } finally {
      setBulkProcessing(false);
    }
  };

  const renderStatusBadge = (row: ClassRow) => {
    const end = dayjs.utc(row.endISO);
    if (end.isBefore(dayjs.utc())) {
      return <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">Finalizada</span>;
    }
    if (row.occupancy >= row.capacity && row.capacity > 0) {
      return <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">Completa</span>;
    }
    return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">Disponible</span>;
  };

  const occupancyLocks = activeClass ? activeClass.occupancy > 0 : false;
  return (
    <AdminLayout title="Sesiones" active="classes">
      <Head>
        <title>PilatesTime Admin - Sesiones</title>
      </Head>
      {singleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 px-4 py-10">
          <div
            className="absolute inset-0"
            aria-hidden="true"
            onClick={closeSingleModal}
          />
          <div className="relative z-10 w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Programar sesión 1:1</h2>
                <p className="text-xs text-slate-500">Crea una sesión individual sin vincularla a un curso.</p>
              </div>
              <button
                type="button"
                onClick={closeSingleModal}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Cerrar"
              >
                <span className="material-icons-outlined text-xl" aria-hidden="true">
                  close
                </span>
              </button>
            </div>
            {canCreateSingle ? (
              <form onSubmit={handleCreateSingleSession} className="mt-4 space-y-4 text-sm">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-slate-600">Tipo de clase</span>
                    <select
                      value={singleForm.classTypeId}
                      onChange={handleSingleChange('classTypeId')}
                      className="rounded-md border border-slate-200 px-3 py-2"
                      required
                    >
                      <option value="">Selecciona</option>
                      {classTypeOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-slate-600">Instructor</span>
                    <select
                      value={singleForm.instructorId}
                      onChange={handleSingleChange('instructorId')}
                      className="rounded-md border border-slate-200 px-3 py-2"
                      required
                    >
                      <option value="">Selecciona</option>
                      {instructorOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.full_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-slate-600">Salón</span>
                    <select
                      value={singleForm.roomId}
                      onChange={handleSingleChange('roomId')}
                      className="rounded-md border border-slate-200 px-3 py-2"
                      required
                    >
                      <option value="">Selecciona</option>
                      {roomOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-slate-600">Fecha</span>
                    <input
                      type="date"
                      value={singleForm.date}
                      onChange={handleSingleChange('date')}
                      className="rounded-md border border-slate-200 px-3 py-2"
                      required
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-slate-600">Hora</span>
                    <input
                      type="time"
                      value={singleForm.startTime}
                      onChange={handleSingleChange('startTime')}
                      className="rounded-md border border-slate-200 px-3 py-2"
                      required
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-slate-600">Duración (minutos)</span>
                    <input
                      type="number"
                      min={15}
                      step={5}
                      value={singleForm.durationMinutes}
                      onChange={handleSingleChange('durationMinutes')}
                      className="rounded-md border border-slate-200 px-3 py-2"
                      required
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-slate-600">Capacidad</span>
                    <input
                      type="number"
                      min={1}
                      value={singleForm.capacity}
                      onChange={handleSingleChange('capacity')}
                      className="rounded-md border border-slate-200 px-3 py-2"
                      required
                    />
                  </label>
                </div>
                <p className="text-xs text-slate-500">
                  Las sesiones 1:1 se crean sin curso asociado. Podrás gestionar reservas y ajustes desde esta misma pantalla.
                </p>
                {singleError && (
                  <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600">
                    {singleError}
                  </p>
                )}
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={closeSingleModal}
                    className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={singleSubmitting}
                    className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="material-icons-outlined text-base" aria-hidden="true">
                      {singleSubmitting ? 'hourglass_top' : 'check_circle'}
                    </span>
                    {singleSubmitting ? 'Guardando…' : 'Crear sesión'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
                Para programar una sesión 1:1 necesitas tener al menos un tipo de clase, un instructor y un salón registrados.
              </div>
            )}
          </div>
        </div>
      )}
      <div className="mx-auto grid max-w-full grid-cols-1 gap-8 xl:grid-cols-3">
        <section className="space-y-4 xl:col-span-2">
          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Sesiones programadas</h2>
                <p className="text-xs text-slate-500">Gestiona sesiones de cursos y sesiones 1:1 programadas.</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={courseFilter}
                  onChange={(event) => setCourseFilter(event.target.value)}
                  className="h-9 rounded-md border border-slate-200 px-3 text-sm"
                >
                  <option value="all">Todos los cursos</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.title}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={dateFilter}
                  onChange={(event) => setDateFilter(event.target.value)}
                  className="h-9 rounded-md border border-slate-200 px-3 text-sm"
                />
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
                  className="h-9 rounded-md border border-slate-200 px-3 text-sm"
                >
                  <option value="all">Todas</option>
                  <option value="upcoming">Proximas</option>
                  <option value="past">Finalizadas</option>
                </select>
                <button
                  type="button"
                  onClick={openSingleModal}
                  className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold shadow-sm transition ${
                    canCreateSingle
                      ? 'bg-brand-600 text-white hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500'
                      : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  <span className="material-icons-outlined text-base" aria-hidden="true">
                    person_add_alt_1
                  </span>
                  Programar 1:1
                </button>
              </div>
            </div>

            {selectedIds.size > 0 && (
              <div className="mb-4 flex flex-col gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{selectedIds.size} sesiones seleccionadas</span>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="text-xs text-brand-600 underline"
                  >
                    Limpiar seleccion
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={bulkInstructorId}
                    onChange={(event) => setBulkInstructorId(event.target.value)}
                    className="h-9 rounded-md border border-slate-200 px-3 text-sm"
                  >
                    <option value="">Instructores...</option>
                    {instructorOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.full_name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={bulkRoomId}
                    onChange={(event) => setBulkRoomId(event.target.value)}
                    className="h-9 rounded-md border border-slate-200 px-3 text-sm"
                  >
                    <option value="">Salones...</option>
                    {roomOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleBulkUpdate}
                    disabled={bulkProcessing}
                    className="rounded-md bg-brand-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {bulkProcessing ? 'Aplicando...' : 'Actualizar sala o instructor'}
                  </button>
                  <button
                    type="button"
                    onClick={handleBulkReschedule}
                    disabled={bulkProcessing}
                    className="rounded-md border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                  >
                    {bulkProcessing ? 'Procesando...' : 'Enviar a reprogramacion'}
                  </button>
                </div>
                {(bulkError || bulkMessage) && (
                  <div className={`text-xs ${bulkError ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {bulkError ?? bulkMessage}
                  </div>
                )}
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.size > 0 && filteredClasses.every((row) => selectedIds.has(row.id))}
                        onChange={(event) => {
                          if (event.target.checked) {
                            const next = new Set(selectedIds);
                            filteredClasses.forEach((row) => next.add(row.id));
                            setSelectedIds(next);
                          } else {
                            const next = new Set(selectedIds);
                            filteredClasses.forEach((row) => next.delete(row.id));
                            setSelectedIds(next);
                          }
                        }}
                      />
                    </th>
                    <th className="px-4 py-3">Curso</th>
                    <th className="px-4 py-3">Sesión</th>
                    <th className="px-4 py-3">Horario</th>
                    <th className="px-4 py-3">Cupo</th>
                    <th className="px-4 py-3">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClasses.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-6 text-center text-sm text-slate-500">
                        No hay sesiones que coincidan con los filtros.
                      </td>
                    </tr>
                  ) : (
                    filteredClasses.map((row) => {
                      const isSelected = selectedIds.has(row.id);
                      const isActive = row.id === activeClassId;
                      const occupancyLabel = `${row.occupancy}/${row.capacity}`;
                      return (
                        <tr
                          key={row.id}
                          className={`border-b border-slate-200 transition-colors ${
                            isActive ? 'bg-brand-50' : 'hover:bg-slate-50'
                          }`}
                          onClick={() => setActiveClassId(row.id)}
                        >
                          <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelection(row.id)}
                            />
                          </td>
                          <td className="px-4 py-3 text-slate-700">{row.courseTitle}</td>
                          <td className="px-4 py-3 font-medium text-slate-800">
                            <div>{row.className}</div>
                            <div className="text-xs text-slate-500">
                              {row.instructor} - {row.room}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-700">{row.scheduleLabel}</td>
                          <td className="px-4 py-3 text-slate-700">{occupancyLabel}</td>
                          <td className="px-4 py-3">{renderStatusBadge(row)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-xl font-semibold">Detalles de la sesión</h3>
            {activeClass && detailState ? (
              <div className="mt-4 space-y-4 text-sm">
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <div className="font-semibold text-slate-800">{activeClass.courseTitle}</div>
                  <div className="text-xs text-slate-500">
                    {dayjs.utc(activeClass.startISO).format('dddd DD MMM YYYY')} - {activeClass.className}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                    <span>Duracion: {activeClass.durationMinutes} min</span>
                    <span>
                      Cupo: {activeClass.occupancy}/{activeClass.capacity}
                      {activeClass.occupancy > 0 ? ' (con reservaciones)' : ''}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600">Instructor</label>
                    <select
                      value={detailState.instructorId}
                      onChange={handleDetailChange('instructorId')}
                      className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    >
                      <option value="">Sin instructor</option>
                      {instructorOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.full_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600">Salon</label>
                    <select
                      value={detailState.roomId}
                      onChange={handleDetailChange('roomId')}
                      className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                      disabled={occupancyLocks}
                    >
                      <option value="">Sin salon asignado</option>
                      {roomOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                    {occupancyLocks && (
                      <p className="mt-1 text-xs text-amber-600">Con reservaciones activas no puedes cambiar el salon.</p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600">Fecha</label>
                      <input
                        type="date"
                        value={detailState.startDate}
                        onChange={handleDetailChange('startDate')}
                        className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                        disabled={occupancyLocks}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600">Hora</label>
                      <input
                        type="time"
                        value={detailState.startTime}
                        onChange={handleDetailChange('startTime')}
                        className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                        disabled={occupancyLocks}
                      />
                    </div>
                  </div>
                </div>

                {detailMessage && <div className="text-xs text-emerald-600">{detailMessage}</div>}
                {detailError && <div className="text-xs text-rose-600">{detailError}</div>}

                <button
                  type="button"
                  onClick={handleDetailSave}
                  disabled={updatingDetail}
                  className="w-full rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {updatingDetail ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">Selecciona una sesión en el listado para editarla.</p>
            )}
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}






