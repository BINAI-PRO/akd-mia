import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Head from "next/head";
import Image from "next/image";
import { useRouter } from "next/router";
import { useMembershipsEnabled } from "@/components/StudioTimezoneContext";

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

type PlanType = {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  currency: string | null;
  classCount: number | null;
  validityDays: number | null;
  privileges: string | null;
  category: string;
  appOnly: boolean;
  isUnlimited: boolean;
  requiresMembership: boolean;
};

type ActivePlan = {
  id: string;
  name: string;
  status: string;
  startDate: string | null;
  expiresAt: string | null;
  initialClasses: number | null;
  remainingClasses: number | null;
  isUnlimited: boolean;
  modality: string | null;
  currency: string | null;
  category: string | null;
};

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

type PlansResponse = {
  planTypes: PlanType[];
  activePlans: ActivePlan[];
  membership: MembershipSummary | null;
};

type ScreenState =
  | { status: "loading" }
  | { status: "ready"; data: PlansResponse }
  | { status: "error"; message: string };

export default function PlansPage() {
  const router = useRouter();
  const membershipsEnabled = useMembershipsEnabled();
  const [state, setState] = useState<ScreenState>({ status: "loading" });
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<{ type: "success" | "cancelled"; message: string } | null>(null);

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

  useEffect(() => {
    if (!router.isReady) return;
    const rawStatus = router.query.status;
    const statusValue = Array.isArray(rawStatus) ? rawStatus[0] : rawStatus;
    if (!statusValue) return;

    setCheckoutLoading(null);

    if (statusValue === "success") {
      setCheckoutError(null);
      setStatusBanner({
        type: "success",
        message: "Pago completado. Actualizaremos tus créditos en cuanto confirmemos el movimiento.",
      });
    } else if (statusValue === "cancelled") {
      setStatusBanner({
        type: "cancelled",
        message: "Pago cancelado. Puedes intentarlo de nuevo cuando lo decidas.",
      });
    } else {
      setStatusBanner(null);
    }

    router.replace("/plans", undefined, { shallow: true });
  }, [router, router.isReady, router.query.status]);

  const activePlan = useMemo(() => {
    if (state.status !== "ready") return null;
    return state.data.activePlans.find((plan) => plan.status === "ACTIVE") ?? state.data.activePlans[0] ?? null;
  }, [state]);

  const availablePlanTypes = useMemo(() => {
    if (state.status !== "ready") return [];
    const hasActiveMembership = membershipsEnabled ? state.data.membership?.isActive ?? false : true;
    return state.data.planTypes.filter(
      (plan) => !membershipsEnabled || hasActiveMembership || !plan.requiresMembership
    );
  }, [membershipsEnabled, state]);

  const lockedPlanCount =
    state.status === "ready" && membershipsEnabled
      ? state.data.planTypes.length - availablePlanTypes.length
      : 0;

  const handleCheckout = async (planTypeId: string) => {
    setCheckoutError(null);
    setCheckoutLoading(planTypeId);
    if (state.status !== "ready") {
      setCheckoutError("No se pudo validar el plan seleccionado");
      setCheckoutLoading(null);
      return;
    }
    const selectedPlan = state.data.planTypes.find((plan) => plan.id === planTypeId);
    const hasActiveMembership = membershipsEnabled ? state.data.membership?.isActive ?? false : true;
    if (!selectedPlan) {
      setCheckoutError("El plan seleccionado no esta disponible");
      setCheckoutLoading(null);
      return;
    }
    if (membershipsEnabled && selectedPlan.requiresMembership && !hasActiveMembership) {
      setCheckoutError("No cumples los requisitos para adquirir este plan");
      setCheckoutLoading(null);
      return;
    }
    setCheckoutLoading(null);
    await router.push("/pagos/integracion");
  };

  const membershipBanner: ReactNode = null;

  return (
    <>
      <Head>
        <title>Planes y Créditos | Akdēmia</title>
      </Head>

      <section className="container-mobile space-y-6">
        <header className="pt-6 text-center">
          <h1 className="text-2xl font-semibold text-brand-800">Planes y Créditos</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Consulta tus planes vigentes, renueva tu paquete flexible o adquiere uno nuevo desde la app.
          </p>
        </header>

        {statusBanner && (
          <div
            className={`rounded-2xl border px-4 py-3 text-sm ${
              statusBanner.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-amber-200 bg-amber-50 text-amber-800"
            }`}
          >
            <p className="font-medium">{statusBanner.message}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <button
                type="button"
                onClick={() => setStatusBanner(null)}
                className="inline-flex items-center justify-center rounded-md border border-current px-3 py-1 font-semibold hover:bg-white"
              >
                Seguir en planes
              </button>
              <button
                type="button"
                onClick={() => router.push("/")}
                className="inline-flex items-center justify-center rounded-md border border-current px-3 py-1 font-semibold hover:bg-white"
              >
                Ir al inicio
              </button>
            </div>
          </div>
        )}

        {membershipBanner}

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
                  {activePlan.name} - {activePlan.status}
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <dt className="text-brand-600 font-medium">Inicio</dt>
                    <dd>{formatDate(activePlan.startDate)}</dd>
                  </div>
                  <div>
                    <dt className="text-brand-600 font-medium">Vence</dt>
                    <dd>{formatDate(activePlan.expiresAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-brand-600 font-medium">Clases totales</dt>
                    <dd>{activePlan.isUnlimited ? "Ilimitado" : activePlan.initialClasses ?? 0}</dd>
                  </div>
                  <div>
                    <dt className="text-brand-600 font-medium">Por usar</dt>
                    <dd>{activePlan.isUnlimited ? "Ilimitado" : activePlan.remainingClasses ?? 0}</dd>
                  </div>
                  <div>
                    <dt className="text-brand-600 font-medium">Categoria</dt>
                    <dd>{activePlan.category ?? "Sin categoria"}</dd>
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
              {availablePlanTypes.map((plan) => (
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

                  <dl className="mt-4 grid grid-cols-2 gap-3 text-xs text-neutral-600 md:grid-cols-5">
                    <div>
                      <dt className="font-medium text-neutral-500">Sesiones</dt>
                      <dd>{plan.isUnlimited ? "Ilimitado" : plan.classCount ?? 0}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-neutral-500">Vigencia</dt>
                      <dd>
                        {plan.validityDays && plan.validityDays > 0
                          ? `${plan.validityDays} dias`
                          : "Segun condiciones del plan"}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-neutral-500">Categoria</dt>
                      <dd>{plan.category ?? "Sin categoria"}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-neutral-500">Reservas</dt>
                      <dd>{plan.appOnly ? "Solo app" : "App y recepcion"}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-neutral-500">Requisito</dt>
                      <dd>{plan.requiresMembership ? "Restriccion activa" : "Sin restricciones"}</dd>
                    </div>
                  </dl>

                  {plan.privileges ? (
                    <p className="mt-2 whitespace-pre-line text-xs text-neutral-500">{plan.privileges}</p>
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
                  </div>
                </article>
              ))}

              {availablePlanTypes.length === 0 && (
                <p className="text-sm text-neutral-500">
                  {lockedPlanCount > 0
                    ? "Algunos planes estan restringidos temporalmente."
                    : "No hay planes disponibles en este momento. Consulta mas tarde o contacta a recepcion."}
                </p>
              )}

              {lockedPlanCount > 0 && availablePlanTypes.length > 0 && (
                <p className="text-xs text-neutral-500">
                  Hay {lockedPlanCount === 1 ? "un plan" : `${lockedPlanCount} planes`} restringidas actualmente.
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
      <div className="container-mobile pb-8">
        <MobileFooterAttribution />
      </div>
    </>
  );
}

function MobileFooterAttribution() {
  return (
    <div className="flex justify-center">
      <a
        href="https://binai.pro"
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-2 text-[9.6px] text-neutral-400 transition hover:text-neutral-500"
      >
        <span className="mt-[10px]">Desarrollado por :</span>
        <Image src="/logo_binai.png" alt="Logo BinAI" width={120} height={32} className="mt-[10px] h-6 w-auto" />
      </a>
    </div>
  );
}
