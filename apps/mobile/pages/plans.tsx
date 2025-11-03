import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";

const CURRENCY_FORMATTERS: Record<string, Intl.NumberFormat> = {};

function formatCurrency(amount: number | null, currency: string | null) {
  if (amount === null || amount === undefined) return "Consultar";
  const code = (currency ?? "MXN").toUpperCase();
  if (!CURRENCY_FORMATTERS[code]) {
    CURRENCY_FORMATTERS[code] = new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 0,
    });
  }
  return CURRENCY_FORMATTERS[code].format(amount);
}

type PlanType = {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  currency: string | null;
  classCount: number | null;
  validityDays: number | null;
  privileges: string | null;
};

type ActivePlan = {
  id: string;
  name: string;
  status: string;
  startDate: string | null;
  expiresAt: string | null;
  initialClasses: number;
  remainingClasses: number;
  modality: string | null;
  currency: string | null;
};

type PlansResponse = {
  planTypes: PlanType[];
  activePlans: ActivePlan[];
};

type ScreenState =
  | { status: "loading" }
  | { status: "ready"; data: PlansResponse }
  | { status: "error"; message: string };

export default function PlansPage() {
  const router = useRouter();
  const [state, setState] = useState<ScreenState>({ status: "loading" });
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    fetch("/api/plans", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          const message = typeof payload?.error === "string" ? payload.error : "No se pudo obtener la informacion";
          throw new Error(message);
        }
        return response.json() as Promise<PlansResponse>;
      })
      .then((data) => {
        setState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : "No se pudo consultar los planes";
        setState({ status: "error", message });
      });

    return () => controller.abort();
  }, []);

  const activePlan = useMemo(() => {
    if (state.status !== "ready") return null;
    return state.data.activePlans.find((plan) => plan.status === "ACTIVE") ?? state.data.activePlans[0] ?? null;
  }, [state]);

  const handleCheckout = async (planTypeId: string) => {
    setCheckoutError(null);
    setCheckoutLoading(planTypeId);
    try {
      const response = await fetch("/api/plans/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planTypeId }),
      });

      const payload = (await response.json()) as { sessionId?: string; url?: string; error?: string };

      if (!response.ok || !payload.url) {
        throw new Error(payload.error ?? "No se pudo iniciar el pago");
      }

      window.location.href = payload.url;
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo iniciar el pago";
      setCheckoutError(message);
    } finally {
      setCheckoutLoading(null);
    }
  };

  const handleContactReception = () => {
    router.push("mailto:contacto@atpilatestime.com?subject=Compra de plan");
  };

  return (
    <>
      <Head>
        <title>Planes | ATP Pilates</title>
      </Head>

      <section className="mx-auto max-w-md space-y-6">
        <header className="pt-6 text-center">
          <h1 className="text-2xl font-semibold text-brand-800">Planes y paquetes</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Consulta tus planes vigentes, renueva tu paquete flexible o adquiere uno nuevo desde la app.
          </p>
        </header>

        {checkoutError && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {checkoutError}
          </div>
        )}

        {state.status === "loading" && (
          <div className="space-y-4">
            <div className="h-32 animate-pulse rounded-2xl bg-neutral-100" />
            <div className="h-32 animate-pulse rounded-2xl bg-neutral-100" />
            <div className="h-32 animate-pulse rounded-2xl bg-neutral-100" />
          </div>
        )}

        {state.status === "error" && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {state.message}
          </div>
        )}

        {state.status === "ready" && (
          <div className="space-y-6">
            {activePlan ? (
              <section className="rounded-2xl border border-brand-200 bg-brand-50 px-4 py-4 text-sm text-brand-900 shadow-sm">
                <h2 className="text-base font-semibold text-brand-800">Tu plan vigente</h2>
                <p className="mt-1 text-sm text-brand-700">
                  {activePlan.name} · {activePlan.status}
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <dt className="text-brand-600 font-medium">Inicio</dt>
                    <dd>{activePlan.startDate ? new Date(activePlan.startDate).toLocaleDateString() : "-"}</dd>
                  </div>
                  <div>
                    <dt className="text-brand-600 font-medium">Vence</dt>
                    <dd>{activePlan.expiresAt ? new Date(activePlan.expiresAt).toLocaleDateString() : "Sin fecha"}</dd>
                  </div>
                  <div>
                    <dt className="text-brand-600 font-medium">Clases totales</dt>
                    <dd>{activePlan.initialClasses}</dd>
                  </div>
                  <div>
                    <dt className="text-brand-600 font-medium">Por usar</dt>
                    <dd>{activePlan.remainingClasses}</dd>
                  </div>
                </dl>
                <p className="mt-3 text-[11px] text-brand-600">
                  Si necesitas ajustar tu plan actual, contacta a recepcion para recibir apoyo.
                </p>
              </section>
            ) : (
              <section className="rounded-2xl border border-dashed border-brand-200 bg-white px-4 py-4 text-sm text-neutral-600 shadow-sm">
                <h2 className="text-base font-semibold text-brand-800">Aun no tienes un plan activo</h2>
                <p className="mt-1 text-sm text-neutral-600">
                  Elige uno de los paquetes flexibles para reservar sesiones y asegurar tu lugar en clase.
                </p>
              </section>
            )}

            <section className="space-y-4">
              <h2 className="text-base font-semibold text-neutral-800">Planes disponibles</h2>
              {state.data.planTypes.map((plan) => (
                <article key={plan.id} className="rounded-2xl border border-neutral-200 bg-white px-4 py-4 shadow-sm">
                  <header className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-neutral-900">{plan.name}</h3>
                      <p className="text-sm text-neutral-600">{plan.description ?? "Plan flexible"}</p>
                    </div>
                    <span className="rounded-full bg-brand-100 px-3 py-1 text-sm font-medium text-brand-700">
                      {formatCurrency(plan.price, plan.currency)}
                    </span>
                  </header>

                  <dl className="mt-4 grid grid-cols-2 gap-3 text-xs text-neutral-600">
                    <div>
                      <dt className="font-medium text-neutral-500">Sesiones</dt>
                      <dd>{plan.classCount ?? 0}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-neutral-500">Vigencia</dt>
                      <dd>
                        {plan.validityDays && plan.validityDays > 0
                          ? `${plan.validityDays} dias`
                          : "Segun condiciones del plan"}
                      </dd>
                    </div>
                  </dl>

                  {plan.privileges ? (
                    <p className="mt-2 text-xs text-neutral-500 whitespace-pre-line">
                      {plan.privileges}
                    </p>
                  ) : null}

                  <div className="mt-4 flex flex-col gap-2 text-sm">
                    <button
                      type="button"
                      onClick={() => handleCheckout(plan.id)}
                      disabled={checkoutLoading === plan.id}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-brand-400"
                    >
                      <span className="material-icons-outlined text-base" aria-hidden="true">
                        credit_card
                      </span>
                      {checkoutLoading === plan.id ? "Redirigiendo..." : "Pagar con tarjeta"}
                    </button>
                    <button
                      type="button"
                      onClick={handleContactReception}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-300 px-4 py-2 font-semibold text-neutral-700 transition hover:bg-neutral-100"
                    >
                      <span className="material-icons-outlined text-base" aria-hidden="true">
                        support_agent
                      </span>
                      Pagar en recepcion
                    </button>
                  </div>
                </article>
              ))}

              {state.data.planTypes.length === 0 && (
                <p className="text-sm text-neutral-500">
                  No hay planes disponibles en este momento. Consulta mas tarde o contacta a recepcion.
                </p>
              )}
            </section>

            <section className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs text-neutral-600">
              <p>
                Los pagos en efectivo o transferencia deben confirmarse con recepcion para activar tu plan. Si realizas la compra en la app, te enviaremos un correo con el comprobante una vez Stripe confirme el pago.
              </p>
            </section>
          </div>
        )}
      </section>
    </>
  );
}
