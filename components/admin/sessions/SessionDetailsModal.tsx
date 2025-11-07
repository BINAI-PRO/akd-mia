"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useState } from "react";
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

type EligiblePlanOption = {
  planPurchaseId: string;
  clientId: string;
  clientName: string;
  clientEmail: string | null;
  clientPhone: string | null;
  planName: string | null;
  remainingClasses: number | null;
  unlimited: boolean;
};

type QrPreviewState = {
  bookingId: string;
  loading: boolean;
  error: string | null;
  token?: string;
  imageUrl?: string;
  downloadUrl?: string;
  expiresAt?: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  CONFIRMED: "Confirmada",
  CHECKED_IN: "Check-in",
  CHECKED_OUT: "Check-out",
  CANCELLED: "Cancelada",
  WAITING: "En espera",
};

const EMPTY_TEXT = "\u2014";

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
  return `${start.format("DD MMM YYYY HH:mm")} \u2013 ${end.format("HH:mm")}`;
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
  const [manualOpen, setManualOpen] = useState(false);
  const [manualSearch, setManualSearch] = useState("");
  const [manualDebounced, setManualDebounced] = useState("");
  const [manualLoading, setManualLoading] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualResults, setManualResults] = useState<EligiblePlanOption[]>([]);
  const [manualAction, setManualAction] = useState<string | null>(null);
  const [cancelBusyId, setCancelBusyId] = useState<string | null>(null);
  const [qrPreview, setQrPreview] = useState<QrPreviewState | null>(null);

  const fetchSessionDetails = useCallback(
    async (options?: { signal?: AbortSignal; silent?: boolean }) => {
      if (!sessionId) return;
      if (!options?.silent) {
        setState({ status: "loading", error: null, data: null });
        setAttendanceFeedback(null);
      }

      try {
        const response = await fetch(`/api/sessions/${sessionId}`, {
          signal: options?.signal,
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          const message = (body as { error?: string }).error ?? "No se pudieron obtener los detalles.";
          throw new Error(message);
        }
        const payload = (await response.json()) as SessionDetailsResponse;
        if (options?.signal?.aborted) return;
        setState({ status: "success", error: null, data: payload });
      } catch (fetchError) {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") return;
        if (options?.signal?.aborted) return;
        const message =
          fetchError instanceof Error ? fetchError.message : "No se pudieron obtener los detalles.";
        setState({ status: "error", error: message, data: null });
      }
    },
    [sessionId]
  );

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
    void fetchSessionDetails({ signal: controller.signal });
    return () => controller.abort();
  }, [fetchSessionDetails, open, sessionId]);

  useEffect(() => {
    if (!open) {
      setAttendanceBusy({});
      setAttendanceFeedback(null);
      setManualOpen(false);
      setManualSearch("");
      setManualDebounced("");
      setManualResults([]);
      setManualError(null);
      setManualLoading(false);
      setManualAction(null);
      setCancelBusyId(null);
      setQrPreview(null);
    }
  }, [open, sessionId]);

  useEffect(() => {
    if (!manualOpen) return;
    const handle = window.setTimeout(() => {
      setManualDebounced(manualSearch.trim());
    }, 300);
    return () => window.clearTimeout(handle);
  }, [manualOpen, manualSearch]);

  useEffect(() => {
    if (!manualOpen || !sessionId) return;

    const controller = new AbortController();
    setManualLoading(true);
    setManualError(null);

    const query = manualDebounced ? `?q=${encodeURIComponent(manualDebounced)}` : "";

    fetch(`/api/sessions/${sessionId}/eligible-plans${query}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          const message = (body as { error?: string }).error ?? "No se pudo consultar la lista de planes activos.";
          throw new Error(message);
        }
        return response.json() as Promise<{ results: EligiblePlanOption[] }>;
      })
      .then((payload) => {
        if (!controller.signal.aborted) {
          setManualResults(payload.results ?? []);
        }
      })
      .catch((fetchError) => {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") return;
        if (controller.signal.aborted) return;
        const message =
          fetchError instanceof Error
            ? fetchError.message
            : "No se pudo consultar la lista de planes activos.";
        setManualError(message);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setManualLoading(false);
        }
      });

    return () => controller.abort();
  }, [manualDebounced, manualOpen, sessionId]);

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
      headline: session.title ?? "Sesión",
      schedule,
      instructor: session.instructorName ?? "Sin instructor asignado",
      room: session.roomName ?? "Sin salón",
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

  const handleManualBooking = async (planPurchaseId: string) => {
    if (!sessionId) return;
    setManualAction(planPurchaseId);
    setManualError(null);

    try {
      const response = await fetch(`/api/sessions/${sessionId}/manual-booking`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planPurchaseId }),
      });
      const payload = (await response.json().catch(() => ({}))) as
        | { bookingId?: string; planName?: string | null; planPurchaseId?: string | null; error?: string }
        | { error?: string };

      if (!response.ok) {
        const message = (payload as { error?: string }).error ?? "No se pudo registrar la reserva";
        throw new Error(message);
      }

      await fetchSessionDetails({ silent: true });
      setAttendanceFeedback({
        type: "success",
        text: "Reserva registrada correctamente.",
      });
      setManualOpen(false);
      setManualResults([]);
      setManualSearch("");
      setManualDebounced("");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo registrar la reserva";
      setManualError(message);
    } finally {
      setManualAction(null);
    }
  };

  const handleCancelBooking = async (bookingId: string) => {
    if (typeof window !== "undefined") {
      const confirmed = window.confirm("¿Cancelar esta reservación? Se liberará el lugar de inmediato.");
      if (!confirmed) return;
    }
    setCancelBusyId(bookingId);
    setAttendanceFeedback(null);
    try {
      const response = await fetch(`/api/bookings/${bookingId}/cancel`, {
        method: "DELETE",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((body as { error?: string })?.error ?? "No se pudo cancelar la reservación");
      }
      await fetchSessionDetails({ silent: true });
      setAttendanceFeedback({
        type: "success",
        text: "Reservación cancelada correctamente.",
      });
    } catch (error) {
      setAttendanceFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "No se pudo cancelar la reservación",
      });
    } finally {
      setCancelBusyId(null);
    }
  };

  const openQrPreview = async (bookingId: string) => {
    setQrPreview({ bookingId, loading: true, error: null });
    try {
      const response = await fetch(`/api/bookings/${bookingId}/qr-token`);
      const body = (await response.json().catch(() => ({}))) as
        | {
            token?: string;
            imageUrl?: string;
            downloadUrl?: string;
            expiresAt?: string | null;
            error?: string;
          }
        | undefined;
      if (!response.ok || !body?.token || !body.imageUrl || !body.downloadUrl) {
        throw new Error(body?.error ?? "No se pudo recuperar el QR");
      }
      setQrPreview({
        bookingId,
        loading: false,
        error: null,
        token: body.token,
        imageUrl: body.imageUrl,
        downloadUrl: body.downloadUrl,
        expiresAt: body.expiresAt ?? null,
      });
    } catch (error) {
      setQrPreview({
        bookingId,
        loading: false,
        error: error instanceof Error ? error.message : "No se pudo recuperar el QR",
      });
    }
  };

  const closeQrPreview = () => setQrPreview(null);

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
            <p className="text-xs uppercase tracking-wide text-brand-600">Detalle de sesión</p>
            <h2 id="session-detail-heading" className="mt-1 text-xl font-semibold text-slate-900">
              {summary?.headline ?? "Sesión"}
            </h2>
            {summary?.course && <p className="text-sm text-slate-500">{summary.course}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Cerrar detalles de sesión"
          >
            <span className="material-icons-outlined text-xl">close</span>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5 text-sm text-slate-700">
          {status === "loading" && (
            <div className="flex h-48 items-center justify-center text-sm text-slate-500">
              Cargando detalles de la sesión\u2026
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
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Duración</dt>
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
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">Participantes con reserva</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">
                      {data.participants.length} registros
                    </span>
                    <button
                      type="button"
                      onClick={() => setManualOpen((prev) => !prev)}
                      className="rounded-md border border-brand-500 px-3 py-1 text-xs font-semibold text-brand-600 transition hover:bg-brand-50"
                    >
                      {manualOpen ? "Cerrar búsqueda" : "Reservar miembro"}
                    </button>
                  </div>
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
                {manualOpen && (
                  <div className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div>
                      <label className="text-xs font-medium uppercase tracking-wide text-slate-600">
                        Buscar miembro
                      </label>
                      <input
                        type="text"
                        value={manualSearch}
                        onChange={(event) => setManualSearch(event.target.value)}
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                        placeholder="Nombre, correo o teléfono"
                      />
                      <p className="mt-1 text-xs text-slate-500">
                        Muestra miembros con plan flexible activo disponible para esta sesión.
                      </p>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-white p-3">
                      {manualLoading ? (
                        <p className="text-sm text-slate-500">Buscando planes activos...</p>
                      ) : manualError ? (
                        <p className="text-sm text-rose-600">{manualError}</p>
                      ) : manualResults.length === 0 ? (
                        <p className="text-sm text-slate-500">
                          No se encontraron planes activos disponibles con la búsqueda actual.
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {manualResults.map((option) => (
                            <li
                              key={option.planPurchaseId}
                              className="flex flex-col gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div>
                                <p className="text-sm font-semibold text-slate-800">
                                  {option.clientName}
                                </p>
                                <div className="mt-1 space-y-0.5 text-xs text-slate-500">
                                  {option.planName && (
                                    <p>
                                      Plan: <span className="font-medium text-slate-700">{option.planName}</span>
                                    </p>
                                  )}
                                  {option.unlimited ? (
                                    <p>Clases disponibles: Ilimitado</p>
                                  ) : (
                                    <p>
                                      Clases disponibles:{" "}
                                      <span className="font-medium text-slate-700">
                                        {option.remainingClasses ?? 0}
                                      </span>
                                    </p>
                                  )}
                                  {option.clientEmail && <p>{option.clientEmail}</p>}
                                  {option.clientPhone && <p>{option.clientPhone}</p>}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleManualBooking(option.planPurchaseId)}
                                disabled={manualAction === option.planPurchaseId}
                                className="self-start rounded-md bg-brand-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-brand-300 sm:self-center"
                              >
                                {manualAction === option.planPurchaseId ? "Reservando..." : "Reservar"}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
                {data.participants.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">
                    Aún no hay reservaciones registradas.
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
                          <th className="px-4 py-3 text-right">Acciones</th>
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
                              <td className="px-4 py-3 text-right">
                                <div className="flex flex-wrap justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => openQrPreview(participant.bookingId)}
                                    className="rounded-md border border-slate-300 px-3 py-1 text-xs text-slate-600 transition hover:bg-slate-100"
                                  >
                                    Ver QR
                                  </button>
                                  {participant.status.toUpperCase() !== "CANCELLED" ? (
                                    <button
                                      type="button"
                                      onClick={() => handleCancelBooking(participant.bookingId)}
                                      disabled={cancelBusyId === participant.bookingId}
                                      className="rounded-md border border-rose-200 px-3 py-1 text-xs text-rose-600 transition hover:bg-rose-50 disabled:opacity-60"
                                    >
                                      {cancelBusyId === participant.bookingId ? "Cancelando..." : "Cancelar"}
                                    </button>
                                  ) : null}
                                </div>
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
                          <th className="px-4 py-3">Posición</th>
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
      {qrPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl">
            <div className="flex items-center justify-between">
              <h4 className="text-base font-semibold text-slate-900">QR de reservación</h4>
              <button
                type="button"
                onClick={closeQrPreview}
                className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                aria-label="Cerrar QR"
              >
                <span className="material-icons-outlined text-lg">close</span>
              </button>
            </div>
            <div className="mt-4">
              {qrPreview.loading ? (
                <p className="text-sm text-slate-500">Cargando QR...</p>
              ) : qrPreview.error ? (
                <p className="text-sm text-rose-600">{qrPreview.error}</p>
              ) : (
                <>
                  {qrPreview.imageUrl && (
                    <img
                      src={qrPreview.imageUrl}
                      alt="QR de reservación"
                      className="mx-auto h-48 w-48 rounded-lg border border-slate-200 object-contain"
                    />
                  )}
                  <p className="mt-3 text-xs text-slate-500">
                    Token: <span className="font-semibold">{qrPreview.token}</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {qrPreview.expiresAt
                      ? `Vence ${studioDayjs(qrPreview.expiresAt).format("DD MMM YYYY HH:mm")}`
                      : "Sin fecha de expiración"}
                  </p>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
                    {qrPreview.downloadUrl && (
                      <a
                        href={qrPreview.downloadUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex flex-1 items-center justify-center rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Descargar PNG
                      </a>
                    )}
                    {qrPreview.imageUrl && (
                      <a
                        href={qrPreview.imageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex flex-1 items-center justify-center rounded-md border border-brand-500 px-3 py-2 text-sm font-semibold text-brand-600 hover:bg-brand-50"
                      >
                        Abrir en pestaña
                      </a>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

