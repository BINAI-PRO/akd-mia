import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { signOut, useSession } from "next-auth/react";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function GoogleAuthLinkPage() {
  const router = useRouter();
  const { data: nextSession, status } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const googleIdToken = (nextSession as { googleIdToken?: string } | null)?.googleIdToken ?? null;

  const redirectTarget = useMemo(() => {
    const param = router.query.redirect;
    if (typeof param === "string" && param.trim().length > 0) return param;
    return "/schedule";
  }, [router.query.redirect]);

  useEffect(() => {
    if (status === "loading" || completed) return;
    if (!googleIdToken) {
      setError("No se encontrA3 el token de Google para completar la sesiA3n.");
      return;
    }

    let cancelled = false;

    const linkSupabaseSession = async () => {
      try {
        const client = supabaseBrowser();
        const { error: linkError } = await client.auth.signInWithIdToken({
          provider: "google",
          token: googleIdToken,
        });

        if (linkError) {
          const friendly =
            typeof linkError.message === "string" && linkError.message.toLowerCase().includes("rate limit")
              ? "Demasiadas solicitudes. Espera unos segundos o cierra otras sesiones abiertas y vuelve a intentar."
              : linkError.message;
          throw new Error(friendly);
        }

        if (cancelled) return;
        setCompleted(true);
        await signOut({ redirect: false });
        await router.replace(redirectTarget);
      } catch (linkError) {
        if (cancelled) return;
        console.error("google link error", linkError);
        const message =
          linkError instanceof Error ? linkError.message : "No se pudo completar la autenticaciA3n.";
        setError(message);
      }
    };

    void linkSupabaseSession();

    return () => {
      cancelled = true;
    };
  }, [completed, googleIdToken, redirectTarget, router, status]);

  const isLoading = status === "loading" || (!error && !completed);

  return (
    <>
      <Head>
        <title>Conectando cuenta | Akdemia by BInAI</title>
      </Head>
      <main className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-6">
        <section className="w-full max-w-sm space-y-4 rounded-3xl bg-white px-6 py-8 text-center shadow-xl">
          <h1 className="text-2xl font-semibold text-neutral-900">Un momento...</h1>
          {isLoading && (
            <>
              <p className="text-sm text-neutral-500">
                Estamos conectando tu cuenta de Google con Akdemia by BInAI
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

// Permite acceder sin sesiA3n previa de Supabase.
(GoogleAuthLinkPage as { publicPage?: boolean }).publicPage = true;

