import Head from "next/head";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import AdminLayout from "@/components/admin/AdminLayout";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Tables } from "@/types/database";

type ClassTypeOption = { id: string; name: string; description?: string | null };
type InstructorOption = { id: string; full_name: string; bio?: string | null };
type RoomOption = { id: string; name: string; capacity?: number | null };

type SessionQueryRow = Tables<"sessions"> & {
  class_types: Pick<Tables<"class_types">, "name"> | null;
  instructors: Pick<Tables<"instructors">, "full_name"> | null;
  rooms: Pick<Tables<"rooms">, "name"> | null;
};

type ClassRow = {
  id: string;
  className: string;
  instructor: string;
  room: string;
  scheduleLabel: string;
  startISO: string;
  endISO: string;
  capacity: number;
  occupancy: number;
};

type PageProps = {
  initialClasses: ClassRow[];
  classTypes: ClassTypeOption[];
  instructors: InstructorOption[];
  rooms: RoomOption[];
};

type FormState = {
  classTypeId: string;
  classTypeName: string;
  classDescription: string;
  instructorId: string;
  instructorName: string;
  instructorBio: string;
  roomId: string;
  roomName: string;
  roomCapacity: string;
  capacity: string;
  date: string;
  startTime: string;
  durationMinutes: string;
  price: string;
  visibility: "public" | "private";
  tags: string;
  notes: string;
};

const DEFAULT_FORM: FormState = {
  classTypeId: "",
  classTypeName: "",
  classDescription: "",
  instructorId: "",
  instructorName: "",
  instructorBio: "",
  roomId: "",
  roomName: "",
  roomCapacity: "",
  capacity: "10",
  date: dayjs().format("YYYY-MM-DD"),
  startTime: "09:00",
  durationMinutes: "60",
  price: "",
  visibility: "public",
  tags: "",
  notes: "",
};

