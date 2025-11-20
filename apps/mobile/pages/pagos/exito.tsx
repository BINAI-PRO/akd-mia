import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";

export default function PaymentSuccessPage() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!router.isReady) return;
    const raw = router.query.session_id;
    let resolved: string | null = null;
    if (typeof raw === "string") {
      resolved = raw;
    } else if (Array.isArray(raw) && raw.length > 0) {
      resolved = raw[0] ?? null;
    }
    setSessionId(resolved);
  }, [router.isReady, router.query.session_id]);

  return (
    <>
      <Head>
        <title>Pago confirmado | Pro Fitness</title>
      </Head>
      <section className="py-10">
        <h1 className="text-xl font-semibold text-neutral-900">Pago registrado</h1>
        <p className="mt-3 text-sm text-neutral-600">
          Stripe recibio el pago y el sistema generara tu plan en cuanto el webhook termine de procesarlo. Puedes seguir
          usando la app sin esperar esta pantalla.
        </p>

        {sessionId === undefined ? (
          <p className="mt-6 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-xs text-neutral-600">
            Recuperando la informacion del pago...
          </p>
        ) : sessionId ? (
          <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800">
            <p className="font-medium text-emerald-900">Identificador</p>
            <code className="mt-1 block break-all text-emerald-700">{sessionId}</code>
            <p className="mt-2">
              Si necesitas ayuda, comparte este dato para localizar el cobro en Stripe y en el historial interno.
            </p>
          </div>
        ) : (
          <p className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-700">
            No recibimos un <code>session_id</code>. Si tu plan no aparece pronto, revisa el pago directamente en Stripe.
          </p>
        )}

        <div className="mt-8 flex flex-col gap-3">
          <Link
            href="/"
            className="inline-flex w-full justify-center rounded-lg bg-brand-600 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700"
          >
            Volver al inicio
          </Link>
          <Link
            href="/plans"
            className="inline-flex w-full justify-center rounded-lg border border-neutral-200 px-4 py-3 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100"
          >
            Ver mis planes
          </Link>
        </div>
      </section>
    </>
  );
}
