import Head from "next/head";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import AdminLayout from "@/components/admin/AdminLayout";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Tables } from "@/types/database";

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
};

type DetailState = {
  startDate: string;
  startTime: string;
  instructorId: string;
  roomId: string;
};

const sortClasses = (rows: ClassRow[]) =>
  [...rows].sort((a, b) => dayjs(a.startISO).valueOf() - dayjs(b.startISO).valueOf());

export const getServerSideProps: GetServerSideProps<PageProps> = async () => {
  const [sessionsResp, coursesResp, instructorsResp, roomsResp] = await Promise.all([
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
  ]);

  const sessionRows = (sessionsResp.data ?? []) as SessionQueryRow[];
  const courseRows = (coursesResp.data ?? []) as CourseQueryRow[];

  const initialClasses: ClassRow[] = sortClasses(
    sessionRows.map((row) => {
      const start = dayjs(row.start_time);
      const end = dayjs(row.end_time);
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

  return {
    props: {
      initialClasses,
      courses,
      instructors,
      rooms,
    },
  };
};
export default function AdminClassesPage({
  initialClasses,
  courses,
  instructors,
  rooms,
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
      startDate: dayjs(activeClass.startISO).format('YYYY-MM-DD'),
      startTime: dayjs(activeClass.startISO).format('HH:mm'),
      instructorId: activeClass.instructorId ?? '',
      roomId: activeClass.roomId ?? '',
    });
    setDetailMessage(null);
    setDetailError(null);
  }, [activeClass]);

  const filteredClasses = useMemo(() => {
    const dayFilter = dayjs(dateFilter || undefined);
    const hasDateFilter = Boolean(dateFilter && dayFilter.isValid());
    return classes.filter((row) => {
      if (courseFilter !== 'all' && row.courseId !== courseFilter) return false;
      if (hasDateFilter && !dayjs(row.startISO).isSame(dayFilter, 'day')) return false;
      if (statusFilter === 'upcoming' && dayjs(row.startISO).isBefore(dayjs())) return false;
      if (statusFilter === 'past' && dayjs(row.endISO).isAfter(dayjs())) return false;
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

      const originalDate = dayjs(activeClass.startISO).format('YYYY-MM-DD');
      const originalTime = dayjs(activeClass.startISO).format('HH:mm');
      if (detailState.startDate !== originalDate) payload.date = detailState.startDate;
      if (detailState.startTime !== originalTime) payload.startTime = detailState.startTime;

      const response = await fetch('/api/admin/classes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const body = await response.json();
      if (!response.ok) {
        throw new Error(body?.error ?? 'No se pudo actualizar la clase');
      }

      const updated = body.session as SessionQueryRow;
      const start = dayjs(updated.start_time);
      const end = dayjs(updated.end_time);
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

      setDetailMessage(body?.message ?? 'Clase actualizada');
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : 'Error al actualizar la clase');
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
      const response = await fetch('/api/admin/classes/bulk', {
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
        throw new Error(body?.error ?? 'No se pudieron actualizar las clases seleccionadas');
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

      setBulkMessage(body?.message ?? 'Clases actualizadas');
      clearSelection();
      setBulkInstructorId('');
      setBulkRoomId('');
    } catch (error) {
      setBulkError(error instanceof Error ? error.message : 'No se pudieron actualizar las clases');
    } finally {
      setBulkProcessing(false);
    }
  };

  const handleBulkReschedule = async () => {
    setBulkError(null);
    setBulkMessage(null);
    if (selectedIds.size === 0) return;
    if (!globalThis.confirm('Seguro que deseas enviar estas clases a reprogramacion? Esta accion las eliminara.')) {
      return;
    }

    setBulkProcessing(true);
    try {
      const response = await fetch('/api/admin/classes/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reschedule', sessionIds: Array.from(selectedIds) }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body?.error ?? 'No se pudieron reprogramar las clases seleccionadas');
      }

      const removedIds: string[] = body.removedIds ?? [];
      if (removedIds.length > 0) {
        setClasses((prev) => prev.filter((row) => !removedIds.includes(row.id)));
      }
      if (removedIds.includes(activeClassId ?? '')) {
        setActiveClassId(null);
      }
      clearSelection();
      setBulkMessage(body?.message ?? 'Clases enviadas a reprogramacion');
    } catch (error) {
      setBulkError(error instanceof Error ? error.message : 'No se pudieron reprogramar las clases');
    } finally {
      setBulkProcessing(false);
    }
  };

  const renderStatusBadge = (row: ClassRow) => {
    const end = dayjs(row.endISO);
    if (end.isBefore(dayjs())) {
      return <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">Finalizada</span>;
    }
    if (row.occupancy >= row.capacity && row.capacity > 0) {
      return <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">Completa</span>;
    }
    return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">Disponible</span>;
  };

  const occupancyLocks = activeClass ? activeClass.occupancy > 0 : false;
  return (
    <AdminLayout title="Clases" active="classes">
      <Head>
        <title>PilatesTime Admin - Clases</title>
      </Head>
      <div className="mx-auto grid max-w-full grid-cols-1 gap-8 xl:grid-cols-3">
        <section className="space-y-4 xl:col-span-2">
          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Clases programadas</h2>
                <p className="text-xs text-slate-500">Cada clase esta vinculada a un curso especifico.</p>
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
              </div>
            </div>

            {selectedIds.size > 0 && (
              <div className="mb-4 flex flex-col gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{selectedIds.size} clases seleccionadas</span>
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
                    <th className="px-4 py-3">Clase</th>
                    <th className="px-4 py-3">Horario</th>
                    <th className="px-4 py-3">Cupo</th>
                    <th className="px-4 py-3">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClasses.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-6 text-center text-sm text-slate-500">
                        No hay clases que coincidan con los filtros.
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
            <h3 className="text-xl font-semibold">Detalles de la clase</h3>
            {activeClass && detailState ? (
              <div className="mt-4 space-y-4 text-sm">
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <div className="font-semibold text-slate-800">{activeClass.courseTitle}</div>
                  <div className="text-xs text-slate-500">
                    {dayjs(activeClass.startISO).format('dddd DD MMM YYYY')} - {activeClass.className}
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
              <p className="mt-4 text-sm text-slate-500">Selecciona una clase en el listado para editarla.</p>
            )}
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}
