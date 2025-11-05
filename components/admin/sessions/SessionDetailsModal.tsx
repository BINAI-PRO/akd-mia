"use client";

import { useEffect, useMemo, useState } from "react";
import { studioDayjs } from "@/lib/timezone";
import { useAuth } from "@/components/auth/AuthContext";

type SessionDetailsResponse = {
  session: {
    id: string;
    title: string | null;
    startISO: string | null;
    endISO: string | null;
    durationMinutes: number | null;
    capacity: number | null;
    occupancy: number;
    availableSpots: number | null;
    classTypeName: string | null;
    courseTitle: string | null;
    instructorName: string | null;
    instructorId: string | null;
    roomName: string | null;
    roomId: string | null;
  };
  participants: Array<{
    bookingId: string;
    status: string;
    reservedAt: string | null;
    client: {
      id: string | null;
      fullName: string;
      email: string | null;
      phone: string | null;
    };
    plan: {
      id: string;
      modality: string | null;
      name: string | null;
    } | null;
  }>;
  waitlist: Array<{
    id: string;
    status: string | null;
    position: number | null;
    createdAt: string | null;
    client: {
      id: string | null;
      fullName: string;
      email: string | null;
      phone: string | null;
    };
  }>;
};

type Props = {
  sessionId: string | null;
  open: boolean;
  onClose: () => void;
};

type FetchState = {
  status: "idle" | "loading" | "success" | "error";
  error: string | null;
  data: SessionDetailsResponse | null;
};

type AttendanceFeedback = { type: "success" | "error"; text: string };

const STATUS_LABELS: Record<string, string> = {
  CONFIRMED: "Confirmada",
  CHECKED_IN: "Check-in",
  CHECKED_OUT: "Check-out",
  CANCELLED: "Cancelada",
  WAITING: "En espera",
};

const EMPTY_TEXT = "â€”";

function formatStatus(status: string) {
  const key = status.toUpperCase();
  return STATUS_LABELS[key] ?? status;
}

function formatDateTime(iso: string | null) {
  if (!iso) return EMPTY_TEXT;
  const instance = studioDayjs(iso);
  if (!instance.isValid()) return EMPTY_TEXT;
  return instance.format("DD MMM YYYY HH:mm");
}

function formatSchedule(startISO: string | null, endISO: string | null) {
  const start = startISO ? studioDayjs(startISO) : null;
  const end = endISO ? studioDayjs(endISO) : null;
  if (!start || !start.isValid()) return EMPTY_TEXT;
  if (!end || !end.isValid()) return start.format("DD MMM YYYY HH:mm");
  return `${start.format("DD MMM YYYY HH:mm")} â€“ ${end.format("HH:mm")}`;
}

