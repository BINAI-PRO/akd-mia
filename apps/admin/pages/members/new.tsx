import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  useState,
  type ComponentType,
  type FormEvent,
  type PropsWithChildren,
} from "react";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import AdminLayout from "@/components/admin/AdminLayout";
import { useStudioPhoneCountry } from "@/components/StudioTimezoneContext";
import { normalizePhoneInput } from "@/lib/phone";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Tables } from "@/types/database";

const AdminLayoutAny = AdminLayout as unknown as ComponentType<
  PropsWithChildren<Record<string, unknown>>
>;

type ApparatusRow = Tables<"apparatus">;

type ApparatusOption = {
  id: string;
  name: string;
};

const CLIENT_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "ON_HOLD", label: "Inactivo" },
  { value: "ACTIVE", label: "Activo" },
  { value: "CANCELED", label: "Cancelado" },
];

type PageProps = {
  apparatusOptions: ApparatusOption[];
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
  emergencyContactName: string;
  emergencyContactPhone: string;
  preferredApparatus: string[];
};

export const getServerSideProps: GetServerSideProps<PageProps> = async () => {
  const { data, error } = await supabaseAdmin
    .from("apparatus")
    .select("id, name")
    .order("name")
    .returns<ApparatusRow[]>();

  if (error) throw error;

  const apparatusOptions: ApparatusOption[] = (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
  }));

  return {
    props: {
      apparatusOptions,
    },
  };
};

export default function NewMemberPage({
  apparatusOptions,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const phoneCountry = useStudioPhoneCountry();

  const [form, setForm] = useState<FormState>({
    fullName: "",
    email: "",
    phone: "",
    profileStatus: "ON_HOLD",
    avatarUrl: "",
    birthdate: "",
    occupation: "",
    profileNotes: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
    preferredApparatus: [],
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

    const fullName = form.fullName.trim();
    if (!fullName) {
      setError("El nombre completo es obligatorio");
      return;
    }

    const phoneResult = normalizePhoneInput(form.phone, phoneCountry);
    if (!phoneResult.ok) {
      setError(phoneResult.error);
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        fullName,
        email: form.email.trim() ? form.email.trim() : null,
        phone: phoneResult.value,
        profileStatus: form.profileStatus,
        avatarUrl: form.avatarUrl.trim() ? form.avatarUrl.trim() : null,
        birthdate: form.birthdate || null,
        occupation: form.occupation.trim() ? form.occupation.trim() : null,
        profileNotes: form.profileNotes.trim() ? form.profileNotes.trim() : null,
        emergencyContactName: form.emergencyContactName.trim()
          ? form.emergencyContactName.trim()
          : null,
        emergencyContactPhone: form.emergencyContactPhone.trim()
          ? form.emergencyContactPhone.trim()
          : null,
        preferredApparatus: form.preferredApparatus,
      };

      const response = await fetch("/api/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => ({}))) as {
        member?: { id?: string | null };
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body?.error ?? "No se pudo crear el miembro");
      }

      const memberId = body?.member?.id;
      const targetQuery =
        typeof memberId === "string" && memberId.length > 0
          ? { created: "1", memberId }
          : { created: "1" };

      await router.push({
        pathname: "/members",
        query: targetQuery,
      });
    } catch (submitError) {
      const message =
        submitError instanceof Error ? submitError.message : "No se pudo crear el miembro";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AdminLayoutAny title="Nuevo miembro" active="Miembros">
      <Head>
        <title>Registrar miembro  Admin</title>
      </Head>

      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">Registrar nuevo miembro</h1>
            <p className="text-sm text-slate-500">Captura los datos basicos del cliente.</p>
          </div>
          <Link
            href="/members"
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            <span className="material-icons-outlined text-base">arrow_back</span>
            Volver al listado
          </Link>
        </div>

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
                  placeholder="Nombre y apellidos"
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
                placeholder="cliente@correo.com"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Telefono
              <input
                type="tel"
                value={form.phone}
                onChange={handleChange("phone")}
                required
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                placeholder={phoneCountry === "MX" ? "+52 55 0000 0000" : "+34 600 000 000"}
              />
              <span className="mt-1 block text-xs text-slate-500">
                {phoneCountry === "MX"
                  ? "Formato Mexico: 10 digitos, admite prefijo +52."
                  : "Formato Espana: 9 digitos, admite prefijo +34."}
              </span>
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
                value={form.birthdate}
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
                placeholder="Profesion u ocupacion"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              URL de avatar
              <input
                type="url"
                value={form.avatarUrl}
                onChange={handleChange("avatarUrl")}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                placeholder="https://..."
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
                placeholder="Observaciones generales del cliente"
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
          </div>

          {error && (
            <div className="border-t border-rose-200 bg-rose-50 px-6 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

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
              {submitting ? "Guardando..." : "Guardar miembro"}
            </button>
          </div>
        </form>
      </div>
    </AdminLayoutAny>
  );
}
