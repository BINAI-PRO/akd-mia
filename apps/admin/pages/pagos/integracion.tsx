import Head from "next/head";
import Image from "next/image";
import Link from "next/link";

export default function PagoIntegracionAdminPage() {
  return (
    <>
      <Head>
        <title>Integración de pagos | Akdemia Admin</title>
      </Head>
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-16">
        <div className="w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-8 shadow-xl">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:gap-10">
            <div className="flex-1 space-y-3">
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-600">Demo sin cobros</p>
              <h1 className="text-2xl font-semibold text-slate-900">Integración de pagos</h1>
              <p className="text-sm text-slate-600">
                Este entorno demo no dispara cargos reales. Integramos Stripe, PayPal, Mercado Pago, Openpay, Conekta y
                otros proveedores en cuanto compartas tus credenciales.
              </p>
              <p className="text-sm text-slate-600">
                Usa esta vista para mostrar a clientes que podemos conectar su pasarela favorita. Cuando quieras activar
                los cobros, restablece el flujo actual y prueba de nuevo.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/members"
                  className="inline-flex items-center justify-center rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-brand-800"
                >
                  Ir a miembros
                </Link>
                <Link
                  href="/"
                  className="inline-flex items-center justify-center rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  Ir al inicio
                </Link>
              </div>
            </div>
            <div className="flex justify-center md:w-[260px]">
              <div className="overflow-hidden rounded-xl border border-slate-100 bg-slate-50 p-3 shadow-sm">
                <Image src="/pay_serv.png" alt="Plataformas de pago" width={240} height={160} />
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
