import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import MonthPicker from "@/components/MonthPicker";
import WeekStrip from "@/components/WeekStrip";
import DayBar from "@/components/DayBar";
import SessionCard, { type SessionSummary } from "@/components/SessionCard";
import { useAuth } from "@/components/auth/AuthContext";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { madridDayjs } from "@/lib/timezone";
import { clampAnchor, earliestAnchor, startOfWeekMX } from "@/lib/date-mx";
import type { PostgresInsertPayload } from "@supabase/supabase-js";
import type { Tables } from "@/types/database";

type ApiSession = {
  id: string;
  classType: string;
  room: string;
  instructor: string;
  start: string;
  end: string;
  capacity: number;
  current_occupancy: number;
  canBook: boolean;
  availableFrom: string | null;
  waitlistCount: number;
  waitlistEntryId: string | null;
  waitlistStatus: "PENDING" | "PROMOTED" | "CANCELLED" | null;
  waitlistPosition: number | null;
};

type BookingRow = Tables<"bookings">;
type SessionState = SessionSummary & { _pending?: boolean };

export default function SchedulePage() {
  const today = madridDayjs().format("YYYY-MM-DD");
  const router = useRouter();
  const { profile } = useAuth();

  const [selected, setSelected] = useState<string>(today);
  const [anchor, setAnchor] = useState<string>(earliestAnchor());
  const [sessions, setSessions] = useState<SessionState[]>([]);

  const rebookFrom = useMemo(() => {
    const param = router.query.rebookFrom;
    return typeof param === "string" ? param : null;
  }, [router.query.rebookFrom]);

  const isRebooking = Boolean(rebookFrom);

  const toSummary = (s: ApiSession): SessionSummary => {
    const availableLabel = s.availableFrom ? madridDayjs(s.availableFrom).format("DD/MM/YYYY") : undefined;
    return {
      id: s.id,
      capacity: s.capacity,
      current_occupancy: s.current_occupancy,
      startLabel: madridDayjs(s.start).format("hh:mm A"),
      classType: s.classType,
      instructor: s.instructor,
      room: s.room,
      duration: Math.max(30, madridDayjs(s.end).diff(madridDayjs(s.start), "minute")),
      canBook: s.canBook,
      availableFrom: s.availableFrom,
      availableFromLabel: availableLabel,
      waitlistCount: s.waitlistCount ?? 0,
      waitlistEntryId: s.waitlistEntryId ?? null,
      waitlistStatus: s.waitlistStatus ?? null,
      waitlistPosition: s.waitlistPosition ?? null,
      _waitlistBusy: null,
    };
  };

  const fetchDay = useCallback(async (iso: string) => {
    const params = new URLSearchParams({ date: iso });
    if (profile?.clientId) {
      params.set("clientId", profile.clientId);
    }
    const res = await fetch(`/api/calendar?${params.toString()}`);
    if (!res.ok) {
      throw new Error("No se pudo consultar el calendario");
    }
    const data = await res.json();
    if (!Array.isArray(data)) {
      throw new Error("Formato inesperado de calendario");
    }
    setSessions(data.map(toSummary));
  }, [profile?.clientId]);

  useEffect(() => {
    fetchDay(selected).catch((error) => {
      console.error("schedule fetchDay", error);
      setSessions([]);
    });
  }, [selected, fetchDay]);

  useEffect(() => {
    const client = supabaseBrowser();
    const ch = client
      .channel("bookings-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "bookings" },
        (payload: PostgresInsertPayload<BookingRow>) => {
          const sessionId = payload.new.session_id;
          if (!sessionId) return;
          setSessions((prev) =>
            prev.map((session) =>
              session.id === sessionId
                ? { ...session, current_occupancy: session.current_occupancy + 1 }
                : session
            )
          );
        }
      )
      .subscribe();

    return () => {
      client.removeChannel(ch);
    };
  }, []);

  const handleMonthChange = (isoFirstDay: string) => {
    const first = madridDayjs(isoFirstDay, true);
    const now = madridDayjs();
    const newAnchor =
      first.month() === now.month() && first.year() === now.year()
        ? startOfWeekMX(now.format("YYYY-MM-DD")).format("YYYY-MM-DD")
        : startOfWeekMX(first.format("YYYY-MM-DD")).format("YYYY-MM-DD");

    setAnchor(clampAnchor(newAnchor));
  };

  const handleToday = () => {
    const iso = madridDayjs().format("YYYY-MM-DD");
    setSelected(iso);
    setAnchor(startOfWeekMX(iso).format("YYYY-MM-DD"));
  };

  const handleWeekShift = (delta: number) => {
    const newAnchor = madridDayjs(anchor, true).add(delta, "week").format("YYYY-MM-DD");
    setAnchor(clampAnchor(newAnchor));
  };

  const handleSelectDay = (iso: string) => {
    setSelected(iso);
  };

  const handleReserve = async (id: string) => {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, _pending: true } : s)));

    const actorPayload = profile?.clientId ? { actorClientId: profile.clientId } : {};

    const requestInit = rebookFrom
      ? {
          method: "PATCH",
          body: JSON.stringify({ action: "rebook", bookingId: rebookFrom, newSessionId: id, ...actorPayload }),
        }
      : {
          method: "POST",
          body: JSON.stringify({
            sessionId: id,
            clientId: profile?.clientId ?? undefined,
            clientHint: profile?.fullName ?? "Angie",
            ...actorPayload,
          }),
        };

    const res = await fetch("/api/bookings", {
      headers: { "Content-Type": "application/json" },
      ...requestInit,
    });

    if (!res.ok) {
      const msg = await res.json().catch(() => ({}));
      setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, _pending: false } : s)));
      alert(msg?.error || "No se pudo completar la acci�n.");
      return;
    }

    const { bookingId } = await res.json();

    if (rebookFrom) {
      router.replace(
        { pathname: router.pathname, query: { ...router.query, rebookFrom: undefined } },
        undefined,
        { shallow: true }
      );
    }

    router.push(`/bookings/${bookingId}`);
  };

  const handleJoinWaitlist = async (id: string) => {
    if (!profile?.clientId) {
      alert("Inicia sesi�n para unirte a la lista de espera.");
      return;
    }

    setSessions((prev) =>
      prev.map((session) =>
        session.id === id ? { ...session, _waitlistBusy: "join" } : session
      )
    );

    const res = await fetch("/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: id, clientId: profile.clientId }),
    });

    if (!res.ok) {
      const msg = await res.json().catch(() => ({}));
      setSessions((prev) =>
        prev.map((session) =>
          session.id === id ? { ...session, _waitlistBusy: null } : session
        )
      );
      alert(msg?.error || "No se pudo agregar a la lista de espera.");
      return;
    }

    const data = (await res.json()) as {
      entry: { id: string; position: number; status: "PENDING" | "PROMOTED" | "CANCELLED" };
      waitlistCount: number;
    };

    setSessions((prev) =>
      prev.map((session) =>
        session.id === id
          ? {
              ...session,
              waitlistEntryId: data.entry.id,
              waitlistStatus: data.entry.status,
              waitlistPosition: data.entry.position,
              waitlistCount: data.waitlistCount,
              _waitlistBusy: null,
            }
          : session
      )
    );
  };

  const handleLeaveWaitlist = async (id: string) => {
    const waitlistEntry = sessions.find((session) => session.id === id)?.waitlistEntryId;
    if (!waitlistEntry) {
      return;
    }

    setSessions((prev) =>
      prev.map((session) =>
        session.id === id ? { ...session, _waitlistBusy: "leave" } : session
      )
    );

    const res = await fetch("/api/waitlist", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ waitlistId: waitlistEntry }),
    });

    if (!res.ok) {
      const msg = await res.json().catch(() => ({}));
      setSessions((prev) =>
        prev.map((session) =>
          session.id === id ? { ...session, _waitlistBusy: null } : session
        )
      );
      alert(msg?.error || "No se pudo salir de la lista de espera.");
      return;
    }

    const data = (await res.json()) as { removed: boolean; waitlistCount: number };

    setSessions((prev) =>
      prev.map((session) =>
        session.id === id
          ? {
              ...session,
              waitlistEntryId: null,
              waitlistStatus: null,
              waitlistPosition: null,
              waitlistCount: data.waitlistCount,
              _waitlistBusy: null,
            }
          : session
      )
    );
  };

  return (
    <section className="pt-6 space-y-3">
      <h2 className="text-2xl font-bold">Reservas</h2>

      {isRebooking && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Selecciona una nueva sesi�n para completar la reprogramaci�n de tu reserva.
        </p>
      )}

      {/* Selector de MES A�O a la izquierda y HOY a la derecha (misma altura h-10) */}
      <div className="flex items-center justify-between">
        <MonthPicker anchor={anchor} onMonthChange={handleMonthChange} />
        <button onClick={handleToday} className="h-10 rounded-xl border px-3 text-sm font-semibold">
          Hoy
        </button>
      </div>

      <WeekStrip anchor={anchor} selected={selected} onSelect={handleSelectDay} onWeekShift={handleWeekShift} />

      <DayBar iso={selected} />

      <div className="mt-2 space-y-3">
        {sessions.length === 0 && <p className="text-neutral-500 text-sm">No hay clases en este d�a.</p>}
        {sessions.map((s) => (
          <SessionCard
            key={s.id}
            session={s}
            onReserve={handleReserve}
            mode={isRebooking ? "rebook" : "reserve"}
            onJoinWaitlist={handleJoinWaitlist}
            onLeaveWaitlist={handleLeaveWaitlist}
          />
        ))}
      </div>
    </section>
  );
}





