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
import { MembershipsDisabledNotice } from "@/components/admin/MembershipsDisabledNotice";
import { useMembershipsEnabled, useStudioPhoneCountry } from "@/components/StudioTimezoneContext";
import { normalizePhoneInput } from "@/lib/phone";
import {
  CUSTOM_PHONE_COUNTRY_ISO,
  PHONE_COUNTRY_OPTIONS,
  findPhoneCountryOption,
} from "@/lib/phone-country-options";
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
  const membershipsEnabled = useMembershipsEnabled();

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
  const [phoneCountryIso, setPhoneCountryIso] = useState<string>(phoneCountry);
  const [customDialCode, setCustomDialCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createAppAccess, setCreateAppAccess] = useState(false);
  const [appPassword, setAppPassword] = useState("");
  const [appPasswordConfirm, setAppPasswordConfirm] = useState("");

  const handleChange =
    (field: keyof FormState) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const value = event.target.value;
      setForm((prev) => ({ ...prev, [field]: value }));
    };

  const selectedPhoneOption =
    findPhoneCountryOption(phoneCountryIso) ?? findPhoneCountryOption(phoneCountry);
  const showCustomDialInput =
    (selectedPhoneOption?.iso ?? "").toUpperCase() === CUSTOM_PHONE_COUNTRY_ISO;
  const phonePlaceholder =
    selectedPhoneOption?.iso === "MX"
      ? "+52 55 0000 0000"
      : selectedPhoneOption?.iso === "ES"
      ? "+34 600 000 000"
      : "+00 000 000 000";
  const phoneHint =
    selectedPhoneOption?.iso === "MX"
      ? "Formato México: 10 dígitos, admite prefijo +52."
      : selectedPhoneOption?.iso === "ES"
      ? "Formato España: 9 dígitos, admite prefijo +34."
      : "Ingresa el número con el prefijo seleccionado o directamente en formato internacional (+código).";

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

    const effectiveCountry = phoneCountryIso || phoneCountry;
    const phoneResult = normalizePhoneInput(form.phone, {
      countryIso: effectiveCountry,
      customDialCode: showCustomDialInput ? customDialCode : undefined,
      fallbackCountry: phoneCountry,
    });
    if (!phoneResult.ok) {
      setError(phoneResult.error);
      return;
    }
    const normalizedPhone = phoneResult.value;

    if (createAppAccess) {
      if (!form.email.trim()) {
        setError("Para crear acceso a la app captura un correo electrónico.");
        return;
      }
      if (appPassword.length < 8) {
        setError("La contraseña para la app debe tener al menos 8 caracteres.");
        return;
      }
      if (appPassword !== appPasswordConfirm) {
        setError("La confirmación de contraseña no coincide.");
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload = {
        fullName,
        email: form.email.trim() ? form.email.trim() : null,
        phone: normalizedPhone,
        phoneCountryIso: effectiveCountry,
        customDialCode: showCustomDialInput ? customDialCode : null,
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
        createAuthUser: createAppAccess,
        authPassword: createAppAccess ? appPassword : null,
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

  if (!membershipsEnabled) {
    return (
      <AdminLayoutAny title="Nuevo miembro" active="Miembros" featureKey="memberNew">
        <Head>
          <title>Registrar miembro | Admin</title>
        </Head>
        <MembershipsDisabledNotice />
      </AdminLayoutAny>
    );
  }

  return (
    <AdminLayoutAny title="Nuevo miembro" active="Miembros" featureKey="memberNew">
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
          className="mx-auto w-full max-w-3xl rounded-xl border border-slate-200 bg-white shadow-sm"
        >
          <div className="grid gap-4 border-b border-slate-200 p-6 sm:grid-cols-2">
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
              {"Pa\u00EDs / prefijo telef\u00F3nico"}
              <div className="mt-1 flex gap-2">
                <select
                  value={phoneCountryIso}
                  onChange={(event) => {
                    const value = event.target.value;
                    setPhoneCountryIso(value);
                    if (value !== CUSTOM_PHONE_COUNTRY_ISO) {
                      setCustomDialCode("");
                    }
                  }}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                >
                  {PHONE_COUNTRY_OPTIONS.map((option) => (
                    <option key={option.iso} value={option.iso}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {showCustomDialInput && (
                  <input
                    type="text"
                    value={customDialCode}
                    onChange={(event) => setCustomDialCode(event.target.value.replace(/\D+/g, ""))}
                    className="w-28 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                    placeholder="Ej. 44"
                  />
                )}
              </div>
              {showCustomDialInput && (
                <span className="mt-1 block text-xs text-slate-500">
                  {"Ingresa solo d\u00EDgitos para la lada internacional (sin el signo +)."}
                </span>
              )}
            </label>
            <label className="text-sm font-medium text-slate-700">
              {"Tel\u00E9fono"}
              <input
                type="tel"
                value={form.phone}
                onChange={handleChange("phone")}
                required
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                placeholder={phonePlaceholder}
              />
              <span className="mt-1 block text-xs text-slate-500">{phoneHint}</span>
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
              Ocupación
              <input
                type="text"
                value={form.occupation}
                onChange={handleChange("occupation")}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                placeholder="Profesión u ocupación"
              />
            </label>
            <div className="md:col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <label className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={createAppAccess}
                  onChange={(event) => setCreateAppAccess(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                Crear acceso inmediato a la app
              </label>
              <p className="mt-1 text-xs text-slate-500">
                Se generará un usuario para la app usando este correo y contraseña.
              </p>
              {createAppAccess && (
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="text-sm font-medium text-slate-700">
                    contraseña temporal
                    <input
                      type="password"
                      value={appPassword}
                      onChange={(event) => setAppPassword(event.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                      placeholder="Mínimo 8 caracteres"
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Confirmar contraseña
                    <input
                      type="password"
                      value={appPasswordConfirm}
                      onChange={(event) => setAppPasswordConfirm(event.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                    />
                  </label>
                </div>
              )}
            </div>
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

          <div className="grid gap-4 border-b border-slate-200 p-6 md:grid-cols-2">
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
