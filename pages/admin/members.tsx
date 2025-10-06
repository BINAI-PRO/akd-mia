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

// Puente de tipos: evita que falle si AdminLayout exige props especificas
const AdminLayoutAny = AdminLayout as unknown as ComponentType<
  PropsWithChildren<Record<string, unknown>>
>;

// ===== Tipos alineados a la DB =====
// (usa valores REALES de la DB para que los filtros vuelvan a funcionar)
export type MiembroEstado =
  | "ACTIVE"
  | "PAYMENT_FAILED"
  | "CANCELLED"
  | "ON_HOLD";

// Filas para la UI (mantengo espanol en los nombres mostrados)
type MemberRow = {
  id: string;
  name: string;
  Correo: string | null; // email
  phone: string | null; // phone
  Plan: string | null; // membership_types.name
  Estado: MiembroEstado; // memberships.status o client_profiles.status (fallback)
  MiembroshipEstado: string | null; // memberships.status del plan activo
  nextBilling: string | null; // memberships.next_billing_date
  joinedAt: string; // clients.created_at
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
  initialMiembros: MemberRow[];
  membershipOptions: MembershipOption[];
};

// ==== Helpers ====
function mapMember(row: any): MemberRow {
  const profileStatus: MiembroEstado = (row.client_profiles?.status ?? "ACTIVE") as MiembroEstado;
  const memberships: any[] = Array.isArray(row.memberships) ? row.memberships : [];
  const sorted = [...memberships].sort((a, b) => {
    const aDate = a.end_date ?? a.created_at ?? "";
    const bDate = b.end_date ?? b.created_at ?? "";
    return dayjs(bDate).valueOf() - dayjs(aDate).valueOf();
  });
  const activeMembership =
    sorted.find((m) => m.status === "ACTIVE") ?? sorted[0] ?? null;

  return {
    id: row.id,
    name: row.full_name,
    Correo: row.email ?? null,
    phone: row.phone ?? null,
    Plan: activeMembership?.membership_types?.name ?? null,
    Estado: (activeMembership?.status ?? profileStatus) as MiembroEstado,
    MiembroshipEstado: activeMembership?.status ?? null,
    nextBilling: activeMembership?.next_billing_date ?? null,
    joinedAt: row.created_at,
  };
}

const currencyFormatterCache: Record<string, Intl.NumberFormat> = {};
function getCurrencyFormatter(currency: string) {
  const key = (currency || "MXN").toUpperCase();
  if (!currencyFormatterCache[key]) {
    currencyFormatterCache[key] = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: key,
      maximumFractionDigits: 2,
    });
  }
  return currencyFormatterCache[key];
}

function formatPlanLabel(option: MembershipOption) {
  if (option.price === null) return `${option.name}  Free`;
  const fmt = getCurrencyFormatter(option.currency);
  return `${option.name}  ${fmt.format(option.price)} / ${option.billingPeriod.toLowerCase()}`;
}

function formatEstadoBadgeData(estado: MiembroEstado) {
  switch (estado) {
    case "ACTIVE":
      return { label: "Activo", tone: "bg-emerald-100 text-emerald-700" };
    case "PAYMENT_FAILED":
      return { label: "Pago fallido", tone: "bg-amber-100 text-amber-700" };
    case "ON_HOLD":
      return { label: "En pausa", tone: "bg-slate-200 text-slate-700" };
    case "CANCELLED":
      return { label: "Cancelado", tone: "bg-rose-100 text-rose-700" };
    default:
      return { label: estado, tone: "bg-slate-200 text-slate-700" };
  }
}

// ===== SSR =====
export const getServerSideProps: GetServerSideProps<PageProps> = async () => {
  const [clientsResp, typesResp] = await Promise.all([
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

  if (clientsResp.error) throw clientsResp.error;
  if (typesResp.error) throw typesResp.error;

  const initialMiembros: MemberRow[] = (clientsResp.data as any[] | null)?.map(mapMember) ?? [];
  const membershipOptions: MembershipOption[] = ((typesResp.data as any[] | null) ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    price: t.price !== null && t.price !== undefined ? Number(t.price) : null,
    currency: t.currency ?? "MXN",
    billingPeriod: t.billing_period,
    isActive: !!t.is_active,
  }));

  return { props: { initialMiembros, membershipOptions } };
};

