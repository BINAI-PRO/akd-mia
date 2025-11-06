import Head from "next/head";
import Link from "next/link";
import dayjs from "dayjs";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
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
import { useAuth } from "@/components/auth/AuthContext";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Tables } from "@/types/database";

dayjs.extend(isSameOrAfter);

// Puente de tipos: evita que falle si AdminLayout exige props especificas
const AdminLayoutAny = AdminLayout as unknown as ComponentType<
  PropsWithChildren<Record<string, unknown>>
>;

// ===== Tipos alineados a la DB =====
// (usa valores REALES de la DB para que los filtros vuelvan a funcionar)
export type MiembroEstado = "ACTIVE" | "ON_HOLD" | "CANCELED";

type MembershipState = "ACTIVE" | "EXPIRED" | "NONE";

type MemberRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  membershipName: string | null;
  membershipStatus: MembershipState;
  membershipEnd: string | null;
  membershipNextBilling: string | null;
  membershipPrivileges: string | null;
  lastMembershipTypeId: string | null;
  hasActiveMembership: boolean;
  planActiveCount: number;
  Estado: MiembroEstado;
  joinedAt: string;
};

type MembershipOption = {
  id: string;
  name: string;
  price: number;
  currency: string;
  privileges: string | null;
  allowMultiYear: boolean;
  maxPrepaidYears: number | null;
  isActive: boolean;
};

type PlanOption = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  classCount: number | null;
  validityDays: number | null;
  privileges: string | null;
  isActive: boolean;
  requiresMembership: boolean;
};

type CourseOption = {
  id: string;
  title: string;
  cancellationWindowHours: number;
  status: string;
};

type MemberQueryRow = Tables<"clients"> & {
  client_profiles: Pick<Tables<"client_profiles">, "status"> | null;
  memberships: Array<
    Tables<"memberships"> & {
      membership_types: Pick<Tables<"membership_types">, "name" | "privileges"> | null;
      membership_payments: Pick<
        Tables<"membership_payments">,
        "amount" | "currency" | "paid_at" | "period_start" | "period_end" | "period_years"
      >[];
    }
  > | null;
  plan_purchases: Array<
    Tables<"plan_purchases"> & {
      plan_types: Pick<Tables<"plan_types">, "name" | "privileges"> | null;
    }
  > | null;
};

type MembershipTypeRow = Tables<"membership_types">;
type PlanTypeRow = Tables<"plan_types">;

type PageProps = {
  initialMiembros: MemberRow[];
  membershipOptions: MembershipOption[];
  planOptions: PlanOption[];
  courseOptions: CourseOption[];
};

// ==== Helpers ====
function mapMember(row: MemberQueryRow): MemberRow {
  const now = dayjs();
  const memberships = row.memberships ?? [];
  const sortedMemberships = [...memberships].sort((a, b) => {
    const aDate = a.end_date ?? a.created_at ?? "";
    const bDate = b.end_date ?? b.created_at ?? "";
    return dayjs(bDate).valueOf() - dayjs(aDate).valueOf();
  });
  const activeMembership = sortedMemberships.find(
    (membership) =>
      membership.status === "ACTIVE" &&
      membership.end_date &&
      dayjs(membership.end_date).isSameOrAfter(now, "day")
  );
  const latestMembership = sortedMemberships[0] ?? null;

  let membershipStatus: MembershipState = "NONE";
  if (activeMembership) {
    membershipStatus = "ACTIVE";
  } else if (latestMembership) {
    membershipStatus = "EXPIRED";
  }

  const membershipName =
    activeMembership?.membership_types?.name ??
    latestMembership?.membership_types?.name ??
    null;

  const membershipPrivileges =
    activeMembership?.privileges_snapshot ??
    activeMembership?.membership_types?.privileges ??
    latestMembership?.privileges_snapshot ??
    latestMembership?.membership_types?.privileges ??
    null;

  const membershipEnd = activeMembership?.end_date ?? latestMembership?.end_date ?? null;
  const membershipNextBilling = activeMembership?.next_billing_date ?? null;
  const lastMembershipTypeId = activeMembership?.membership_type_id ?? latestMembership?.membership_type_id ?? null;

  const planPurchases = row.plan_purchases ?? [];
  const planActiveCount = planPurchases.filter((plan) => plan.status === "ACTIVE").length;

  const hasActiveMembership = membershipStatus === "ACTIVE";
  const Estado: MiembroEstado = hasActiveMembership ? "ACTIVE" : "ON_HOLD";

  return {
    id: row.id,
    name: row.full_name,
    email: row.email ?? null,
    phone: row.phone ?? null,
    membershipName,
    membershipStatus,
    membershipEnd,
    membershipNextBilling,
    membershipPrivileges,
    lastMembershipTypeId,
    hasActiveMembership,
    planActiveCount,
    Estado,
    joinedAt: row.created_at ?? "",
  };
}

const currencyFormatterCache: Record<string, Intl.NumberFormat> = {};
function getCurrencyFormatter(currency: string) {
  const key = (currency || "MXN").toUpperCase();
  if (!currencyFormatterCache[key]) {
    currencyFormatterCache[key] = new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: key,
      maximumFractionDigits: 2,
    });
  }
  return currencyFormatterCache[key];
}