export default function SessionDetailsModal({ sessionId, open, onClose }: Props) {
  const { profile } = useAuth();
  const staffId = profile?.staffId ?? null;

  const [{ status, error, data }, setState] = useState<FetchState>({
    status: "idle",
    error: null,
    data: null,
  });

  const [attendanceBusy, setAttendanceBusy] = useState<Record<string, boolean>>({});
  const [attendanceFeedback, setAttendanceFeedback] = useState<AttendanceFeedback | null>(null);

  useEffect(() => {
    if (!open || !sessionId) {
      setState((prev) => ({
        status: sessionId ? prev.status : "idle",
        error: null,
        data: sessionId ? prev.data : null,
      }));
      return;
    }

    const controller = new AbortController();
    setState({ status: "loading", error: null, data: null });
    setAttendanceFeedback(null);

    const fetchDetails = async () => {
      try {
        const response = await fetch(`/api/sessions/${sessionId}`, { signal: controller.signal });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          const message = (body as { error?: string }).error ?? "No se pudieron obtener los detalles.";
          throw new Error(message);
        }
        const payload = (await response.json()) as SessionDetailsResponse;
        setState({ status: "success", error: null, data: payload });
      } catch (fetchError) {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") return;
        const message =
          fetchError instanceof Error ? fetchError.message : "No se pudieron obtener los detalles.";
        setState({ status: "error", error: message, data: null });
      }
    };

    void fetchDetails();
    return () => controller.abort();
  }, [open, sessionId]);

  useEffect(() => {
    if (!open) {
      setAttendanceBusy({});
      setAttendanceFeedback(null);
    }
  }, [open, sessionId]);

  const showModal = open && sessionId;

  const summary = useMemo(() => {
    if (!data) return null;
    const { session } = data;
    const schedule = formatSchedule(session.startISO, session.endISO);
    const duration =
      typeof session.durationMinutes === "number" && session.durationMinutes > 0
        ? `${session.durationMinutes} min`
        : EMPTY_TEXT;
    const capacity =
      typeof session.capacity === "number"
        ? `${session.occupancy}/${session.capacity}`
        : `${session.occupancy}`;
    const available =
      session.availableSpots !== null ? Math.max(session.availableSpots, 0) : null;

    return {
      headline: session.title ?? "SesiÃ³n",
      schedule,
      instructor: session.instructorName ?? "Sin instructor asignado",
      room: session.roomName ?? "Sin salÃ³n",
      classType: session.classTypeName ?? "Clase general",
      course: session.courseTitle ?? null,
      capacity,
      available,
      duration,
    };
  }, [data]);

  const handleToggleAttendance = async (bookingId: string, shouldMarkPresent: boolean) => {
    setAttendanceFeedback(null);
    setAttendanceBusy((prev) => ({ ...prev, [bookingId]: true }));

    try {
      const response = await fetch("/api/bookings/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId,
          present: shouldMarkPresent,
          actorStaffId: staffId,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as
        | { status?: string; message?: string }
        | { error?: string };

      if (!response.ok) {
        const message = (payload as { error?: string }).error ?? "No se pudo actualizar la asistencia.";
        throw new Error(message);
      }

      const nextStatus =
        (payload as { status?: string }).status ??
        (shouldMarkPresent ? "CHECKED_IN" : "CONFIRMED");

      setState((prev) => {
        if (!prev.data) return prev;
        return {
          ...prev,
          data: {
            ...prev.data,
            participants: prev.data.participants.map((participant) =>
              participant.bookingId === bookingId
                ? { ...participant, status: nextStatus }
                : participant
            ),
          },
        };
      });

      const successMessage =
        (payload as { message?: string }).message ??
        (shouldMarkPresent ? "Asistencia registrada correctamente." : "Asistencia revertida.");

      setAttendanceFeedback({ type: "success", text: successMessage });
    } catch (updateError) {
      const message =
        updateError instanceof Error ? updateError.message : "No se pudo actualizar la asistencia.";
      setAttendanceFeedback({ type: "error", text: message });
    } finally {
      setAttendanceBusy((prev) => {
        const next = { ...prev };
        delete next[bookingId];
        return next;
      });
    }
  };

  const closeOnOverlay = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  if (!showModal) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-10 backdrop-blur-sm"
      onClick={closeOnOverlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-detail-heading"
    >
      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <header className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-brand-600">Detalle de sesiÃ³n</p>
            <h2 id="session-detail-heading" className="mt-1 text-xl font-semibold text-slate-900">
              {summary?.headline ?? "SesiÃ³n"}
            </h2>
            {summary?.course && <p className="text-sm text-slate-500">{summary.course}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Cerrar detalles de sesiÃ³n"
          >
            <span className="material-icons-outlined text-xl">close</span>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5 text-sm text-slate-700">
          {status === "loading" && (
            <div className="flex h-48 items-center justify-center text-sm text-slate-500">
              Cargando detalles de la sesiÃ³nâ€¦
            </div>
          )}

          {status === "error" && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
              {error}
            </div>
          )}

          {status === "success" && data && summary && (
            <div className="space-y-8">
              <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Horario</dt>
                    <dd className="mt-1 text-sm text-slate-800">{summary.schedule}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">DuraciÃ³n</dt>
                    <dd className="mt-1 text-sm text-slate-800">{summary.duration}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Instructor</dt>
                    <dd className="mt-1 text-sm text-slate-800">{summary.instructor}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Sala</dt>
                    <dd className="mt-1 text-sm text-slate-800">{summary.room}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Tipo de clase</dt>
                    <dd className="mt-1 text-sm text-slate-800">{summary.classType}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Capacidad</dt>
                    <dd className="mt-1 text-sm text-slate-800">
                      {summary.capacity}
                      {summary.available !== null && (
                        <span className="ml-2 text-xs text-slate-500">
                          {summary.available === 0
                            ? "Sin lugares disponibles"
                            : `${summary.available} lugares disponibles`}
                        </span>
                      )}
                    </dd>
                  </div>
                </dl>
              </section>

              <section>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">Participantes con reserva</h3>
                  <span className="text-xs text-slate-500">{data.participants.length} registros</span>
                </div>
                {attendanceFeedback ? (
                  <p
                    className={`mt-3 rounded-md px-3 py-2 text-xs ${
                      attendanceFeedback.type === "success"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-rose-50 text-rose-600"
                    }`}
                  >
                    {attendanceFeedback.text}
                  </p>
                ) : null}
                {data.participants.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">
                    AÃºn no hay reservaciones registradas.
                  </p>
                ) : (
                  <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-3">Cliente</th>
                          <th className="px-4 py-3">Contacto</th>
                          <th className="px-4 py-3">Plan</th>
                          <th className="px-4 py-3 text-center">Asistencia</th>
                          <th className="px-4 py-3">Estado</th>
                          <th className="px-4 py-3">Reservado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {data.participants.map((participant) => {
                          const checked = participant.status.toUpperCase() === "CHECKED_IN";
                          return (
                            <tr key={participant.bookingId}>
                              <td className="px-4 py-3 font-medium text-slate-700">
                                {participant.client.fullName}
                              </td>
                              <td className="px-4 py-3 text-slate-500">
                                <div className="space-y-0.5">
                                  {participant.client.email && (
                                    <span className="block text-xs">{participant.client.email}</span>
                                  )}
                                  {participant.client.phone && (
                                    <span className="block text-xs">{participant.client.phone}</span>
                                  )}
                                  {!participant.client.email && !participant.client.phone && (
                                    <span className="block text-xs text-slate-400">Sin contacto</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-slate-500">
                                {participant.plan ? (
                                  <div className="space-y-0.5">
                                    <span className="block text-xs font-medium text-slate-700">
                                      {participant.plan.name ?? "Plan"}
                                    </span>
                                    {participant.plan.modality && (
                                      <span className="block text-[11px] uppercase tracking-wide text-slate-400">
                                        {participant.plan.modality === "FIXED" ? "Fijo" : "Flexible"}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-xs text-slate-400">Sin plan</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                                  checked={checked}
                                  onChange={(event) =>
                                    void handleToggleAttendance(participant.bookingId, event.target.checked)
                                  }
                                  disabled={attendanceBusy[participant.bookingId]}
                                />
                              </td>
                              <td className="px-4 py-3 text-slate-500">{formatStatus(participant.status)}</td>
                              <td className="px-4 py-3 text-slate-500">
                                {participant.reservedAt ? formatDateTime(participant.reservedAt) : EMPTY_TEXT}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">Lista de espera</h3>
                  <span className="text-xs text-slate-500">{data.waitlist.length} registros</span>
                </div>
                {data.waitlist.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">Sin personas en lista de espera.</p>
                ) : (
                  <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-3">PosiciÃ³n</th>
                          <th className="px-4 py-3">Cliente</th>
                          <th className="px-4 py-3">Contacto</th>
                          <th className="px-4 py-3">Estado</th>
                          <th className="px-4 py-3">Registrado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {data.waitlist.map((entry) => (
                          <tr key={entry.id}>
                            <td className="px-4 py-3 font-medium text-slate-700">
                              {entry.position ?? EMPTY_TEXT}
                            </td>
                            <td className="px-4 py-3 text-slate-600">{entry.client.fullName}</td>
                            <td className="px-4 py-3 text-slate-500">
                              <div className="space-y-0.5">
                                {entry.client.email && (
                                  <span className="block text-xs">{entry.client.email}</span>
                                )}
                                {entry.client.phone && (
                                  <span className="block text-xs">{entry.client.phone}</span>
                                )}
                                {!entry.client.email && !entry.client.phone && (
                                  <span className="block text-xs text-slate-400">Sin contacto</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-slate-500">
                              {entry.status ? formatStatus(entry.status) : "Pendiente"}
                            </td>
                            <td className="px-4 py-3 text-slate-500">
                              {entry.createdAt ? formatDateTime(entry.createdAt) : EMPTY_TEXT}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end border-t border-slate-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cerrar
          </button>
        </footer>
      </div>
    </div>
  );
}

