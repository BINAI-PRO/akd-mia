import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type FormEvent,
  type PropsWithChildren,
} from "react";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import dayjs from "dayjs";
import AdminLayout from "@/components/admin/AdminLayout";
import { MembershipsDisabledNotice } from "@/components/admin/MembershipsDisabledNotice";
import { useMembershipsEnabled } from "@/components/StudioTimezoneContext";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { AdminFeatureKey } from "@/lib/admin-access";
import type { Tables } from "@/types/database";

const AdminLayoutAny = AdminLayout as unknown as ComponentType<
  PropsWithChildren<Record<string, unknown>>
>;

type MemberRow = Tables<"clients"> & {
  client_profiles: {
    status: string;
    avatar_url: string | null;
    birthdate: string | null;
    occupation: string | null;
    notes: string | null;
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
    preferred_apparatus: string[] | null;
  } | null;
  memberships: Array<
    Tables<"memberships"> & {
      membership_types: Pick<Tables<"membership_types">, "name"> | null;
    }
  > | null;
  plan_purchases: Array<
    Tables<"plan_purchases"> & {
      plan_types: Pick<Tables<"plan_types">, "name" | "privileges"> | null;
    }
  > | null;
};

type ApparatusOption = {
  id: string;
  name: string;
};

type AppAccessInfo = {
  authUserId: string | null;
  providers: string[];
  email: string | null;
  lastSignInAt: string | null;
};

type PageProps = {
  member: MemberRow;
  apparatusOptions: ApparatusOption[];
  justCreated: boolean;
  appAccess: AppAccessInfo;
};

type FormState = {
  fullName: string;
  email: string;
  phone: string;
  profileStatus: string;
  avatarUrl: string;
  birthdate: string;
  occupation: string;
  profileNotes: string;
  membershipNotes: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  preferredApparatus: string[];
};

type PasswordState = {
  status: "idle" | "loading" | "success" | "error";
  password: string | null;
  error: string | null;
  copied: boolean;
};

const CLIENT_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "ACTIVE", label: "Activo" },
  { value: "PAYMENT_FAILED", label: "Pago fallido" },
  { value: "ON_HOLD", label: "En pausa" },
  { value: "CANCELED", label: "Cancelado" },
];

export const getServerSideProps: GetServerSideProps<PageProps> = async (ctx) => {
  const memberId = typeof ctx.params?.id === "string" ? ctx.params.id : null;
  if (!memberId) {
    return { notFound: true };
  }

  const justCreated =
    ctx.query?.created === "1" || ctx.query?.created === "true";

  const [memberResp, apparatusResp] = await Promise.all([
    supabaseAdmin
      .from("clients")
      .select(
        `
        id,
        full_name,
        email,
        phone,
        created_at,
        auth_user_id,
        client_profiles(
          status,
          avatar_url,
          birthdate,
          occupation,
          notes,
          emergency_contact_name,
          emergency_contact_phone,
          preferred_apparatus
        ),
        memberships(
          id,
          status,
          next_billing_date,
          notes,
          start_date,
          membership_types(name)
        ),
        plan_purchases(
          id,
          status,
          modality,
          start_date,
          expires_at,
          initial_classes,
          remaining_classes,
          purchased_at,
          plan_types(name, privileges)
        )
      `
      )
      .eq("id", memberId)
      .single<MemberRow>(),
    supabaseAdmin
      .from("apparatus")
      .select("id, name")
      .order("name")
      .returns<ApparatusOption[]>(),
  ]);

  if (memberResp.error || !memberResp.data) {
    return { notFound: true };
  }
  if (apparatusResp.error) throw apparatusResp.error;

  const memberRow = memberResp.data;
  let authEmail = memberRow.email ?? null;
  let lastSignInAt: string | null = null;
  let providerList: string[] = [];

  if (memberRow.auth_user_id) {
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.getUserById(
      memberRow.auth_user_id
    );
    if (authError) {
      if (authError.status !== 404) {
        console.error("/members/[id] auth lookup", authError);
      }
    } else if (authData?.user) {
      const user = authData.user;
      authEmail = user.email ?? authEmail;
      lastSignInAt = user.last_sign_in_at ?? null;
      if (Array.isArray(user.app_metadata?.providers) && user.app_metadata.providers.length > 0) {
        providerList = user.app_metadata.providers as string[];
      } else if (typeof user.app_metadata?.provider === "string") {
        providerList = [user.app_metadata.provider];
      }
    }
  }

  const appAccess: AppAccessInfo = {
    authUserId: memberRow.auth_user_id ?? null,
    providers: providerList,
    email: authEmail,
    lastSignInAt,
  };

  return {
    props: {
      member: memberRow,
      apparatusOptions: apparatusResp.data ?? [],
      justCreated,
      appAccess,
    },
  };
};

