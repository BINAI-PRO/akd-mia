// pages/admin/planeacion/instructores.tsx
// Encoding: UTF-8

import * as React from "react";
import Head from "next/head";
import AdminLayout from "@/components/admin/AdminLayout";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  DAY_KEYS,
  DAY_LABELS,
  cloneOverrideWeek,
  cloneWeek,
  createEmptyWeek,
  groupOverridesByInstructor,
  groupWeeklyByInstructor,
  normalizeWeek,
  weekKeyFromStartDate,
  weekStartDateFromKey,
  type AvailabilityRange,
  type DayKey,
  type InstructorAvailability,
  type OverrideRowWithSlots,
  type OverrideWeek,
  type WeeklyAvailability,
} from "@/lib/instructor-availability";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import type { Database } from "@/types/database";

type CT = Database["public"]["Tables"]["class_types"]["Row"];
type InstructorRow = Database["public"]["Tables"]["instructors"]["Row"];
type PivotRow = Database["public"]["Tables"]["instructor_class_types"]["Row"];
type WeeklyRow = Database["public"]["Tables"]["instructor_weekly_availability"]["Row"];

type InstructorVM = {
  id: string;
  fullName: string;
  email: string | null;
  phone1: string | null;
  phone2: string | null;
  phone1HasWhatsapp: boolean;
  phone2HasWhatsapp: boolean;
  classTypeIds: string[];
  availability: InstructorAvailability;
};

type PageProps = { instructors: InstructorVM[]; classTypes: CT[] };

const DEFAULT_TIME_RANGE: AvailabilityRange = { start: "08:00", end: "09:00" };

const makeDefaultRange = (): AvailabilityRange => ({ ...DEFAULT_TIME_RANGE });

const sortRangesByStart = (ranges: AvailabilityRange[]) =>
  [...ranges].sort((a, b) => a.start.localeCompare(b.start));

const sortOverrideWeeks = (list: OverrideWeek[]) =>
  [...list].sort((a, b) => a.weekStartDate.localeCompare(b.weekStartDate));

export const getServerSideProps: GetServerSideProps<PageProps> = async () => {
  const { data: instructorsRaw, error: e1 } = await supabaseAdmin
    .from("instructors")
    .select("id, full_name, email, phone1, phone2, phone1_has_whatsapp, phone2_has_whatsapp")
    .returns<InstructorRow[]>();
  if (e1) throw e1;

  const { data: classTypes, error: e2 } = await supabaseAdmin
    .from("class_types")
    .select("id, name, description")
    .order("name")
    .returns<CT[]>();
  if (e2) throw e2;

  const { data: pivots, error: e3 } = await supabaseAdmin
    .from("instructor_class_types")
    .select("instructor_id, class_type_id, certified, certified_at, notes")
    .returns<PivotRow[]>();
  if (e3) throw e3;

  const { data: weeklyRows, error: e4 } = await supabaseAdmin
    .from("instructor_weekly_availability")
    .select("id, instructor_id, weekday, start_time, end_time")
    .returns<WeeklyRow[]>();
  if (e4) throw e4;

  const { data: overrideRows, error: e5 } = await supabaseAdmin
    .from("instructor_week_overrides")
    .select("id, instructor_id, week_start_date, label, notes, instructor_week_override_slots ( id, weekday, start_time, end_time )")
    .returns<OverrideRowWithSlots[]>();
  if (e5) throw e5;

  const classTypesMap = new Map<string, string[]>();
  (pivots ?? []).forEach((p) => {
    const arr = classTypesMap.get(p.instructor_id) ?? [];
    arr.push(p.class_type_id);
    classTypesMap.set(p.instructor_id, arr);
  });

  const weeklyByInstructor = groupWeeklyByInstructor(weeklyRows);
  const overridesByInstructor = groupOverridesByInstructor(overrideRows);

  const instructors: InstructorVM[] = (instructorsRaw ?? []).map((r) => {
    const weekly = weeklyByInstructor.get(r.id);
    const overrideList = overridesByInstructor.get(r.id) ?? [];
    return {
      id: r.id,
      fullName: r.full_name,
      email: r.email ?? null,
      phone1: r.phone1 ?? null,
      phone2: r.phone2 ?? null,
      phone1HasWhatsapp: !!r.phone1_has_whatsapp,
      phone2HasWhatsapp: !!r.phone2_has_whatsapp,
      classTypeIds: classTypesMap.get(r.id) ?? [],
      availability: {
        weekly: weekly ? cloneWeek(weekly) : createEmptyWeek(),
        overrides: overrideList.map((ov) => cloneOverrideWeek(ov)),
      },
    };
  });

  return { props: { instructors, classTypes: classTypes ?? [] } };
};

