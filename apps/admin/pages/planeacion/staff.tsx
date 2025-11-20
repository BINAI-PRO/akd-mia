import { useCallback, useState, type ChangeEvent, type FormEvent } from "react";
import Head from "next/head";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import AdminLayout from "@/components/admin/AdminLayout";

type StaffRole = {
  id: string;
  slug: string;
  name: string | null;
  description: string | null;
};

type StaffMember = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  createdAt: string | null;
  lastLoginAt: string | null;
  roleSlug: string | null;
  roleName: string | null;
};

type PageProps = {
  staff: StaffMember[];
  roles: StaffRole[];
};

type StaffRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  created_at: string | null;
  last_login_at: string | null;
  staff_roles: { slug: string | null; name: string | null } | null;
};

type StaffSelfRow = {
  staff_roles: { slug: string | null } | null;
};

const MANAGER_ROLE_SLUGS = new Set(["MASTER", "LOCATION_MANAGER", "SUPPORT"]);

const normalizeRole = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.toUpperCase();
};

const collectRoleCandidates = (source: unknown): string[] => {
  if (!source || typeof source !== "object") return [];
  const roles: string[] = [];

  const pushCandidate = (value: unknown) => {
    if (typeof value === "string") {
      const normalized = normalizeRole(value);
      if (normalized) roles.push(normalized);
    } else if (Array.isArray(value)) {
      value.forEach((entry) => {
        if (typeof entry === "string") {
          const normalized = normalizeRole(entry);
          if (normalized) roles.push(normalized);
        }
      });
    }
  };

  const record = source as Record<string, unknown>;
  pushCandidate(record.role);
  pushCandidate(record.roles);
  pushCandidate(record.staff_role);
  pushCandidate(record.staff_roles);
  pushCandidate(record.admin_role);
  pushCandidate(record.admin_roles);

  return roles;
};

async function parseJsonResponse<T>(
  response: Response
): Promise<{ payload: T | null; raw: string }> {
  const raw = await response.text();
  if (!raw) {
    return { payload: {} as T, raw: "" };
  }
  try {
    return { payload: JSON.parse(raw) as T, raw };
  } catch {
    return { payload: null, raw };
  }
}

