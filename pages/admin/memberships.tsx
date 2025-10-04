import { useMemo, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import dayjs from "dayjs";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { supabaseAdmin } from "@/lib/supabase-admin";

type PlanStatus = "ACTIVE" | "INACTIVE";

type MembershipPlanRow = {
  id: string;
  name: string;
  description: string | null;
  billingPeriod: string;
  price: number;
  currency: string;
  trialDays: number | null;
  classQuota: number | null;
  accessClasses: boolean;
  accessCourses: boolean;
  accessEvents: boolean;
  status: PlanStatus;
  activeMembers: number;
  updatedAt: string;
};

type FormState = {
  name: string;
  description: string;
  billingPeriod: string;
  price: string;
  currency: string;
  trialDays: string;
  classQuota: string;
  accessClasses: boolean;
  accessCourses: boolean;
  accessEvents: boolean;
  isActive: boolean;
};

type PageProps = {
  initialPlans: MembershipPlanRow[];
};

const DEFAULT_FORM: FormState = {
  name: "",
  description: "",
  billingPeriod: "MONTHLY",
  price: "",
  currency: "MXN",
  trialDays: "",
  classQuota: "",
  accessClasses: true,
  accessCourses: false,
  accessEvents: false,
  isActive: true,
};

const currencyFormatterCache: Record<string, Intl.NumberFormat> = {};

function formatCurrency(value: number, currency: string) {
  const key = currency.toUpperCase();
  if (!currencyFormatterCache[key]) {
    currencyFormatterCache[key] = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: key,
    });
  }
  return currencyFormatterCache[key].format(value);
}

function mapPlan(row: any, activeCount: number): MembershipPlanRow {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    billingPeriod: row.billing_period,
    price: row.price !== null ? Number(row.price) : 0,
    currency: row.currency ?? "MXN",
    trialDays: row.trial_days ?? null,
    classQuota: row.class_quota ?? null,
    accessClasses: row.access_classes ?? true,
    accessCourses: row.access_courses ?? false,
    accessEvents: row.access_events ?? false,
    status: row.is_active ? "ACTIVE" : "INACTIVE",
    activeMembers: activeCount,
    updatedAt: row.updated_at ?? row.created_at,
  };
}

export const getServerSideProps: GetServerSideProps<PageProps> = async () => {
  const [{ data: types, error: typesError }, { data: memberships, error: membershipsError }] = await Promise.all([
    supabaseAdmin
      .from("membership_types")
      .select(
        "id, name, description, billing_period, price, currency, trial_days, class_quota, access_classes, access_courses, access_events, is_active, updated_at, created_at"
      )
      .order("name"),
    supabaseAdmin
      .from("memberships")
      .select("membership_type_id")
      .eq("status", "ACTIVE"),
  ]);

  if (typesError) {
    console.error("admin/memberships types", typesError);
  }
  if (membershipsError) {
    console.error("admin/memberships counts", membershipsError);
  }

  const counts: Record<string, number> = {};
  (memberships ?? []).forEach((row: any) => {
    if (!row?.membership_type_id) return;
    counts[row.membership_type_id] = (counts[row.membership_type_id] ?? 0) + 1;
  });

  const initialPlans = (types ?? []).map((row) => mapPlan(row, counts[row.id] ?? 0));

  return {
    props: {
      initialPlans,
    },
  };
};

type StatusFilter = "all" | PlanStatus;

