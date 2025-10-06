import Head from "next/head";
import dayjs from "dayjs";
import {
  useMemo,
  useState,
  type ComponentType,
  type PropsWithChildren,
} from "react";
import type {
  GetServerSideProps,
  InferGetServerSidePropsType,
} from "next";
import AdminLayout from "@/components/admin/AdminLayout";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Bridge tipado por si AdminLayout exige props particulares
const AdminLayoutAny = AdminLayout as unknown as ComponentType<
  PropsWithChildren<Record<string, unknown>>
>;

// ================= Tipos UI =================
// Usamos espanol en la UI, pero alineamos los valores a la DB en SSR
export type PlanEstatus = "Activo" | "Inactivo";

export type MembershipPlanRow = {
  id: string;
  name: string;
  description: string | null;
  billingPeriod: string;
  Precio: number; // price
  Moneda: string; // currency
  trialDays: number | null;
  classQuota: number | null;
  AccesosClases: boolean;
  AccesosCursos: boolean;
  status: PlanEstatus; // mapeado desde is_active
  ActivoMiembros: number; // miembros con este plan activo
  updatedAt: string;
};

export type PageProps = {
  initialPlanes: MembershipPlanRow[];
};

// ================= Helpers =================
const CURRENCY_CACHE: Record<string, Intl.NumberFormat> = {};
function formatCurrency(value: number, currency: string) {
  const key = (currency || "MXN").toUpperCase();
  if (!CURRENCY_CACHE[key]) {
    CURRENCY_CACHE[key] = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: key,
      maximumFractionDigits: 2,
    });
  }
  return CURRENCY_CACHE[key].format(value);
}

function mapPlan(row: any, activeCount: number): MembershipPlanRow {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    billingPeriod: row.billing_period ?? "Mensual",
    Precio: row.price != null ? Number(row.price) : 0,
    Moneda: row.currency ?? "MXN",
    trialDays: row.trial_days ?? null,
    classQuota: row.class_quota ?? null,
    AccesosClases: (row.access_classes ?? row.Accesos_Clases ?? true) as boolean,
    AccesosCursos: (row.access_courses ?? row.Accesos_Cursos ?? false) as boolean,
    status: row.is_active ? "Activo" : "Inactivo",
    ActivoMiembros: activeCount,
    updatedAt: row.updated_at ?? row.created_at,
  };
}

// ================= SSR =================
export const getServerSideProps: GetServerSideProps<PageProps> = async () => {
  const [typesResp, membershipsResp] = await Promise.all([
    supabaseAdmin
      .from("membership_types")
      .select(
        `id, name, description, billing_period, price, currency, trial_days, class_quota, access_classes, access_courses, is_active, updated_at, created_at`
      )
      .order("name"),
    supabaseAdmin
      .from("memberships")
      .select("membership_type_id")
      .eq("status", "ACTIVE"),
  ]);

  if (typesResp.error) throw typesResp.error;
  if (membershipsResp.error) throw membershipsResp.error;

  const counts: Record<string, number> = {};
  for (const row of membershipsResp.data ?? []) {
    const id = (row as any)?.membership_type_id;
    if (!id) continue;
    counts[id] = (counts[id] ?? 0) + 1;
  }

  const initialPlanes: MembershipPlanRow[] = (typesResp.data ?? []).map((row) =>
    mapPlan(row, counts[(row as any).id] ?? 0)
  );

  return { props: { initialPlanes } };
};

