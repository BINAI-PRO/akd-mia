import type { NextApiRequest, NextApiResponse } from "next";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  ClientLinkConflictError,
  ensureClientForAuthUser,
} from "@/lib/resolve-client";
import { isRefreshTokenMissingError } from "@/lib/auth-errors";
import {
  preparePlanPurchase,
  type PlanPurchasePayload,
} from "@/lib/plan-purchase";
import { getStripeClient } from "@/lib/stripe";

type CheckoutResponse =
  | { sessionId: string; url: string }
  | { error: string };

type RequestBody = {
  planTypeId?: string;
  startDate?: string | null;
  notes?: string | null;
};

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

function truncate(value: string | null | undefined, max = 450) {
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CheckoutResponse>
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { planTypeId, startDate, notes } = req.body as RequestBody;
  if (!planTypeId || typeof planTypeId !== "string") {
    return res.status(400).json({ error: "Plan no especificado" });
  }

  const supabase = createSupabaseServerClient({ req, res });
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    if (isRefreshTokenMissingError(sessionError)) {
      await supabase.auth.signOut();
      return res.status(401).json({ error: "Not authenticated" });
    }
    return res.status(500).json({ error: sessionError.message });
  }

  if (!session?.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { data: clientRow, error: clientError } = await supabaseAdmin
    .from("clients")
    .select("id")
    .eq("auth_user_id", session.user.id)
    .maybeSingle();

  if (clientError) {
    return res.status(500).json({ error: clientError.message });
  }

  let clientId = clientRow?.id ?? null;

  if (!clientId) {
    const metadata = (session.user.user_metadata ?? {}) as Record<string, unknown>;
    const fallbackFullName =
      (metadata.full_name as string | undefined) ??
      (metadata.name as string | undefined) ??
      (metadata.display_name as string | undefined) ??
      session.user.email ??
      null;
    const fallbackPhone = (metadata.phone as string | undefined) ?? null;

    try {
      const ensured = await ensureClientForAuthUser({
        authUserId: session.user.id,
        email: session.user.email ?? null,
        fullName: fallbackFullName,
        phone: fallbackPhone,
      });
      clientId = ensured?.id ?? null;
    } catch (linkError: unknown) {
      if (linkError instanceof ClientLinkConflictError) {
        return res.status(409).json({ error: linkError.message });
      }
      const message =
        linkError instanceof Error
          ? linkError.message
          : "Failed to resolve client profile";
      return res.status(500).json({ error: message });
    }
  }

  if (!clientId) {
    return res.status(404).json({ error: "Client profile not found" });
  }

  const payload: PlanPurchasePayload = {
    clientId,
    planTypeId,
    modality: "FLEXIBLE",
    courseId: null,
    startDate: startDate ?? null,
    notes: notes ?? null,
  };

  let prepared;
  try {
    prepared = await preparePlanPurchase(payload);
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    const message =
      error instanceof Error ? error.message : "No se pudo preparar la compra";
    return res.status(status).json({ error: message });
  }

  let stripe: ReturnType<typeof getStripeClient>;
  try {
    stripe = getStripeClient();
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Configuracion de Stripe incompleta";
    return res.status(500).json({ error: message });
  }

  const successUrl = resolveUrl(
    undefined,
    process.env.STRIPE_CHECKOUT_SUCCESS_URL,
    "{CHECKOUT_SESSION_ID}"
  );
  const cancelUrl = resolveUrl(undefined, process.env.STRIPE_CHECKOUT_CANCEL_URL);

  if (!successUrl || !cancelUrl) {
    return res.status(500).json({
      error:
        "Configura STRIPE_CHECKOUT_SUCCESS_URL y STRIPE_CHECKOUT_CANCEL_URL en las variables de entorno",
    });
  }

  const amount = Number(prepared.planType.price ?? 0);
  const currency = (prepared.planType.currency ?? "MXN").toLowerCase();
  const zeroDecimal = ["JPY", "KRW"].includes(currency.toUpperCase());
  const unitAmount = zeroDecimal ? Math.round(amount) : Math.round(amount * 100);

  try {
    const sessionResult = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: successUrl,
      cancel_url: cancelUrl,
      payment_method_types: ["card"],
      customer_email: prepared.client.email ?? undefined,
      metadata: {
        clientId: prepared.client.id,
        planTypeId: prepared.planType.id,
        modality: prepared.modality,
        startIso: prepared.startIso,
        expiresAt: prepared.expiresAt ?? "",
        initialClasses: prepared.initialClasses === null ? "ILIMITADO" : String(prepared.initialClasses),
        notes: truncate(notes),
        currency: prepared.planType.currency ?? "MXN",
        expectedAmount: prepared.planType.price !== null ? String(prepared.planType.price) : "",
        planCategory: prepared.planType.category,
      },
      payment_intent_data: {
        metadata: {
          clientId: prepared.client.id,
          planTypeId: prepared.planType.id,
        },
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: unitAmount,
            product_data: {
              name: prepared.planType.name,
              description: truncate(prepared.planType.privileges),
            },
          },
        },
      ],
    });

    return res.status(200).json({
      sessionId: sessionResult.id,
      url: sessionResult.url ?? successUrl,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "No se pudo crear el checkout de Stripe";
    return res.status(500).json({ error: message });
  }
}
