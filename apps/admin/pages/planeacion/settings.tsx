import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import Head from "next/head";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import AdminLayout from "@/components/admin/AdminLayout";
import { loadStudioSettings } from "@/lib/studio-settings";
import { FIXED_GMT_OPTIONS, STUDIO_TIMEZONE_SUGGESTIONS, type TimezoneOption } from "@/lib/timezone-options";
import {
  DEFAULT_STUDIO_TIMEZONE,
  formatOffsetLabel,
  getTimezoneOffsetMinutes,
  setStudioTimezone,
} from "@/lib/timezone";

type PhoneCountry = "MX" | "ES";

type PageProps = {
  initialTimezone: string;
  initialOffsetLabel: string | null;
  initialPhoneCountry: PhoneCountry;
  suggestions: TimezoneOption[];
  initialMembershipsEnabled: boolean;
};

export const getServerSideProps: GetServerSideProps<PageProps> = async () => {
  const settings = await loadStudioSettings();
  const offset = getTimezoneOffsetMinutes(settings.scheduleTimezone);
  return {
    props: {
      initialTimezone: settings.scheduleTimezone,
      initialOffsetLabel: offset === null ? null : formatOffsetLabel(offset),
      initialPhoneCountry: settings.phoneCountry,
      suggestions: STUDIO_TIMEZONE_SUGGESTIONS,
      initialMembershipsEnabled: settings.membershipsEnabled,
    },
  };
};

type Feedback =
  | { status: "idle"; message: null }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

const FIXED_OPTIONS_SET = new Set(FIXED_GMT_OPTIONS.map((option) => option.value));

