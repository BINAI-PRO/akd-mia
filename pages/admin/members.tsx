
import { useMemo, useState } from "react";
import dayjs from "dayjs";
import AdminLayout from "@/components/admin/AdminLayout";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type MemberStatus = "ACTIVE" | "PAYMENT_FAILED" | "CANCELED" | "ON_HOLD";

type MemberRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  plan: string | null;
  status: MemberStatus;
  membershipStatus: string | null;
  nextBilling: string | null;
  joinedAt: string;
};

type MembershipOption = {
  id: string;
  name: string;
  price: number | null;
  currency: string;
  billingPeriod: string;
  isActive: boolean;
};

type PageProps = {
  initialMembers: MemberRow[];
  membershipOptions: MembershipOption[];
};

function mapMember(row: any): MemberRow {
  const profileStatus = row.client_profiles?.status ?? "ACTIVE";
  const memberships: any[] = Array.isArray(row.memberships) ? row.memberships : [];
  const sorted = [...memberships].sort((a, b) => {
    const aDate = a.end_date ?? a.created_at ?? "";
    const bDate = b.end_date ?? b.created_at ?? "";
    return dayjs(bDate).valueOf() - dayjs(aDate).valueOf();
  });

  const activeMembership = sorted.find((item) => item.status === "ACTIVE") ?? sorted[0] ?? null;

  return {
    id: row.id,
    name: row.full_name,
    email: row.email,
    phone: row.phone,
    plan: activeMembership?.membership_types?.name ?? null,
    status: profileStatus as MemberStatus,
    membershipStatus: activeMembership?.status ?? null,
    nextBilling: activeMembership?.next_billing_date ?? null,
    joinedAt: row.created_at,
  };
}

export const getServerSideProps: GetServerSideProps<PageProps> = async () => {
  const [{ data: clients, error: clientsError }, { data: plans, error: plansError }] = await Promise.all([
    supabaseAdmin
      .from("clients")
      .select(
        `
        id,
        full_name,
        email,
        phone,
        created_at,
        client_profiles(status),
        memberships(
          id,
          status,
          start_date,
          end_date,
          next_billing_date,
          created_at,
          membership_types(name)
        )
      `
      )
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("membership_types")
      .select("id, name, price, currency, billing_period, is_active")
      .order("name"),
  ]);

  if (clientsError) {
    console.error("admin/members clients", clientsError);
  }
  if (plansError) {
    console.error("admin/members plans", plansError);
  }

  const initialMembers = (clients ?? []).map(mapMember);

  const membershipOptions = (plans ?? []).map((plan) => ({
    id: plan.id,
    name: plan.name,
    price: plan.price !== null ? Number(plan.price) : null,
    currency: plan.currency ?? "MXN",
    billingPeriod: plan.billing_period,
    isActive: plan.is_active ?? true,
  }));

  return {
    props: {
      initialMembers,
      membershipOptions,
    },
  };
};

type StatusFilter = "all" | MemberStatus;

type AssignState = {
  fullName: string;
  email: string;
  phone: string;
  membershipTypeId: string;
};

const DEFAULT_ASSIGN: AssignState = {
  fullName: "",
  email: "",
  phone: "",
  membershipTypeId: "",
};

function formatStatus(status: MemberStatus) {
  switch (status) {
    case "ACTIVE":
      return { label: "Active", tone: "bg-emerald-100 text-emerald-700" };
    case "PAYMENT_FAILED":
      return { label: "Payment Failed", tone: "bg-amber-100 text-amber-700" };
    case "CANCELED":
      return { label: "Canceled", tone: "bg-rose-100 text-rose-700" };
    case "ON_HOLD":
      return { label: "On Hold", tone: "bg-slate-200 text-slate-700" };
    default:
      return { label: status, tone: "bg-slate-200 text-slate-700" };
  }
}