function formatEstadoBadgeData(estado: MiembroEstado) {
  switch (estado) {
    case "ACTIVE":
      return { label: "Activo", tone: "bg-emerald-100 text-emerald-700" };
    case "CANCELED":
      return { label: "Cancelado", tone: "bg-rose-100 text-rose-700" };
    case "ON_HOLD":
    default:
      return { label: "Inactivo", tone: "bg-slate-200 text-slate-700" };
  }
}

// ===== SSR =====
export const getServerSideProps: GetServerSideProps<PageProps> = async () => {
  const [clientsResp, membershipTypesResp, planTypesResp, coursesResp] = await Promise.all([
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
          term_years,
          privileges_snapshot,
          membership_types(name, privileges),
          membership_payments(amount, currency, paid_at, period_start, period_end, period_years)
        ),
        plan_purchases(
          id,
          status,
          start_date,
          expires_at,
          initial_classes,
          remaining_classes,
          modality,
          plan_types(name, privileges)
        )
      `
      )
      .order("created_at", { ascending: false })
      .returns<MemberQueryRow[]>(),
    supabaseAdmin
      .from("membership_types")
      .select("id, name, price, currency, privileges, allow_multi_year, max_prepaid_years, is_active")
      .order("name")
      .returns<MembershipTypeRow[]>(),
    supabaseAdmin
      .from("plan_types")
      .select("id, name, description, price, currency, class_count, validity_days, privileges, is_active, mem_req")
      .order("name")
      .returns<PlanTypeRow[]>(),
    supabaseAdmin
      .from("courses")
      .select("id, title, status, cancellation_window_hours")
      .order("title")
      .returns<Tables<"courses">[]>(),
  ]);

  if (clientsResp.error) throw clientsResp.error;
  if (membershipTypesResp.error) throw membershipTypesResp.error;
  if (planTypesResp.error) throw planTypesResp.error;
  if (coursesResp.error) throw coursesResp.error;

  const initialMiembros: MemberRow[] = (clientsResp.data ?? []).map(mapMember);
  const membershipOptions: MembershipOption[] = (membershipTypesResp.data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    price: Number(t.price ?? 0),
    currency: t.currency ?? "MXN",
    privileges: t.privileges ?? null,
    allowMultiYear: t.allow_multi_year ?? true,
    maxPrepaidYears: t.max_prepaid_years ?? null,
    isActive: !!t.is_active,
  }));

  const planOptions: PlanOption[] = (planTypesResp.data ?? []).map((plan) => ({
    id: plan.id,
    name: plan.name,
    description: plan.description ?? null,
    price: Number(plan.price ?? 0),
    currency: plan.currency ?? "MXN",
    classCount: plan.class_count === null ? null : Number(plan.class_count ?? 0),
    validityDays: plan.validity_days ?? null,
    privileges: plan.privileges ?? null,
    isActive: !!plan.is_active,
    requiresMembership: plan.mem_req ?? true,
  }));

  const courseOptions: CourseOption[] = (coursesResp.data ?? []).map((course) => ({
    id: course.id,
    title: course.title ?? "Horario",
    cancellationWindowHours: Number(course.cancellation_window_hours ?? 24),
    status: course.status ?? "DRAFT",
  }));

  return { props: { initialMiembros, membershipOptions, planOptions, courseOptions } };
};

// ===== Pagina =====
export default function AdminMiembrosPage(
  {
    initialMiembros,
    membershipOptions,
    planOptions,
    courseOptions,
  }: InferGetServerSidePropsType<typeof getServerSideProps>
) {
  const [rows, setRows] = useState<MemberRow[]>(initialMiembros);
  const [search, setSearch] = useState("");
  const [estadoFilter, setEstadoFilter] = useState<"all" | MiembroEstado>("all");
  const [membershipModalOpen, setMembershipModalOpen] = useState(false);
  const [membershipModalMember, setMembershipModalMember] = useState<MemberRow | null>(null);
  const [membershipError, setMembershipError] = useState<string | null>(null);
  const [membershipLoading, setMembershipLoading] = useState(false);
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [planModalMember, setPlanModalMember] = useState<MemberRow | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planPaymentMode, setPlanPaymentMode] = useState<PlanPaymentMode>("CASH");
  const [planSuccess, setPlanSuccess] = useState<string | null>(null);

  const membershipDefaultType = useMemo(
    () => membershipOptions.find((option) => option.isActive) ?? membershipOptions[0] ?? null,
    [membershipOptions]
  );
  const planDefaultType = useMemo(
    () => planOptions.find((option) => option.isActive) ?? planOptions[0] ?? null,
    [planOptions]
  );

type MembershipFormState = {
  membershipTypeId: string;
  startDate: string;
  termYears: number;
  notes: string;
};

type MembershipPaymentMode = "CARD" | "CASH";
type PlanPaymentMode = "CARD" | "CASH";
type SortColumn = "NAME" | "MEMBERSHIP" | "PLANS" | "STATUS" | "JOINED";

type PlanFormState = {
  planTypeId: string;
  startDate: string;
  notes: string;
  modality: "FLEXIBLE" | "FIXED";
    courseId: string;
  };

  const [membershipForm, setMembershipForm] = useState<MembershipFormState>(() => ({
    membershipTypeId: membershipDefaultType?.id ?? "",
    startDate: dayjs().format("YYYY-MM-DD"),
    termYears: 1,
    notes: "",
  }));
  const [membershipPaymentMode, setMembershipPaymentMode] = useState<MembershipPaymentMode>("CASH");
  const [membershipSuccess, setMembershipSuccess] = useState<string | null>(null);

  const [planForm, setPlanForm] = useState<PlanFormState>(() => ({
    planTypeId: planDefaultType?.id ?? "",
    startDate: dayjs().format("YYYY-MM-DD"),
    notes: "",
    modality: "FLEXIBLE",
    courseId: "",
  }));
  const [sortConfig, setSortConfig] = useState<{ column: SortColumn; direction: "asc" | "desc" }>({
    column: "NAME",
    direction: "asc",
  });
  const [deleteTarget, setDeleteTarget] = useState<MemberRow | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const { profile } = useAuth();
  const isMaster = (profile?.role ?? "").toUpperCase() === "MASTER";

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (term) {
        const haystack = `${row.name} ${row.email ?? ""} ${row.membershipName ?? ""}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      if (estadoFilter !== "all" && row.Estado !== estadoFilter) return false;
      return true;
    });

    const membershipOrder: Record<MembershipState, number> = {
      ACTIVE: 0,
      EXPIRED: 1,
      NONE: 2,
    };
    const estadoOrder: Record<MiembroEstado, number> = {
      ACTIVE: 0,
      ON_HOLD: 1,
      CANCELED: 2,
    };
    const compareText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });

    const sorted = [...filtered].sort((a, b) => {
      let comparison = 0;
      switch (sortConfig.column) {
        case "NAME": {
          comparison = compareText(a.name, b.name);
          break;
        }
        case "MEMBERSHIP": {
          const rankA = membershipOrder[a.membershipStatus] ?? 99;
          const rankB = membershipOrder[b.membershipStatus] ?? 99;
          comparison = rankA - rankB;
          if (comparison === 0) {
            comparison = compareText(a.membershipName ?? "", b.membershipName ?? "");
          }
          break;
        }
        case "PLANS": {
          comparison = (a.planActiveCount ?? 0) - (b.planActiveCount ?? 0);
          break;
        }
        case "STATUS": {
          const rankA = estadoOrder[a.Estado] ?? 99;
          const rankB = estadoOrder[b.Estado] ?? 99;
          comparison = rankA - rankB;
          if (comparison === 0) {
            comparison = compareText(a.name, b.name);
          }
          break;
        }
        case "JOINED": {
          comparison = dayjs(a.joinedAt).valueOf() - dayjs(b.joinedAt).valueOf();
          break;
        }
        default: {
          comparison = 0;
          break;
        }
      }

      if (comparison === 0 && sortConfig.column !== "NAME") {
        comparison = compareText(a.name, b.name);
      }

      return sortConfig.direction === "asc" ? comparison : -comparison;
    });

    return sorted;
  }, [rows, search, estadoFilter, sortConfig]);

  const handleSort = (column: SortColumn) => {
    setSortConfig((prev) =>
      prev.column === column
        ? { column, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { column, direction: "asc" }
    );
  };

  const getSortIcon = (column: SortColumn) => {
    if (sortConfig.column !== column) return "unfold_more";
    return sortConfig.direction === "asc" ? "arrow_upward" : "arrow_downward";
  };

  const closeDeleteModal = () => {
    if (deleteLoading) return;
    setDeleteTarget(null);
    setDeleteError(null);
  };

  const handleDeleteMember = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/members/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body?.error ?? "No se pudo eliminar al miembro");
      }
      setRows((current) => current.filter((item) => item.id !== deleteTarget.id));
      closeDeleteModal();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "No se pudo eliminar al miembro";
      setDeleteError(message);
    } finally {
      setDeleteLoading(false);
    }
  };

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
      <div className="h-9 w-9 rounded-full bg-slate-200" />
    </div>
  );

  const getMembershipOption = (id: string) => membershipOptions.find((option) => option.id === id) ?? null;
  const getPlanOption = (id: string) => planOptions.find((option) => option.id === id) ?? null;
  const getEligiblePlanOptions = useMemo(
    () =>
      (member: MemberRow | null) =>
        planOptions.filter((option) => {
          if (!option.isActive) return false;
          if (!member) return true;
          if (member.hasActiveMembership) return true;
          return !option.requiresMembership;
        }),
    [planOptions]
  );

  const availablePlanOptions = useMemo(
    () => getEligiblePlanOptions(planModalMember),
    [planModalMember, getEligiblePlanOptions]
  );

  const upsertMemberRow = (memberData: MemberQueryRow) => {
    const mapped = mapMember(memberData);
    setRows((prev) => {
      const idx = prev.findIndex((row) => row.id === mapped.id);
      if (idx === -1) {
        return [mapped, ...prev];
      }
      const clone = [...prev];
      clone[idx] = mapped;
      return clone;
    });
  };

  const openMembershipModalFor = (member: MemberRow) => {
    const preferredOption =
      (member.lastMembershipTypeId
        ? membershipOptions.find((option) => option.id === member.lastMembershipTypeId && option.isActive)
        : null) ??
      membershipDefaultType;

    setMembershipForm({
      membershipTypeId: preferredOption?.id ?? "",
      startDate: dayjs().format("YYYY-MM-DD"),
      termYears: 1,
      notes: "",
    });
    setMembershipModalMember(member);
    setMembershipError(null);
    setMembershipSuccess(null);
    setMembershipPaymentMode("CASH");
    setMembershipModalOpen(true);
  };

  const closeMembershipModal = () => {
    setMembershipModalOpen(false);
    setMembershipModalMember(null);
    setMembershipError(null);
    setMembershipLoading(false);
    setMembershipSuccess(null);
    setMembershipPaymentMode("CASH");
  };

  const openPlanModalFor = (member: MemberRow) => {
    const eligible = getEligiblePlanOptions(member);
    const defaultPlan =
      eligible[0] ??
      planOptions.find((option) => option.isActive) ??
      planOptions[0] ??
      null;
    setPlanForm({
      planTypeId: defaultPlan?.id ?? "",
      startDate: dayjs().format("YYYY-MM-DD"),
      notes: "",
      modality: "FLEXIBLE",
      courseId: "",
    });
    setPlanModalMember(member);
    setPlanError(null);
    setPlanSuccess(null);
    setPlanPaymentMode("CASH");
    setPlanLoading(false);
    setPlanModalOpen(true);
  };

  const closePlanModal = () => {
    setPlanModalOpen(false);
    setPlanModalMember(null);
    setPlanError(null);
    setPlanLoading(false);
    setPlanSuccess(null);
    setPlanPaymentMode("CASH");
  };

  async function handleMembershipSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!membershipModalMember) return;

    if (!membershipForm.membershipTypeId) {
      setMembershipError("Selecciona un tipo de membresia");
      return;
    }

    const selectedOption = getMembershipOption(membershipForm.membershipTypeId);
    if (!selectedOption) {
      setMembershipError("El tipo de membresia seleccionado no es valido");
      return;
    }

    if (!selectedOption.allowMultiYear && membershipForm.termYears !== 1) {
      setMembershipError("Esta membresia solo permite pagar un anio a la vez");
      return;
    }

    if (
      selectedOption.maxPrepaidYears &&
      membershipForm.termYears > selectedOption.maxPrepaidYears
    ) {
      setMembershipError(`Esta membresia admite hasta ${selectedOption.maxPrepaidYears} anios por pago`);
      return;
    }

    setMembershipLoading(true);
    setMembershipError(null);
    setMembershipSuccess(null);

    const payload = {
      clientId: membershipModalMember.id,
      membershipTypeId: membershipForm.membershipTypeId,
      startDate: membershipForm.startDate,
      termYears: membershipForm.termYears,
      notes: membershipForm.notes || null,
    };

    try {
      if (membershipPaymentMode === "CARD" && membershipTotal <= 0) {
        setMembershipError("Configura un monto mayor a 0 para poder cobrar con tarjeta");
        setMembershipLoading(false);
        return;
      }

      if (membershipPaymentMode === "CARD") {
        const response = await fetch("/api/memberships/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || typeof body?.url !== "string") {
          throw new Error(body?.error ?? "No se pudo iniciar el pago con tarjeta");
        }
        window.open(body.url, "_blank", "noopener");
        setMembershipSuccess("Abrimos Stripe en una nueva pestana. La membresia se activara cuando el pago sea confirmado.");
        setMembershipLoading(false);
        return;
      }

      const response = await fetch("/api/memberships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body?.error ?? "No se pudo registrar la membresia");
      }

      upsertMemberRow(body.member as MemberQueryRow);
      closeMembershipModal();
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo registrar la membresia";
      setMembershipError(message);
      setMembershipLoading(false);
    } finally {
      if (membershipPaymentMode !== "CARD") {
        setMembershipLoading(false);
      }
    }
  }

  async function handlePlanSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!planModalMember) return;

    if (!planForm.planTypeId) {
      setPlanError("Selecciona un plan");
      return;
    }
    if (planForm.modality === "FIXED" && !planForm.courseId) {
      setPlanError("Selecciona el horario para el plan fijo");
      return;
    }

    const selectedPlan = getPlanOption(planForm.planTypeId);
    if (!selectedPlan || !selectedPlan.isActive) {
      setPlanError("El plan seleccionado no es valido");
      return;
    }
    if (selectedPlan.requiresMembership && !planModalMember.hasActiveMembership) {
      setPlanError("Este plan requiere una membresia activa");
      return;
    }

    const planAmount = Number(selectedPlan.price ?? 0);
    setPlanLoading(true);
    setPlanError(null);
    setPlanSuccess(null);

    const payload = {
      clientId: planModalMember.id,
      planTypeId: planForm.planTypeId,
      startDate: planForm.startDate,
      notes: planForm.notes || null,
      modality: planForm.modality,
      courseId: planForm.modality === "FIXED" ? planForm.courseId : null,
    };

    try {
      if (planPaymentMode === "CARD") {
        if (!Number.isFinite(planAmount) || planAmount <= 0) {
          setPlanError("Configura un monto mayor a 0 para poder cobrar este plan con tarjeta");
          setPlanLoading(false);
          return;
        }

        const origin = typeof window === "undefined" ? "" : window.location.origin;
        const successUrl = origin ? `${origin}/pagos/exito` : undefined;
        const cancelUrl = origin ? `${origin}/pagos/cancelado` : undefined;

        const response = await fetch("/api/plans/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, successUrl, cancelUrl }),
        });

        const body = await response.json().catch(() => ({}));
        if (!response.ok || typeof body?.url !== "string") {
          throw new Error(body?.error ?? "No se pudo generar el pago con tarjeta");
        }

        window.open(body.url, "_blank", "noopener");
        setPlanSuccess(
          "Abrimos Stripe en una nueva pestana. El plan se activara automaticamente cuando el pago sea confirmado."
        );
        setPlanLoading(false);
        return;
      }

      const response = await fetch("/api/plans/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body?.error ?? "No se pudo registrar el plan");
      }

      upsertMemberRow(body.member as MemberQueryRow);
      closePlanModal();
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo registrar el plan";
      setPlanError(message);
      if (planPaymentMode === "CARD") {
        setPlanLoading(false);
      }
    } finally {
      if (planPaymentMode !== "CARD") {
        setPlanLoading(false);
      }
    }
  }

  const selectedMembershipOption = getMembershipOption(membershipForm.membershipTypeId);
  const membershipTotal = selectedMembershipOption ? selectedMembershipOption.price * membershipForm.termYears : 0;
  const membershipCurrency = selectedMembershipOption?.currency ?? "MXN";
  const membershipMaxYears = selectedMembershipOption?.maxPrepaidYears ?? null;
  const selectedPlanOption = getPlanOption(planForm.planTypeId);
  const rawPlanPrice = selectedPlanOption?.price ?? null;
  const planCurrency = selectedPlanOption?.currency ?? "MXN";
  const hasPlanPrice =
    typeof rawPlanPrice === "number" && Number.isFinite(rawPlanPrice) && rawPlanPrice >= 0;
  const planPriceLabel = hasPlanPrice
    ? getCurrencyFormatter(planCurrency).format(rawPlanPrice)
    : "Consultar en recepcion";
  const planSupportsCard = Boolean(hasPlanPrice && (rawPlanPrice ?? 0) > 0);
  const selectedPlanClassCount = selectedPlanOption
    ? selectedPlanOption.classCount === null
      ? "Ilimitado"
      : selectedPlanOption.classCount
    : null;
  const selectedCourseOption =
    planForm.courseId ? courseOptions.find((option) => option.id === planForm.courseId) ?? null : null;
  const defaultFixedCourseId = useMemo(() => {
    const firstActive = courseOptions.find((option) => option.status !== "ARCHIVED");
    return firstActive?.id ?? courseOptions[0]?.id ?? "";
  }, [courseOptions]);
  const hasFixedCourses = courseOptions.length > 0;

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
                onChange={(event) => {
                  const value = event.target.value as "all" | MiembroEstado;
                  if (value === "all" || value === "ACTIVE" || value === "ON_HOLD" || value === "CANCELED") {
                    setEstadoFilter(value);
                  }
                }}
                className="h-9 rounded-md border border-slate-200 px-3 text-sm"
              >
                <option value="all">Todos los estados</option>
                <option value="ACTIVE">Activo</option>
                <option value="ON_HOLD">Inactivo</option>
                <option value="CANCELED">Cancelado</option>
              </select>
              <Link
                href="/members/new"
                className="flex items-center rounded-md border border-brand-600 px-4 py-2 text-sm font-semibold text-brand-600 shadow-sm hover:bg-brand-50"
              >
                <span className="material-icons-outlined mr-2 text-base">person_add</span>
                Nuevo miembro
              </Link>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-6 py-3">
                    <button
                      type="button"
                      onClick={() => handleSort("NAME")}
                      className="flex items-center gap-1 font-semibold tracking-wide text-slate-500"
                    >
                      Miembro
                      <span className="material-icons-outlined text-base">{getSortIcon("NAME")}</span>
                    </button>
                  </th>
                  <th className="px-6 py-3">
                    <button
                      type="button"
                      onClick={() => handleSort("MEMBERSHIP")}
                      className="flex items-center gap-1 font-semibold tracking-wide text-slate-500"
                    >
                      Membresia
                      <span className="material-icons-outlined text-base">{getSortIcon("MEMBERSHIP")}</span>
                    </button>
                  </th>
                  <th className="px-6 py-3">
                    <button
                      type="button"
                      onClick={() => handleSort("PLANS")}
                      className="flex items-center gap-1 font-semibold tracking-wide text-slate-500"
                    >
                      Planes activos
                      <span className="material-icons-outlined text-base">{getSortIcon("PLANS")}</span>
                    </button>
                  </th>
                  <th className="px-6 py-3">
                    <button
                      type="button"
                      onClick={() => handleSort("STATUS")}
                      className="flex items-center gap-1 font-semibold tracking-wide text-slate-500"
                    >
                      Estado
                      <span className="material-icons-outlined text-base">{getSortIcon("STATUS")}</span>
                    </button>
                  </th>
                  <th className="px-6 py-3">Acciones</th>
                  <th className="px-6 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleSort("JOINED")}
                      className="ml-auto flex items-center gap-1 font-semibold tracking-wide text-slate-500"
                    >
                      Alta
                      <span className="material-icons-outlined text-base">{getSortIcon("JOINED")}</span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-6 text-center text-sm text-slate-500">
                      No hay miembros que coincidan con los filtros.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => {
                    const badge = formatEstadoBadgeData(row.Estado);
                    const membershipDetails =
                      row.membershipStatus === "ACTIVE"
                        ? row.membershipEnd
                          ? `Vence ${dayjs(row.membershipEnd).format("DD MMM YYYY")}`
                          : "Activa"
                        : row.membershipStatus === "EXPIRED" && row.membershipEnd
                          ? `Vencida ${dayjs(row.membershipEnd).format("DD MMM YYYY")}`
                          : "Sin membresia";
                    return (
                      <tr key={row.id} className="border-t border-slate-200 hover:bg-slate-50">
                        <td className="px-6 py-4">
                          <div className="font-medium text-slate-800">{row.name}</div>
                          <div className="text-xs text-slate-500">
                            {row.email ?? "Sin correo"}{row.phone ? `  |  ${row.phone}` : ""}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-700">
                          <div className="font-medium">
                            {row.membershipStatus === "ACTIVE"
                              ? row.membershipName ?? "Membresia activa"
                              : row.membershipStatus === "EXPIRED"
                              ? row.membershipName ?? "Membresia expirada"
                              : "Sin membresia"}
                          </div>
                          <div className="text-xs text-slate-500">{membershipDetails}</div>
                          {row.membershipPrivileges && (
                            <div className="text-xs text-slate-400">Privilegios: {row.membershipPrivileges}</div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-slate-700">
                          {row.planActiveCount > 0 ? `${row.planActiveCount} activos` : "Sin planes"}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.tone}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openMembershipModalFor(row)}
                              disabled={membershipOptions.length === 0}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                            >
                              <span className="material-icons-outlined text-sm">credit_score</span>
                              Membresia
                            </button>
                            <button
                              type="button"
                              onClick={() => openPlanModalFor(row)}
                              disabled={getEligiblePlanOptions(row).length === 0}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                            >
                              <span className="material-icons-outlined text-sm">shopping_cart</span>
                              Plan
                            </button>
                            <Link
                              href={`/members/${row.id}`}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                            >
                              <span className="material-icons-outlined text-sm">edit</span>
                              Editar
                            </Link>
                            {isMaster && (
                              <button
                                type="button"
                                onClick={() => {
                                  setDeleteError(null);
                                  setDeleteTarget(row);
                                }}
                                className="inline-flex items-center gap-1 rounded-md border border-rose-200 px-3 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                              >
                                <span className="material-icons-outlined text-sm">delete</span>
                                Eliminar
                              </button>
                            )}
                          </div>
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

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-2xl">
            <div className="border-b border-slate-200 px-6 py-4">
              <h3 className="text-lg font-semibold text-slate-800">Eliminar miembro</h3>
              <p className="mt-1 text-sm text-slate-600">
                Confirma la eliminacion permanente de{" "}
                <span className="font-semibold">{deleteTarget.name}</span>.
              </p>
            </div>
            <div className="space-y-3 px-6 py-5 text-sm text-slate-600">
              <p>Esta accion elimina al miembro y sus registros relacionados. No se puede deshacer.</p>
              {deleteError && (
                <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">
                  {deleteError}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
              <button
                type="button"
                onClick={closeDeleteModal}
                className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600"
                disabled={deleteLoading}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteMember}
                disabled={deleteLoading}
                className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {deleteLoading ? "Eliminando..." : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {membershipModalOpen && membershipModalMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-2xl">
            <form onSubmit={handleMembershipSubmit}>
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-800">Registrar membresia</h3>
                  <p className="text-xs text-slate-500">{membershipModalMember.name}</p>
                </div>
                <button
                  type="button"
                  className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100"
                  onClick={closeMembershipModal}
                  aria-label="Cerrar"
                >
                  <span className="material-icons-outlined">close</span>
                </button>
              </div>
              <div className="space-y-4 px-6 py-6 text-sm">
                <div>
                  <span className="block text-xs font-medium text-slate-600">Metodo de pago</span>
                  <div className="mt-2 inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => {
                        setMembershipPaymentMode("CARD");
                        setMembershipError(null);
                        setMembershipSuccess(null);
                      }}
                      className={`rounded-md px-3 py-2 transition ${
                        membershipPaymentMode === "CARD"
                          ? "bg-white text-brand-600 shadow-sm"
                          : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      Cobrar con tarjeta
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMembershipPaymentMode("CASH");
                        setMembershipError(null);
                        setMembershipSuccess(null);
                      }}
                      className={`ml-1 rounded-md px-3 py-2 transition ${
                        membershipPaymentMode === "CASH"
                          ? "bg-white text-brand-600 shadow-sm"
                          : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      Registrar pago en efectivo
                    </button>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500">
                    {membershipPaymentMode === "CARD"
                      ? "Generaremos un checkout de Stripe en una nueva pestana para que el cliente pague con tarjeta."
                      : "Registra aqui los pagos confirmados en recepcion o efectivo. La membresia se activara al guardar."}
                  </p>
                </div>

                {membershipSuccess ? (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                    {membershipSuccess}
                  </div>
                ) : null}

                <div>
                  <label className="block text-xs font-medium text-slate-600">Tipo de membresia</label>
                  <select
                    value={membershipForm.membershipTypeId}
                    onChange={(event) =>
                      setMembershipForm((prev) => ({ ...prev, membershipTypeId: event.target.value }))
                    }
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="">Selecciona un tipo</option>
                    {membershipOptions.map((option) => (
                      <option key={option.id} value={option.id} disabled={!option.isActive}>
                        {option.name} {getCurrencyFormatter(option.currency).format(option.price)}
                        {!option.isActive ? " (inactiva)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600">
                      {planForm.modality === "FIXED" ? "Fecha de inicio del horario" : "Fecha de inicio"}
                    </label>
                    <input
                      type="date"
                      value={membershipForm.startDate}
                      onChange={(event) =>
                        setMembershipForm((prev) => ({ ...prev, startDate: event.target.value }))
                      }
                      className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600">anios pagados</label>
                    <input
                      type="number"
                      min={1}
                      max={membershipMaxYears ?? undefined}
                      value={membershipForm.termYears}
                      onChange={(event) =>
                        setMembershipForm((prev) => ({
                          ...prev,
                          termYears: Math.max(1, Number(event.target.value) || 1),
                        }))
                      }
                      className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    />
                    {membershipMaxYears && (
                      <p className="mt-1 text-xs text-slate-400">
                        Maximo {membershipMaxYears} {membershipMaxYears === 1 ? "anio" : "anios"} por pago
                      </p>
                    )}
                  </div>
                </div>
                <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <p>
                    Total a cobrar:{" "}
                    <span className="font-semibold">
                      {getCurrencyFormatter(membershipCurrency).format(membershipTotal)}
                    </span>
                  </p>
                  {selectedMembershipOption?.privileges && (
                    <p className="mt-1 text-xs text-slate-500">
                      Privilegios: {selectedMembershipOption.privileges}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600">Notas (opcional)</label>
                  <textarea
                    value={membershipForm.notes}
                    onChange={(event) =>
                      setMembershipForm((prev) => ({ ...prev, notes: event.target.value }))
                    }
                    rows={3}
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
                {membershipError && <p className="text-sm text-rose-600">{membershipError}</p>}
              </div>
              <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
                <button
                  type="button"
                  onClick={closeMembershipModal}
                  className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600"
                  disabled={membershipLoading}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={membershipLoading}
                  className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {membershipLoading
                    ? membershipPaymentMode === "CARD"
                      ? "Generando pago..."
                      : "Registrando..."
                    : membershipPaymentMode === "CARD"
                    ? "Generar link de pago"
                    : "Registrar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {planModalOpen && planModalMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-2xl">
            <form onSubmit={handlePlanSubmit}>
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-800">Registrar plan</h3>
                  <p className="text-xs text-slate-500">{planModalMember.name}</p>
                </div>
                <button
                  type="button"
                  className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100"
                  onClick={closePlanModal}
                  aria-label="Cerrar"
                >
                  <span className="material-icons-outlined">close</span>
                </button>
              </div>
              <div className="space-y-4 px-6 py-6 text-sm">
                <div>
                  <span className="block text-xs font-medium text-slate-600">Metodo de pago</span>
                  <div className="mt-2 inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => {
                        setPlanPaymentMode("CARD");
                        setPlanError(null);
                        setPlanSuccess(null);
                      }}
                      className={`rounded-md px-3 py-2 transition ${
                        planPaymentMode === "CARD"
                          ? "bg-white text-brand-600 shadow-sm"
                          : "text-slate-500 hover:text-slate-700"
                      }`}
                      disabled={planLoading}
                    >
                      Cobrar con tarjeta
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPlanPaymentMode("CASH");
                        setPlanError(null);
                        setPlanSuccess(null);
                      }}
                      className={`ml-1 rounded-md px-3 py-2 transition ${
                        planPaymentMode === "CASH"
                          ? "bg-white text-brand-600 shadow-sm"
                          : "text-slate-500 hover:text-slate-700"
                      }`}
                      disabled={planLoading}
                    >
                      Registrar pago en efectivo
                    </button>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500">
                    {planPaymentMode === "CARD"
                      ? "Generaremos un checkout de Stripe en una nueva pestana para que el cliente pague con tarjeta."
                      : "Registra aqui los pagos confirmados en recepcion o efectivo. El plan se activara al guardar."}
                  </p>
                  {planPaymentMode === "CARD" && !planSupportsCard ? (
                    <p className="mt-2 text-[11px] text-amber-600">
                      Selecciona un plan con precio mayor a 0 para habilitar el cobro con tarjeta.
                    </p>
                  ) : null}
                </div>

                {planSuccess ? (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                    {planSuccess}
                  </div>
                ) : null}

                <div>
                  <label className="block text-xs font-medium text-slate-600">Plan</label>
                  <select
                    value={planForm.planTypeId}
                    onChange={(event) => {
                      setPlanSuccess(null);
                      setPlanError(null);
                      setPlanForm((prev) => ({ ...prev, planTypeId: event.target.value }));
                    }}
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    disabled={availablePlanOptions.length === 0}
                  >
                    <option value="">{availablePlanOptions.length === 0 ? "Sin planes disponibles" : "Selecciona un plan"}</option>
                    {availablePlanOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}{" "}
                        {getCurrencyFormatter(option.currency).format(option.price)}
                        {!option.requiresMembership ? " - sin membresia" : ""}
                      </option>
                    ))}
                  </select>
                  {availablePlanOptions.length === 0 && (
                    <p className="mt-1 text-xs text-amber-600">
                      No hay planes disponibles. Activa una membresia o habilita planes sin requisito de membresia.
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600">Modalidad</label>
                  <select
                    value={planForm.modality}
                    onChange={(event) => {
                      const next = event.target.value === "FIXED" ? "FIXED" : "FLEXIBLE";
                      setPlanSuccess(null);
                      setPlanError(null);
                      setPlanForm((prev) => ({
                        ...prev,
                        modality: next,
                        courseId: next === "FIXED" ? prev.courseId || defaultFixedCourseId : "",
                      }));
                    }}
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="FLEXIBLE">Flexible (usa creditos)</option>
                    <option value="FIXED" disabled={!hasFixedCourses}>
                      Horario fijo (reservas automaticas)
                    </option>
                  </select>
                  {planForm.modality === "FLEXIBLE" ? (
                    <p className="mt-1 text-xs text-slate-500">
                      El alumno usara creditos y reservara manualmente mientras tenga vigencia.
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-slate-500">
                      Las reservas se generan automaticamente para el horario seleccionado.
                    </p>
                  )}
                  {!hasFixedCourses && (
                    <p className="mt-1 text-xs text-amber-600">
                      No hay horarios publicados para asignar en modalidad fija.
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600">
                      {planForm.modality === "FIXED" ? "Fecha de inicio del horario" : "Fecha de inicio"}
                    </label>
                    <input
                      type="date"
                    value={planForm.startDate}
                      onChange={(event) => {
                        setPlanSuccess(null);
                        setPlanError(null);
                        setPlanForm((prev) => ({ ...prev, startDate: event.target.value }));
                      }}
                      className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    {selectedPlanOption ? (
                      <>
                        {planForm.modality === "FLEXIBLE" ? (
                          <>
                            <p>
                              Clases: <span className="font-semibold">{selectedPlanClassCount}</span>
                            </p>
                            {selectedPlanOption.validityDays ? (
                              <p>Validez: {selectedPlanOption.validityDays} dias</p>
                            ) : (
                              <p>Sin fecha de vencimiento</p>
                            )}
                          </>
                        ) : (
                          <>
                            <p>
                              Se asignaran{" "}
                              <span className="font-semibold">{selectedPlanClassCount}</span> sesiones del horario.
                            </p>
                            <p>El alumno no necesita reservar de forma manual.</p>
                          </>
                        )}
                        <p className="mt-2 text-xs text-slate-500">
                          Precio: <span className="font-semibold text-slate-700">{planPriceLabel}</span>
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {selectedPlanOption.requiresMembership
                            ? "Requiere membresia activa para asignarse."
                            : "Disponible para clientes sin membresia activa."}
                        </p>
                      </>
                    ) : (
                      <p>Selecciona un plan para ver detalles.</p>
                    )}
                  </div>
                </div>
                {planForm.modality === "FIXED" && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600">Horario asignado</label>
                    <select
                      value={planForm.courseId}
                      onChange={(event) => {
                        setPlanSuccess(null);
                        setPlanError(null);
                        setPlanForm((prev) => ({ ...prev, courseId: event.target.value }));
                      }}
                      className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    >
                      <option value="">Selecciona un horario</option>
                      {courseOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.title}
                        </option>
                      ))}
                    </select>
                    {selectedCourseOption ? (
                      <p className="mt-1 text-xs text-slate-500">
                        Ventana de cancelacion: {selectedCourseOption.cancellationWindowHours} horas.
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-slate-500">
                        El horario define los dias y horarios que se reservaran.
                      </p>
                    )}
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-slate-600">Notas (opcional)</label>
                  <textarea
                    value={planForm.notes}
                    onChange={(event) => {
                      setPlanSuccess(null);
                      setPlanError(null);
                      setPlanForm((prev) => ({ ...prev, notes: event.target.value }));
                    }}
                    rows={3}
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
                {planError && <p className="text-sm text-rose-600">{planError}</p>}
              </div>
              <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
                <button
                  type="button"
                  onClick={closePlanModal}
                  className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600"
                  disabled={planLoading}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={planLoading || availablePlanOptions.length === 0}
                  className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {planLoading
                    ? planPaymentMode === "CARD"
                      ? "Generando pago..."
                      : "Registrando..."
                    : planPaymentMode === "CARD"
                    ? "Generar link de pago"
                    : "Registrar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayoutAny>
  );
}





