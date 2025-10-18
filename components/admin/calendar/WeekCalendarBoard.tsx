"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import type { CalendarFilterOption, CalendarSession } from "./types";

dayjs.extend(utc);

const START_HOUR = 4;
const END_HOUR = 23;
const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, index) => START_HOUR + index);
const HOUR_BLOCK_HEIGHT = 48;
const WEEKDAY_LABELS = ["LUN", "MAR", "MIE", "JUE", "VIE", "SAB", "DOM"];
const COLOR_TOKENS = ["bg-brand-500", "bg-indigo-500", "bg-emerald-500", "bg-sky-500", "bg-amber-500"];

const DEFAULT_FILTERS = {
  instructorId: "all",
  roomId: "all",
  classTypeId: "all",
  search: "",
} as const;

type WeekCalendarBoardProps = {
  anchorDateISO: string;
  weekStartISO: string;
  todayISO: string;
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

function formatHourLabel(hour: number) {
  const suffix = hour >= 12 ? "PM" : "AM";
  const normalized = ((hour + 11) % 12) + 1;
  return `${normalized} ${suffix}`;
}

function computeEventStyle(startISO: string, endISO: string) {
  const start = dayjs.utc(startISO);
  const end = dayjs.utc(endISO);
  const anchor = start.startOf("day").hour(START_HOUR).minute(0).second(0).millisecond(0);
  const topMinutes = Math.max(0, start.diff(anchor, "minute"));
  const durationMinutes = Math.max(30, end.diff(start, "minute"));

  return {
    top: (topMinutes / 60) * HOUR_BLOCK_HEIGHT,
    height: (durationMinutes / 60) * HOUR_BLOCK_HEIGHT,
  } as const;
}

function getColor(classTypeId: string | null, map: Map<string, string>) {
  const key = classTypeId ?? "__fallback";
  if (!map.has(key)) {
    const color = COLOR_TOKENS[map.size % COLOR_TOKENS.length];
    map.set(key, color);
  }
  return map.get(key)!;
}

function getOptionLabel(options: CalendarFilterOption[], id: string) {
  return options.find((option) => option.id === id)?.label ?? "Seleccionado";
}

export default function WeekCalendarBoard({
  anchorDateISO,
  weekStartISO,
  todayISO,
  initialSessions,
  filterOptions,
}: WeekCalendarBoardProps) {
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
  }, [anchorDateISO, initialSessions]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch(filters.search.trim());
    }, 300);
    return () => clearTimeout(handle);
  }, [filters.search]);

  const weekStart = useMemo(() => dayjs.utc(weekStartISO), [weekStartISO]);
  const today = useMemo(() => dayjs.utc(todayISO), [todayISO]);

  const colorMap = useMemo(() => {
    const map = new Map<string, string>();
    sessions.forEach((session) => {
      getColor(session.classTypeId, map);
    });
    return map;
  }, [sessions]);

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, offset) => {
      const date = weekStart.add(offset, "day");
      const isoDate = date.format("YYYY-MM-DD");
      const daySessions = sessions
        .filter((session) => dayjs.utc(session.startISO).isSame(date, "day"))
        .map((session) => ({
          ...session,
          color: getColor(session.classTypeId, colorMap),
        }));

      return {
        date,
        isoDate,
        label: date.format("D"),
        shortLabel: WEEKDAY_LABELS[offset],
        isToday: date.isSame(today, "day"),
        sessions: daySessions,
      };
    });
  }, [colorMap, sessions, today, weekStart]);

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
        const params = new URLSearchParams({ date: anchorDateISO });
        if (filters.instructorId !== "all") params.set("instructorId", filters.instructorId);
        if (filters.roomId !== "all") params.set("roomId", filters.roomId);
        if (filters.classTypeId !== "all") params.set("classTypeId", filters.classTypeId);
        if (debouncedSearch) params.set("search", debouncedSearch);

        const response = await fetch(`/api/calendar/week?${params.toString()}`, {
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
  }, [anchorDateISO, debouncedSearch, filters.classTypeId, filters.instructorId, filters.roomId]);

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

  const totalSessions = sessions.length;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <section className="rounded-xl border border-slate-200 bg-white px-6 py-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-3 text-sm text-slate-600 md:flex-row md:items-center md:gap-4">
            <div className="flex flex-wrap items-center gap-6 font-medium">
              <button className="border-b-2 border-brand-500 pb-2 text-brand-600">Calendario completo</button>
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-brand-400" /> Sesiones
              </span>
              <span className="flex items-center gap-2">
              </span>
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400" /> Citas 1-1
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex h-10 items-center rounded-md border border-slate-200 bg-white pr-2 text-sm text-slate-600">
                <span className="flex h-full items-center px-3 text-slate-400">
                  <span className="material-icons-outlined text-base">search</span>
                </span>
                <input
                  value={filters.search}
                  onChange={(event) => updateFilter("search", event.target.value)}
                  placeholder="Buscar por sesión, instructor o sala"
                  className="h-full border-0 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
                />
              </label>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <select
              value={filters.instructorId}
              onChange={(event) => updateFilter("instructorId", event.target.value)}
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
              disabled={loading}
            >
              <option value="all">Todo el personal</option>
              {filterOptions.instructors.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={filters.roomId}
              onChange={(event) => updateFilter("roomId", event.target.value)}
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
              disabled={loading}
            >
              <option value="all">Ubicaciones</option>
              {filterOptions.rooms.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={filters.classTypeId}
              onChange={(event) => updateFilter("classTypeId", event.target.value)}
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
              disabled={loading}
            >
              <option value="all">Clases</option>
              {filterOptions.classTypes.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleClearFilters}
              className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
              disabled={loading}
            >
              Limpiar filtros
            </button>
          </div>
        </div>
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
          {activeFilterChips.length > 0 && <span className="text-slate-400"></span>}
          <span className="text-slate-500">{totalSessions} sesiones</span>
        </div>
        {error && <p className="mt-3 text-sm text-rose-500">{error}</p>}
        {loading && !error && activeFilterChips.length === 0 && (
          <p className="mt-3 text-sm text-slate-500">Actualizando</p>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Semana de</span>
            <span className="font-semibold text-slate-700">{weekStart.format("D MMMM YYYY")}</span>
          </div>
          <div className="text-slate-500">GMT-6</div>
        </div>

        <div className="grid grid-cols-[80px_repeat(7,minmax(0,1fr))] text-sm">
          <div className="border-r border-slate-200 bg-slate-50">
            <div className="h-11" />
            {HOURS.map((hour) => (
              <div key={hour} className="h-12 border-b border-slate-200 pr-3 text-right text-xs text-slate-500">
                <span className="inline-block translate-y-2">{formatHourLabel(hour)}</span>
              </div>
            ))}
          </div>

          {days.map((day) => (
            <div
              key={day.isoDate}
              className={`relative border-r border-slate-200 ${day.isToday ? "bg-brand-50" : "bg-white"}`}
            >
              <div
                className={`flex h-11 items-center justify-center border-b border-slate-200 text-sm font-semibold ${
                  day.isToday ? "text-brand-600" : "text-slate-700"
                }`}
              >
                <span className="text-xs uppercase text-slate-500">{day.shortLabel}</span>
                <span className="ml-2 text-base">{day.label}</span>
              </div>

              <div className="relative" style={{ height: HOURS.length * HOUR_BLOCK_HEIGHT }}>
                {HOURS.map((hour, index) => (
                  <div
                    key={hour}
                    className="absolute left-0 right-0 border-b border-slate-200"
                    style={{ top: index * HOUR_BLOCK_HEIGHT, height: HOUR_BLOCK_HEIGHT }}
                  />
                ))}

                {day.sessions.map((session) => {
                  const { top, height } = computeEventStyle(session.startISO, session.endISO);
                  const start = dayjs.utc(session.startISO).format("HH:mm");
                  const end = dayjs.utc(session.endISO).format("HH:mm");
                  const color = getColor(session.classTypeId, colorMap);
                  return (
                    <div
                      key={session.id}
                      className={`absolute left-1 right-1 rounded-md px-3 py-2 text-white shadow-sm transition hover:shadow-lg ${color}`}
                      style={{ top, height }}
                    >
                      <p className="text-xs opacity-90">
                        {start}  {end}
                      </p>
                      <p className="font-semibold leading-tight">{session.classTypeName ?? session.title}</p>
                      {session.instructorName && <p className="text-xs opacity-90">{session.instructorName}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}