export default function AdminMembershipsPage({
  initialPlans,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [plans, setPlans] = useState<MembershipPlanRow[]>(initialPlans);
  const [formState, setFormState] = useState<FormState>(DEFAULT_FORM);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const filteredPlans = useMemo(() => {
    if (statusFilter === "all") return plans;
    return plans.filter((plan) => plan.status === statusFilter);
  }, [plans, statusFilter]);

  const handleChange = <K extends keyof FormState>(key: K) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const value = event.target.type === "checkbox" ? (event.target as HTMLInputElement).checked : event.target.value;
      setFormState((prev) => ({ ...prev, [key]: value as any }));
    };

  const resetForm = () => {
    setFormState(DEFAULT_FORM);
    setMessage(null);
    setError(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      if (!formState.name.trim()) {
        throw new Error("El nombre es obligatorio");
      }

      const numericPrice = formState.price ? Number(formState.price) : 0;
      if (Number.isNaN(numericPrice) || numericPrice < 0) {
        throw new Error("El precio debe ser un numero positivo");
      }

      const trialDaysValue = formState.trialDays ? Number(formState.trialDays) : null;
      if (trialDaysValue !== null && (Number.isNaN(trialDaysValue) || trialDaysValue < 0)) {
        throw new Error("Los dias de prueba deben ser un numero positivo");
      }

      const classQuotaValue = formState.classQuota ? Number(formState.classQuota) : null;
      if (classQuotaValue !== null && (Number.isNaN(classQuotaValue) || classQuotaValue < 0)) {
        throw new Error("El cupo de clases debe ser un numero positivo");
      }

      const payload = {
        name: formState.name.trim(),
        description: formState.description.trim() || null,
        billingPeriod: formState.billingPeriod,
        price: numericPrice,
        currency: formState.currency,
        trialDays: trialDaysValue,
        classQuota: classQuotaValue,
        accessClasses: formState.accessClasses,
        accessCourses: formState.accessCourses,
        accessEvents: formState.accessEvents,
        isActive: formState.isActive,
      };

      const response = await fetch("/api/admin/membership-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "No se pudo crear el plan");
      }

      const body = await response.json();
      const plan = mapPlan(body.membershipType, 0);
      setPlans((prev) => [plan, ...prev]);
      setMessage("Plan creado correctamente");
      resetForm();
    } catch (err: any) {
      setError(err?.message || "No se pudo crear el plan");
    } finally {
      setSaving(false);
    }
  };

  const togglePlanStatus = async (plan: MembershipPlanRow) => {
    try {
      const response = await fetch("/api/admin/membership-types", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: plan.id, isActive: plan.status !== "ACTIVE" }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "No se pudo actualizar el plan");
      }

      const body = await response.json();
      const updated = mapPlan(body.membershipType, plan.activeMembers);
      setPlans((prev) => prev.map((item) => (item.id === updated.id ? { ...updated, activeMembers: plan.activeMembers } : item)));
    } catch (err: any) {
      setError(err?.message || "No se pudo actualizar el plan");
    }
  };

  const renderStatus = (status: PlanStatus) => {
    if (status === "ACTIVE") {
      return <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">Active</span>;
    }
    return <span className="inline-flex items-center rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-medium text-rose-700">Inactive</span>;
  };

  const headerToolbar = (
    <div className="flex items-center gap-4">
      <select
        value={statusFilter}
        onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
        className="h-10 rounded-md border border-slate-200 px-3 text-sm"
      >
        <option value="all">All plans</option>
        <option value="ACTIVE">Active</option>
        <option value="INACTIVE">Inactive</option>
      </select>
      <button className="rounded-full p-2 hover:bg-slate-100" type="button" aria-label="Notifications">
        <span className="material-icons-outlined text-slate-500">notifications</span>
      </button>
      <img src="/angie.jpg" alt="Usuario" className="h-9 w-9 rounded-full object-cover" />
    </div>
  );

  return (
    <AdminLayout title="Membership plans" active="membershipPlans" headerToolbar={headerToolbar}>
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-800">Plans</h2>
              <p className="text-sm text-slate-500">Control pricing, quotas, and access rules for every membership.</p>
            </div>
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <span>Total plans: {plans.length}</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-6 py-3">Plan</th>
                  <th className="px-6 py-3">Pricing</th>
                  <th className="px-6 py-3">Access</th>
                  <th className="px-6 py-3">Members</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Updated</th>
                </tr>
              </thead>
              <tbody>
                {filteredPlans.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-6 text-center text-sm text-slate-500">
                      No plans match the current filters.
                    </td>
                  </tr>
                ) : (
                  filteredPlans.map((plan) => {
                    const accessTokens = [
                      plan.accessClasses ? "Classes" : null,
                      plan.accessCourses ? "Courses" : null,
                      plan.accessEvents ? "Events" : null,
                    ].filter(Boolean);

                    return (
                      <tr key={plan.id} className="border-t border-slate-200 hover:bg-slate-50">
                        <td className="px-6 py-4">
                          <p className="font-medium text-slate-800">{plan.name}</p>
                          <p className="text-xs text-slate-500">{plan.description ?? "Sin descripcion"}</p>
                        </td>
                        <td className="px-6 py-4 text-slate-700">
                          {plan.price ? `${formatCurrency(plan.price, plan.currency)} / ${plan.billingPeriod.toLowerCase()}` : "Free"}
                          {plan.trialDays ? <span className="ml-1 text-xs text-slate-500">- {plan.trialDays} trial days</span> : null}
                          {plan.classQuota ? <span className="ml-1 text-xs text-slate-500">- {plan.classQuota} classes</span> : null}
                        </td>
                        <td className="px-6 py-4 text-slate-700">
                          {accessTokens.length > 0 ? accessTokens.join(", ") : "Custom"}
                        </td>
                        <td className="px-6 py-4 text-slate-700">{plan.activeMembers}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            {renderStatus(plan.status)}
                            <label className="relative inline-flex cursor-pointer items-center">
                              <input
                                type="checkbox"
                                className="peer sr-only"
                                checked={plan.status === "ACTIVE"}
                                onChange={() => togglePlanStatus(plan)}
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
          <h3 className="text-xl font-semibold">Create plan</h3>
          <p className="mt-1 text-xs text-slate-500">Define pricing, trial days, and access rules for a new membership plan.</p>
          <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-medium text-slate-600">Plan name</label>
              <input
                value={formState.name}
                onChange={handleChange("name")}
                placeholder="e.g. Pilates Pro"
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600">Description</label>
              <textarea
                value={formState.description}
                onChange={handleChange("description")}
                placeholder="Short description"
                rows={3}
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-600">Billing period</label>
                <select
                  value={formState.billingPeriod}
                  onChange={handleChange("billingPeriod")}
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="MONTHLY">Monthly</option>
                  <option value="ANNUAL">Annual</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600">Price</label>
                <div className="flex gap-2">
                  <input
                    value={formState.price}
                    onChange={handleChange("price")}
                    placeholder="120.00"
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  />
                  <select
                    value={formState.currency}
                    onChange={handleChange("currency")}
                    className="mt-1 w-24 rounded-md border border-slate-200 px-3 py-2 text-sm"
                  >
                    {['MXN','USD','EUR'].map((currency) => (
                      <option key={currency} value={currency}>
                        {currency}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-600">Trial days</label>
                <input
                  value={formState.trialDays}
                  onChange={handleChange("trialDays")}
                  placeholder="Optional"
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600">Class quota</label>
                <input
                  value={formState.classQuota}
                  onChange={handleChange("classQuota")}
                  placeholder="Optional"
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <span className="block text-sm font-medium text-slate-600">Access scope</span>
              <div className="mt-2 grid grid-cols-1 gap-2 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formState.accessClasses}
                    onChange={handleChange("accessClasses")}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  Classes
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formState.accessCourses}
                    onChange={handleChange("accessCourses")}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  Courses
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formState.accessEvents}
                    onChange={handleChange("accessEvents")}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  Events
                </label>
              </div>
            </div>
            <div className="flex items-center justify-between border rounded-md border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              <span className="font-medium text-slate-600">Active</span>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={formState.isActive}
                  onChange={handleChange("isActive")}
                />
                <div className="h-6 w-11 rounded-full bg-slate-200 transition peer-checked:bg-brand-600" />
                <span className="absolute left-0 top-0 ml-1 mt-1 h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-5" />
              </label>
            </div>
            {message && <p className="text-sm text-emerald-600">{message}</p>}
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={resetForm} className="rounded-md border border-slate-200 px-4 py-2 text-sm">
                Clear
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save plan"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </AdminLayout>
  );
}
