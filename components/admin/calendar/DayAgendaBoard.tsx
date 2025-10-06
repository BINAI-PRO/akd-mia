"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dayjs from "dayjs";
import type { CalendarFilterOption, CalendarSession, MiniCalendarDay } from "./types";

const HEADER_LABELS = ["D", "L", "M", "M", "J", "V", "S"];

const DEFAULT_FILTERS = {
  instructorId: "all",
  roomId: "all",
  classTypeId: "all",
  search: "",
} as const;

type DayAgendaBoardProps = {
  selectedDateISO: string;
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

type FiltersState = {
  instructorId: string;
  roomId: string;
  classTypeId: string;
  search: string;
};

type ActiveFilterChip = {
  key: keyof FiltersState;
  label: string;
};

function formatTimeRange(startISO: string, endISO: string) {
  const start = dayjs(startISO).format("h:mm A");
  const end = dayjs(endISO).format("h:mm A");
  return `${start}  ${end}`;
}

function getOptionLabel(options: CalendarFilterOption[], id: string) {
  return options.find((option) => option.id === id)?.label ?? "Seleccionado";
}

export default function DayAgendaBoard({
  selectedDateISO,
  todayISO,
  miniCalendarMonthLabel,
  miniCalendarDays,
  initialSessions,
  filterOptions,
}: DayAgendaBoardProps) {
  const [sessions, setSessions] = useState<CalendarSession[]>(initialSessions);
  const [filters, setFilters] = useState<FiltersState>({ ...DEFAULT_FILTERS });
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isFirstFetch = useRef(true);

  useEffect(() => {
    setSessions(initialSessions);
    setFilters({ ...DEFAULT_FILTERS });
    setDebouncedSearch("");
    setError(null);
    setLoading(false);
    isFirstFetch.current = true;
  }, [initialSessions, selectedDateISO]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch(filters.search.trim());
    }, 300);
    return () => clearTimeout(handle);
  }, [filters.search]);

  useEffect(() => {
    if (isFirstFetch.current) {
      isFirstFetch.current = false;
      return;
    }

    const controller = new AbortController();
    const fetchSessions = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ date: selectedDateISO });
        if (filters.instructorId !== "all") params.set("instructorId", filters.instructorId);
        if (filters.roomId !== "all") params.set("roomId", filters.roomId);
        if (filters.classTypeId !== "all") params.set("classTypeId", filters.classTypeId);
        if (debouncedSearch) params.set("search", debouncedSearch);

        const response = await fetch(`/api/admin/calendar/day?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(await response.text());
        }
        const payload = (await response.json()) as { sessions: CalendarSession[] };
        setSessions(payload.sessions);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error(error);
        setError(error instanceof Error ? error.message : "No se pudieron cargar las sesiones");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchSessions();
    return () => controller.abort();
  }, [debouncedSearch, filters.classTypeId, filters.instructorId, filters.roomId, selectedDateISO]);

  const updateFilter = useCallback((field: keyof FiltersState, value: string) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleClearFilters = useCallback(() => {
    setFilters({ ...DEFAULT_FILTERS });
  }, []);

  const handleClearSingleFilter = useCallback((field: keyof FiltersState) => {
    setFilters((prev) => ({ ...prev, [field]: DEFAULT_FILTERS[field] }));
  }, []);

  const activeFilterChips = useMemo<ActiveFilterChip[]>(() => {
    const chips: ActiveFilterChip[] = [];
    const trimmedSearch = filters.search.trim();
    if (trimmedSearch) {
      chips.push({ key: "search", label: `Busqueda: "${trimmedSearch}"` });
    }
    if (filters.instructorId !== "all") {
      const label = getOptionLabel(filterOptions.instructors, filters.instructorId);
      chips.push({ key: "instructorId", label: `Instructor: ${label}` });
    }
    if (filters.roomId !== "all") {
      const label = getOptionLabel(filterOptions.rooms, filters.roomId);
      chips.push({ key: "roomId", label: `Ubicacion: ${label}` });
    }
    if (filters.classTypeId !== "all") {
      const label = getOptionLabel(filterOptions.classTypes, filters.classTypeId);
      chips.push({ key: "classTypeId", label: `Clase: ${label}` });
    }
    return chips;
  }, [filterOptions.classTypes, filterOptions.instructors, filterOptions.rooms, filters.classTypeId, filters.instructorId, filters.roomId, filters.search]);

  const agendaLabel = useMemo(() => dayjs(selectedDateISO).format("D [de] MMMM, YYYY"), [selectedDateISO]);
  const totalSessions = sessions.length;

  return (
    <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[20rem,1fr]">
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <span className="text-sm font-semibold text-slate-700">{miniCalendarMonthLabel}</span>
          <Link href={{ pathname: "/admin/calendar/day", query: { date: todayISO } }} className="hidden">
            Hoy
          </Link>
        </div>
        <div className="px-4 py-3">
          <div className="grid grid-cols-7 text-center text-xs font-medium text-slate-500">
            {HEADER_LABELS.map((label) => (
              <div key={label}>{label}</div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-y-1 text-sm">
            {miniCalendarDays.map((day) => (
              <Link
                key={day.isoDate}
                href={{ pathname: "/admin/calendar/day", query: { date: day.isoDate } }}
                className={`flex h-9 items-center justify-center rounded-full transition ${
                  day.isSelected
                    ? "bg-brand-600 text-white"
                    : day.isCurrentMonth
                    ? "text-slate-700 hover:bg-slate-100"
                    : "text-slate-400 hover:bg-slate-100"
                }`}
              >
                {day.label}
              </Link>
            ))}
          </div>
          <Link
            href={{ pathname: "/admin/calendar/day", query: { date: todayISO } }}
            className="mt-4 flex h-10 items-center justify-center rounded-md border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Hoy
          </Link>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-4 shadow-sm">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold text-slate-800">Agenda para {agendaLabel}</h2>
                <span className="text-sm text-slate-500">{totalSessions} resultados</span>
              </div>
              {loading && <span className="text-sm text-slate-500">Actualizando</span>}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
              <label className="flex flex-1 min-w-[220px] items-center rounded-md border border-slate-200 bg-white pr-2">
                <span className="flex h-10 items-center px-3 text-slate-400">
                  <span className="material-icons-outlined">search</span>
                </span>
                <input
                  value={filters.search}
                  onChange={(event) => updateFilter("search", event.target.value)}
                  className="h-10 flex-1 border-0 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
                  placeholder="Buscar por clase, instructor o sala"
                />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={filters.instructorId}
                  onChange={(event) => updateFilter("instructorId", event.target.value)}
                  className="h-10 rounded-md border border-slate-200 bg-white px-3 text-xs"
                  disabled={loading}
                >
                  <option value="all">Todo el staff</option>
                  {filterOptions.instructors.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select
                  value={filters.roomId}
                  onChange={(event) => updateFilter("roomId", event.target.value)}
                  className="h-10 rounded-md border border-slate-200 bg-white px-3 text-xs"
                  disabled={loading}
                >
                  <option value="all">Ubicacion</option>
                  {filterOptions.rooms.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select
                  value={filters.classTypeId}
                  onChange={(event) => updateFilter("classTypeId", event.target.value)}
                  className="h-10 rounded-md border border-slate-200 bg-white px-3 text-xs"
                  disabled={loading}
                >
                  <option value="all">Tipo de clase</option>
                  {filterOptions.classTypes.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50"
                  disabled={loading}
                >
                  Limpiar filtros
                </button>
              </div>
            </div>
          </div>
          {activeFilterChips.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
              {activeFilterChips.map((chip) => (
                <span key={chip.key} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1">
                  {chip.label}
                  <button
                    type="button"
                    onClick={() => handleClearSingleFilter(chip.key)}
                    className="rounded-full p-0.5 text-slate-400 hover:text-slate-600"
                    aria-label={`Eliminar filtro ${chip.label}`}
                  >
                    <span className="material-icons-outlined text-sm">close</span>
                  </button>
                </span>
              ))}
            </div>
          )}
          {error && <p className="mt-3 text-sm text-rose-500">{error}</p>}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-4">
            <h3 className="text-lg font-semibold text-slate-800">
              {dayjs(selectedDateISO).format("D [de] MMMM, YYYY")} (GMT-6)
            </h3>
          </div>
          <div className="overflow-x-auto px-4 py-4">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3">Hora</th>
                  <th className="whitespace-nowrap px-4 py-3">Clase / Evento</th>
                  <th className="whitespace-nowrap px-4 py-3">Ubicacion</th>
                  <th className="whitespace-nowrap px-4 py-3">Staff</th>
                  <th className="whitespace-nowrap px-4 py-3">Capacidad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {sessions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">
                      No hay actividades registradas para este dia.
                    </td>
                  </tr>
                )}
                {sessions.map((session) => (
                  <tr key={session.id} className="text-slate-700">
                    <td className="px-4 py-3 text-slate-600">{formatTimeRange(session.startISO, session.endISO)}</td>
                    <td className="px-4 py-3 font-medium">{session.classTypeName ?? session.title}</td>
                    <td className="px-4 py-3 text-slate-500">{session.roomName ?? "Sin asignar"}</td>
                    <td className="px-4 py-3 text-slate-500">{session.instructorName ?? "Sin asignar"}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {session.capacity > 0 ? `${session.occupancy}/${session.capacity}` : "N/A"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}