// ===== Pagina =====
export default function AdminMiembrosPage(
  { initialMiembros, membershipOptions }: InferGetServerSidePropsType<typeof getServerSideProps>
) {
  const [rows, setRows] = useState<MemberRow[]>(initialMiembros);
  const [search, setSearch] = useState("");
  const [estadoFilter, setEstadoFilter] = useState<"all" | MiembroEstado>("all");
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [confirmationOpen, setConfirmationOpen] = useState(false);

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
  const [assignState, setAssignState] = useState<AssignState>(() => {
    const firstActive = membershipOptions.find((o) => o.isActive);
    return { ...DEFAULT_ASSIGN, membershipTypeId: firstActive?.id ?? "" };
  });
  const [assignError, setAssignError] = useState<string | null>(null);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (term) {
        const haystack = `${row.name} ${row.Correo ?? ""} ${row.Plan ?? ""}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      if (estadoFilter !== "all" && row.Estado !== estadoFilter) return false;
      return true;
    });
  }, [rows, search, estadoFilter]);

  const headerToolbar = (
    <div className="flex items-center gap-4">
      <div className="relative hidden lg:block">
        <span className="material-icons-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
        <input
          type="search"
          placeholder="Buscar miembros..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10 w-64 rounded-md border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
        />
      </div>
      <button className="rounded-full p-2 hover:bg-slate-100" type="button" aria-label="Notifications">
        <span className="material-icons-outlined text-slate-500">notifications</span>
      </button>
      {/* avatar placeholder */}
      <div className="h-9 w-9 rounded-full bg-slate-200" />
    </div>
  );

  const openAssignModal = () => {
    setAssignError(null);
    const firstActive = membershipOptions.find((o) => o.isActive);
    setAssignState({ ...DEFAULT_ASSIGN, membershipTypeId: firstActive?.id ?? "" });
    setAssignModalOpen(true);
  };

  const closeModals = () => {
    setAssignModalOpen(false);
    setConfirmationOpen(false);
    setAssignError(null);
  };

  async function handleAssignMembership(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAssignError(null);

    if (!assignState.fullName.trim()) return setAssignError("El nombre es obligatorio");
    if (!assignState.membershipTypeId) return setAssignError("Selecciona un plan");

    try {
      //  Ajusta la ruta a la que tengas en tu API real
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
        const idx = prev.findIndex((r) => r.id === member.id);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = member;
          return copy;
        }
        return [member, ...prev];
      });
      setAssignModalOpen(false);
      setConfirmationOpen(true);
    } catch (err: any) {
      setAssignError(err?.message || "No se pudo asignar la membresia");
    }
  }

  return (
    <AdminLayoutAny title="Miembros" active="Miembros" headerToolbar={headerToolbar}>
      <Head>
        <title>Miembros  Admin</title>
      </Head>

      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-800">Miembros</h2>
              <p className="text-sm text-slate-500">
                Supervisa membresias activas, problemas de cobro y asignacion de planes.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={estadoFilter}
                onChange={(e) => setEstadoFilter(e.target.value as any)}
                className="h-9 rounded-md border border-slate-200 px-3 text-sm"
              >
                <option value="all">Todos los estados</option>
                <option value="ACTIVE">Activo</option>
                <option value="PAYMENT_FAILED">Pago fallido</option>
                <option value="ON_HOLD">En pausa</option>
                <option value="CANCELLED">Cancelado</option>
              </select>
              <button
                type="button"
                onClick={openAssignModal}
                className="flex items-center rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
              >
                <span className="material-icons-outlined mr-2 text-base">person_add</span>
                Asignar membresia
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-6 py-3">Miembro</th>
                  <th className="px-6 py-3">Plan</th>
                  <th className="px-6 py-3">Estado</th>
                  <th className="px-6 py-3">Proximo cobro</th>
                  <th className="px-6 py-3 text-right">Alta</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-6 text-center text-sm text-slate-500">
                      No hay miembros que coincidan con los filtros.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => {
                    const badge = formatEstadoBadgeData(row.Estado);
                    return (
                      <tr key={row.id} className="border-t border-slate-200 hover:bg-slate-50">
                        <td className="px-6 py-4 font-medium text-slate-800">
                          <div>{row.name}</div>
                          <div className="text-xs text-slate-500">{row.Correo ?? "Sin correo"}</div>
                        </td>
                        <td className="px-6 py-4 text-slate-700">{row.Plan ?? "Sin plan"}</td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.tone}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-500">
                          {row.nextBilling ? dayjs(row.nextBilling).format("DD MMM YYYY") : ""}
                        </td>
                        <td className="px-6 py-4 text-right text-xs text-slate-500">
                          {dayjs(row.joinedAt).format("DD MMM YYYY")}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-6 py-4 text-sm text-slate-500">
            <span>
              Mostrando {filteredRows.length} de {rows.length} miembros
            </span>
            <div className="flex items-center gap-2">
              <button className="rounded-md border border-slate-200 px-3 py-1 text-sm text-slate-400" type="button" disabled>
                Anterior
              </button>
              <button className="rounded-md border border-slate-200 px-3 py-1 text-sm text-slate-600" type="button" disabled>
                Siguiente
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
                <h3 className="text-lg font-semibold text-slate-800">Asignar membresia</h3>
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
                  <label className="block text-sm font-medium text-slate-600">Nombre del miembro</label>
                  <input
                    value={assignState.fullName}
                    onChange={(e) => setAssignState((p) => ({ ...p, fullName: e.target.value }))}
                    placeholder="Nombre completo"
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600">Correo</label>
                  <input
                    type="email"
                    value={assignState.email}
                    onChange={(e) => setAssignState((p) => ({ ...p, email: e.target.value }))}
                    placeholder="correo@ejemplo.com"
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600">Telefono</label>
                  <input
                    value={assignState.phone}
                    onChange={(e) => setAssignState((p) => ({ ...p, phone: e.target.value }))}
                    placeholder="Opcional"
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600">Plan</label>
                  <select
                    value={assignState.membershipTypeId}
                    onChange={(e) => setAssignState((p) => ({ ...p, membershipTypeId: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="" disabled>
                      Selecciona un plan
                    </option>
                    {membershipOptions.map((o) => (
                      <option key={o.id} value={o.id} disabled={!o.isActive}>
                        {formatPlanLabel(o)}{o.isActive ? "" : "  inactivo"}
                      </option>
                    ))}
                  </select>
                </div>
                {assignError && <p className="text-sm text-rose-600">{assignError}</p>}
              </div>
              <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
                <button
                  type="button"
                  onClick={closeModals}
                  className="rounded-md border border-slate-200 px-4 py-2 text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                >
                  Asignar
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
            <h3 className="text-xl font-semibold text-emerald-800">Membresia asignada</h3>
            <p className="mt-2 text-sm text-slate-600">
              La membresia fue creada y asignada al miembro seleccionado.
            </p>
            <button
              type="button"
              className="mt-6 w-full rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
              onClick={closeModals}
            >
              Listo
            </button>
          </div>
        </div>
      )}
    </AdminLayoutAny>
  );
}
