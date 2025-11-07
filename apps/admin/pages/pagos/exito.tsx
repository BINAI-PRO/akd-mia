import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";

export default function PaymentSuccessPage() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (!router.isReady) return;
    const raw = router.query.session_id;
    if (typeof raw === "string") {
      setSessionId(raw);
    } else if (Array.isArray(raw) && raw.length > 0) {
      setSessionId(raw[0] ?? null);
    } else {
      setSessionId(null);
    }
  }, [router.isReady, router.query.session_id]);

  return (
    <>
      <Head>
        <title>Pago exitoso | ATP Pilates Admin</title>
      </Head>
      <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-16">
        <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-8 shadow-lg">
          <h1 className="text-2xl font-semibold text-slate-900">Pago registrado correctamente</h1>
          <p className="mt-4 text-sm text-slate-600">
            Stripe confirmó el pago y el sistema activará el plan en cuanto se procese. Regresa al panel para revisar
            el historial del cliente o continuar con otra operación.
          </p>
          {sessionId ? (
            <div className="mt-6 rounded-md border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">
              <p className="font-medium text-slate-900">ID de sesión</p>
              <code className="mt-1 block break-all text-slate-600">{sessionId}</code>
              <p className="mt-2 text-slate-600">
                Si necesitas soporte, comparte este identificador para rastrear el pago en Stripe y en el historial interno.
              </p>
            </div>
          ) : (
            <p className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-xs text-amber-700">
              No recibimos un <code>session_id</code>. Si el plan no aparece en el historial, verifica el pago directamente en Stripe.
            </p>
          )}

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/members"
              className="inline-flex w-full items-center justify-center rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white shadow transition hover:bg-brand-800"
            >
              Regresar a miembros
            </Link>
            <Link
              href="/"
              className="inline-flex w-full items-center justify-center rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Ir al inicio
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