export const getServerSideProps: GetServerSideProps<PageProps> = async (ctx) => {
  const supabase = createSupabaseServerClient(ctx);
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    return {
      redirect: { destination: "/login", permanent: false },
    };
  }

  const { data: requester, error: requesterError } = await supabaseAdmin
    .from("staff")
    .select("staff_roles ( slug )")
    .eq("auth_user_id", session.user.id)
    .maybeSingle<StaffSelfRow>();

  if (requesterError) {
    throw requesterError;
  }

  const requesterSlug = requester?.staff_roles?.slug ?? null;
  const normalizedSlug = normalizeRole(requesterSlug);

  const sessionUser = session.user;
  const metadataRoles = collectRoleCandidates(sessionUser.user_metadata ?? null);
  const appMetadataRoles = collectRoleCandidates(sessionUser.app_metadata ?? null);

  const roleCandidates = new Set<string>([
    ...metadataRoles,
    ...appMetadataRoles,
  ]);
  if (normalizedSlug) {
    roleCandidates.add(normalizedSlug);
  }

  const hasManagerRole = Array.from(roleCandidates).some((role) => MANAGER_ROLE_SLUGS.has(role));

  if (!hasManagerRole) {
    return {
      redirect: { destination: "/?accessDenied=staff", permanent: false },
    };
  }

  const { data: staffRows, error: staffError } = await supabaseAdmin
    .from("staff")
    .select("id, full_name, email, phone, created_at, last_login_at, staff_roles ( slug, name )")
    .order("full_name", { ascending: true })
    .returns<StaffRow[]>();

  if (staffError) {
    throw staffError;
  }

  const { data: roles, error: roleError } = await supabaseAdmin
    .from("staff_roles")
    .select("id, slug, name, description")
    .order("name", { ascending: true })
    .returns<StaffRole[]>();

  if (roleError) {
    throw roleError;
  }

  const staff: StaffMember[] =
    staffRows?.map((row) => ({
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      createdAt: row.created_at,
      lastLoginAt: row.last_login_at,
      roleSlug: row.staff_roles?.slug ?? null,
      roleName: row.staff_roles?.name ?? null,
    })) ?? [];

  return {
    props: {
      staff,
      roles: roles ?? [],
    },
  };
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-MX", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function StaffManagementPage({
  staff: initialStaff,
  roles,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [staff, setStaff] = useState<StaffMember[]>(initialStaff);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [formState, setFormState] = useState({
    fullName: "",
    email: "",
    roleSlug: roles[0]?.slug ?? "",
    phone: "",
  });

  const handleRoleChange = useCallback(
    async (memberId: string, nextSlug: string) => {
      if (!nextSlug) return;
      setSavingId(memberId);
      setMessage(null);
      try {
        const response = await fetch("/api/staff/update-role", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ staffId: memberId, roleSlug: nextSlug }),
        });
        const { payload, raw } = await parseJsonResponse<{
          error?: string;
          staff?: { id: string; roleSlug: string | null; roleName: string | null };
        }>(response);
        const parsed = payload ?? { error: raw || "Respuesta inválida del servidor" };
        if (!response.ok || !parsed.staff) {
          throw new Error(parsed.error ?? "No se pudo actualizar el rol");
        }
        setStaff((prev) =>
          prev.map((member) =>
            member.id === memberId
              ? {
                  ...member,
                  roleSlug: parsed.staff?.roleSlug ?? null,
                  roleName: parsed.staff?.roleName ?? null,
                }
              : member
          )
        );
        setMessage({ type: "success", text: "Rol actualizado correctamente." });
      } catch (error) {
        const text = error instanceof Error ? error.message : "Error inesperado al actualizar el rol";
        setMessage({ type: "error", text });
      } finally {
        setSavingId(null);
      }
    },
    []
  );

  const handleFormChange = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    setFormState((prev) => ({ ...prev, [name]: value }));
  };

  const handleInviteSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formState.email || !formState.fullName || !formState.roleSlug) {
      setMessage({ type: "error", text: "Completa nombre, correo y rol." });
      return;
    }
    if (!formState.phone || !formState.phone.trim()) {
      setMessage({ type: "error", text: "Ingresa el telAcfono de contacto." });
      return;
    }
    setInviteLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/staff/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formState.email,
          fullName: formState.fullName,
          roleSlug: formState.roleSlug,
          phone: formState.phone.trim(),
        }),
      });
      const { payload, raw } = await parseJsonResponse<{ error?: string; staff?: StaffMember }>(response);
      const parsed = payload ?? { error: raw || "Respuesta inválida del servidor" };
      if (!response.ok || !parsed.staff) {
        throw new Error(parsed.error ?? "No se pudo registrar al staff");
      }
      const staffMember = parsed.staff;
      setStaff((prev) => {
        const existingIndex = prev.findIndex((entry) => entry.id === staffMember.id);
        if (existingIndex >= 0) {
          const copy = [...prev];
          copy[existingIndex] = { ...copy[existingIndex], ...staffMember };
          return copy;
        }
        return [...prev, staffMember].sort((a, b) => (a.fullName ?? "").localeCompare(b.fullName ?? ""));
      });
      setMessage({
        type: "success",
        text: "Se envio la invitacion y se asigno el rol. Pide al colaborador revisar su correo.",
      });
      setFormState({
        fullName: "",
        email: "",
        roleSlug: roles[0]?.slug ?? "",
        phone: "",
      });
    } catch (error) {
      const text = error instanceof Error ? error.message : "No se pudo registrar al staff";
      setMessage({ type: "error", text });
    } finally {
      setInviteLoading(false);
    }
  };

  return (
    <AdminLayout title="Administrar staff" active="planningStaff" featureKey="planningStaff">
      <Head>
        <title>Equipo | Akdemia by BInAI</title>
      </Head>

      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Invitar / registrar colaborador</h2>
          <p className="mt-1 text-sm text-slate-600">
            Envia una invitacion por correo para que el colaborador configure su acceso y asigna el rol correspondiente.
          </p>
          <form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={handleInviteSubmit}>
            <label className="flex flex-col gap-1 text-sm text-slate-700">
              Nombre completo
              <input
                type="text"
                name="fullName"
                value={formState.fullName}
                onChange={handleFormChange}
                placeholder="Ej. Maria Perez"
                required
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-700">
              Correo electronico
              <input
                type="email"
                name="email"
                value={formState.email}
                onChange={handleFormChange}
                placeholder="correo@empresa.com"
                required
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-700">
              Teléfono de contacto
              <input
                type="tel"
                name="phone"
                value={formState.phone}
                onChange={handleFormChange}
                placeholder="+52 55 0000 0000"
                required
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-700">
              Rol
              <select
                name="roleSlug"
                value={formState.roleSlug}
                onChange={handleFormChange}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
              >
                {roles.map((role) => (
                  <option key={role.id} value={role.slug}>
                    {role.name ?? role.slug}
                  </option>
                ))}
              </select>
            </label>
            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={inviteLoading}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-brand-400"
              >
                {inviteLoading ? "Procesando..." : "Enviar invitacion"}
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-slate-900">Equipo registrado</h2>
            <p className="text-sm text-slate-500">
              Solo los usuarios con rol MASTER pueden modificar estos accesos.
            </p>
          </div>

          {message && (
            <div
              className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
                message.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-rose-200 bg-rose-50 text-rose-700"
              }`}
            >
              {message.text}
            </div>
          )}

          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-slate-600">
                    Nombre
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-slate-600">
                    Correo
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-slate-600">
                    Rol
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-slate-600">
                    Ultimo acceso
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-slate-600">
                    Registrado
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {staff.map((member) => (
                  <tr key={member.id}>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="font-medium text-slate-900">
                          {member.fullName ?? "Sin nombre"}
                        </span>
                        {member.phone ? (
                          <span className="text-xs text-slate-500">{member.phone}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{member.email ?? "—"}</td>
                    <td className="px-4 py-3">
                      <select
                        value={member.roleSlug ?? ""}
                        onChange={(event) => handleRoleChange(member.id, event.target.value)}
                        disabled={savingId === member.id}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:cursor-not-allowed"
                      >
                        <option value="" disabled>
                          Selecciona un rol
                        </option>
                        {roles.map((role) => (
                          <option key={role.id} value={role.slug}>
                            {role.name ?? role.slug}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(member.lastLoginAt)}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(member.createdAt)}</td>
                  </tr>
                ))}

                {staff.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">
                      No hay colaboradores registrados.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}


