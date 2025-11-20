import { useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { useAuth } from "@/components/auth/AuthContext";
import { supabaseBrowser } from "@/lib/supabase-browser";

const INITIAL_FORM = {
  fullName: "",
  phone: "",
  gender: "",
  birthdate: "",
};

type ProfileForm = typeof INITIAL_FORM;

type ProfileResponse = {
  fullName?: string | null;
  phone?: string | null;
  gender?: string | null;
  birthdate?: string | null;
};

export default function ProfilePage() {
  const router = useRouter();
  const { user, profile, refreshProfile } = useAuth();
  const email = user?.email ?? "";
  const [form, setForm] = useState<ProfileForm>({ ...INITIAL_FORM });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const next: ProfileForm = {
      fullName: (profile?.fullName ?? "").trim(),
      phone: profile?.phoneNumber ?? "",
      gender: (profile as ProfileResponse)?.gender ?? "",
      birthdate: (profile as ProfileResponse)?.birthdate ?? "",
    };
    setForm((prev) => ({ ...prev, ...next }));
  }, [profile]);

  const handleChange = (field: keyof ProfileForm) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const value = event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const supabase = supabaseBrowser();
      const updates: ProfileResponse = {
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        gender: form.gender.trim(),
        birthdate: form.birthdate.trim(),
      };

      if (!profile?.id) {
        throw new Error("Perfil no disponible para actualizar.");
      }

      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          full_name: updates.fullName || null,
          phone_number: updates.phone || null,
          gender: updates.gender || null,
          birthdate: updates.birthdate || null,
        })
        .eq("id", profile?.id);

      if (profileError) throw profileError;
      await refreshProfile?.();
      setMessage("Perfil actualizado");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "No se pudo actualizar el perfil";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Head>
        <title>Tu perfil | Akdemia</title>
      </Head>
      <main className="container-mobile pb-24 pt-6 space-y-4">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-[0.25em] text-brand-600">Cuenta</p>
          <h1 className="text-2xl font-semibold text-neutral-900">Perfil</h1>
          <p className="text-sm text-neutral-600">Actualiza tus datos generales. El correo no se puede modificar.</p>
        </header>

        <section className="space-y-4">
          <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Correo</label>
                <p className="mt-1 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">{email}</p>
              </div>
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500" htmlFor="fullName">Nombre completo</label>
                  <input
                    id="fullName"
                    type="text"
                    value={form.fullName}
                    onChange={handleChange("fullName")}
                    className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500" htmlFor="phone">Teléfono</label>
                  <input
                    id="phone"
                    type="tel"
                    value={form.phone}
                    onChange={handleChange("phone")}
                    className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500" htmlFor="gender">Género</label>
                    <select
                      id="gender"
                      value={form.gender}
                      onChange={handleChange("gender")}
                      className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                    >
                      <option value="">Selecciona</option>
                      <option value="F">Femenino</option>
                      <option value="M">Masculino</option>
                      <option value="X">Prefiero no decir</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500" htmlFor="birthdate">Fecha de nacimiento</label>
                    <input
                      id="birthdate"
                      type="date"
                      value={form.birthdate}
                      onChange={handleChange("birthdate")}
                      className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                    />
                  </div>
                </div>

                {message && (
                  <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>
                )}
                {error && (
                  <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
                )}

                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-brand-300"
                  >
                    {saving ? "Guardando..." : "Guardar cambios"}
                  </button>
                  <button
                    type="button"
                    className="text-sm font-medium text-brand-700 hover:text-brand-800"
                    onClick={() => router.back()}
                  >
                    Regresar
                  </button>
                </div>
              </form>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}

(ProfilePage as { publicPage?: boolean }).publicPage = false;

