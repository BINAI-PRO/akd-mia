import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import AdminLayout from "@/components/admin/AdminLayout";

type MonthlyRevenue = { month: string; label: string; total: number };
type TopPlan = { id: string; label: string; total: number; percentage: number };
type ExpirationRow = {
  id: string;
  client: string;
  label: string;
  type: "MEMBERSHIP" | "PLAN";
  endDate: string;
  daysLeft: number;
};

type ReportsData = {
  metrics: {
    totalClients: number;
    activeMemberships: number;
    activePlans: number;
    upcomingSessions: number;
  };
  revenue: {
    monthly: MonthlyRevenue[];
    topPlans: TopPlan[];
  };
  expirations: ExpirationRow[];
  sessions: {
    scheduled: number;
    reserved: number;
    attended: number;
    lostByExpiration: number;
  };
};

type LoadState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "success"; data: ReportsData };

const PESO_FORMATTER = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

const NUMBER_FORMATTER = new Intl.NumberFormat("es-MX");

function formatCurrency(value: number) {
  return PESO_FORMATTER.format(Math.round(value));
}

function formatRelativeLabel(daysLeft: number) {
  if (daysLeft < 0) return "Vencido";
  if (daysLeft === 0) return "Hoy";
  if (daysLeft === 1) return "Ma\u00f1ana";
  return `${daysLeft} d\u00edas`;
}

function MetricCard({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
      {helper ? <p className="mt-1 text-xs text-slate-400">{helper}</p> : null}
    </article>
  );
}

function RevenueTrend({ data }: { data: MonthlyRevenue[] }) {
  const maxValue = useMemo(
    () => Math.max(...data.map((item) => item.total), 1),
    [data]
  );

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {data.map((item) => (
        <div key={item.month} className="flex flex-col rounded-lg border border-slate-200 bg-white p-3 text-xs">
          <span className="font-medium text-slate-600">{item.label}</span>
          <div className="mt-2 flex-1">
            <div className="relative h-16 overflow-hidden rounded bg-slate-100">
              <div
                className="absolute bottom-0 left-0 w-full bg-brand-500 transition-all"
                style={{ height: `${Math.max(6, (item.total / maxValue) * 100)}%` }}
              />
            </div>
          </div>
          <span className="mt-2 text-sm font-semibold text-slate-900">{formatCurrency(item.total)}</span>
        </div>
      ))}
    </div>
  );
}

