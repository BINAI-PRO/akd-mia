import { useCallback, useEffect, useMemo, useState } from "react";
import Head from "next/head";
import dayjs from "dayjs";
import AdminLayout from "@/components/admin/AdminLayout";
import Img from "@/components/Img";

type SessionSummary = {
  id: string;
  startTime: string;
  endTime: string;
  classType: string;
  room: string;
  instructor: { id: string | null; name: string };
  attendees: Array<{ id: string | null; name: string }>;
  capacity: number;
  statusLabel: string;
};

type ScheduleResponse = {
  date: string;
  sessions: SessionSummary[];
};

type InstructorOption = { id: string; name: string; staffId: string | null };

type QrState = Record<
  string,
  {
    token: string;
    expiresAt: string;
    sessionLabel: string;
  }
>;

export default function InstructorDashboardPage() {
  const today = dayjs().format("YYYY-MM-DD");
  const [date, setDate] = useState(today);
  const [personal, setPersonal] = useState<SessionSummary[]>([]);
  const [personalLoading, setPersonalLoading] = useState(false);
  const [personalError, setPersonalError] = useState<string | null>(null);

  const [general, setGeneral] = useState<SessionSummary[]>([]);
  const [generalLoading, setGeneralLoading] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [generalInstructor, setGeneralInstructor] = useState<string>("ALL");

  const [instructors, setInstructors] = useState<InstructorOption[]>([]);
  const [qrState, setQrState] = useState<QrState>({});
  const [qrError, setQrError] = useState<string | null>(null);
  const [qrBusy, setQrBusy] = useState<string | null>(null);

  const fetchSchedule = useCallback(
    async (view: "personal" | "all", instructorId?: string | null) => {
      const params = new URLSearchParams({ view, date });
      if (view === "all" && instructorId && instructorId !== "ALL") {
        params.set("instructorId", instructorId);
      }
      const response = await fetch(`/api/instructor/schedule?${params.toString()}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "No se pudo consultar el calendario");
      }
      return (response.json() as Promise<ScheduleResponse>).then((payload) => payload.sessions);
    },
    [date]
  );

  useEffect(() => {
    const controller = new AbortController();
    setPersonalLoading(true);
    setPersonalError(null);
    fetchSchedule("personal")
      .then((sessions) => {
        if (!controller.signal.aborted) {
          setPersonal(sessions);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setPersonalError(error instanceof Error ? error.message : "No se pudo cargar la agenda");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setPersonalLoading(false);
        }
      });
    return () => controller.abort();
  }, [date, fetchSchedule]);

  useEffect(() => {
    const controller = new AbortController();
    setGeneralLoading(true);
    setGeneralError(null);
    fetchSchedule("all", generalInstructor === "ALL" ? null : generalInstructor)
      .then((sessions) => {
        if (!controller.signal.aborted) {
          setGeneral(sessions);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setGeneralError(error instanceof Error ? error.message : "No se pudo cargar el calendario");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setGeneralLoading(false);
        }
      });
    return () => controller.abort();
  }, [date, generalInstructor, fetchSchedule]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/instructor/list", { signal: controller.signal })
      .then((response) => response.json())
      .then((payload: { instructors: InstructorOption[] }) => {
        if (!controller.signal.aborted) {
          setInstructors(payload.instructors ?? []);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setQrState((prev) => {
        const now = dayjs();
        let changed = false;
        const next: QrState = {};
        for (const [sessionId, info] of Object.entries(prev)) {
          if (dayjs(info.expiresAt).isAfter(now)) {
            next[sessionId] = info;
          } else {
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleGenerateQr = async (session: SessionSummary) => {
    setQrBusy(session.id);
    setQrError(null);
    try {
      const response = await fetch(`/api/instructor/sessions/${session.id}/qr`, { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo generar el QR");
      }
      setQrState((prev) => ({
        ...prev,
        [session.id]: {
          token: payload.token,
          expiresAt: payload.expiresAt,
          sessionLabel: session.classType,
        },
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo generar el QR";
      setQrError(message);
    } finally {
      setQrBusy(null);
    }
  };

  const renderSessions = (sessions: SessionSummary[]) => {
    if (sessions.length === 0) {
      return <p className="text-sm text-slate-500">No hay sesiones en la fecha seleccionada.</p>;
    }

    return (
      <div className="space-y-3">
        {sessions.map((session) => {
          const qrInfo = qrState[session.id];
          const secondsLeft = qrInfo ? Math.max(0, dayjs(qrInfo.expiresAt).diff(dayjs(), "second")) : 0;
          return (
            <article key={session.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <header className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">{session.classType}</h3>
                  <p className="text-sm text-slate-600">
                    {dayjs(session.startTime).format("DD MMM HH:mm")} -{" "}
                    {dayjs(session.endTime).format("HH:mm")} Â· {session.room}
                  </p>
                </div>
                <div className="text-xs text-slate-500">
                  OcupaciA3n: <span className="font-semibold text-slate-800">{session.statusLabel}</span>
                </div>
              </header>

              <div className="mt-3 text-sm text-slate-600">
                <p className="font-semibold text-slate-800">Participantes</p>
                {session.attendees.length === 0 ? (
                  <p className="text-xs text-slate-500">Aï¿½n no hay asistentes confirmados.</p>
                ) : (
                  <ul className="mt-1 flex flex-wrap gap-2 text-xs">
                    {session.attendees.map((attendee) => (
                      <li key={attendee.id ?? attendee.name} className="rounded-full bg-slate-100 px-3 py-1">
                        {attendee.name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="mt-4 flex flex-col gap-3">
                {qrInfo ? (
                  <div className="flex flex-col items-center rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-center">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">QR activo</p>
                    <Img
                      src={`/api/qr/${qrInfo.token}`}
                      alt="QR instructor"
                      width={192}
                      height={192}
                      className="mt-2 h-40 w-40 rounded-lg border border-white object-contain"
                    />
                    <p className="mt-2 text-xs text-emerald-700">
                      Expira en {secondsLeft} segundo{secondsLeft === 1 ? "" : "s"}
                    </p>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleGenerateQr(session)}
                    disabled={qrBusy === session.id}
                    className="inline-flex items-center justify-center rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {qrBusy === session.id ? "Generando..." : "Generar QR para asistencia"}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    );
  };

  const generalOptions = useMemo(() => [{ id: "ALL", name: "Todos los instructores", staffId: null }, ...instructors], [instructors]);

  return (
    <>
      <Head>
        <title>App de instructor | Akdēmia</title>
      </Head>
      <AdminLayout
        title="App de instructor"
        active="instructorApp"
        featureKey="instructorApp"
        minFeatureLevel="READ"
      >
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Mis sesiones</h2>
                <p className="text-sm text-slate-500">Consulta tu agenda del dï¿½a y registra tu llegada.</p>
              </div>
              <label className="text-sm text-slate-600">
                Fecha
                <input
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  className="ml-2 rounded-md border border-slate-200 px-3 py-1 text-sm text-slate-700"
                />
              </label>
            </div>
            <div className="mt-4">
              {personalLoading ? (
                <p className="text-sm text-slate-500">Cargando agenda...</p>
              ) : personalError ? (
                <p className="text-sm text-rose-600">{personalError}</p>
              ) : (
                renderSessions(personal)
              )}
            </div>
            {qrError && <p className="mt-3 text-sm text-rose-600">{qrError}</p>}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Calendario general</h2>
                <p className="text-sm text-slate-500">Consulta las sesiones de otros instructores.</p>
              </div>
              <label className="text-sm text-slate-600">
                Instructor
                <select
                  className="ml-2 rounded-md border border-slate-200 px-3 py-1 text-sm text-slate-700"
                  value={generalInstructor}
                  onChange={(event) => setGeneralInstructor(event.target.value)}
                >
                  {generalOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-4">
              {generalLoading ? (
                <p className="text-sm text-slate-500">Cargando calendario general...</p>
              ) : generalError ? (
                <p className="text-sm text-rose-600">{generalError}</p>
              ) : (
                renderSessions(general)
              )}
            </div>
          </section>
        </div>
      </AdminLayout>
    </>
  );
}


