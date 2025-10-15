
import Head from "next/head";
import dayjs from "dayjs";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { supabaseAdmin } from "@/lib/supabase-admin";
import AdminLayout from "@/components/admin/AdminLayout";
import Img from "@/components/Img";
import type { Tables } from "@/types/database";

type Stats = {
  activeMembers: number;
  upcomingClasses: number;
  revenue: number;
  unpaidInvoices: number;
};

type UpcomingSession = {
  id: string;
  classType: string;
  startTime: string;
  endTime: string;
  instructor: string;
  room: string;
  capacity: number;
  occupancy: number;
};

type RecentPayment = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  paidAt: string | null;
  memberName?: string | null;
  membershipName?: string | null;
};

type PageProps = {
  stats: Stats;
  upcomingSessions: UpcomingSession[];
  recentPayments: RecentPayment[];
  referralUrl: string;
};

type PaymentRow = Pick<Tables<'membership_payments'>, 'amount' | 'currency'>;

type BookingRow = Pick<Tables<'bookings'>, 'session_id' | 'status'>;

type UpcomingSessionRow = Tables<'sessions'> & {
  class_types: Pick<Tables<'class_types'>, 'name'> | null;
  instructors: Pick<Tables<'instructors'>, 'full_name'> | null;
  rooms: Pick<Tables<'rooms'>, 'name'> | null;
};

type RecentPaymentRow = Tables<'membership_payments'> & {
  memberships: (
    Pick<Tables<'memberships'>, 'id'> & {
      clients: Pick<Tables<'clients'>, 'full_name'> | null;
      membership_types: Pick<Tables<'membership_types'>, 'name'> | null;
    }
  ) | null;
};

const PESO_FORMATTER = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

const NUMBER_FORMATTER = new Intl.NumberFormat("es-MX");

export const getServerSideProps: GetServerSideProps<PageProps> = async () => {
  const now = dayjs();
  const todayIso = now.startOf("day").format("YYYY-MM-DD");
  const startOfMonth = now.startOf("month").toISOString();
  const endOfMonth = now.endOf("month").toISOString();
  const inSevenDays = now.add(7, "day").toISOString();

  try {
    const [
      membershipsCountResp,
      upcomingCountResp,
      paymentsResp,
      unpaidResp,
      upcomingSessionsResp,
      bookingsResp,
      recentPaymentsResp,
    ] = await Promise.all([
      supabaseAdmin
        .from("memberships")
        .select("id", { count: "exact", head: true })
        .eq("status", "ACTIVE")
        .gte("end_date", todayIso),
      supabaseAdmin
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .gte("start_time", now.toISOString())
        .lte("start_time", inSevenDays),
      supabaseAdmin
        .from("membership_payments")
        .select("amount,currency")
        .eq("status", "SUCCESS")
        .gte("paid_at", startOfMonth)
        .lte("paid_at", endOfMonth),
      supabaseAdmin
        .from("membership_payments")
        .select("id", { count: "exact", head: true })
        .in("status", ["PENDING", "FAILED"]),
      supabaseAdmin
        .from("sessions")
        .select(
          "id, start_time, end_time, capacity, current_occupancy, class_types(name), instructors(full_name), rooms(name)"
        )
        .gte("start_time", now.toISOString())
        .order("start_time", { ascending: true })
        .limit(5),
      supabaseAdmin
        .from("bookings")
        .select("session_id, status")
        .gte("reserved_at", now.subtract(30, "day").toISOString()),
      supabaseAdmin
        .from("membership_payments")
        .select(
          "id, amount, currency, status, paid_at, memberships ( clients ( full_name ), membership_types ( name ) )"
        )
        .order("paid_at", { ascending: false })
        .limit(6),
    ]);

    const paymentRows = (paymentsResp.data ?? []) as PaymentRow[];
    const bookingRows = (bookingsResp.data ?? []) as BookingRow[];
    const upcomingRows = (upcomingSessionsResp.data ?? []) as UpcomingSessionRow[];
    const recentRows = (recentPaymentsResp.data ?? []) as RecentPaymentRow[];

    const stats: Stats = {
      activeMembers: membershipsCountResp.count ?? 0,
      upcomingClasses: upcomingCountResp.count ?? 0,
      revenue: paymentRows.reduce((acc, row) => acc + Number(row.amount ?? 0), 0),
      unpaidInvoices: unpaidResp.count ?? 0,
    };

    const bookingOccupancy = new Map<string, number>();
    bookingRows.forEach((row) => {
      if (!row.session_id) return;
      const current = bookingOccupancy.get(row.session_id) ?? 0;
      if (row.status !== "CANCELLED") {
        bookingOccupancy.set(row.session_id, current + 1);
      }
    });

    const upcomingSessions: UpcomingSession[] = upcomingRows.map((row) => ({
      id: row.id,
      classType: row.class_types?.name ?? "Clase",
      startTime: row.start_time,
      endTime: row.end_time,
      instructor: row.instructors?.full_name ?? "-",
      room: row.rooms?.name ?? "-",
      capacity: row.capacity ?? 0,
      occupancy: bookingOccupancy.get(row.id) ?? row.current_occupancy ?? 0,
    }));

    const recentPayments: RecentPayment[] = recentRows.map((row) => ({
      id: row.id,
      amount: Number(row.amount ?? 0),
      currency: row.currency ?? "MXN",
      status: row.status,
      paidAt: row.paid_at ?? null,
      memberName: row.memberships?.clients?.full_name ?? null,
      membershipName: row.memberships?.membership_types?.name ?? null,
    }));

    return {
      props: {
        stats,
        upcomingSessions,
        recentPayments,
        referralUrl:
          process.env.NEXT_PUBLIC_BASE_URL?.concat("/?ref=admin") ??
          "https://pilatestime.io/?ref=admin",
      },
    };
  } catch (error) {
    console.error("admin dashboard SSR", error);
    return {
      props: {
        stats: { activeMembers: 0, upcomingClasses: 0, revenue: 0, unpaidInvoices: 0 },
        upcomingSessions: [],
        recentPayments: [],
        referralUrl:
          process.env.NEXT_PUBLIC_BASE_URL?.concat("/?ref=admin") ??
          "https://pilatestime.io/?ref=admin",
      },
    };
  }
};

