import type { NextApiRequest, NextApiResponse } from "next";
import { getStripeClient } from "@/lib/stripe";
import { prepareMembershipPurchase, type MembershipPurchasePayload } from "@/lib/membership-purchase";

const ZERO_DECIMAL_CURRENCIES = new Set(["JPY", "KRW"]);

function resolveUrl(
  requestUrl: string | undefined,
  fallback: string | undefined,
  placeholder?: string
) {
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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ url: string; sessionId: string } | { error: string }>
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Metodo no permitido" });
  }

  try {
    const payload = req.body as MembershipPurchasePayload & {
      successUrl?: string;
      cancelUrl?: string;
    };

    const prepared = await prepareMembershipPurchase(payload);
    const stripe = getStripeClient();

    const successUrl = resolveUrl(
      payload.successUrl,
      process.env.STRIPE_CHECKOUT_SUCCESS_URL,
      "{CHECKOUT_SESSION_ID}"
    );
    const cancelUrl = resolveUrl(payload.cancelUrl, process.env.STRIPE_CHECKOUT_CANCEL_URL);

    if (!successUrl || !cancelUrl) {
      return res.status(500).json({
        error:
          "Configura STRIPE_CHECKOUT_SUCCESS_URL y STRIPE_CHECKOUT_CANCEL_URL para poder generar el pago con tarjeta",
      });
    }

    const amount = prepared.amount;
    const currency = prepared.currency ?? "MXN";
    const zeroDecimal = ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase());
    const unitAmount = zeroDecimal ? Math.round(amount) : Math.round(amount * 100);

    const metadata: Record<string, string> = {
      clientId: prepared.client.id,
      membershipTypeId: prepared.membershipType.id,
      startIso: prepared.startIso,
      endIso: prepared.endIso,
      termYears: String(prepared.termYears),
      expectedAmount: String(amount),
      currency: currency.toLowerCase(),
    };

    if (prepared.notes) {
      metadata.notes = prepared.notes;
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: successUrl,
      cancel_url: cancelUrl,
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
              name: prepared.membershipType.name ?? "Membresia",
            },
          },
        },
      ],
    });

    if (!session.url) {
      return res.status(500).json({ error: "Stripe no devolvio una URL de checkout" });
    }

    return res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error("/api/memberships/checkout", error);
    const status = (error as { status?: number }).status ?? 500;
    const message = error instanceof Error ? error.message : "Error inesperado";
    return res.status(status).json({ error: message });
  }
}
