import Head from "next/head";
import Link from "next/link";

export default function PaymentCancelledPage() {
  return (
    <>
      <Head>
        <title>Pago cancelado | ATP Pilates Admin</title>
      </Head>
      <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-16">
        <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-8 shadow-lg">
          <h1 className="text-2xl font-semibold text-slate-900">Pago cancelado</h1>
          <p className="mt-4 text-sm text-slate-600">
            El proceso de pago se canceló o el cliente cerró la página de Stripe. Ningún cargo fue registrado. Si
            todavía deseas completar la compra, vuelve a generar el checkout desde el panel.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/members"
              className="inline-flex w-full items-center justify-center rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white shadow transition hover:bg-brand-800"
            >
              Volver a miembros
            </Link>
            <Link
              href="/"
              className="inline-flex w-full items-center justify-center rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Ir al dashboard
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
