import { useEffect, useState, type FormEvent } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { signIn } from "next-auth/react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useAuth } from "@/components/auth/AuthContext";
import {
  AuthPasswordSetupCard,
  type PasswordFlowCompletionStatus,
  type PasswordFlowType,
} from "@/components/auth/AuthPasswordSetupCard";
import { PASSWORD_REQUIREMENT_SUMMARY } from "@/lib/password-policy";

const normalizeFlowValue = (value?: string | null): PasswordFlowType | null => {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (normalized === "invite" || normalized === "recovery") {
    return normalized;
  }
  return null;
};

export default function AdminLoginPage() {
  const router = useRouter();
  const { user, loading, refreshSession } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hashMeta, setHashMeta] = useState<{ type?: string }>({});
  const [flowDismissed, setFlowDismissed] = useState(false);

  const redirectTarget =
    typeof router.query.redirectTo === "string"
      ? router.query.redirectTo
      : "/";

  useEffect(() => {
    if (!router.isReady || typeof window === "undefined") return;
    const hash = window.location.hash ?? "";
    if (!hash) {
      setHashMeta({});
      return;
    }

    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const typeValue = params.get("type") ?? undefined;
    setHashMeta({ type: typeValue });

    const cleanupUrl = () => {
      window.history.replaceState(
        null,
        document.title,
        `${window.location.pathname}${window.location.search}`
      );
    };

    if (params.has("access_token") && params.has("refresh_token")) {
      const supabase = supabaseBrowser();
      void supabase.auth
        .setSession({
          access_token: params.get("access_token") ?? "",
          refresh_token: params.get("refresh_token") ?? "",
        })
        .catch((error) => console.error("[/login] setSession from hash failed", error))
        .finally(cleanupUrl);
      return;
    }

    cleanupUrl();
  }, [router.isReady]);

  const derivedFlow: PasswordFlowType | null =
    normalizeFlowValue(typeof router.query.flow === "string" ? router.query.flow : null) ??
    normalizeFlowValue(typeof router.query.type === "string" ? router.query.type : null) ??
    normalizeFlowValue(hashMeta.type ?? null);

  useEffect(() => {
    if (derivedFlow) {
      setFlowDismissed(false);
    }
  }, [derivedFlow]);

  const activeFlow = flowDismissed ? null : derivedFlow;

  useEffect(() => {
    if (!loading && user && !activeFlow) {
      void router.replace(redirectTarget);
    }
  }, [activeFlow, loading, redirectTarget, router, user]);

  useEffect(() => {
    if (!router.isReady) return;
    const errorParam = router.query.error;
    if (typeof errorParam === "string") {
      if (errorParam === "staff_required") {
        setFormError(
          "Tu cuenta no tiene acceso administrativo. Solicita una invitacion al administrador."
        );
      } else if (errorParam === "auth_required") {
        setFormError("Tu sesiÃ³n expirÃ³. Vuelve a iniciar sesiÃ³n para continuar.");
      }
    }
  }, [router.isReady, router.query.error]);

  const statusParam = typeof router.query.status === "string" ? router.query.status : null;
  const statusMessage =
    statusParam === "invite-complete"
      ? "Tu contraseÃ±a se guardÃ³ correctamente. Enviamos un correo de confirmaciÃ³n."
      : statusParam === "password-updated"
      ? "ContraseÃ±a actualizada. Ya puedes iniciar sesiÃ³n de nuevo."
      : null;

  const handleGoogleLogin = async () => {
    if (submitting) return;
    setSubmitting(true);
    setFormError(null);

    try {
      const callbackUrl = `/auth/google?redirect=${encodeURIComponent(redirectTarget)}`;
      const response = await signIn("google", { callbackUrl, redirect: false });
      if (response?.error) {
        throw new Error(response.error);
      }
      if (response?.url) {
        window.location.href = response.url;
      } else {
        setSubmitting(false);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo iniciar sesiÃ³n con Google";
      setFormError(message);
      setSubmitting(false);
    }
  };

  const handleFlowCompleted = async (status: PasswordFlowCompletionStatus) => {
    setFlowDismissed(true);
    const nextQuery: Record<string, string> = { status };
    if (typeof router.query.redirectTo === "string") {
      nextQuery.redirectTo = router.query.redirectTo;
    }
    await router.replace({
      pathname: "/login",
      query: nextQuery,
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setFormError(null);

    try {
      const supabase = supabaseBrowser();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setFormError(error.message);
        setSubmitting(false);
        return;
      }

      await refreshSession();
      await router.replace(redirectTarget);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo iniciar sesiÃ³n";
      setFormError(message);
      setSubmitting(false);
    }
  };

  return (
    <>
      <Head>
        <title>Iniciar sesiÃ³n | Panel Admin</title>
      </Head>
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        {activeFlow ? (
          <AuthPasswordSetupCard flow={activeFlow} onCompleted={handleFlowCompleted} />
        ) : (
          <section className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
            <header className="mb-6 text-center">
              <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">
                Akdēmia by BInAI
              </p>
              <h1 className="mt-2 text-2xl font-bold text-slate-900">
                Acceso administrativo
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Ingresa tus credenciales para continuar.
              </p>
            </header>

            <div className="space-y-3 pb-6">
              <button
                type="button"
                onClick={handleGoogleLogin}
                className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
                disabled={submitting}
              >
                Continuar con Google
              </button>
              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-slate-200" />
                <span className="text-[11px] uppercase tracking-wide text-slate-400">
                  o ingresa con email
                </span>
                <span className="h-px flex-1 bg-slate-200" />
              </div>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700" htmlFor="email">
                  Correo
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                  placeholder="admin@atpilatestime.com"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700" htmlFor="password">
                  ContraseÃ±a
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-11 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                    placeholder="********"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 transition hover:text-slate-600"
                    aria-label={showPassword ? "Ocultar contraseÃ±a" : "Mostrar contraseÃ±a"}
                  >
                    <span className="material-icons-outlined text-base">
                      {showPassword ? "visibility_off" : "visibility"}
                    </span>
                  </button>
                </div>
                <p className="text-xs text-slate-500">{PASSWORD_REQUIREMENT_SUMMARY}</p>
              </div>

              {statusMessage && (
                <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  {statusMessage}
                </p>
              )}

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
                {submitting ? "Ingresando..." : "Iniciar sesiÃ³n"}
              </button>
            </form>
          </section>
        )}
      </main>
    </>
  );
}

AdminLoginPage.publicPage = true;