export const getServerSideProps: GetServerSideProps<PageProps> = async () => {
  const [sessionsResp, classTypesResp, instructorsResp, roomsResp] = await Promise.all([
    supabaseAdmin
      .from("sessions")
      .select(
        "id, start_time, end_time, capacity, current_occupancy, class_types(name), instructors(full_name), rooms(name)"
      )
      .returns<SessionQueryRow[]>()
      .order("start_time", { ascending: true })
      .limit(100),
    supabaseAdmin.from("class_types").select("id, name, description").order("name"),
    supabaseAdmin.from("instructors").select("id, full_name, bio").order("full_name"),
    supabaseAdmin.from("rooms").select("id, name, capacity").order("name"),
  ]);

  const sessionRows: SessionQueryRow[] = sessionsResp.data ?? [];
  const initialClasses: ClassRow[] = sessionRows.map((row) => {
    const start = dayjs(row.start_time);
    const end = dayjs(row.end_time);
    const scheduleLabel = `${start.format("ddd DD MMM, HH:mm")} - ${end.format("HH:mm")}`;
    return {
      id: row.id,
      className: row.class_types?.name ?? "Clase",
      instructor: row.instructors?.full_name ?? "-",
      room: row.rooms?.name ?? "-",
      scheduleLabel,
      startISO: row.start_time,
      endISO: row.end_time,
      capacity: row.capacity ?? 0,
      occupancy: row.current_occupancy ?? 0,
    };
  });

  const classTypes: ClassTypeOption[] = (classTypesResp.data ?? []).map(({ id, name, description }) => ({
    id,
    name,
    description: description ?? null,
  }));
  const instructors: InstructorOption[] = (instructorsResp.data ?? []).map(({ id, full_name, bio }) => ({
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
      classTypes,
      instructors,
      rooms,
    },
  };
};

export default function AdminClassesPage({ initialClasses, classTypes, instructors, rooms }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [classes, setClasses] = useState<ClassRow[]>(initialClasses);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "upcoming" | "past">("all");
  const [formState, setFormState] = useState<FormState>(DEFAULT_FORM);
  const [creating, setCreating] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [classTypeOptions, setClassTypeOptions] = useState(classTypes);
  const [instructorOptions, setInstructorOptions] = useState(instructors);
  const [roomOptions, setRoomOptions] = useState(rooms);

  const filteredClasses = useMemo(() => {
    const term = search.trim().toLowerCase();
    const now = dayjs();
    return classes.filter((row) => {
      if (term) {
        const haystack = `${row.className} ${row.instructor} ${row.room}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      if (statusFilter === "upcoming" && dayjs(row.startISO).isBefore(now)) return false;
      if (statusFilter === "past" && dayjs(row.endISO).isAfter(now)) return false;
      return true;
    });
  }, [classes, search, statusFilter]);

  const handleFormChange = (field: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const value = event.target.value;
    setFormState((prev) => ({ ...prev, [field]: value }));
  };

  const resetForm = () => {
    setFormState({ ...DEFAULT_FORM });
    setFormMessage(null);
    setFormError(null);
  };

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreating(true);
    setFormMessage(null);
    setFormError(null);

    try {
      const payload = {
        classTypeId: formState.classTypeId || null,
        classTypeName: formState.classTypeName || null,
        classDescription: formState.classDescription || null,
        instructorId: formState.instructorId || null,
        instructorName: formState.instructorName || null,
        instructorBio: formState.instructorBio || null,
        roomId: formState.roomId || null,
        roomName: formState.roomName || null,
        roomCapacity: formState.roomCapacity || null,
        capacity: Number(formState.capacity || 0),
        date: formState.date,
        startTime: formState.startTime,
        durationMinutes: Number(formState.durationMinutes || 60),
        visibility: formState.visibility,
        tags: formState.tags,
        notes: formState.notes,
        price: formState.price,
      };

      if (!payload.classTypeId && !payload.classTypeName) {
        throw new Error("Selecciona o crea un tipo de clase.");
      }
      if (!payload.instructorId && !payload.instructorName) {
        throw new Error("Selecciona o crea un instructor.");
      }
      if (!payload.roomId && !payload.roomName) {
        throw new Error("Selecciona o crea un salón.");
      }
      if (!payload.date || !payload.startTime) {
        throw new Error("Define fecha y hora de inicio.");
      }
      if (!payload.capacity || payload.capacity <= 0) {
        throw new Error("Define una capacidad mayor a cero.");
      }

      const res = await fetch("/api/admin/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "No se pudo crear la clase");
      }

      const body = (await res.json()) as {
        message: string;
        session: any;
        classType?: ClassTypeOption;
        instructor?: InstructorOption;
        room?: RoomOption;
      };

      const sessionRow = body.session;
      const newClass: ClassRow = {
        id: sessionRow.id,
        className: sessionRow.class_types?.name ?? "Clase",
        instructor: sessionRow.instructors?.full_name ?? "-",
        room: sessionRow.rooms?.name ?? "-",
        scheduleLabel: `${dayjs(sessionRow.start_time).format("ddd DD MMM, HH:mm")} - ${dayjs(sessionRow.end_time).format("HH:mm")}`,
        startISO: sessionRow.start_time,
        endISO: sessionRow.end_time,
        capacity: sessionRow.capacity ?? 0,
        occupancy: sessionRow.current_occupancy ?? 0,
      };

      setClasses((prev) => [newClass, ...prev]);

      if (body.classType) {
        setClassTypeOptions((prev) => {
          if (prev.some((c) => c.id === body.classType?.id)) return prev;
          return [...prev, body.classType!].sort((a, b) => a.name.localeCompare(b.name, "es") );
        });
      }
      if (body.instructor) {
        setInstructorOptions((prev) => {
          if (prev.some((i) => i.id === body.instructor?.id)) return prev;
          return [...prev, body.instructor!].sort((a, b) => a.full_name.localeCompare(b.full_name, "es") );
        });
      }
      if (body.room) {
        setRoomOptions((prev) => {
          if (prev.some((r) => r.id === body.room?.id)) return prev;
          return [...prev, body.room!].sort((a, b) => a.name.localeCompare(b.name, "es") );
        });
      }

      setFormMessage(body.message || "Clase creada correctamente.");
      resetForm();
    } catch (error: any) {
      setFormError(error?.message || "No se pudo crear la clase");
    } finally {
      setCreating(false);
    }
  };

  const now = dayjs();

  const renderStatusBadge = (row: ClassRow) => {
    const start = dayjs(row.startISO);
    const end = dayjs(row.endISO);
    if (end.isBefore(now)) {
      return <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">Finalizada</span>;
    }
    if (row.occupancy >= row.capacity && row.capacity > 0) {
      return <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">Full</span>;
    }
    return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">Disponible</span>;
  };

  const headerToolbar = (
    <div className="flex items-center gap-4">
      <div className="relative hidden lg:block">
        <span className="material-icons-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
        <input
          type="search"
          placeholder="Buscar clases..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10 w-64 rounded-md border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
        />
      </div>
      <button className="rounded-full p-2 hover:bg-slate-100" type="button" aria-label="Notificaciones">
        <span className="material-icons-outlined text-slate-500">notifications</span>
      </button>
      <img src="/angie.jpg" alt="Usuario" className="h-9 w-9 rounded-full object-cover" />
    </div>
  );

  return (
    <AdminLayout title="Classes" active="classes" headerToolbar={headerToolbar}>
      <Head>
        <title>PilatesTime Admin - Classes</title>
      </Head>
      <div className="mx-auto grid max-w-full grid-cols-1 gap-8 xl:grid-cols-3">
        <section className="xl:col-span-2 space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <h2 className="text-lg font-semibold">Clases programadas</h2>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs font-medium text-slate-500">Estado:</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                  className="h-9 rounded-md border border-slate-200 px-3 text-sm"
                >
                  <option value="all">Todas</option>
                  <option value="upcoming">Próximas</option>
                  <option value="past">Finalizadas</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-6 py-3">Clase</th>
                    <th className="px-6 py-3">Instructor</th>
                    <th className="px-6 py-3">Horario</th>
                    <th className="px-6 py-3">Cupo</th>
                    <th className="px-6 py-3">Estado</th>
                    <th className="px-6 py-3 text-right">Acciones</th>
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
                      const spots = `${row.occupancy}/${row.capacity}`;
                      return (
                        <tr key={row.id} className="border-b border-slate-200 hover:bg-slate-50">
                          <td className="px-6 py-4 font-medium text-slate-800">
                            <div>{row.className}</div>
                            <div className="text-xs text-slate-500">{row.room}</div>
                          </td>
                          <td className="px-6 py-4 text-slate-700">{row.instructor}</td>
                          <td className="px-6 py-4 text-slate-700">{row.scheduleLabel}</td>
                          <td className="px-6 py-4 text-slate-700">{spots}</td>
                          <td className="px-6 py-4">{renderStatusBadge(row)}</td>
                          <td className="px-6 py-4">
                            <div className="flex justify-end gap-2 text-slate-400">
                              <button type="button" className="rounded-full p-1.5 hover:text-brand-600" title="Ver detalles">
                                <span className="material-icons-outlined text-base">visibility</span>
                              </button>
                              <button type="button" className="rounded-full p-1.5 hover:text-brand-600" title="Editar">
                                <span className="material-icons-outlined text-base">edit</span>
                              </button>
                              <button type="button" className="rounded-full p-1.5 hover:text-rose-600" title="Eliminar">
                                <span className="material-icons-outlined text-base">delete</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-xs text-slate-500">
              * Próximamente: acciones de edición, duplicado y exportación conectadas al backend.
            </p>
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold">Crear nueva clase</h2>
            <p className="mt-1 text-xs text-slate-500">
              Los campos de precio, visibilidad y etiquetas quedarán pendientes hasta habilitar soporte en la base de datos.
            </p>
            <form className="mt-4 space-y-4" onSubmit={handleCreate}>
              <div>
                <label className="block text-sm font-medium text-slate-700">Tipo de clase</label>
                <select
                  value={formState.classTypeId}
                  onChange={handleFormChange("classTypeId")}
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">Crear nueva…</option>
                  {classTypeOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
                {!formState.classTypeId && (
                  <div className="mt-2 space-y-2">
                    <input
                      type="text"
                      value={formState.classTypeName}
                      onChange={handleFormChange("classTypeName")}
                      placeholder="Nombre del nuevo tipo de clase"
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    />
                    <textarea
                      value={formState.classDescription}
                      onChange={handleFormChange("classDescription")}
                      placeholder="Descripción breve (opcional)"
                      rows={2}
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Instructor</label>
                <select
                  value={formState.instructorId}
                  onChange={handleFormChange("instructorId")}
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">Crear nuevo…</option>
                  {instructorOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.full_name}
                    </option>
                  ))}
                </select>
                {!formState.instructorId && (
                  <div className="mt-2 space-y-2">
                    <input
                      type="text"
                      value={formState.instructorName}
                      onChange={handleFormChange("instructorName")}
                      placeholder="Nombre del instructor"
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    />
                    <textarea
                      value={formState.instructorBio}
                      onChange={handleFormChange("instructorBio")}
                      placeholder="Bio (opcional)"
                      rows={2}
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Salón</label>
                  <select
                    value={formState.roomId}
                    onChange={handleFormChange("roomId")}
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="">Crear nuevo…</option>
                    {roomOptions.map((room) => (
                      <option key={room.id} value={room.id}>
                        {room.name}
                      </option>
                    ))}
                  </select>
                  {!formState.roomId && (
                    <div className="mt-2 space-y-2">
                      <input
                        type="text"
                        value={formState.roomName}
                        onChange={handleFormChange("roomName")}
                        placeholder="Nombre del salón"
                        className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                      />
                      <input
                        type="number"
                        value={formState.roomCapacity}
                        onChange={handleFormChange("roomCapacity")}
                        placeholder="Capacidad referencial"
                        className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                      />
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Capacidad</label>
                  <input
                    type="number"
                    min={1}
                    value={formState.capacity}
                    onChange={handleFormChange("capacity")}
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Fecha</label>
                  <input
                    type="date"
                    value={formState.date}
                    onChange={handleFormChange("date")}
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Hora inicio</label>
                  <input
                    type="time"
                    value={formState.startTime}
                    onChange={handleFormChange("startTime")}
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Duración (min)</label>
                  <input
                    type="number"
                    min={15}
                    step={15}
                    value={formState.durationMinutes}
                    onChange={handleFormChange("durationMinutes")}
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Precio*</label>
                  <input
                    type="number"
                    min={0}
                    placeholder="Pendiente de BE"
                    value={formState.price}
                    onChange={handleFormChange("price")}
                    className="mt-1 w-full rounded-md border border-dashed border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Visibilidad*</label>
                  <select
                    value={formState.visibility}
                    onChange={handleFormChange("visibility")}
                    className="mt-1 w-full rounded-md border border-dashed border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="public">Public</option>
                    <option value="private">Private</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Etiquetas*</label>
                <input
                  type="text"
                  placeholder="e.g. beginner, reformer"
                  value={formState.tags}
                  onChange={handleFormChange("tags")}
                  className="mt-1 w-full rounded-md border border-dashed border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Notas internas</label>
                <textarea
                  rows={2}
                  value={formState.notes}
                  onChange={handleFormChange("notes")}
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                />
              </div>

              {formMessage && <p className="text-sm text-emerald-600">{formMessage}</p>}
              {formError && <p className="text-sm text-rose-600">{formError}</p>}

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={creating}
                  className="w-full rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {creating ? "Creando…" : "Crear clase"}
                </button>
              </div>
            </form>
          </div>

          <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 text-xs text-indigo-800">
            <h3 className="mb-2 text-sm font-semibold text-indigo-900">Nota sobre campos pendientes</h3>
            <p>
              Los campos marcados con * (precio, visibilidad, etiquetas) se conservarán a nivel de interfaz, pero aún no se
              persisten en la base de datos. En cuanto se habilite soporte en Supabase, conectaremos estos valores.
            </p>
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}