export default function AdminDashboardPage({
  stats,
  upcomingSessions,
  recentPayments,
  referralUrl,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <AdminLayout
      title="Tablero"
      active="dashboard"
      headerToolbar={
        <div className="flex items-center gap-4">
          <div className="relative hidden lg:block">
            <span className="material-icons-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              search
            </span>
            <input
              type="search"
              placeholder="Buscar..."
              className="h-10 w-64 rounded-md border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
          </div>
          <button className="rounded-full p-2 hover:bg-slate-100" type="button" aria-label="Notificaciones">
            <span className="material-icons-outlined text-slate-500">notifications</span>
          </button>
          <Img src="/angie.jpg" alt="Usuario" width={36} height={36} className="h-9 w-9 rounded-full object-cover" />
        </div>
      }
    >
      <Head>
        <title>AT Pilates Time - Tablero</title>
      </Head>
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <section className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="Miembros activos"
            icon="people_alt"
            tone="indigo"
            value={NUMBER_FORMATTER.format(stats.activeMembers)}
            helper="Estado ACTIVO"
          />
          <StatCard
            title="Sesiones próximas (7d)"
            icon="event_available"
            tone="green"
            value={NUMBER_FORMATTER.format(stats.upcomingClasses)}
            helper="Proximos 7 dias"
          />
          <StatCard
            title="Ingresos (mes)"
            icon="monetization_on"
            tone="amber"
            value={PESO_FORMATTER.format(stats.revenue)}
            helper="Pagos exitosos"
          />
          <StatCard
            title="Facturas pendientes"
            icon="pending_actions"
            tone="rose"
            value={NUMBER_FORMATTER.format(stats.unpaidInvoices)}
            helper="Pendientes / fallidos"
          />
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Acceso Directo</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
            {[
              { label: "Nueva sesión", icon: "add_circle_outline", primary: true },
              { label: "Agregar miembro", icon: "person_add" },
              { label: "Crear factura", icon: "receipt_long" },
              { label: "Enviar correo", icon: "email" },
              { label: "Ver reportes", icon: "bar_chart" },
            ].map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={() => alert("Funcion en desarrollo")}
                className={`flex h-24 flex-col items-center justify-center gap-2 rounded-lg border text-sm font-medium transition ${
                  action.primary
                    ? "border-brand-500 bg-brand-500 text-white hover:bg-brand-600"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span className="material-icons-outlined text-2xl" aria-hidden="true">
                  {action.icon}
                </span>
                <span>{action.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Próximas Sesiones</h2>
              <span className="text-xs text-slate-500">Proximos 5 turnos</span>
            </div>
            {upcomingSessions.length === 0 ? (
              <p className="text-sm text-slate-500">No hay sesiones programadas en los próximos días.</p>
            ) : (
              <ul className="space-y-4">
                {upcomingSessions.map((session) => {
                  const start = dayjs(session.startTime).format("D MMM, HH:mm");
                  return (
                    <li
                      key={session.id}
                      className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3"
                    >
                      <div>
                        <p className="text-sm text-slate-500">{start}</p>
                        <p className="text-base font-medium">{session.classType}</p>
                        <p className="text-xs text-slate-500">
                          {session.instructor}  {session.room}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">
                          {session.occupancy}/{session.capacity}
                        </p>
                        <p className="text-xs text-slate-500">Ocupacion</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Pagos Recientes</h2>
              <span className="text-xs text-slate-500">Ultimos 6</span>
            </div>
            {recentPayments.length === 0 ? (
              <p className="text-sm text-slate-500">Aun no hay pagos registrados.</p>
            ) : (
              <ul className="space-y-3">
                {recentPayments.map((payment) => {
                  const paidLabel = payment.paidAt
                    ? dayjs(payment.paidAt).format("DD MMM YYYY")
                    : "Sin registrar";
                  const amountFormatter = new Intl.NumberFormat("es-MX", {
                    style: "currency",
                    currency: payment.currency || "MXN",
                  });
                  const tone =
                    payment.status === "SUCCESS"
                      ? "text-emerald-600 bg-emerald-50"
                      : payment.status === "PENDING"
                      ? "text-amber-600 bg-amber-50"
                      : "text-rose-600 bg-rose-50";
                  return (
                    <li key={payment.id} className="rounded-lg border border-slate-200 px-4 py-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{payment.memberName ?? "Cliente"}</p>
                          <p className="text-xs text-slate-500">{payment.membershipName ?? "Membresia"}</p>
                        </div>
                        <div className="text-sm font-semibold">
                          {amountFormatter.format(payment.amount)}
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                        <span>{paidLabel}</span>
                        <span className={`rounded-full px-2 py-0.5 font-medium ${tone}`}>
                          {payment.status}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-4 rounded-xl border border-indigo-200 bg-indigo-50 p-6 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-indigo-900">Quieres $20? Invita a un amigo!</h2>
            <p className="mt-1 text-sm text-indigo-800">
              Comparte PilatesTime y recibe $20 por cada cliente que se convierta en suscriptor.
            </p>
            <button
              type="button"
              className="mt-2 text-sm font-medium text-brand-700 hover:underline"
              onClick={() => alert("Programa de referidos en preparacion")}
            >
              Conoce mas
            </button>
          </div>
          <div className="w-full md:w-auto">
            <div className="flex items-center overflow-hidden rounded-md border border-indigo-200 bg-white">
              <input
                type="text"
                readOnly
                value={referralUrl}
                className="flex-grow px-3 py-2 text-sm text-slate-600 focus:outline-none"
              />
              <button
                type="button"
                className="bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                onClick={() =>
                  navigator.clipboard
                    ?.writeText(referralUrl)
                    .catch(() => alert("No se pudo copiar"))
                }
              >
                Copiar
              </button>
            </div>
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}

type StatCardProps = {
  title: string;
  icon: string;
  tone: "indigo" | "green" | "amber" | "rose";
  value: string;
  helper: string;
};

function StatCard({ title, icon, tone, value, helper }: StatCardProps) {
  const toneClasses: Record<StatCardProps["tone"], { icon: string; bg: string }> = {
    indigo: { icon: "text-indigo-500", bg: "bg-indigo-100" },
    green: { icon: "text-emerald-500", bg: "bg-emerald-100" },
    amber: { icon: "text-amber-500", bg: "bg-amber-100" },
    rose: { icon: "text-rose-500", bg: "bg-rose-100" },
  };
  const palette = toneClasses[tone];

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-4">
        <span className={`material-icons-outlined text-2xl rounded-full p-3 ${palette.bg} ${palette.icon}`}>
          {icon}
        </span>
        <div>
          <p className="text-sm text-slate-500">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-slate-400">{helper}</p>
        </div>
      </div>
    </article>
  );
}




