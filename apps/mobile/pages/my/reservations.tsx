import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthContext";

type DashboardBooking = {
  id: string;
  status: string;
  classType: string;
  instructor: string;
  room: string;
  startTime: string;
  endTime: string;
  startLabel: string;
  planPurchaseId: string | null;
  planName: string | null;
};

type DashboardPlan = {
  id: string;
  name: string;
  status: string;
  startDate: string;
  expiresAt: string | null;
  initialClasses: number;
  remainingClasses: number;
  modality: string;
};

type DashboardResponse = {
  upcomingBookings: DashboardBooking[];
  plans: DashboardPlan[];
};

type ScreenState =
  | { status: "idle" | "loading" }
  | { status: "loaded"; data: DashboardResponse }
  | { status: "error"; message: string }
  | { status: "unauthenticated" };

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Activo",
  PAUSED: "En pausa",
  EXPIRED: "Vencido",
  CANCELLED: "Cancelado",
};

function statusLabel(raw: string) {
  return STATUS_LABEL[raw] ?? raw;
}

export default function MyReservationsPage() {
  const { user, loading } = useAuth();
  const [state, setState] = useState<ScreenState>({ status: "idle" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setState({ status: "unauthenticated" });
      return;
    }

    const controller = new AbortController();
    setState({ status: "loading" });

    fetch("/api/my/dashboard", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error ?? "No se pudo cargar el panel");
        }
        return response.json() as Promise<DashboardResponse>;
      })
      .then((data) => {
        setState({ status: "loaded", data });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : "Ocurrió un error inesperado";
        setState({ status: "error", message });
      });

    return () => controller.abort();
  }, [loading, user, reloadKey]);

  const metrics = useMemo(() => {
    if (state.status !== "loaded") {
      return { activePlanCount: 0, remainingClasses: 0 };
    }

    const activePlans = state.data.plans.filter((plan) => plan.status === "ACTIVE");
    const remainingClasses = activePlans.reduce(
      (acc, plan) => acc + Math.max(0, plan.remainingClasses ?? 0),
      0
    );
    return { activePlanCount: activePlans.length, remainingClasses };
  }, [state]);

  const todayLabel = useMemo(
    () =>
      {
        const formatted = new Intl.DateTimeFormat("es-MX", {
          weekday: "long",
          day: "numeric",
          month: "long",
        }).format(new Date());
        return formatted.charAt(0).toUpperCase() + formatted.slice(1);
      },
    []
  );

  let content: JSX.Element;
  if (state.status === "unauthenticated") {
    content = (
      <p className="text-sm text-neutral-600">
        Inicia sesión para consultar tus reservas y tus planes activos.
      </p>
    );
  } else if (state.status === "loading" || state.status === "idle") {
    content = (
      <p className="text-sm text-neutral-500 animate-pulse">
        Cargando tu información...
      </p>
    );
  } else if (state.status === "error") {
    content = (
      <div className="space-y-3">
        <p className="text-sm text-red-600">{state.message}</p>
        <button
          type="button"
          onClick={() => setReloadKey((value) => value + 1)}
          className="rounded-xl border border-neutral-300 px-3 py-2 text-sm font-medium"
        >
          Reintentar
        </button>
      </div>
    );
  } else {
    const { upcomingBookings, plans } = state.data;
    content = (
      <div className="space-y-6">
        <section className="card px-4 py-4 space-y-2">
          <h2 className="text-lg font-semibold text-neutral-900">Tu resumen</h2>
          <p className="text-sm text-neutral-600">{todayLabel}</p>
          <div className="flex items-center justify-between rounded-xl border border-neutral-200 px-4 py-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-neutral-400">Clases reservadas</p>
              <p className="text-lg font-semibold text-neutral-900">
                {upcomingBookings.length}
              </p>
            </div>
            <div className="h-10 w-px bg-neutral-200" />
            <div>
              <p className="text-xs uppercase tracking-wide text-neutral-400">Clases disponibles</p>
              <p className="text-lg font-semibold text-neutral-900">
                {metrics.remainingClasses}
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-neutral-900">Próximas clases</h2>
            <span className="text-xs text-neutral-500">
              {upcomingBookings.length} {upcomingBookings.length === 1 ? "reserva" : "reservas"}
            </span>
          </div>

          {upcomingBookings.length === 0 ? (
            <p className="text-sm text-neutral-500">
              Aún no tienes clases agendadas. Explora el horario para reservar.
            </p>
          ) : (
            <div className="space-y-3">
              {upcomingBookings.map((booking) => (
                <Link
                  key={booking.id}
                  href={`/bookings/${booking.id}`}
                  className="block rounded-2xl border border-neutral-200 bg-white px-4 py-3 shadow-sm transition hover:border-brand-200 hover:shadow-md"
                >
                  <p className="text-sm font-semibold text-neutral-900">{booking.classType}</p>
                  <p className="text-xs text-neutral-500">
                    {booking.startLabel}
                    {booking.room ? ` · ${booking.room}` : ""}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {booking.instructor}
                  </p>
                  {booking.planName ? (
                    <span className="mt-2 inline-flex items-center rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-medium text-brand-700">
                      Plan: {booking.planName}
                    </span>
                  ) : (
                    <span className="mt-2 inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-0.5 text-[11px] font-medium text-neutral-600">
                      Sin plan asignado
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-neutral-900">Planes</h2>
            <span className="text-xs text-neutral-500">
              {metrics.activePlanCount} activos
            </span>
          </div>

          {plans.length === 0 ? (
            <p className="text-sm text-neutral-500">
              No encontramos planes asociados a tu cuenta. Ponte en contacto con recepción si esperabas ver uno.
            </p>
          ) : (
            <div className="space-y-3">
              {plans.map((plan) => {

                const isFixed = plan.modality === "FIXED";

                const used = Math.max(0, plan.initialClasses - plan.remainingClasses);

                const ratio =

                  !isFixed && plan.initialClasses > 0

                    ? Math.min(100, Math.round((plan.remainingClasses / plan.initialClasses) * 100))

                    : 100;

                const expiresLabel = plan.expiresAt

                  ? `Vence el ${new Intl.DateTimeFormat("es-MX", {

                      day: "2-digit",

                      month: "short",

                      year: "numeric",

                    }).format(new Date(plan.expiresAt))}`

                  : isFixed

                  ? "Fechas preasignadas"

                  : "Sin fecha de vencimiento";

                return (

                  <div

                    key={plan.id}

                    className="rounded-2xl border border-neutral-200 bg-white px-4 py-4 shadow-sm"

                  >

                    <div className="flex items-start justify-between gap-2">

                      <div>

                        <p className="text-sm font-semibold text-neutral-900">{plan.name}</p>

                        <p className="text-xs text-neutral-500">{expiresLabel}</p>

                        {isFixed && (

                          <p className="text-xs text-neutral-500">

                            Modalidad fija: {plan.initialClasses} sesiones asignadas

                          </p>

                        )}

                      </div>

                      <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600 uppercase tracking-wide">

                        {statusLabel(plan.status)}

                      </span>

                    </div>



                    {isFixed ? (

                      <div className="mt-3 space-y-1 text-xs text-neutral-600">

                        <p>Reservas automaticas generadas con el curso asignado.</p>

                        <p>Contacta a recepcion si necesitas reprogramar.</p>

                      </div>

                    ) : (

                      <div className="mt-3 space-y-1.5">

                        <div className="flex items-center justify-between text-xs text-neutral-600">

                          <span>Usadas: {used}</span>

                          <span>Restantes: {plan.remainingClasses}</span>

                        </div>

                        <div className="h-2 w-full rounded-full bg-neutral-100">

                          <div

                            className="h-2 rounded-full bg-brand-500 transition-all"

                            style={{ width: `${ratio}%` }}

                          />

                        </div>

                      </div>

                    )}

                  </div>

                );

              })}
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Mis reservas | AT Pilates Time</title>
      </Head>
      <main className="container-mobile py-6 space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-neutral-900">Mis reservas</h1>
          <p className="text-sm text-neutral-500">
            Consulta tus clases agendadas y los créditos disponibles en tus planes.
          </p>
        </div>
        {content}
        <div className="pb-24" />
      </main>
    </>
  );
}