// ================= Page =================
export default function AdminMembershipsPage(
  { initialPlanes }: InferGetServerSidePropsType<typeof getServerSideProps>
) {
  const [Planes, setPlanes] = useState<MembershipPlanRow[]>(initialPlanes);
  const [statusFilter, setStatusFilter] = useState<"all" | PlanEstatus>("all");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  type FormState = {
    name: string;
    description: string;
    billingPeriod: string;
    Precio: string; // string para inputs
    Moneda: string;
    trialDays: string;
    classQuota: string;
    AccesosClases: boolean;
    AccesosCursos: boolean;
      isActivo: boolean;
  };

  const DEFAULT_FORM: FormState = {
    name: "",
    description: "",
    billingPeriod: "Mensual",
    Precio: "",
    Moneda: "MXN",
    trialDays: "",
    classQuota: "",
    AccesosClases: true,
    AccesosCursos: false,
    isActivo: true,
  };

  const [formState, setFormState] = useState<FormState>(DEFAULT_FORM);

  const filteredPlanes = useMemo(() => {
    if (statusFilter === "all") return Planes;
    return Planes.filter((p) => p.status === statusFilter);
  }, [Planes, statusFilter]);

  const handleChange = <K extends keyof FormState>(key: K) =>
    (
      event:
        | React.ChangeEvent<HTMLInputElement>
        | React.ChangeEvent<HTMLSelectElement>
        | React.ChangeEvent<HTMLTextAreaElement>
    ) => {
      const target = event.target as HTMLInputElement;
      const value = target.type === "checkbox" ? target.checked : target.value;
      setFormState((prev) => ({ ...prev, [key]: value as any }));
    };

  function resetForm() {
    setFormState(DEFAULT_FORM);
    setMessage(null);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      if (!formState.name.trim()) throw new Error("El nombre es obligatorio");

      const numericPrecio = formState.Precio ? Number(formState.Precio) : 0;
      if (Number.isNaN(numericPrecio) || numericPrecio < 0)
        throw new Error("El precio debe ser un numero positivo");

      const trialDaysValue = formState.trialDays ? Number(formState.trialDays) : null;
      if (trialDaysValue !== null && (Number.isNaN(trialDaysValue) || trialDaysValue < 0))
        throw new Error("Los dias de prueba deben ser un numero positivo");

      const classQuotaValue = formState.classQuota ? Number(formState.classQuota) : null;
      if (classQuotaValue !== null && (Number.isNaN(classQuotaValue) || classQuotaValue < 0))
        throw new Error("El cupo de clases debe ser un numero positivo");

      const payload = {
        //  Ajusta los nombres a lo que espere tu API (snake_case vs camelCase)
        name: formState.name.trim(),
        description: formState.description.trim() || null,
        billing_period: formState.billingPeriod, // si tu API usa camel: billingPeriod
        price: numericPrecio,
        currency: formState.Moneda,
        trial_days: trialDaysValue,
        class_quota: classQuotaValue,
        access_classes: formState.AccesosClases,
        access_courses: formState.AccesosCursos,
        is_active: formState.isActivo,
      };

      const res = await fetch("/api/admin/membership-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "No se pudo crear el plan");
      }
      const body = await res.json();
      const newRow = mapPlan(body.membershipType ?? body.data ?? body, 0);
      setPlanes((prev) => [newRow, ...prev]);
      setMessage("Plan creado correctamente");
      resetForm();
    } catch (err: any) {
      setError(err?.message || "No se pudo crear el plan");
    } finally {
      setSaving(false);
    }
  }

  async function togglePlanEstatus(plan: MembershipPlanRow) {
    try {
      const res = await fetch("/api/admin/membership-types", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: plan.id, is_active: plan.status !== "Activo" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "No se pudo actualizar el plan");
      }
      const body = await res.json();
      const updated = mapPlan(body.membershipType ?? body.data ?? body, plan.ActivoMiembros);
      setPlanes((prev) => prev.map((p) => (p.id === updated.id ? { ...updated, ActivoMiembros: plan.ActivoMiembros } : p)));
    } catch (err: any) {
      setError(err?.message || "No se pudo actualizar el plan");
    }
  }

  const headerToolbar = (
    <div className="flex items-center gap-4">
      <select
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value as any)}
        className="h-10 rounded-md border border-slate-200 px-3 text-sm"
      >
        <option value="all">Todos los planes</option>
        <option value="Activo">Activo</option>
        <option value="Inactivo">Inactivo</option>
      </select>
      <button className="rounded-full p-2 hover:bg-slate-100" type="button" aria-label="Notifications">
        <span className="material-icons-outlined text-slate-500">notifications</span>
      </button>
      <div className="h-9 w-9 rounded-full bg-slate-200" />
    </div>
  );

  return (
    <AdminLayoutAny title="Planes de membresia" active="MembershipPlans" headerToolbar={headerToolbar}>
      <Head>
        <title>Planes  Admin</title>
      </Head>

      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-800">Planes</h2>
              <p className="text-sm text-slate-500">
                Controla precio, cuotas y accesos de cada plan de membresia.
              </p>
            </div>
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <span>Total planes: {Planes.length}</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-6 py-3">Plan</th>
                  <th className="px-6 py-3">Precio</th>
                  <th className="px-6 py-3">Accesos</th>
                  <th className="px-6 py-3">Miembros</th>
                  <th className="px-6 py-3">Estado</th>
                  <th className="px-6 py-3 text-right">Actualizado</th>
                </tr>
              </thead>
              <tbody>
                {filteredPlanes.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-6 text-center text-sm text-slate-500">
                      No hay planes que coincidan con los filtros.
                    </td>
                  </tr>
                ) : (
                  filteredPlanes.map((plan) => {
                    const accessTokens = [
                      plan.AccesosClases ? "Clases" : null,
                      plan.AccesosCursos ? "Cursos" : null,
                    ].filter(Boolean) as string[];

                    return (
                      <tr key={plan.id} className="border-t border-slate-200 hover:bg-slate-50">
                        <td className="px-6 py-4">
                          <p className="font-medium text-slate-800">{plan.name}</p>
                          <p className="text-xs text-slate-500">{plan.description ?? "Sin descripcion"}</p>
                        </td>
                        <td className="px-6 py-4 text-slate-700">
                          {plan.Precio
                            ? `${formatCurrency(plan.Precio, plan.Moneda)} / ${plan.billingPeriod.toLowerCase()}`
                            : "Gratis"}
                          {plan.trialDays ? (
                            <span className="ml-1 text-xs text-slate-500"> {plan.trialDays} dias de prueba</span>
                          ) : null}
                          {plan.classQuota ? (
                            <span className="ml-1 text-xs text-slate-500"> {plan.classQuota} clases</span>
                          ) : null}
                        </td>
                        <td className="px-6 py-4 text-slate-700">
                          {accessTokens.length > 0 ? accessTokens.join(", ") : "Custom"}
                        </td>
                        <td className="px-6 py-4 text-slate-700">{plan.ActivoMiembros}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            {plan.status === "Activo" ? (
                              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                                Activo
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-medium text-rose-700">
                                Inactivo
                              </span>
                            )}
                            <label className="relative inline-flex cursor-pointer items-center">
                              <input
                                type="checkbox"
                                className="peer sr-only"
                                checked={plan.status === "Activo"}
                                onChange={() => togglePlanEstatus(plan)}
                              />
                              <div className="h-5 w-10 rounded-full bg-slate-200 transition peer-checked:bg-brand-600" />
                              <span className="absolute left-0 top-0 ml-1 mt-0.5 h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-5" />
                            </label>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right text-xs text-slate-500">
                          {dayjs(plan.updatedAt).format("DD MMM YYYY")}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold">Crear plan</h3>
          <p className="mt-1 text-xs text-slate-500">
            Define precio, dias de prueba y accesos para un nuevo plan.
          </p>
          <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-medium text-slate-600">Nombre del plan</label>
              <input
                value={formState.name}
                onChange={handleChange("name")}
                placeholder="p. ej., Pilates Pro"
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600">Descripcion</label>
              <textarea
                value={formState.description}
                onChange={handleChange("description")}
                placeholder="Descripcion"
                rows={3}
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-600">Periodo de cobro</label>
                <select
                  value={formState.billingPeriod}
                  onChange={handleChange("billingPeriod")}
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="Mensual">Mensual</option>
                  <option value="Anual">Anual</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600">Precio</label>
                <div className="flex gap-2">
                  <input
                    value={formState.Precio}
                    onChange={handleChange("Precio")}
                    placeholder="120.00"
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  />
                  <select
                    value={formState.Moneda}
                    onChange={handleChange("Moneda")}
                    className="mt-1 w-24 rounded-md border border-slate-200 px-3 py-2 text-sm"
                  >
                    {(["MXN", "USD", "EUR"] as const).map((cur) => (
                      <option key={cur} value={cur}>
                        {cur}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-600">Dias de prueba</label>
                <input
                  value={formState.trialDays}
                  onChange={handleChange("trialDays")}
                  placeholder="Opcional"
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600">Cupo de clases</label>
                <input
                  value={formState.classQuota}
                  onChange={handleChange("classQuota")}
                  placeholder="Opcional"
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <span className="block text-sm font-medium text-slate-600">Accesos incluidos</span>
              <div className="mt-2 grid grid-cols-1 gap-2 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formState.AccesosClases}
                    onChange={handleChange("AccesosClases")}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  Clases
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formState.AccesosCursos}
                    onChange={handleChange("AccesosCursos")}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  Cursos
                </label>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              <span className="font-medium text-slate-600">Activo</span>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={formState.isActivo}
                  onChange={handleChange("isActivo")}
                />
                <div className="h-6 w-11 rounded-full bg-slate-200 transition peer-checked:bg-brand-600" />
                <span className="absolute left-0 top-0 ml-1 mt-1 h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-5" />
              </label>
            </div>
            {message && <p className="text-sm text-emerald-600">{message}</p>}
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={resetForm}
                className="rounded-md border border-slate-200 px-4 py-2 text-sm"
              >
                Limpiar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {saving ? "Guardando..." : "Guardar plan"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </AdminLayoutAny>
  );
}