export default function StudioSettingsPage({
  initialTimezone,
  initialOffsetLabel,
  initialPhoneCountry,
  suggestions,
  initialMembershipsEnabled,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [timezoneValue, setTimezoneValue] = useState(initialTimezone);
  const [phoneCountry, setPhoneCountry] = useState<PhoneCountry>(initialPhoneCountry);
  const [membershipsEnabled, setMembershipsEnabled] = useState(initialMembershipsEnabled);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>({ status: "idle", message: null });
  const [activeOffsetLabel, setActiveOffsetLabel] = useState(initialOffsetLabel);

  const previewOffset = useMemo(() => {
    const offsetMinutes = getTimezoneOffsetMinutes(timezoneValue);
    return offsetMinutes === null ? null : formatOffsetLabel(offsetMinutes);
  }, [timezoneValue]);

  const handleSuggestionChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    if (!value) return;
    setTimezoneValue(value);
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    setTimezoneValue(event.target.value);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const candidate = timezoneValue.trim();
    if (!candidate) {
      setFeedback({ status: "error", message: "Debes indicar un identificador de zona horaria" });
      return;
    }

    const payload = {
      timezone: candidate,
      phoneCountry,
      membershipsEnabled,
    };

    setSubmitting(true);
    setFeedback({ status: "idle", message: null });
    try {
      const response = await fetch("/api/settings/timezone", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as {
        timezone?: string;
        offsetLabel?: string | null;
        phoneCountry?: PhoneCountry;
        membershipsEnabled?: boolean;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body?.error ?? "No se pudo actualizar la configuracion");
      }

      const updatedTimezone = typeof body?.timezone === "string" ? body.timezone : candidate;
      setStudioTimezone(updatedTimezone);
      setTimezoneValue(updatedTimezone);
      setPhoneCountry(body?.phoneCountry ?? phoneCountry);
      setMembershipsEnabled(
        typeof body?.membershipsEnabled === "boolean" ? body.membershipsEnabled : membershipsEnabled
      );
      setActiveOffsetLabel(body?.offsetLabel ?? null);
      setFeedback({ status: "success", message: "Configuracion actualizada correctamente" });
    } catch (error) {
      console.error("Failed to update studio timezone", error);
      const message = error instanceof Error ? error.message : "No se pudo actualizar la configuracion";
      setFeedback({ status: "error", message });
    } finally {
      setSubmitting(false);
    }
  };

  const renderSuggestions = () => {
    const fixedGroup = suggestions.filter((option) => option.group === "FIXED_GMT");
    const regionalGroup = suggestions.filter((option) => option.group === "REGION");

    return (
      <>
        <optgroup label="Offsets GMT fijos">
          {fixedGroup.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </optgroup>
        <optgroup label="Zonas regionales sugeridas">
          {regionalGroup.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </optgroup>
      </>
    );
  };

  const infoOffsetLabel = previewOffset ?? "No reconocido aun";

  const activeModeLabel = FIXED_OPTIONS_SET.has(timezoneValue)
    ? "Offset fijo (GMT)"
    : timezoneValue === DEFAULT_STUDIO_TIMEZONE
    ? "Offset fijo recomendado (GMT+01:00)"
    : "Zona regional (IANA)";

  return (
    <>
      <Head>
        <title>Configuracion de recursos | AT Pilates Time</title>
      </Head>
      <AdminLayout title="Configuracion de recursos" active="settings" featureKey="planningSettings">
        <div className="mx-auto max-w-3xl space-y-8">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <header className="space-y-2">
              <h1 className="text-2xl font-semibold text-slate-900">Horario de programacion</h1>
              <p className="text-sm text-slate-600">
                Define la referencia que se utiliza para programar sesiónes, reservas y ventanas de cancelacion. Este valor
                se aplica en todas las instancias (admin, app y QR) sin conversiones adicionales.
              </p>
            </header>

            <form onSubmit={handleSubmit} className="mt-6 space-y-6">
              <div className="space-y-2">
                <label htmlFor="timezone-suggestion" className="text-sm font-medium text-slate-800">
                  Seleccionar una opcion sugerida
                </label>
                <select
                  id="timezone-suggestion"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                  value={FIXED_OPTIONS_SET.has(timezoneValue) ? timezoneValue : ""}
                  onChange={handleSuggestionChange}
                >
                  <option value="">Selecciona un horario sugerido</option>
                  {renderSuggestions()}
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="timezone-input" className="text-sm font-medium text-slate-800">
                  Identificador de zona horaria (IANA o GMT)
                </label>
                <input
                  id="timezone-input"
                  type="text"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                  value={timezoneValue}
                  onChange={handleInputChange}
                  placeholder="Ej. Etc/GMT-1 o Europe/Madrid"
                />
                <p className="text-xs text-slate-500">
                  Modo actual: <span className="font-medium text-slate-700">{activeModeLabel}</span>
                </p>
              </div>

              <div className="space-y-2">
                <label htmlFor="phone-country" className="text-sm font-medium text-slate-800">
                  País para validar teléfonos
                </label>
                <select
                  id="phone-country"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                  value={phoneCountry}
                  onChange={(event) => setPhoneCountry((event.target.value as PhoneCountry) ?? "MX")}
                >
                  <option value="MX">México (+52)</option>
                  <option value="ES">España (+34)</option>
                </select>
                <p className="text-xs text-slate-500">
                  Los registros nuevos y las apps aplicarán esta regla para exigir el formato correcto del número
                  telefónico.
                </p>
              </div>
              <div className="space-y-2">
                <span className="text-sm font-medium text-slate-800">Membresías en admin y app</span>
                <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-600 shadow-inner md:flex-row md:items-center md:justify-between">
                  <p className="max-w-2xl text-sm">
                    Activa o desactiva el uso de membresías. Al desactivarlas se ocultarán las pantallas de administración,
                    compra y gestión tanto en admin como en la app móvil.
                  </p>
                  <label htmlFor="memberships-enabled" className="inline-flex items-center gap-3 text-base font-semibold text-slate-900">
                    <input
                      id="memberships-enabled"
                      type="checkbox"
                      className="h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-2 focus:ring-brand-500"
                      checked={membershipsEnabled}
                      onChange={(event) => setMembershipsEnabled(event.target.checked)}
                    />
                    {membershipsEnabled ? "Habilitadas" : "Deshabilitadas"}
                  </label>
                </div>
                <p className="text-xs text-slate-500">
                  {membershipsEnabled
                    ? "Se mostrarán todas las secciones relacionadas con membresías en admin y mobile."
                    : "Se ocultarán las referencias a membresías en admin, mobile y flujos de compra."}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                <p className="font-semibold text-slate-800">Vista previa</p>
                <p>
                  Offset detectado:{" "}
                  <span className="font-medium text-slate-900">
                    {infoOffsetLabel} {previewOffset === null ? "(verifica el identificador)" : ""}
                  </span>
                </p>
                <p className="mt-1">
                  Formato telefónico:{" "}
                  <span className="font-medium text-slate-900">
                    {phoneCountry === "MX" ? "México (+52)" : "España (+34)"}
                  </span>
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  El horario se aplica a todas las comparaciones (inicio de sesión, ventanas de reserva y cancelacion,
                  etiquetas de clase pasada).
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-brand-300"
                  disabled={submitting}
                >
                  {submitting ? "Guardando..." : "Guardar horario"}
                </button>
                <div className="text-sm">
                  {feedback.status === "success" && (
                    <span className="text-emerald-600">{feedback.message ?? "Horario actualizado"}</span>
                  )}
                  {feedback.status === "error" && <span className="text-rose-600">{feedback.message}</span>}
                  {feedback.status === "idle" && (
                    <span className="text-slate-500">
                      Offset actual:{" "}
                      <span className="font-medium text-slate-700">{activeOffsetLabel ?? "Sin detectar"}</span>
                      {"  •  "}
                      Teléfono:{" "}
                      <span className="font-medium text-slate-700">
                        {phoneCountry === "MX" ? "México (+52)" : "España (+34)"}
                      </span>
                    </span>
                  )}
                </div>
              </div>
            </form>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Notas operativas</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>
                El valor definido aqui se replica en todas las herramientas (sesiónes, reservas, QR, calendario, menu de
                inicio).
              </li>
              <li>Para evitar discrepancias, siempre programa nuevas clases despues de ajustar el horario.</li>
              <li>
                Si necesitas un offset fijo, selecciona una opcion <span className="font-medium text-slate-700">Etc/GMT</span>.
                Para horarios con horario de verano utiliza un identificador regional (ej. Europe/Madrid).
              </li>
            </ul>
          </section>
        </div>
      </AdminLayout>
    </>
  );
}