const splitName = (full: string) => {
  const parts = (full || "").trim().split(/\s+/);
  if (parts.length <= 1) return { first: parts[0] ?? "", last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
};
export default function InstructorsPage({
  instructors: initial,
  classTypes,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [instructors, setInstructors] = React.useState<InstructorVM[]>(initial);
  const [selectedId, setSelectedId] = React.useState<string | null>(initial[0]?.id ?? null);
  const selected = React.useMemo(
    () => instructors.find((i) => i.id === selectedId) ?? null,
    [instructors, selectedId]
  );

  // Form state
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone1, setPhone1] = React.useState("");
  const [phone2, setPhone2] = React.useState("");
  const [wa1, setWa1] = React.useState(false);
  const [wa2, setWa2] = React.useState(false);
  const [classTypeIds, setClassTypeIds] = React.useState<string[]>([]);
  const [weeklyAvailability, setWeeklyAvailability] = React.useState<WeeklyAvailability>(createEmptyWeek());
  const [overrideWeeks, setOverrideWeeks] = React.useState<OverrideWeek[]>([]);
  const [activeScheduleTab, setActiveScheduleTab] = React.useState<"typical" | "atypical">("typical");
  const [pendingWeekKey, setPendingWeekKey] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState<{ t: "ok" | "err"; m: string } | null>(null);

  const weekStartFormatter = React.useMemo(
    () => new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short" }),
    []
  );

  const formatWeekStart = React.useCallback(
    (iso: string) => {
      if (!iso) return "Sin fecha";
      const date = new Date(`${iso}T00:00:00`);
      if (Number.isNaN(date.getTime())) return iso;
      return weekStartFormatter.format(date);
    },
    [weekStartFormatter]
  );

  const addTypicalRange = (day: DayKey) => {
    setWeeklyAvailability((prev) => {
      const next = cloneWeek(prev);
      next[day] = sortRangesByStart([...next[day], makeDefaultRange()]);
      return next;
    });
  };

  const updateTypicalRange = (day: DayKey, index: number, field: "start" | "end", value: string) => {
    setWeeklyAvailability((prev) => {
      const next = cloneWeek(prev);
      const ranges = [...next[day]];
      ranges[index] = { ...ranges[index], [field]: value };
      next[day] = sortRangesByStart(ranges);
      return next;
    });
  };

  const removeTypicalRange = (day: DayKey, index: number) => {
    setWeeklyAvailability((prev) => {
      const next = cloneWeek(prev);
      next[day] = next[day].filter((_, idx) => idx !== index);
      return next;
    });
  };

  const handleAddOverrideWeek = () => {
    if (!pendingWeekKey) {
      setMsg({ t: "err", m: "Selecciona una semana" });
      return;
    }
    const weekStart = weekStartDateFromKey(pendingWeekKey);
    if (!weekStart) {
      setMsg({ t: "err", m: "Semana invalida" });
      return;
    }
    if (overrideWeeks.some((week) => week.weekKey === pendingWeekKey)) {
      setMsg({ t: "err", m: "Esa semana ya esta definida" });
      return;
    }
    setOverrideWeeks((prev) => {
      const next = [...prev, {
        id: null,
        weekKey: pendingWeekKey,
        weekStartDate: weekStart,
        label: null,
        notes: null,
        days: createEmptyWeek(),
      }];
      return sortOverrideWeeks(next);
    });
    setPendingWeekKey("");
    setMsg(null);
  };

  const removeOverrideWeek = (index: number) => {
    setOverrideWeeks((prev) => prev.filter((_, idx) => idx !== index));
  };

  const addOverrideRange = (index: number, day: DayKey) => {
    setOverrideWeeks((prev) => {
      const updated = prev.map((ov, idx) => {
        if (idx !== index) return ov;
        const nextWeek = cloneOverrideWeek(ov);
        nextWeek.days[day] = sortRangesByStart([...nextWeek.days[day], makeDefaultRange()]);
        return nextWeek;
      });
      return sortOverrideWeeks(updated);
    });
  };

  const updateOverrideRange = (
    index: number,
    day: DayKey,
    rangeIndex: number,
    field: "start" | "end",
    value: string
  ) => {
    setOverrideWeeks((prev) => {
      const updated = prev.map((ov, idx) => {
        if (idx !== index) return ov;
        const nextWeek = cloneOverrideWeek(ov);
        const ranges = [...nextWeek.days[day]];
        ranges[rangeIndex] = { ...ranges[rangeIndex], [field]: value };
        nextWeek.days[day] = sortRangesByStart(ranges);
        return nextWeek;
      });
      return sortOverrideWeeks(updated);
    });
  };

  const removeOverrideRange = (index: number, day: DayKey, rangeIndex: number) => {
    setOverrideWeeks((prev) => {
      const updated = prev.map((ov, idx) => {
        if (idx !== index) return ov;
        const nextWeek = cloneOverrideWeek(ov);
        nextWeek.days[day] = nextWeek.days[day].filter((_, rIdx) => rIdx !== rangeIndex);
        return nextWeek;
      });
      return sortOverrideWeeks(updated);
    });
  };

  // Sincroniza formulario al cambiar el seleccionado
  React.useEffect(() => {
    if (!selected) return;
    const { first, last } = splitName(selected.fullName);
    setFirstName(first);
    setLastName(last);
    setEmail(selected.email ?? "");
    setPhone1(selected.phone1 ?? "");
    setPhone2(selected.phone2 ?? "");
    setWa1(!!selected.phone1HasWhatsapp);
    setWa2(!!selected.phone2HasWhatsapp);
    setClassTypeIds(selected.classTypeIds ?? []);
    setWeeklyAvailability(cloneWeek(selected.availability.weekly));
    setOverrideWeeks(selected.availability.overrides.map((ov) => cloneOverrideWeek(ov)));
    setActiveScheduleTab("typical");
    setPendingWeekKey("");
  }, [selected]);

  const onSave = async () => {
    if (!selected) return;
    setSaving(true);
    setMsg(null);
    try {
      const overridesPayload: OverrideWeek[] = overrideWeeks
        .map((ov) => {
          const weekStart = ov.weekStartDate || weekStartDateFromKey(ov.weekKey);
          if (!weekStart) return null;
          const weekKey = ov.weekKey || weekKeyFromStartDate(weekStart);
          return {
            ...ov,
            weekKey,
            weekStartDate: weekStart,
            days: normalizeWeek(ov.days),
          };
        })
        .filter((ov): ov is OverrideWeek => ov !== null);

      const availabilityPayload: InstructorAvailability = {
        weekly: normalizeWeek(weeklyAvailability),
        overrides: overridesPayload,
      };

      const body = {
        firstName,
        lastName,
        email,
        phone1,
        phone2,
        phone1WhatsApp: wa1,
        phone2WhatsApp: wa2,
        classTypeIds,
        availability: availabilityPayload,
      };
      const res = await fetch(`/api/admin/instructors/${selected.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      const updated: InstructorVM = await res.json();
      setInstructors((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      setWeeklyAvailability(cloneWeek(updated.availability.weekly));
      setOverrideWeeks(updated.availability.overrides.map((ov) => cloneOverrideWeek(ov)));
      setActiveScheduleTab("typical");
      setPendingWeekKey("");
      setMsg({ t: "ok", m: "¡Cambios guardados!" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error guardando";
      setMsg({ t: "err", m: message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout title="Planeación · Instructores" active="planningInstructors">
      <Head>
        <title>PilatesTime · Planeación · Instructores</title>
      </Head>

      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        {msg && (
          <div
            className={`rounded-md border px-4 py-3 text-sm ${
              msg.t === "ok"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-rose-200 bg-rose-50 text-rose-700"
            }`}
          >
            {msg.m}
          </div>
        )}

        {/* Selector de instructor (pulldown) */}
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <label className="block text-sm font-medium text-slate-700">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Selecciona instructor
            </span>
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={selectedId ?? ""}
              onChange={(e) => setSelectedId(e.target.value || null)}
            >
              {instructors.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.fullName} {i.email ? `(${i.email})` : ""}
                </option>
              ))}
            </select>
          </label>
        </section>

        {/* Datos básicos */}
        {selected && (
          <>
            <section className="rounded-lg border border-slate-200 bg-white">
              <header className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
                Datos del instructor
              </header>
              <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 lg:grid-cols-3">
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                    Nombre
                  </span>
                  <input
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                    Apellido
                  </span>
                  <input
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </label>
                <label className="block text-sm md:col-span-2 lg:col-span-1">
                  <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                    Correo
                  </span>
                  <input
                    type="email"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="correo@dominio.com"
                  />
                </label>

                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                    Teléfono 1
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={phone1}
                      onChange={(e) => setPhone1(e.target.value)}
                      placeholder="Ej. +52 55 0000 0000"
                    />
                    <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                      <input type="checkbox" checked={wa1} onChange={(e) => setWa1(e.target.checked)} />
                      WhatsApp
                    </label>
                  </div>
                </label>

                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                    Teléfono 2
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={phone2}
                      onChange={(e) => setPhone2(e.target.value)}
                      placeholder="Opcional"
                    />
                    <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                      <input type="checkbox" checked={wa2} onChange={(e) => setWa2(e.target.checked)} />
                      WhatsApp
                    </label>
                  </div>
                </label>
              </div>
            </section>

            {/* Tipo de clase */}
            <section className="rounded-lg border border-slate-200 bg-white">
              <header className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
                Tipo de clase
              </header>
              <div className="grid grid-cols-1 gap-2 p-4 text-sm sm:grid-cols-2 md:grid-cols-3">
                {classTypes.map((ct) => (
                  <label key={ct.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={classTypeIds.includes(ct.id)}
                      onChange={() => setClassTypeIds((prev) =>
                        prev.includes(ct.id) ? prev.filter((x) => x !== ct.id) : [...prev, ct.id]
                      )}
                    />
                    {ct.name}
                  </label>
                ))}
              </div>
            </section>

            {/* Disponibilidad */}
            <section className="rounded-lg border border-slate-200 bg-white">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
                <span>Disponibilidad</span>
                <div className="inline-flex overflow-hidden rounded-md border border-slate-300">
                  <button
                    type="button"
                    className={`px-3 py-1 text-xs font-medium ${activeScheduleTab === "typical" ? "bg-indigo-600 text-white" : "text-slate-600"}`}
                    onClick={() => setActiveScheduleTab("typical")}
                  >
                    Semana tipica
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-1 text-xs font-medium ${activeScheduleTab === "atypical" ? "bg-indigo-600 text-white" : "text-slate-600"}`}
                    onClick={() => setActiveScheduleTab("atypical")}
                  >
                    Semanas atipicas
                  </button>
                </div>
              </header>
              <div className="p-4">
                {activeScheduleTab === "typical" ? (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {DAY_KEYS.map((day) => (
                      <div key={day} className="rounded-md border border-slate-200">
                        <div className="border-b border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
                          {DAY_LABELS[day]}
                        </div>
                        <div className="space-y-3 px-3 py-3">
                          {weeklyAvailability[day].length === 0 ? (
                            <p className="text-xs text-slate-500">Sin rangos definidos.</p>
                          ) : (
                            weeklyAvailability[day].map((range, idx) => (
                              <div key={idx} className="flex flex-wrap items-center gap-2">
                                <input
                                  type="time"
                                  className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
                                  value={range.start}
                                  onChange={(e) => updateTypicalRange(day, idx, "start", e.target.value)}
                                />
                                <span className="text-xs text-slate-500">a</span>
                                <input
                                  type="time"
                                  className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
                                  value={range.end}
                                  onChange={(e) => updateTypicalRange(day, idx, "end", e.target.value)}
                                />
                                <button
                                  type="button"
                                  className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                                  onClick={() => removeTypicalRange(day, idx)}
                                >
                                  Eliminar
                                </button>
                              </div>
                            ))
                          )}
                          <button
                            type="button"
                            className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
                            onClick={() => addTypicalRange(day)}
                          >
                            + Rango
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="block text-sm">
                        <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                          Selecciona semana
                        </span>
                        <input
                          type="week"
                          className="w-48 rounded-md border border-slate-300 px-3 py-2 text-sm"
                          value={pendingWeekKey}
                          onChange={(e) => setPendingWeekKey(e.target.value)}
                        />
                      </label>
                      <button
                        type="button"
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        onClick={handleAddOverrideWeek}
                      >
                        Definir semana
                      </button>
                    </div>
                    {overrideWeeks.length === 0 ? (
                      <p className="text-sm text-slate-500">Aun no hay semanas atipicas definidas.</p>
                    ) : (
                      <div className="space-y-4">
                        {overrideWeeks.map((week, weekIndex) => (
                          <div key={week.weekKey} className="rounded-md border border-slate-200">
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-3 py-2">
                              <div>
                                <div className="text-sm font-semibold text-slate-700">Semana {week.weekKey}</div>
                                <div className="text-xs text-slate-500">Inicio {formatWeekStart(week.weekStartDate)}</div>
                              </div>
                              <button
                                type="button"
                                className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                                onClick={() => removeOverrideWeek(weekIndex)}
                              >
                                Eliminar semana
                              </button>
                            </div>
                            <div className="grid grid-cols-1 gap-4 p-3 md:grid-cols-2 xl:grid-cols-3">
                              {DAY_KEYS.map((day) => (
                                <div key={day} className="rounded-md border border-slate-200">
                                  <div className="border-b border-slate-200 px-3 py-2 text-xs font-semibold uppercase text-slate-600">
                                    {DAY_LABELS[day]}
                                  </div>
                                  <div className="space-y-3 px-3 py-3">
                                    {week.days[day].length === 0 ? (
                                      <p className="text-xs text-slate-500">Sin rangos.</p>
                                    ) : (
                                      week.days[day].map((range, rangeIndex) => (
                                        <div key={rangeIndex} className="flex flex-wrap items-center gap-2">
                                          <input
                                            type="time"
                                            className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
                                            value={range.start}
                                            onChange={(e) =>
                                              updateOverrideRange(weekIndex, day, rangeIndex, "start", e.target.value)
                                            }
                                          />
                                          <span className="text-xs text-slate-500">a</span>
                                          <input
                                            type="time"
                                            className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
                                            value={range.end}
                                            onChange={(e) =>
                                              updateOverrideRange(weekIndex, day, rangeIndex, "end", e.target.value)
                                            }
                                          />
                                          <button
                                            type="button"
                                            className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                                            onClick={() => removeOverrideRange(weekIndex, day, rangeIndex)}
                                          >
                                            Eliminar
                                          </button>
                                        </div>
                                      ))
                                    )}
                                    <button
                                      type="button"
                                      className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
                                      onClick={() => addOverrideRange(weekIndex, day)}
                                    >
                                      + Rango
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* Acciones */}
            <div className="flex items-center justify-end gap-2">
              <button
                className="rounded-md border border-slate-300 px-4 py-2 text-sm"
                onClick={() => {
                  const { first, last } = splitName(selected.fullName);
                  setFirstName(first);
                  setLastName(last);
                  setEmail(selected.email ?? "");
                  setPhone1(selected.phone1 ?? "");
                  setPhone2(selected.phone2 ?? "");
                  setWa1(!!selected.phone1HasWhatsapp);
                  setWa2(!!selected.phone2HasWhatsapp);
                  setClassTypeIds(selected.classTypeIds ?? []);
                  setWeeklyAvailability(cloneWeek(selected.availability.weekly));
                  setOverrideWeeks(selected.availability.overrides.map((ov) => cloneOverrideWeek(ov)));
                  setActiveScheduleTab("typical");
                  setPendingWeekKey("");
                }}
              >
                Cancelar
              </button>
              <button
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                onClick={onSave}
                disabled={saving}
              >
                {saving ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}