export default function EditMemberPage({
  member,
  apparatusOptions,
  justCreated,
  appAccess,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const profile = member.client_profiles;
  const sortedMemberships = useMemo(
    () =>
      [...(member.memberships ?? [])].sort(
        (a, b) =>
          dayjs(b.created_at ?? b.start_date ?? 0).valueOf() -
          dayjs(a.created_at ?? a.start_date ?? 0).valueOf()
      ),
    [member.memberships]
  );
  const latestMembership = sortedMemberships[0] ?? null;
  const initialStatus = (profile?.status ?? "ACTIVE").toUpperCase();
  const normalizedStatus = initialStatus === "CANCELLED" ? "CANCELED" : initialStatus;
  const featureKey: AdminFeatureKey = "memberDetail";
  const pageAccess = useAdminAccess(featureKey);
  const canEditMember = pageAccess.canEdit;
  const allowPlanDelete = pageAccess.canDelete;
  const readOnly = !canEditMember;
  const membershipsEnabled = useMembershipsEnabled();

  const [form, setForm] = useState<FormState>({
    fullName: member.full_name,
    email: member.email ?? "",
    phone: member.phone ?? "",
    profileStatus: normalizedStatus,
    avatarUrl: profile?.avatar_url ?? "",
    birthdate: profile?.birthdate ?? "",
    occupation: profile?.occupation ?? "",
    profileNotes: profile?.notes ?? "",
    membershipNotes: latestMembership?.notes ?? "",
    emergencyContactName: profile?.emergency_contact_name ?? "",
    emergencyContactPhone: profile?.emergency_contact_phone ?? "",
    preferredApparatus: profile?.preferred_apparatus ?? [],
  });
  const [appAccessState, setAppAccessState] = useState<AppAccessInfo>(appAccess);
  const [plans, setPlans] = useState(member.plan_purchases ?? []);
  const [planDeletingId, setPlanDeletingId] = useState<string | null>(null);
  const [planDeleteError, setPlanDeleteError] = useState<string | null>(null);
  const sortedPlans = useMemo(
    () =>
      [...plans].sort((a, b) => {
        const aDate = a.start_date ?? a.purchased_at ?? "";
        const bDate = b.start_date ?? b.purchased_at ?? "";
        return dayjs(bDate).valueOf() - dayjs(aDate).valueOf();
      }),
    [plans]
  );
  const activePlans = useMemo(
    () => sortedPlans.filter((plan) => (plan.status ?? "").toUpperCase() === "ACTIVE"),
    [sortedPlans]
  );
  const formatDate = (value: string | null | undefined) =>
    value ? dayjs(value).format("DD MMM YYYY") : "Sin fecha";
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(
    justCreated ? "Miembro creado exitosamente." : null
  );
  const [passwordState, setPasswordState] = useState<PasswordState>({
    status: "idle",
    password: null,
    error: null,
    copied: false,
  });
  const copyTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (justCreated) {
      router.replace(`/members/${member.id}`, undefined, { shallow: true }).catch(() => {
        // noop, routing errors silent
      });
    }
  }, [justCreated, member.id, router]);

  const handleChange =
    (field: keyof FormState) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const value = event.target.value;
      setForm((prev) => ({ ...prev, [field]: value }));
    };

  const toggleApparatus = (name: string) => {
    setForm((prev) => {
      const set = new Set(prev.preferredApparatus);
      if (set.has(name)) {
        set.delete(name);
      } else {
        set.add(name);
      }
      return { ...prev, preferredApparatus: Array.from(set) };
    });
  };

  const providerLabel = useMemo(() => {
    if (appAccessState.providers.includes("google")) return "Google";
    if (appAccessState.providers.includes("email")) return "Correo y contraseña";
    if (appAccessState.authUserId) return "Cuenta vinculada";
    return "Sin acceso configurado";
  }, [appAccessState]);

  const usesGoogle = appAccessState.providers.includes("google");
  const hasEmailInput = Boolean(form.email.trim());
  const lastSignInLabel = appAccessState.lastSignInAt
    ? dayjs(appAccessState.lastSignInAt).format("DD MMM YYYY HH:mm")
    : "Sin registro";

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const handleGeneratePassword = async () => {
    setPasswordState({ status: "loading", password: null, error: null, copied: false });
    try {
      const response = await fetch(`/api/members/${member.id}/password`, {
        method: "POST",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body?.error ?? "No se pudo generar la contraseña");
      }

      setPasswordState({
        status: "success",
        password: body.password ?? null,
        error: null,
        copied: false,
      });
      setAppAccessState((prev) => ({
        authUserId: body.authUserId ?? prev.authUserId ?? member.auth_user_id ?? null,
        providers:
          Array.isArray(body.providers) && body.providers.length > 0
            ? body.providers
            : prev.providers.length > 0
            ? prev.providers
            : ["email"],
        email: body.email ?? prev.email ?? form.email ?? null,
        lastSignInAt: prev.lastSignInAt,
      }));
    } catch (generateError) {
      const message =
        generateError instanceof Error
          ? generateError.message
          : "No se pudo generar la contraseña";
      setPasswordState({ status: "error", password: null, error: message, copied: false });
    }
  };

  const handleCopyPassword = async () => {
    if (!passwordState.password) return;
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      setPasswordState((prev) => ({
        ...prev,
        error: "No se pudo copiar la contraseña en este navegador.",
      }));
      return;
    }

    try {
      await navigator.clipboard.writeText(passwordState.password);
      setPasswordState((prev) => ({ ...prev, copied: true, error: null }));
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = setTimeout(() => {
        setPasswordState((prev) => ({ ...prev, copied: false }));
      }, 2000);
    } catch (copyError) {
      setPasswordState((prev) => ({
        ...prev,
        error:
          copyError instanceof Error
            ? copyError.message
            : "No se pudo copiar la contraseña.",
      }));
    }
  };

  const handleDeletePlan = async (planId: string) => {
    if (!allowPlanDelete) {
      setPlanDeleteError("No tienes permisos para eliminar planes.");
      return;
    }
    if (typeof window !== "undefined") {
      const confirmed = window.confirm("¿Eliminar este plan activo? Esta acción no se puede deshacer.");
      if (!confirmed) return;
    }
    setPlanDeleteError(null);
    setPlanDeletingId(planId);
    try {
      const response = await fetch(`/api/members/${member.id}/plans/${planId}`, {
        method: "DELETE",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((body as { error?: string })?.error ?? "No se pudo eliminar el plan");
      }
      setPlans((prev) => prev.filter((plan) => plan.id !== planId));
      setSuccess("Plan eliminado correctamente.");
    } catch (planError) {
      setPlanDeleteError(
        planError instanceof Error ? planError.message : "No se pudo eliminar el plan"
      );
    } finally {
      setPlanDeletingId(null);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!form.fullName.trim()) {
      setError("El nombre completo es obligatorio");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        fullName: form.fullName.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        profileStatus: form.profileStatus,
        avatarUrl: form.avatarUrl.trim() || null,
        birthdate: form.birthdate || null,
        occupation: form.occupation.trim() || null,
        profileNotes: form.profileNotes.trim() || null,
        membershipNotes: form.membershipNotes.trim() || null,
        emergencyContactName: form.emergencyContactName.trim() || null,
        emergencyContactPhone: form.emergencyContactPhone.trim() || null,
        preferredApparatus: form.preferredApparatus,
      };

      const response = await fetch(`/api/members/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body?.error ?? "No se pudo actualizar el miembro");
      }

      setSuccess("Datos guardados correctamente.");
      setForm((prev) => ({
        ...prev,
        fullName: payload.fullName,
        email: payload.email ?? "",
        phone: payload.phone ?? "",
        profileStatus: payload.profileStatus,
        avatarUrl: payload.avatarUrl ?? "",
        birthdate: payload.birthdate ?? "",
        occupation: payload.occupation ?? "",
        profileNotes: payload.profileNotes ?? "",
        membershipNotes: payload.membershipNotes ?? "",
        emergencyContactName: payload.emergencyContactName ?? "",
        emergencyContactPhone: payload.emergencyContactPhone ?? "",
        preferredApparatus: payload.preferredApparatus ?? [],
      }));
      setAppAccessState((prev) => ({
        ...prev,
        email: payload.email,
      }));
    } catch (submitError) {
      const message =
        submitError instanceof Error ? submitError.message : "No se pudo actualizar el miembro";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!membershipsEnabled) {
    return (
      <AdminLayoutAny title="Editar miembro" active="Miembros" featureKey={featureKey}>
        <Head>
          <title>Miembros | Admin</title>
        </Head>
        <MembershipsDisabledNotice />
      </AdminLayoutAny>
    );
  }

  return (
    <AdminLayoutAny title="Editar miembro" active="Miembros" featureKey="memberDetail">
      <Head>
        <title>Editar miembro  Admin</title>
      </Head>

      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">{member.full_name}</h1>
            <p className="text-sm text-slate-500">
              Actualiza los datos de contacto y el perfil del cliente.
            </p>
          </div>
          <Link
            href="/members"
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            <span className="material-icons-outlined text-base">arrow_back</span>
            Volver al listado
          </Link>
        </div>

        {success && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {success}
          </div>
        )}
        {error && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}
        {readOnly && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            Tu rol solo tiene permiso de lectura en este perfil. Puedes revisar la información pero no guardar cambios.
          </div>
        )}

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Acceso a la app</h2>
              <p className="text-sm text-slate-500">
                Gestiona cómo este miembro ingresa a la app móvil.
              </p>
            </div>
            <div className="text-sm text-slate-500">
              Estado: <span className="font-semibold text-slate-700">{providerLabel}</span>
              <span className="ml-2 text-slate-400">Último acceso: {lastSignInLabel}</span>
            </div>
          </div>
          <div className="mt-4 space-y-4 text-sm text-slate-600">
            {usesGoogle ? (
              <p>
                Este miembro inicia sesión con <span className="font-semibold">Google</span>, por lo
                que no es necesario generar una contraseña manual.
              </p>
            ) : (
              <>
                <p>
                  La app utiliza el correo{" "}
                  <span className="font-semibold">
                    {form.email.trim() || appAccessState.email || "sin correo registrado"}
                  </span>{" "}
                  como usuario. Genera una contraseña temporal y compártela con el miembro.
                </p>
                {!hasEmailInput && (
                  <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    Agrega y guarda un correo antes de generar una contraseña.
                  </p>
                )}
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                  <button
                    type="button"
                    onClick={handleGeneratePassword}
                    disabled={!hasEmailInput || passwordState.status === "loading"}
                    className="inline-flex items-center justify-center rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {passwordState.status === "loading"
                      ? "Generando..."
                      : appAccessState.authUserId
                      ? "Regenerar contraseña"
                      : "Generar contraseña"}
                  </button>
                  <p className="text-xs text-slate-500">
                    Se mostrará la contraseña temporal; solicita que la cambien al iniciar sesión.
                  </p>
                </div>
                {passwordState.password && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Contraseña temporal
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <code className="rounded bg-white px-3 py-1 text-base font-semibold tracking-wider text-slate-900 shadow-inner">
                        {passwordState.password}
                      </code>
                      <button
                        type="button"
                        onClick={handleCopyPassword}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-white"
                      >
                        <span className="material-icons-outlined text-base">
                          {passwordState.copied ? "check" : "content_copy"}
                        </span>
                        {passwordState.copied ? "Copiado" : "Copiar"}
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      Comparte esta contraseña solo con el miembro y asegúrate de que la cambie al
                      ingresar.
                    </p>
                  </div>
                )}
                {passwordState.error && (
                  <p className="text-sm text-rose-600">{passwordState.error}</p>
                )}
              </>
            )}
          </div>
        </section>

        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-slate-200 bg-white shadow-sm"
        >
          <div className="grid gap-6 border-b border-slate-200 p-6 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="text-sm font-medium text-slate-700">
                Nombre completo
                <input
                  type="text"
                  value={form.fullName}
                  onChange={handleChange("fullName")}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                  required
                />
              </label>
            </div>
            <label className="text-sm font-medium text-slate-700">
              Email
              <input
                type="email"
                value={form.email}
                onChange={handleChange("email")}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Teléfono
              <input
                type="tel"
                value={form.phone}
                onChange={handleChange("phone")}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Estado del perfil
              <select
                value={form.profileStatus}
                onChange={handleChange("profileStatus")}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              >
                {CLIENT_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Fecha de nacimiento
              <input
                type="date"
                value={form.birthdate ?? ""}
                onChange={handleChange("birthdate")}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Ocupación
              <input
                type="text"
                value={form.occupation}
                onChange={handleChange("occupation")}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              URL de avatar
              <input
                type="url"
                value={form.avatarUrl}
                onChange={handleChange("avatarUrl")}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              />
            </label>
            <div>
              <span className="text-sm font-medium text-slate-700">Aparatos preferidos</span>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                {apparatusOptions.length === 0 && (
                  <p className="text-xs text-slate-400">No hay aparatos registrados.</p>
                )}
                {apparatusOptions.map((option) => {
                  const checked = form.preferredApparatus.includes(option.name);
                  return (
                    <label key={option.id} className="flex items-center gap-2 text-sm text-slate-600">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleApparatus(option.name)}
                        className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                      />
                      {option.name}
                    </label>
                  );
                })}
              </div>
            </div>
            <label className="text-sm font-medium text-slate-700 md:col-span-2">
              Notas del perfil
              <textarea
                value={form.profileNotes}
                onChange={handleChange("profileNotes")}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                rows={3}
              />
            </label>
          </div>

          <div className="grid gap-6 border-b border-slate-200 p-6 md:grid-cols-2">
            <h2 className="md:col-span-2 text-lg font-semibold text-slate-800">
              Contacto de emergencia y notas
            </h2>
            <label className="text-sm font-medium text-slate-700">
              Nombre de contacto
              <input
                type="text"
                value={form.emergencyContactName}
                onChange={handleChange("emergencyContactName")}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Teléfono de contacto
              <input
                type="tel"
                value={form.emergencyContactPhone}
                onChange={handleChange("emergencyContactPhone")}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              />
            </label>
            <label className="text-sm font-medium text-slate-700 md:col-span-2">
              Notas de la membresía
              <textarea
                value={form.membershipNotes}
                onChange={handleChange("membershipNotes")}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                rows={3}
              />
            </label>
          </div>

          <div className="grid gap-6 p-6 md:grid-cols-2">
            <h2 className="md:col-span-2 text-lg font-semibold text-slate-800">
              Resumen de membresía
            </h2>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 md:col-span-2">
              {latestMembership ? (
                <div className="space-y-1">
                  <p className="font-medium text-slate-700">
                    {latestMembership.membership_types?.name ?? "Plan sin nombre"}
                  </p>
                  <p>
                    Estado: <span className="font-medium">{latestMembership.status}</span>
                  </p>
                  {latestMembership.next_billing_date && (
                    <p>
                      Proximo cobro:{" "}
                      {dayjs(latestMembership.next_billing_date).format("DD MMM YYYY")}
                    </p>
                  )}
                  {latestMembership.start_date && (
                    <p>
                      Inicio: {dayjs(latestMembership.start_date).format("DD MMM YYYY")}
                    </p>
                  )}
                </div>
              ) : (
                <p>No hay membresías registradas para este cliente.</p>
              )}
            </div>
          </div>

          <div className="grid gap-4 border-b border-slate-200 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800">Planes activos</h2>
              {!allowPlanDelete ? (
                <span className="text-xs text-slate-400">No tienes permisos para eliminar planes.</span>
              ) : null}
            </div>
            {planDeleteError && (
              <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">
                {planDeleteError}
              </p>
            )}
            {activePlans.length === 0 ? (
              <p className="text-sm text-slate-500">Sin planes activos para este miembro.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Plan</th>
                      <th className="px-4 py-3">Modalidad</th>
                      <th className="px-4 py-3">Vigencia</th>
                      <th className="px-4 py-3">Créditos</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activePlans.map((plan) => {
                      const planName = plan.plan_types?.name ?? "Plan sin nombre";
                      const planNotes = plan.plan_types?.privileges ?? null;
                      const modality = plan.modality === "FIXED" ? "Fijo" : "Flexible";
                      const remainingLabel =
                        plan.initial_classes === null
                          ? "Ilimitado"
                          : `${plan.remaining_classes ?? 0} de ${plan.initial_classes}`;
                      return (
                        <tr key={plan.id}>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-900">{planName}</div>
                            {planNotes && (
                              <p className="text-xs text-slate-500">{planNotes}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-600">{modality}</td>
                          <td className="px-4 py-3 text-slate-600">
                            <p>Inicio: {formatDate(plan.start_date)}</p>
                            <p>Vence: {plan.expires_at ? formatDate(plan.expires_at) : "Sin fecha"}</p>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{remainingLabel}</td>
                          <td className="px-4 py-3 text-right">
                            {allowPlanDelete ? (
                              <button
                                type="button"
                                onClick={() => handleDeletePlan(plan.id)}
                                disabled={planDeletingId === plan.id}
                                className="inline-flex items-center rounded-md border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-60"
                              >
                                {planDeletingId === plan.id ? "Eliminando..." : "Eliminar plan"}
                              </button>
                            ) : (
                              <span className="text-xs text-slate-400">Sin permisos de eliminación</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
            <Link
              href="/members"
              className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={readOnly || submitting}
              className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60"
            >
              <span className="material-icons-outlined text-base">
                {submitting ? "hourglass_top" : "save"}
              </span>
              {submitting ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </form>
      </div>
    </AdminLayoutAny>
  );
}