function TopPlansList({ data }: { data: TopPlan[] }) {
  const maxValue = useMemo(
    () => Math.max(...data.map((item) => item.total), 1),
    [data]
  );

  return (
    <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
      {data.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-500">{"No hay ingresos registrados todav\u00eda."}</p>
      ) : (
        data.map((plan) => (
          <div key={plan.id} className="flex flex-col gap-2 px-4 py-3 text-sm text-slate-700">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{plan.label}</span>
              <span className="text-xs text-slate-500">
                {`${(plan.percentage * 100).toFixed(1)}% \u00b7 ${formatCurrency(plan.total)}`}
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-brand-500"
                style={{ width: `${Math.max(4, (plan.total / maxValue) * 100)}%` }}
              />
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function ExpirationsTable({ rows }: { rows: ExpirationRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
        {"No hay vencimientos dentro de los pr\u00f3ximos 30 d\u00edas."}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-sm text-slate-700">
        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3 text-left">Cliente</th>
            <th className="px-4 py-3 text-left">Tipo</th>
            <th className="px-4 py-3 text-left">Vence</th>
            <th className="px-4 py-3 text-right">Restan</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {rows.map((item) => (
            <tr key={`${item.type}-${item.id}`} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-medium text-slate-800">{item.client}</td>
              <td className="px-4 py-3 text-slate-600">
                {`${item.type === "MEMBERSHIP" ? "Membres\u00eda" : "Plan"} \u00b7 ${item.label}`}
              </td>
              <td className="px-4 py-3 text-slate-500">
                {new Date(item.endDate).toLocaleDateString("es-MX", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </td>
              <td className="px-4 py-3 text-right text-slate-500">
                {formatRelativeLabel(item.daysLeft)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SessionsSummary({
  scheduled,
  reserved,
  attended,
  lost,
}: {
  scheduled: number;
  reserved: number;
  attended: number;
  lost: number;
}) {
  const reservationRate = scheduled > 0 ? Math.round((reserved / scheduled) * 100) : 0;
  const attendanceRate = reserved > 0 ? Math.round((attended / reserved) * 100) : 0;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard label="Sesiones programadas" value={NUMBER_FORMATTER.format(scheduled)} />
      <MetricCard
        label="Reservas confirmadas"
        value={NUMBER_FORMATTER.format(reserved)}
        helper={`${reservationRate}% de ocupaci\u00f3n`}
      />
      <MetricCard
        label="Asistencias"
        value={NUMBER_FORMATTER.format(attended)}
        helper={`${attendanceRate}% de asistencia`}
      />
      <MetricCard
        label="Sesiones perdidas por vencimiento"
        value={NUMBER_FORMATTER.format(lost)}
        helper="Cr\u00e9ditos que expiraron con saldo"
      />
    </div>
  );
}

export default function ReportsPage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/reports/overview");
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error ?? "No se pudieron cargar los reportes");
        }
        if (!active) return;
        setState({ status: "success", data: payload as ReportsData });
      } catch (error) {
        if (!active) return;
        const message = error instanceof Error ? error.message : "Error inesperado";
        setState({ status: "error", error: message });
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, []);

  const renderContent = () => {
    if (state.status === "loading") {
      return (
        <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-slate-200 bg-white text-sm text-slate-500">
          {"Cargando reportes..."}
        </div>
      );
    }

    if (state.status === "error") {
      return (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-600">
          {state.error}
        </div>
      );
    }

    const { data } = state;

    return (
      <div className="space-y-6">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Usuarios registrados"
            value={NUMBER_FORMATTER.format(data.metrics.totalClients)}
          />
          <MetricCard
            label="Membres\u00edas activas"
            value={NUMBER_FORMATTER.format(data.metrics.activeMemberships)}
          />
          <MetricCard
            label="Planes activos"
            value={NUMBER_FORMATTER.format(data.metrics.activePlans)}
          />
          <MetricCard
            label="Sesiones pr\u00f3ximas (7 d\u00edas)"
            value={NUMBER_FORMATTER.format(data.metrics.upcomingSessions)}
          />
        </section>

        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <header className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{"Ingresos mensuales"}</h2>
              <p className="text-sm text-slate-500">
                {"Montos consolidados de membres\u00edas y planes (\u00faltimos 12 meses)."}
              </p>
            </div>
          </header>
          <RevenueTrend data={data.revenue.monthly} />
        </section>

        <section className="space-y-4">
          <header className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">{"Top planes por ventas"}</h2>
            <p className="text-xs text-slate-500">{"Acumulado del mismo per\u00edodo."}</p>
          </header>
          <TopPlansList data={data.revenue.topPlans} />
        </section>

        <section className="space-y-4">
          <header className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">{"Vencimientos pr\u00f3ximos"}</h2>
            <p className="text-xs text-slate-500">{"Pr\u00f3ximos 30 d\u00edas (planes y membres\u00edas)."}</p>
          </header>
          <ExpirationsTable rows={data.expirations.slice(0, 25)} />
        </section>

        <section className="space-y-4">
          <header className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">{"Sesiones y asistencia"}</h2>
            <p className="text-xs text-slate-500">
              {"Actividades para los siguientes 30 d\u00edas y cr\u00e9ditos expirados."}
            </p>
          </header>
          <SessionsSummary
            scheduled={data.sessions.scheduled}
            reserved={data.sessions.reserved}
            attended={data.sessions.attended}
            lost={data.sessions.lostByExpiration}
          />
        </section>
      </div>
    );
  };

  return (
    <>
      <Head>
        <title>Reportes | Panel Admin</title>
      </Head>
      <AdminLayout title="Reportes" active="reports">
        <div className="mx-auto max-w-6xl space-y-6">{renderContent()}</div>
      </AdminLayout>
    </>
  );
}
