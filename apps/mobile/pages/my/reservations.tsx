import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthContext";

type MembershipSummary = {
  id: string;
  name: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  nextBillingDate: string | null;
  autoRenew: boolean;
  isActive: boolean;
  price: number | null;
  currency: string | null;
  category: string | null;
} | null;

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
  displayExpiresAt: string | null;
  initialClasses: number | null;
  remainingClasses: number | null;
  reservedCount: number;
  modality: string;
  isUnlimited: boolean;
  category: string | null;
};

type RecentBooking = {
  id: string;
  classType: string;
  instructor: string;
  room: string;
  startTime: string;
  startLabel: string;
  planName: string | null;
  planPurchaseId: string | null;
};

type DashboardResponse = {
  membership: MembershipSummary;
  upcomingBookings: DashboardBooking[];
  plans: DashboardPlan[];
  recentBookings: RecentBooking[];
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

const CATEGORY_LABELS: Record<string, string> = {
  GRUPAL: "Planes grupales",
  PARTICULAR: "Planes particulares",
  SEMI_PARTICULAR: "Planes semi-particulares",
  OTHER: "Otros planes",
};

const CATEGORY_ORDER = ["GRUPAL", "PARTICULAR", "SEMI_PARTICULAR"];

function statusLabel(raw: string) {
  return STATUS_LABEL[raw] ?? raw;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Sin fecha";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Sin fecha";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
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
        const message = error instanceof Error ? error.message : "Ocurrio un error inesperado";
        setState({ status: "error", message });
      });

    return () => controller.abort();
  }, [loading, user, reloadKey]);

  const todayLabel = useMemo(() => {
    const formatted = new Intl.DateTimeFormat("es-MX", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(new Date());
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  }, []);

  const summary = useMemo(() => {
    if (state.status !== "loaded") {
      return { reservedCount: 0, availableCount: 0, hasUnlimited: false };
    }

    const reservedCount = state.data.upcomingBookings.length;
    const activePlans = state.data.plans.filter((plan) => plan.status === "ACTIVE");
    const hasUnlimited = activePlans.some((plan) => plan.isUnlimited);

    const availableCount = activePlans.reduce((acc, plan) => {
      if (plan.isUnlimited) return null;
      if (acc === null) return null;
      const remaining = Math.max(0, plan.remainingClasses ?? 0);
      return acc + remaining;
    }, 0 as number | null);

    return {
      reservedCount,
      availableCount,
      hasUnlimited,
    };
  }, [state]);

  const groupedPlans = useMemo(() => {
    if (state.status !== "loaded") return new Map<string, DashboardPlan[]>();
    const activePlans = state.data.plans.filter((plan) => plan.status === "ACTIVE");
    const map = new Map<string, DashboardPlan[]>();

    activePlans.forEach((plan) => {
      const key = plan.category ? plan.category.toUpperCase() : "OTHER";
      const bucket = map.get(key) ?? [];
      bucket.push(plan);
      map.set(key, bucket);
    });

    CATEGORY_ORDER.forEach((category) => {
      if (map.has(category)) {
        map.set(
          category,
          map
            .get(category)!
            .slice()
            .sort((a, b) => {
              const aDate = a.displayExpiresAt ?? a.expiresAt ?? "";
              const bDate = b.displayExpiresAt ?? b.expiresAt ?? "";
              return aDate.localeCompare(bDate);
            })
        );
      }
    });

    if (map.has("OTHER")) {
      map.set(
        "OTHER",
        map
          .get("OTHER")!
          .slice()
          .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
      );
    }

    return map;
  }, [state]);

  const handleEvaluateSession = (bookingId: string) => {
    alert(`Evaluar sesion ${bookingId}`);
  };

  let content: JSX.Element;
  if (state.status === "unauthenticated") {
    content = <p className="text-sm text-neutral-600">Inicia sesion para consultar tus reservas y tus planes activos.</p>;
  } else if (state.status === "loading" || state.status === "idle") {
    content = (
      <div className="space-y-4">
        <div className="animate-pulse rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-4 shadow-sm">
          <div className="h-4 w-1/3 rounded bg-neutral-200" />
          <div className="mt-2 h-3 w-2/3 rounded bg-neutral-200" />
          <div className="mt-4 h-3 w-1/2 rounded bg-neutral-200" />
        </div>
        <div className="animate-pulse space-y-3">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-4 shadow-sm">
              <div className="h-3 w-2/4 rounded bg-neutral-200" />
              <div className="mt-2 h-3 w-full rounded bg-neutral-200" />
              <div className="mt-2 h-3 w-3/4 rounded bg-neutral-200" />
            </div>
          ))}
        </div>
      </div>
    );
  } else if (state.status === "error") {
    content = (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700 shadow-sm">
        {state.message}
      </div>
    );
  } else {
    const upcomingBookings = state.data.upcomingBookings;
    const recentBookings = state.data.recentBookings;

    const membershipCard = state.data.membership?.isActive ? (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-neutral-900">{state.data.membership?.name ?? "Membresia"}</p>
            <p className="text-xs text-neutral-600">Activa hasta {formatDate(state.data.membership?.endDate ?? state.data.membership?.nextBillingDate)}.</p>
          </div>
          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Activa</span>
        </div>
      </div>
    ) : (
      <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-4 shadow-sm">
        <p className="text-sm text-neutral-600">No tienes una membresia activa actualmente.</p>
      </div>
    );

    const planSections: JSX.Element[] = [];
    CATEGORY_ORDER.concat(["OTHER"]).forEach((categoryKey) => {
      const plans = groupedPlans.get(categoryKey);
      if (!plans || plans.length === 0) return;

      planSections.push(
        <section key={categoryKey} className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-neutral-900">{CATEGORY_LABELS[categoryKey] ?? CATEGORY_LABELS.OTHER}</h2>
            <span className="text-xs text-neutral-500">{plans.length} activos</span>
          </div>
          <div className="space-y-3">
            {plans.map((plan) => {
              const expiresLabel = plan.displayExpiresAt ?? plan.expiresAt;
              const totalClasses = plan.initialClasses ?? 0;
              const reservedClasses = plan.reservedCount;
              const availableClasses = plan.isUnlimited ? null : Math.max(0, plan.remainingClasses ?? 0);
              const usedClasses = plan.isUnlimited
                ? null
                : Math.max(0, totalClasses - (availableClasses ?? 0) - (reservedClasses ?? 0));

              return (
                <div key={plan.id} className="rounded-2xl border border-neutral-200 bg-white px-4 py-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-neutral-900">{plan.name}</p>
                      <p className="text-xs text-neutral-600">Vence {expiresLabel ? formatDate(expiresLabel) : "sin fecha"}</p>
                      {plan.modality === "FIXED" && (
                        <p className="text-[11px] text-neutral-500">Modalidad fija</p>
                      )}
                    </div>
                    <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-600">
                      {statusLabel(plan.status)}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-3 text-center text-xs text-neutral-600">
                    <div>
                      <p className="font-semibold text-neutral-900">{plan.isUnlimited ? "Ilimitado" : usedClasses}</p>
                      <p>Usadas</p>
                    </div>
                    <div>
                      <p className="font-semibold text-neutral-900">{reservedClasses}</p>
                      <p>Reservadas</p>
                    </div>
                    <div>
                      <p className="font-semibold text-neutral-900">{plan.isUnlimited ? "Ilimitado" : availableClasses}</p>
                      <p>Disponibles</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      );
    });

    if (planSections.length === 0) {
      planSections.push(
        <section key="empty-plans" className="rounded-2xl border border-neutral-200 bg-white px-4 py-4 text-sm text-neutral-600 shadow-sm">
          Ningun plan activo en este momento.
        </section>
      );
    }

    content = (
      <div className="space-y-6">
        <section className="rounded-2xl border border-neutral-200 bg-white px-4 py-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-neutral-500">Tu resumen</p>
              <p className="text-lg font-semibold text-neutral-900">{todayLabel}</p>
            </div>
            <button
              type="button"
              className="text-xs font-medium text-brand-600"
              onClick={() => setReloadKey((value) => value + 1)}
            >
              Actualizar
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-center text-sm text-neutral-600">
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-3">
              <p className="text-xs uppercase tracking-wide text-neutral-500">Clases reservadas</p>
              <p className="text-2xl font-bold text-neutral-900">{summary.reservedCount}</p>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-3">
              <p className="text-xs uppercase tracking-wide text-neutral-500">Clases disponibles</p>
              <p className="text-2xl font-bold text-neutral-900">
                {summary.hasUnlimited ? "Ilimitado" : summary.availableCount ?? 0}
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-neutral-900">Membresia</h2>
          {membershipCard}
        </section>

        {planSections}

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-neutral-900">Proximas clases</h2>
            <span className="text-xs text-neutral-500">
              {upcomingBookings.length} {upcomingBookings.length === 1 ? "reserva" : "reservas"}
            </span>
          </div>
          {upcomingBookings.length === 0 ? (
            <p className="text-sm text-neutral-600">No tienes clases por tomar. Agenda una desde el menu principal.</p>
          ) : (
            <div className="space-y-3">
              {upcomingBookings.map((booking) => (
                <Link
                  key={booking.id}
                  href={`/bookings/${booking.id}`}
                  className="block rounded-2xl border border-neutral-200 bg-white px-4 py-4 shadow-sm"
                >
                  <p className="text-sm font-semibold text-neutral-900">{booking.classType}</p>
                  <p className="text-xs text-neutral-500">{formatDateTime(booking.startTime)}</p>
                  <p className="text-xs text-neutral-500">
                    {booking.instructor}
                    {booking.room ? ` · ${booking.room}` : ""}
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
            <h2 className="text-lg font-semibold text-neutral-900">Sesiones recientes</h2>
            <span className="text-xs text-neutral-500">Ultimos 15 dias</span>
          </div>
          {recentBookings.length === 0 ? (
            <p className="text-sm text-neutral-600">Aun no has tomado clases recientemente.</p>
          ) : (
            <div className="space-y-3">
              {recentBookings.map((booking) => (
                <div key={booking.id} className="rounded-2xl border border-neutral-200 bg-white px-4 py-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-neutral-900">{booking.classType}</p>
                      <p className="text-xs text-neutral-500">{formatDateTime(booking.startTime)}</p>
                      <p className="text-xs text-neutral-500">
                        {booking.instructor}
                        {booking.room ? ` · ${booking.room}` : ""}
                      </p>
                      {booking.planName && (
                        <span className="mt-2 inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-0.5 text-[11px] font-medium text-neutral-600">
                          Plan: {booking.planName}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleEvaluateSession(booking.id)}
                      className="rounded-full border border-brand-200 px-3 py-1 text-xs font-semibold text-brand-600 hover:bg-brand-50"
                    >
                      Evaluar sesion
                    </button>
                  </div>
                </div>
              ))}
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
      <main className="container-mobile space-y-6 py-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-neutral-900">Mis reservas</h1>
          <p className="text-sm text-neutral-500">
            Consulta tus clases agendadas y los creditos disponibles en tus planes.
          </p>
        </div>
        {content}
        <div className="pb-24" />
      </main>
    </>
  );
}


