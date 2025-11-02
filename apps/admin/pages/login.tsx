import { useEffect, useState, type FormEvent } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useAuth } from "@/components/auth/AuthContext";

export default function AdminLoginPage() {
  const router = useRouter();
  const { user, loading, refreshSession } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const redirectTarget =
    typeof router.query.redirectTo === "string"
      ? router.query.redirectTo
      : "/";

  useEffect(() => {
    if (!loading && user) {
      void router.replace(redirectTarget);
    }
  }, [loading, redirectTarget, router, user]);

  const handleGoogleLogin = async () => {
    if (submitting) return;
    setSubmitting(true);
    setFormError(null);

    try {
      const supabase = supabaseBrowser();
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}${redirectTarget}`
          : redirectTarget;
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No se pudo iniciar sesion con Google";
      setFormError(message);
      setSubmitting(false);
    }
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
        error instanceof Error ? error.message : "No se pudo iniciar sesión";
      setFormError(message);
      setSubmitting(false);
    }
  };

  return (
    <>
      <Head>
        <title>Iniciar sesión | Panel Admin</title>
      </Head>
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <section className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
          <header className="mb-6 text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">
              AT Pilates Time
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
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                placeholder="••••••••"
              />
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
              {submitting ? "Ingresando..." : "Iniciar sesión"}
            </button>
          </form>
        </section>
      </main>
    </>
  );
}

AdminLoginPage.publicPage = true;
