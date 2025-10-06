import { useEffect, useState } from "react";
import dayjs from "dayjs";
import MonthPicker from "@/components/MonthPicker";
import WeekStrip from "@/components/WeekStrip";
import DayBar from "@/components/DayBar";
import SessionCard, { type SessionSummary } from "@/components/SessionCard";
import Router from "next/router";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { clampAnchor, earliestAnchor, startOfWeekMX } from "@/lib/date-mx";

type ApiSession = {
  id: string;
  classType: string;
  room: string;
  instructor: string;
  start: string;
  end: string;
  capacity: number;
  current_occupancy: number;
};

export default function SchedulePage() {
  const today = dayjs().format("YYYY-MM-DD");

  // Día seleccionado (permanece aunque cambie la semana visible)
  const [selected, setSelected] = useState<string>(today);

  // Anchor = cualquier fecha dentro de la semana visible (DOM–SÁB)
  // Ahora siempre es string ISO y respetamos los límites (mes actual + 11)
  const [anchor, setAnchor] = useState<string>(earliestAnchor());

  const [sessions, setSessions] = useState<SessionSummary[]>([]);

  const toSummary = (s: ApiSession): SessionSummary => ({
    id: s.id,
    capacity: s.capacity,
    current_occupancy: s.current_occupancy,
    startLabel: dayjs(s.start).format("hh:mm A"),
    classType: s.classType,
    instructor: s.instructor,
    room: s.room,
    duration: Math.max(30, Math.round((+new Date(s.end) - +new Date(s.start)) / 60000)),
  });

  const fetchDay = async (iso: string) => {
    const res = await fetch(`/api/calendar?date=${iso}`);
    const data: ApiSession[] = await res.json();
    setSessions(data.map(toSummary));
  };

  useEffect(() => {
    fetchDay(selected);
  }, [selected]);

  // Realtime: si hay INSERT en bookings, actualizamos ocupación en la lista visible
  useEffect(() => {
    const ch = supabaseBrowser
      .channel("bookings-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "bookings" },
        (p: any) => {
          const sid = p.new.session_id;
          setSessions((prev) =>
            prev.map((s) => (s.id === sid ? { ...s, current_occupancy: s.current_occupancy + 1 } : s))
          );
        }
      )
      .subscribe();

    return () => {
      supabaseBrowser.removeChannel(ch);
    };
  }, []);

  // === Acciones de UI ===

  // Selector de mes (MES AÑO):
  // - Mes actual -> semana actual (DOM–SÁB)
  // - Mes futuro -> semana que contiene el día 1 (DOM–SÁB)
  const handleMonthChange = (isoFirstDay: string) => {
    const first = dayjs(isoFirstDay);
    const now = dayjs();
    let newAnchor: string;

    if (first.month() === now.month() && first.year() === now.year()) {
      // Mes actual => semana actual
      newAnchor = startOfWeekMX(now.format("YYYY-MM-DD")).format("YYYY-MM-DD");
    } else {
      // Mes futuro => semana que contiene el día 1
      newAnchor = startOfWeekMX(first.format("YYYY-MM-DD")).format("YYYY-MM-DD");
    }

    setAnchor(clampAnchor(newAnchor)); // NO cambiamos el día seleccionado
  };

  // Botón HOY: fija selected = hoy y semana visible = semana actual
  const handleToday = () => {
    const iso = dayjs().format("YYYY-MM-DD");
    setSelected(iso);
    setAnchor(startOfWeekMX(iso).format("YYYY-MM-DD"));
  };

  // Navegación semanal con « » (sin permitir ir antes de la semana actual ni más allá del rango)
  const handleWeekShift = (delta: number) => {
    const newAnchor = dayjs(anchor).add(delta, "week").format("YYYY-MM-DD");
    setAnchor(clampAnchor(newAnchor)); // el seleccionado permanece
  };

  // Click en un día de la tira
  const handleSelectDay = (iso: string) => {
    setSelected(iso);
  };

    // dentro del componente
  const handleReserve = async (id: string) => {
    // deshabilitar botón en UI
    setSessions(prev => prev.map(s => s.id === id ? { ...s, _pending: true } as any : s));

    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: id, clientHint: "Angie" })
    });

    if (!res.ok) {
      const msg = await res.json().catch(() => ({}));
      // revertir estado
      setSessions(prev => prev.map(s => s.id === id ? { ...s, _pending: false } as any : s));
      alert(msg?.error || "No se pudo reservar.");
      return;
    }

    const { bookingId } = await res.json();
    // Redirige al detalle (mostrará QR)
    Router.push(`/bookings/${bookingId}`);
  };


  return (
    <section className="pt-6 space-y-3">
      <h2 className="text-2xl font-bold">Reservas</h2>

      {/* Selector de MES AÑO a la izquierda y HOY a la derecha (misma altura h-10) */}
      <div className="flex items-center justify-between">
        <MonthPicker anchor={anchor} onMonthChange={handleMonthChange} />
        <button onClick={handleToday} className="h-10 rounded-xl border px-3 text-sm font-semibold">
          Hoy
        </button>
      </div>

      <WeekStrip
        anchor={anchor}
        selected={selected}
        onSelect={handleSelectDay}
        onWeekShift={handleWeekShift}
      />

      <DayBar iso={selected} />

      <div className="mt-2 space-y-3">
        {sessions.length === 0 && <p className="text-neutral-500 text-sm">No hay clases en este día.</p>}
        {sessions.map((s) => (
          <SessionCard key={s.id} session={s} onReserve={handleReserve} />
        ))}
      </div>
    </section>
  );
}
