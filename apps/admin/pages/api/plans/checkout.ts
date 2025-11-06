import type { NextApiRequest, NextApiResponse } from "next";
import { loadStudioSettings } from "@/lib/studio-settings";
import {
  preparePlanPurchase,
  type PlanPurchasePayload,
} from "@/lib/plan-purchase";
import { getStripeClient } from "@/lib/stripe";

const ZERO_DECIMAL_CURRENCIES = new Set(["JPY", "KRW"]);
const VALID_MODALITIES = new Set<"FLEXIBLE" | "FIXED">(["FLEXIBLE", "FIXED"]);

function resolveUrl(
  provided: string | undefined | null,
  fallback: string | undefined,
  placeholder?: string
) {
  const value = provided && provided.length > 0 ? provided : fallback;
  if (!value) return null;
  if (placeholder && !value.includes(placeholder)) {
    if (value.includes("?")) {
      return `${value}&session_id=${placeholder}`;
    }
    return `${value}?session_id=${placeholder}`;
  }
  return value;
}

function normalizeModality(candidate: unknown): "FLEXIBLE" | "FIXED" {
  if (typeof candidate === "string") {
    const upper = candidate.toUpperCase();
    if (VALID_MODALITIES.has(upper as "FLEXIBLE" | "FIXED")) {
      return upper as "FLEXIBLE" | "FIXED";
    }
  }
  return "FLEXIBLE";
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ url: string; sessionId: string } | { error: string }>
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Metodo no permitido" });
  }

  await loadStudioSettings();

  try {
    const {
      clientId,
      planTypeId,
      startDate,
      notes,
      modality: rawModality,
      courseId,
      successUrl,
      cancelUrl,
    } = req.body as PlanPurchasePayload & {
      successUrl?: string | null;
      cancelUrl?: string | null;
    };

    if (!clientId || !planTypeId) {
      return res.status(400).json({ error: "Debes indicar el cliente y el plan" });
    }

    const payload: PlanPurchasePayload = {
      clientId,
      planTypeId,
      modality: normalizeModality(rawModality),
      courseId: courseId ?? null,
      startDate: startDate ?? null,
      notes: notes ?? null,
    };

    const prepared = await preparePlanPurchase(payload);

    const price = prepared.planType.price ?? null;
    if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
      return res.status(400).json({
        error: "Configura un precio mayor a 0 para poder cobrar este plan con tarjeta",
      });
    }

    const stripe = getStripeClient();

    const successUrlResolved = resolveUrl(
      successUrl ?? undefined,
      process.env.STRIPE_CHECKOUT_SUCCESS_URL,
      "{CHECKOUT_SESSION_ID}"
    );
    const cancelUrlResolved = resolveUrl(
      cancelUrl ?? undefined,
      process.env.STRIPE_CHECKOUT_CANCEL_URL,
      "{CHECKOUT_SESSION_ID}"
    );

    if (!successUrlResolved || !cancelUrlResolved) {
      return res.status(500).json({
        error:
          "Configura STRIPE_CHECKOUT_SUCCESS_URL y STRIPE_CHECKOUT_CANCEL_URL para generar el pago con tarjeta",
      });
    }

    const currency = (prepared.planType.currency ?? "MXN").toUpperCase();
    const zeroDecimal = ZERO_DECIMAL_CURRENCIES.has(currency);
    const unitAmount = zeroDecimal ? Math.round(price) : Math.round(price * 100);

    const metadata: Record<string, string> = {
      clientId: prepared.client.id,
      planTypeId: prepared.planType.id,
      modality: prepared.modality,
      startIso: prepared.startIso,
      planCurrency: currency,
      expectedAmount: String(price),
      initialClasses:
        prepared.initialClasses === null
          ? "ILIMITADO"
          : String(prepared.initialClasses),
      createdBy: "ADMIN",
    };

    if (prepared.expiresAt) {
      metadata.expiresAt = prepared.expiresAt;
    }
    if (prepared.courseId) {
      metadata.courseId = prepared.courseId;
    }
    if (prepared.notes) {
      metadata.notes = prepared.notes;
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: successUrlResolved,
      cancel_url: cancelUrlResolved,
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
            currency: currency.toLowerCase(),
            unit_amount: unitAmount,
            product_data: {
              name: prepared.planType.name,
              description: prepared.planType.privileges ?? undefined,
            },
          },
        },
      ],
    });

    if (!session.url) {
      return res.status(500).json({ error: "Stripe no devolvio una URL de checkout" });
    }

    return res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (error: unknown) {
    console.error("/api/plans/checkout", error);
    const status = (error as { status?: number }).status ?? 500;
    const message = error instanceof Error ? error.message : "Error inesperado";
    return res.status(status).json({ error: message });
  }
}
