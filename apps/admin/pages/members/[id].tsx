import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type FormEvent,
  type PropsWithChildren,
} from "react";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import dayjs from "dayjs";
import AdminLayout from "@/components/admin/AdminLayout";
import { supabaseAdmin } from "@/lib/supabase-admin";
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
};

type ApparatusOption = {
  id: string;
  name: string;
};

type PageProps = {
  member: MemberRow;
  apparatusOptions: ApparatusOption[];
  justCreated: boolean;
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

  return {
    props: {
      member: memberResp.data,
      apparatusOptions: apparatusResp.data ?? [],
      justCreated,
    },
  };
};

export default function EditMemberPage({
  member,
  apparatusOptions,
  justCreated,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const profile = member.client_profiles;
  const sortedMemberships = useMemo(
    () =>
      [...(member.memberships ?? [])].sort(
        (a, b) => dayjs(b.created_at).valueOf() - dayjs(a.created_at).valueOf()
      ),
    [member.memberships]
  );
  const latestMembership = sortedMemberships[0] ?? null;
  const initialStatus = (profile?.status ?? "ACTIVE").toUpperCase();
  const normalizedStatus = initialStatus === "CANCELLED" ? "CANCELED" : initialStatus;

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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(
    justCreated ? "Miembro creado exitosamente." : null
  );

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
    } catch (submitError) {
      const message =
        submitError instanceof Error ? submitError.message : "No se pudo actualizar el miembro";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AdminLayoutAny title="Editar miembro" active="Miembros">
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
              Telefono
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
              Ocupacion
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
              Telefono de contacto
              <input
                type="tel"
                value={form.emergencyContactPhone}
                onChange={handleChange("emergencyContactPhone")}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              />
            </label>
            <label className="text-sm font-medium text-slate-700 md:col-span-2">
              Notas de la membresia
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
              Resumen de membresia
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
                <p>No hay membresias registradas para este cliente.</p>
              )}
            </div>
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
              disabled={submitting}
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
