import { useState, type FormEvent } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useAuth } from "./AuthContext";
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_REQUIREMENT_SUMMARY,
  PASSWORD_RULES,
  isPasswordValid,
} from "@/lib/password-policy";

export type PasswordFlowType = "invite" | "recovery";
export type PasswordFlowCompletionStatus = "invite-complete" | "password-updated";

type Props = {
  flow: PasswordFlowType;
  onCompleted: (status: PasswordFlowCompletionStatus) => Promise<void> | void;
};

export function AuthPasswordSetupCard({ flow, onCompleted }: Props) {
  const { user } = useAuth();
  const email = user?.email ?? null;
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const heading = flow === "invite" ? "Configura tu contrasena" : "Actualiza tu contrasena";
  const description =
    flow === "invite"
      ? "Define una contrasena segura para acceder al panel administrativo."
      : "Ingresa una nueva contrasena para recuperar el acceso a tu cuenta.";

  if (!user) {
    return (
      <section className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
        <header className="text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">Akdemia by BInAI</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">Validando enlace...</h1>
          <p className="mt-1 text-sm text-slate-500">
            Espera un momento mientras confirmamos tu invitacion o recuperacion.
          </p>
        </header>
      </section>
    );
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    if (!isPasswordValid(password)) {
      setFormError("La contrasena debe cumplir todos los requisitos de seguridad.");
      return;
    }

    if (password !== confirmPassword) {
      setFormError("Las contrasenas no coinciden.");
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const supabase = supabaseBrowser();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      if (email) {
        try {
          await supabase.auth.resend({
            type: "signup",
            email,
            options: {
              emailRedirectTo:
                typeof window !== "undefined"
                  ? `${window.location.origin}/login`
                  : undefined,
            },
          });
        } catch (resendError) {
          console.warn("[AuthPasswordSetupCard] resend confirm email failed", resendError);
        }
      }

      await supabase.auth.signOut();
      await onCompleted(flow === "invite" ? "invite-complete" : "password-updated");
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo actualizar la contrasena.";
      setFormError(message);
    } finally {
      setSubmitting(false);
      setPassword("");
      setConfirmPassword("");
    }
  };

  return (
    <section className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
      <header className="mb-6 text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">Akdemia by BInAI</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">{heading}</h1>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
        {email && (
          <p className="mt-1 text-xs text-slate-400">
            Gestionando acceso para {" "}
            <span className="font-semibold text-slate-600">{email}</span>
          </p>
        )}
      </header>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700" htmlFor="new-password">
            Nueva contrasena
          </label>
          <div className="relative">
            <input
              id="new-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              maxLength={PASSWORD_MAX_LENGTH}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-11 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
              placeholder="********"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 transition hover:text-slate-600"
              aria-label={showPassword ? "Ocultar contrasena" : "Mostrar contrasena"}
            >
              <span className="material-icons-outlined text-base">
                {showPassword ? "visibility_off" : "visibility"}
              </span>
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700" htmlFor="confirm-password">
            Confirmar contrasena
          </label>
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            maxLength={PASSWORD_MAX_LENGTH}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            placeholder="********"
          />
        </div>

        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <p>{PASSWORD_REQUIREMENT_SUMMARY}</p>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            {PASSWORD_RULES.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </div>

        {formError && (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">
            {formError}
          </p>
        )}

        <button
          type="submit"
          className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-brand-400"
          disabled={submitting}
        >
          {submitting
            ? flow === "invite"
              ? "Guardando..."
              : "Actualizando..."
            : flow === "invite"
            ? "Guardar contrasena"
            : "Actualizar contrasena"}
        </button>
      </form>
    </section>
  );
}
