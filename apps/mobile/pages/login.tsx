import { useEffect, useState, type FormEvent } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useAuth } from "@/components/auth/AuthContext";
import Img from "@/components/Img";

export default function MobileLoginPage() {
  const router = useRouter();
  const { user, loading, refreshSession } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const redirectTarget =
    typeof router.query.redirectTo === "string"
      ? router.query.redirectTo
      : "/schedule";

  useEffect(() => {
    if (!loading && user) {
      void router.replace(redirectTarget);
    }
  }, [loading, redirectTarget, router, user]);

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
        <title>Iniciar sesión | AT Pilates Time</title>
      </Head>
      <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-6">
        <section className="w-full max-w-sm space-y-6 rounded-3xl bg-white px-6 py-8 shadow-xl">
          <div className="flex flex-col items-center gap-3 text-center">
            <Img
              src="/logo.png"
              alt="AT Pilates Time"
              width={120}
              height={40}
              className="h-12 w-auto"
            />
            <h1 className="text-2xl font-bold text-neutral-900">
              Bienvenida de nuevo
            </h1>
            <p className="text-sm text-neutral-500">
              Accede para reservar y gestionar tus clases.
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500" htmlFor="email">
                Correo electrónico
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                placeholder="cliente@correo.com"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500" htmlFor="password">
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                placeholder="••••••••"
              />
            </div>

            {formError && (
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">
                {formError}
              </p>
            )}

            <button
              type="submit"
              className="w-full rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-brand-400"
              disabled={submitting}
            >
              {submitting ? "Ingresando..." : "Entrar"}
            </button>
          </form>
        </section>
      </main>
    </>
  );
}

MobileLoginPage.publicPage = true;
