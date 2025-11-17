import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { signOut, useSession } from "next-auth/react";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function AdminGoogleAuthLinkPage() {
  const router = useRouter();
  const { data: nextSession, status } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  const redirectTarget = useMemo(() => {
    const param = router.query.redirect;
    if (typeof param === "string" && param.trim().length > 0) return param;
    return "/";
  }, [router.query.redirect]);

  useEffect(() => {
    if (status === "loading" || completed) return;
    if (!nextSession?.googleIdToken) {
      setError("No se encontró el token de Google para completar la sesión.");
      return;
    }

    let cancelled = false;

    const linkSupabaseSession = async () => {
      try {
        const client = supabaseBrowser();
        const { error: linkError } = await client.auth.signInWithIdToken({
          provider: "google",
          token: nextSession.googleIdToken,
        });

        if (linkError) {
          throw linkError;
        }

        if (cancelled) return;
        setCompleted(true);
        await signOut({ redirect: false });
        await router.replace(redirectTarget);
      } catch (linkError) {
        if (cancelled) return;
        console.error("admin google link error", linkError);
        const message =
          linkError instanceof Error
            ? linkError.message
            : "No se pudo completar la autenticación.";
        setError(message);
      }
    };

    void linkSupabaseSession();

    return () => {
      cancelled = true;
    };
  }, [completed, nextSession?.googleIdToken, redirectTarget, router, status]);

  const isLoading = status === "loading" || (!error && !completed);

  return (
    <>
      <Head>
        <title>Conectando cuenta | ATP Admin</title>
      </Head>
      <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6">
        <section className="w-full max-w-sm space-y-4 rounded-3xl bg-white px-6 py-8 text-center shadow-xl">
          <h1 className="text-2xl font-semibold text-slate-900">Un momento...</h1>
          {isLoading && (
            <>
              <p className="text-sm text-slate-500">
                Estamos conectando tu cuenta de Google con el panel de administración.
              </p>
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
            </>
          )}
          {error && (
            <>
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">
                {error}
              </p>
              <button
                type="button"
                className="w-full rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
                onClick={() => void router.replace("/login")}
              >
                Volver al login
              </button>
            </>
          )}
        </section>
      </main>
    </>
  );
}

(AdminGoogleAuthLinkPage as { publicPage?: boolean }).publicPage = true;
