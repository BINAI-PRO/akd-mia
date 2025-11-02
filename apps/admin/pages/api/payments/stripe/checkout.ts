import type { NextApiRequest, NextApiResponse } from "next";
import { getStripeClient } from "@/lib/stripe";
import {
  preparePlanPurchase,
  type PlanPurchasePayload,
  type PlanPurchasePrepared,
} from "@/lib/plan-purchase";

const VALID_MODALITIES = new Set<"FLEXIBLE" | "FIXED">(["FLEXIBLE", "FIXED"]);
const ZERO_DECIMAL_CURRENCIES = new Set(["JPY", "KRW"]);

function normalizeModality(value: unknown): "FLEXIBLE" | "FIXED" {
  if (typeof value === "string") {
    const upper = value.toUpperCase();
    if (upper === "FIXED") return "FIXED";
  }
  return "FLEXIBLE";
}

function resolveUrl(requestUrl: string | undefined, fallback: string | undefined, placeholder?: string) {
  const value = requestUrl && requestUrl.length > 0 ? requestUrl : fallback;
  if (!value) return null;
  if (placeholder && !value.includes(placeholder)) {
    if (value.includes("?")) {
      return `${value}&session_id=${placeholder}`;
    }
    return `${value}?session_id=${placeholder}`;
  }
  return value;
}

function truncate(value: string | null | undefined, max = 450) {
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function buildMetadata(prepared: PlanPurchasePrepared) {
  return {
    clientId: prepared.client.id,
    planTypeId: prepared.planType.id,
    modality: prepared.modality,
    startIso: prepared.startIso,
    expiresAt: prepared.expiresAt ?? "",
    initialClasses: prepared.initialClasses.toString(),
    courseId: prepared.courseId ?? "",
    notes: truncate(prepared.notes),
    expectedAmount: prepared.planType.price !== null ? String(prepared.planType.price) : "",
    currency: prepared.planType.currency ?? "MXN",
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Metodo no permitido" });
  }

  const {
    clientId,
    planTypeId,
    startDate,
    notes,
    modality: rawModality,
    courseId,
    successUrl,
    cancelUrl,
  } = req.body as {
    clientId?: string;
    planTypeId?: string;
    startDate?: string | null;
    notes?: string | null;
    modality?: string;
    courseId?: string | null;
    successUrl?: string;
    cancelUrl?: string;
  };

  if (!clientId || !planTypeId) {
    return res.status(400).json({ error: "Cliente y plan son obligatorios" });
  }

  const modality = normalizeModality(rawModality);
  if (!VALID_MODALITIES.has(modality)) {
    return res.status(400).json({ error: "Modalidad de plan invalida" });
  }

  try {
    const payload: PlanPurchasePayload = {
      clientId,
      planTypeId,
      modality,
      courseId: courseId ?? null,
      startDate: startDate ?? null,
      notes: notes ?? null,
    };

    const prepared = await preparePlanPurchase(payload);
    const metadata = buildMetadata(prepared);

    const stripe = getStripeClient();

    const resolvedSuccessUrl = resolveUrl(
      successUrl,
      process.env.STRIPE_CHECKOUT_SUCCESS_URL,
      "{CHECKOUT_SESSION_ID}"
    );
    const resolvedCancelUrl = resolveUrl(cancelUrl, process.env.STRIPE_CHECKOUT_CANCEL_URL);

    if (!resolvedSuccessUrl || !resolvedCancelUrl) {
      return res.status(500).json({
        error:
          "Configura las URLs de exito y cancelacion de Stripe en las variables STRIPE_CHECKOUT_SUCCESS_URL y STRIPE_CHECKOUT_CANCEL_URL",
      });
    }

    const amount = Number(prepared.planType.price ?? 0);
    const currency = (prepared.planType.currency ?? "MXN").toLowerCase();
    const unitAmount = ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase())
      ? Math.round(amount)
      : Math.round(amount * 100);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: resolvedSuccessUrl,
      cancel_url: resolvedCancelUrl,
      payment_method_types: ["card"],
      customer_email: prepared.client.email ?? undefined,
      metadata,
      payment_intent_data: {
        metadata,
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: unitAmount,
            product_data: {
              name: prepared.planType.name,
              metadata: {
                planTypeId: prepared.planType.id,
                modality: prepared.modality,
              },
            },
          },
        },
      ],
    });

    return res.status(200).json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    console.error("/api/payments/stripe/checkout", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    const status = (error as { status?: number }).status ?? 500;
    return res.status(status).json({ error: message });
  }
}
