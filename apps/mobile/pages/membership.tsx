import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";

type MembershipSummary = {
  id: string;
  name: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  nextBillingDate: string | null;
  autoRenew: boolean;
  isActive: boolean;
  price: number | null;
  currency: string | null;
  category: string | null;
};

type MembershipState =
  | { status: "loading"; membership: null; error: null }
  | { status: "ready"; membership: MembershipSummary | null; error: null }
  | { status: "error"; membership: null; error: string };

const MEMBERSHIP_CARD_URL =
  process.env.NEXT_PUBLIC_MEMBERSHIP_CARD_PAYMENT_URL ?? "";
const RECEPTION_EMAIL =
  process.env.NEXT_PUBLIC_RECEPTION_EMAIL ?? "contacto@atpilatestime.com";
const RECEPTION_PHONE =
  process.env.NEXT_PUBLIC_RECEPTION_PHONE ?? null;

function formatDate(value: string | null): string {
  if (!value) return "Sin fecha";
  try {
    return new Intl.DateTimeFormat("es-MX", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function MembershipPage() {
  const [state, setState] = useState<MembershipState>({
    status: "loading",
    membership: null,
    error: null,
  });

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    fetch("/api/my/membership", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.error ?? "No se pudo cargar la membresia");
        }
        return response.json() as Promise<{ membership: MembershipSummary | null }>;
      })
      .then((payload) => {
        if (!active) return;
        setState({ status: "ready", membership: payload.membership, error: null });
      })
      .catch((error: unknown) => {
        if (!active || controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : "No se pudo cargar la membresia";
        setState({ status: "error", membership: null, error: message });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  let content: JSX.Element;

  if (state.status === "loading") {
    content = (
      <div className="space-y-6">
        <div className="animate-pulse rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-4 shadow-sm">
          <div className="h-5 w-1/2 rounded bg-neutral-200" />
          <div className="mt-3 h-3 w-2/3 rounded bg-neutral-200" />
          <div className="mt-5 flex gap-3">
            <div className="h-10 w-28 rounded bg-neutral-200" />
            <div className="h-10 w-28 rounded bg-neutral-200" />
          </div>
        </div>
      </div>
    );
  } else if (state.status === "error") {
    content = (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700 shadow-sm">
        {state.error}
      </div>
    );
  } else {
    const membership = state.membership;
    const isActive = membership?.isActive ?? false;
    const statusLabel = membership
      ? isActive
        ? `Activa hasta ${formatDate(membership.endDate ?? membership.nextBillingDate)}`
        : `Estado: ${(membership.status ?? "INACTIVA").toUpperCase()}`
      : "Aun no tienes una membresia registrada";

    content = (
      <div className="space-y-6">
        <section
          className={`rounded-2xl border px-4 py-4 shadow-sm ${
            isActive ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
          }`}
        >
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-neutral-900">
                  {membership?.name ?? "Membresia"}
                </p>
                <p className="text-sm text-neutral-600">{statusLabel}</p>
                {membership?.category && (
                  <p className="text-[11px] text-neutral-500">
                    Categoria: {membership.category}
                  </p>
                )}
              </div>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                  isActive
                    ? "bg-emerald-600/10 text-emerald-700"
                    : "bg-amber-600/10 text-amber-700"
                }`}
              >
                {isActive ? "Activa" : "Inactiva"}
              </span>
            </div>

            <dl className="grid grid-cols-2 gap-3 text-xs text-neutral-600">
              <div>
                <dt className="font-medium text-neutral-500">Inicio</dt>
                <dd>{formatDate(membership?.startDate ?? null)}</dd>
              </div>
              <div>
                <dt className="font-medium text-neutral-500">Vencimiento</dt>
                <dd>{formatDate(membership?.endDate ?? membership?.nextBillingDate ?? null)}</dd>
              </div>
              <div>
                <dt className="font-medium text-neutral-500">Renovacion automatica</dt>
                <dd>{membership?.autoRenew ? "Activa" : "No activada"}</dd>
              </div>
              <div>
                <dt className="font-medium text-neutral-500">Precio referencial</dt>
                <dd>
                  {membership?.price !== null && membership?.currency
                    ? new Intl.NumberFormat("es-MX", {
                        style: "currency",
                        currency: membership.currency,
                        maximumFractionDigits: 0,
                      }).format(membership.price)
                    : "Consultar en recepcion"}
                </dd>
              </div>
            </dl>

            <p className="text-[11px] text-neutral-500">
              El pago con tarjeta redirige al bio oficial para completar la transaccion. Tambien puedes
              acudir a recepcion para realizar el pago y activar tu membresia manualmente.
            </p>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => {
                  if (MEMBERSHIP_CARD_URL) {
                    window.open(MEMBERSHIP_CARD_URL, "_blank");
                  }
                }}
                disabled={!MEMBERSHIP_CARD_URL}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-brand-300"
              >
                Pagar con tarjeta
              </button>
              <a
                href={`mailto:${RECEPTION_EMAIL}?subject=Renovacion de membresia`}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-100"
              >
                Pagar en recepcion
              </a>
            </div>

            {RECEPTION_PHONE && (
              <p className="text-[11px] text-neutral-500">
                Tambien puedes llamar al{" "}
                <a className="font-semibold text-brand-700" href={`tel:${RECEPTION_PHONE}`}>
                  {RECEPTION_PHONE}
                </a>{" "}
                para coordinar tu pago.
              </p>
            )}
          </div>
        </section>

        <section className="space-y-2 rounded-2xl border border-neutral-200 bg-white px-4 py-4 text-sm text-neutral-600 shadow-sm">
          <p>
            Una membresia activa te permite reservar clases en cualquier momento. Si tu membresia
            expira, aun podras acceder a la app, pero necesitaras renovarla antes de reservar nuevas
            clases.
          </p>
          <p>
            ¿Necesitas soporte? Escribenos a{" "}
            <a className="font-semibold text-brand-700" href={`mailto:${RECEPTION_EMAIL}`}>
              {RECEPTION_EMAIL}
            </a>
            .
          </p>
        </section>

        <section className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600 shadow-sm">
          <p>
            ¿Buscas un paquete de clases flexible? Revisa los planes disponibles y combina tu
            membresia con paquetes adicionales.
          </p>
          <Link
            href="/plans"
            className="mt-3 inline-flex items-center justify-center rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
          >
            Ver planes y paquetes
          </Link>
        </section>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Mi membresia | ATP Pilates</title>
      </Head>
      <main className="container-mobile space-y-6 pb-24 pt-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold text-neutral-900">Mi membresia</h1>
          <p className="text-sm text-neutral-500">
            Consulta la vigencia de tu membresia y elige como renovarla.
          </p>
        </header>
        {content}
      </main>
    </>
  );
}
