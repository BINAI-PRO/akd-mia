import { useEffect, useState, type FormEvent } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { normalizePhoneInput } from "@/lib/phone";
import type { StudioPhoneCountry } from "@/lib/studio-settings-shared";
import { useStudioPhoneCountry } from "@/components/StudioTimezoneContext";
import { useAuth } from "@/components/auth/AuthContext";

const PHONE_OPTIONS: Array<{ value: StudioPhoneCountry; label: string }> = [
  { value: "MX", label: "Mexico (+52)" },
  { value: "ES", label: "Espana (+34)" },
];

function guessCountryFromPhone(phone: string | null | undefined): StudioPhoneCountry | null {
  if (!phone) return null;
  if (phone.startsWith("+34")) return "ES";
  if (phone.startsWith("+52")) return "MX";
  return null;
}

export default function SetupProfilePage() {
  const router = useRouter();
  const { profile, reloadProfile } = useAuth();
  const studioCountry = useStudioPhoneCountry();

  const [fullName, setFullName] = useState(profile?.fullName ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [country, setCountry] = useState<StudioPhoneCountry>(
    guessCountryFromPhone(profile?.phone) ?? studioCountry
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const redirectTo =
    typeof router.query.redirectTo === "string" && router.query.redirectTo.length > 0
      ? router.query.redirectTo
      : "/menu";

  useEffect(() => {
    if (!profile) return;

    if (!fullName && profile.fullName) {
      setFullName(profile.fullName);
    }

    if (!phone && profile.phone) {
      setPhone(profile.phone);
      const detected = guessCountryFromPhone(profile.phone);
      if (detected) {
        setCountry(detected);
      }
    }
  }, [profile, fullName, phone]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    setError(null);

    const trimmedName = fullName.trim();
    if (!trimmedName) {
      setError("Escribe tu nombre completo");
      return;
    }

    const normalizedPhone = normalizePhoneInput(phone, country);
    if (!normalizedPhone.ok) {
      setError(normalizedPhone.error);
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: trimmedName,
          phone,
          phoneCountry: country,
        }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body?.error ?? "No se pudo guardar la informacion");
      }

      await reloadProfile();
      await router.replace(redirectTo);
    } catch (submitError) {
      const message =
        submitError instanceof Error ? submitError.message : "No se pudo guardar la informacion";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const phoneHint =
    country === "MX"
      ? "Ingresa 10 digitos, con o sin prefijo +52."
      : "Ingresa 9 digitos, con o sin prefijo +34.";

  return (
    <>
      <Head>
        <title>Completa tu perfil | AT Pilates</title>
      </Head>
      <main className="min-h-screen bg-neutral-50 px-6 py-10">
        <div className="mx-auto w-full max-w-md rounded-3xl bg-white px-6 py-8 shadow-xl">
          <h1 className="text-2xl font-semibold text-neutral-900">Completa tu perfil</h1>
          <p className="mt-2 text-sm text-neutral-600">
            Necesitamos tu nombre y telefono para confirmar reservas y enviarte avisos importantes.
          </p>

          <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Nombre completo
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                placeholder="Nombre y apellidos"
                autoComplete="name"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Pais
              </label>
              <select
                value={country}
                onChange={(event) => {
                  const value = event.target.value === "ES" ? "ES" : "MX";
                  setCountry(value);
                }}
                className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
              >
                {PHONE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Telefono
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                placeholder={country === "ES" ? "+34 600 000 000" : "+52 55 0000 0000"}
                autoComplete="tel"
              />
              <p className="text-xs text-neutral-500">{phoneHint}</p>
            </div>

            {error && (
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-brand-400"
            >
              {submitting ? "Guardando..." : "Guardar y continuar"}
            </button>
          </form>
        </div>
      </main>
    </>
  );
}
