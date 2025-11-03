import Head from "next/head";
import Link from "next/link";

export default function PaymentCancelledPage() {
  return (
    <>
      <Head>
        <title>Pago cancelado | ATP Tu Fit App</title>
      </Head>
      <section className="py-10">
        <h1 className="text-xl font-semibold text-neutral-900">Pago cancelado</h1>
        <p className="mt-3 text-sm text-neutral-600">
          El flujo de Stripe se cerro antes de completar el cargo. No se registro ningun pago y tu plan sigue igual que
          antes. Si quieres intentarlo de nuevo, regresa a la lista de planes y genera otro checkout.
        </p>

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
            Ir a los planes
          </Link>
        </div>
      </section>
    </>
  );
}