function formatPlanLabel(option: MembershipOption) {
  if (option.price === null) {
    return `${option.name} - Free`;
  }
  const formatter = getCurrencyFormatter(option.currency);
  return `${option.name} - ${formatter.format(option.price)} / ${option.billingPeriod.toLowerCase()}`;
}

const currencyFormatterCache: Record<string, Intl.NumberFormat> = {};

function getCurrencyFormatter(currency: string) {
  const key = currency.toUpperCase();
  if (!currencyFormatterCache[key]) {
    currencyFormatterCache[key] = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: key,
      maximumFractionDigits: 2,
    });
  }
  return currencyFormatterCache[key];
}

export default function AdminMembersPage({
  initialMembers,
  membershipOptions,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [rows, setRows] = useState<MemberRow[]>(initialMembers);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [assignState, setAssignState] = useState<AssignState>(() => {
    const firstActive = membershipOptions.find((option) => option.isActive);
    return {
      fullName: "",
      email: "",
      phone: "",
      membershipTypeId: firstActive?.id ?? "",
    };
  });
  const [assignError, setAssignError] = useState<string | null>(null);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (term) {
        const haystack = `${row.name} ${row.email ?? ""} ${row.plan ?? ""}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      return true;
    });
  }, [rows, search, statusFilter]);

  const headerToolbar = (
    <div className="flex items-center gap-4">
      <div className="relative hidden lg:block">
        <span className="material-icons-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
        <input
          type="search"
          placeholder="Search members..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10 w-64 rounded-md border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
        />
      </div>
      <button className="rounded-full p-2 hover:bg-slate-100" type="button" aria-label="Notifications">
        <span className="material-icons-outlined text-slate-500">notifications</span>
      </button>
      <img src="/angie.jpg" alt="Usuario" className="h-9 w-9 rounded-full object-cover" />
    </div>
  );

  const openAssignModal = () => {
    setAssignError(null);
    const firstActive = membershipOptions.find((option) => option.isActive);
    setAssignState({ ...DEFAULT_ASSIGN, membershipTypeId: firstActive?.id ?? "" });
    setAssignModalOpen(true);
  };

  const closeModals = () => {
    setAssignModalOpen(false);
    setConfirmationOpen(false);
    setAssignError(null);
  };

  const handleAssignMembership = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAssignError(null);

    if (!assignState.fullName.trim()) {
      setAssignError("El nombre es obligatorio");
      return;
    }
    if (!assignState.membershipTypeId) {
      setAssignError("Selecciona un plan");
      return;
    }

    try {
      const response = await fetch("/api/admin/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: assignState.fullName.trim(),
          email: assignState.email.trim() || null,
          phone: assignState.phone.trim() || null,
          membershipTypeId: assignState.membershipTypeId,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "No se pudo asignar la membresia");
      }

      const body = await response.json();
      const member = mapMember(body.member);
      setRows((prev) => {
        const existingIndex = prev.findIndex((row) => row.id === member.id);
        if (existingIndex >= 0) {
          const next = [...prev];
          next[existingIndex] = member;
          return next;
        }
        return [member, ...prev];
      });

      setAssignModalOpen(false);
      setConfirmationOpen(true);
    } catch (error: any) {
      setAssignError(error?.message || "No se pudo asignar la membresia");
    }
  };

  return (
    <AdminLayout title="Members" active="members" headerToolbar={headerToolbar}>
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-800">Members</h2>
              <p className="text-sm text-slate-500">Monitor active memberships, billing issues, and plan assignments.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                className="h-9 rounded-md border border-slate-200 px-3 text-sm"
              >
                <option value="all">All statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="PAYMENT_FAILED">Payment failed</option>
                <option value="ON_HOLD">On hold</option>
                <option value="CANCELED">Canceled</option>
              </select>
              <button
                type="button"
                onClick={openAssignModal}
                className="flex items-center rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
              >
                <span className="material-icons-outlined mr-2 text-base">person_add</span>
                Assign membership
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-6 py-3">Member</th>
                  <th className="px-6 py-3">Plan</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Next billing</th>
                  <th className="px-6 py-3 text-right">Joined</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-6 text-center text-sm text-slate-500">
                      No members match the current filters.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => {
                    const status = formatStatus(row.status);
                    return (
                      <tr key={row.id} className="border-t border-slate-200 hover:bg-slate-50">
                        <td className="px-6 py-4 font-medium text-slate-800">
                          <div>{row.name}</div>
                          <div className="text-xs text-slate-500">{row.email ?? "No email"}</div>
                        </td>
                        <td className="px-6 py-4 text-slate-700">{row.plan ?? "No plan"}</td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${status.tone}`}>
                            {status.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-500">
                          {row.nextBilling ? dayjs(row.nextBilling).format("MMM DD, YYYY") : "�"}
                        </td>
                        <td className="px-6 py-4 text-right text-xs text-slate-500">
                          {dayjs(row.joinedAt).format("MMM DD, YYYY")}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-6 py-4 text-sm text-slate-500">
            <span>Showing {filteredRows.length} of {rows.length} members</span>
            <div className="flex items-center gap-2">
              <button className="rounded-md border border-slate-200 px-3 py-1 text-sm text-slate-400" type="button" disabled>
                Previous
              </button>
              <button className="rounded-md border border-slate-200 px-3 py-1 text-sm text-slate-600" type="button" disabled>
                Next
              </button>
            </div>
          </div>
        </section>
      </div>

      {assignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-2xl">
            <form onSubmit={handleAssignMembership}>
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                <h3 className="text-lg font-semibold text-slate-800">Assign membership</h3>
                <button
                  type="button"
                  className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100"
                  onClick={closeModals}
                  aria-label="Close"
                >
                  <span className="material-icons-outlined">close</span>
                </button>
              </div>
              <div className="space-y-4 px-6 py-6">
                <div>
                  <label className="block text-sm font-medium text-slate-600">Member name</label>
                  <input
                    value={assignState.fullName}
                    onChange={(e) => setAssignState((prev) => ({ ...prev, fullName: e.target.value }))}
                    placeholder="Full name"
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600">Email</label>
                  <input
                    type="email"
                    value={assignState.email}
                    onChange={(e) => setAssignState((prev) => ({ ...prev, email: e.target.value }))}
                    placeholder="example@email.com"
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600">Phone</label>
                  <input
                    value={assignState.phone}
                    onChange={(e) => setAssignState((prev) => ({ ...prev, phone: e.target.value }))}
                    placeholder="Optional"
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600">Plan</label>
                  <select
                    value={assignState.membershipTypeId}
                    onChange={(e) => setAssignState((prev) => ({ ...prev, membershipTypeId: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="" disabled>
                      Select a plan
                    </option>
                    {membershipOptions.map((option) => (
                      <option key={option.id} value={option.id} disabled={!option.isActive}>
                        {formatPlanLabel(option)}{option.isActive ? "" : " - inactive"}
                      </option>
                    ))}
                  </select>
                </div>
                {assignError && <p className="text-sm text-rose-600">{assignError}</p>}
              </div>
              <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
                <button type="button" onClick={closeModals} className="rounded-md border border-slate-200 px-4 py-2 text-sm">
                  Cancel
                </button>
                <button type="submit" className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
                  Assign
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmationOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-sm rounded-lg border border-emerald-200 bg-white p-8 text-center shadow-2xl">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <span className="material-icons-outlined text-4xl text-emerald-600">check_circle</span>
            </div>
            <h3 className="text-xl font-semibold text-emerald-800">Membership assigned</h3>
            <p className="mt-2 text-sm text-slate-600">
              La membresia fue creada y asignada al miembro seleccionado.
            </p>
            <button
              type="button"
              className="mt-6 w-full rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
              onClick={closeModals}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}


