import Head from "next/head";
import Image from "next/image";
import Link from "next/link";

export default function PagoIntegracionPage() {
  return (
    <>
      <Head>
        <title>Integración de pagos | Akdemia</title>
      </Head>
      <main className="min-h-screen bg-slate-900 px-4 py-10 text-white">
        <div className="mx-auto flex w-full max-w-md flex-col gap-6 rounded-2xl bg-white/5 p-6 shadow-xl ring-1 ring-white/10 backdrop-blur">
          <header className="text-center">
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">Demo sin cobros</p>
            <h1 className="mt-2 text-2xl font-semibold">Integración de pagos</h1>
            <p className="mt-2 text-sm text-white/80">
              Conectamos tu app con las principales plataformas de pago. Este demo no inicia cargos reales.
            </p>
          </header>

          <div className="flex justify-center">
            <div className="overflow-hidden rounded-xl bg-white/10 p-3 ring-1 ring-white/10">
              <Image src="/pay_serv.png" alt="Plataformas de pago" width={340} height={160} />
            </div>
          </div>

          <div className="space-y-2 text-sm text-white/80">
            <p>
              Integramos Stripe, PayPal, Mercado Pago, Openpay, Conekta y más. Activa de nuevo el cobro cuando tengas
              las credenciales listas.
            </p>
            <p>
              Mientras tanto, contáctanos para habilitar el proveedor que prefieras y ajustar el flujo de checkout a tu
              operación.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/plans"
              className="inline-flex items-center justify-center rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/15 transition hover:bg-white/20"
            >
              Volver a planes
            </Link>
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-900 shadow-lg transition hover:bg-emerald-400"
            >
              Ir al inicio
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
