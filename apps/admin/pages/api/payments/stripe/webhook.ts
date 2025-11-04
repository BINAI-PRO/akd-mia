import type { NextApiRequest, NextApiResponse } from "next";
import dayjs from "dayjs";
import { getStripeClient, getStripeWebhookSecret } from "@/lib/stripe";
import { commitPlanPurchase, preparePlanPurchase } from "@/lib/plan-purchase";
import {
  commitMembershipPurchase,
  prepareMembershipPurchase,
} from "@/lib/membership-purchase";

export const config = {
  api: {
    bodyParser: false,
  },
};

async function readRawBody(req: NextApiRequest): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

type StripeCheckoutSession = {
  id: string;
  payment_status: string;
  metadata?: Record<string, string | null | undefined>;
  payment_intent?: string | { id: string };
  amount_total?: number | null;
  currency?: string | null;
  created?: number;
};

function getString(metadata: Record<string, string | null | undefined>, key: string) {
  const value = metadata[key];
  if (typeof value === "string" && value.length > 0) return value;
  return null;
}

function normalizeModality(value: string | null): "FLEXIBLE" | "FIXED" {
  if (value && value.toUpperCase() === "FIXED") return "FIXED";
  return "FLEXIBLE";
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Metodo no permitido" });
  }

  const stripe = getStripeClient();
  const webhookSecret = getStripeWebhookSecret();

  let event: import("stripe").Stripe.Event;

  try {
    const rawBody = await readRawBody(req);
    const signature = req.headers["stripe-signature"];
    if (!signature) {
      return res.status(400).json({ error: "Falta la cabecera stripe-signature" });
    }
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    console.error("Stripe webhook signature error", error);
    const message = error instanceof Error ? error.message : "Webhook invalido";
    return res.status(400).json({ error: message });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as unknown as StripeCheckoutSession;
      await processCheckoutSession(session);
    }
  } catch (error) {
    console.error("Stripe webhook processing error", error);
    return res.status(500).json({ error: "Error al procesar el evento" });
  }

  return res.status(200).json({ received: true });
}

async function processCheckoutSession(session: StripeCheckoutSession) {
  if (session.payment_status !== "paid") {
    return;
  }

  const metadata = session.metadata ?? {};
  const clientId = getString(metadata, "clientId");
  const planTypeId = getString(metadata, "planTypeId");
  const membershipTypeId = getString(metadata, "membershipTypeId");
  const modality = normalizeModality(getString(metadata, "modality"));
  const startIso = getString(metadata, "startIso");
  const notes = getString(metadata, "notes");
  const courseId = getString(metadata, "courseId");

  if (!clientId || (!planTypeId && !membershipTypeId) || !startIso) {
    console.warn("Stripe checkout session sin metadata suficiente", {
      sessionId: session.id,
      clientId,
      planTypeId,
      membershipTypeId,
      startIso,
    });
    return;
  }

  const expectedAmount = getString(metadata, "expectedAmount");
  const expectedCurrency = getString(metadata, "currency") ?? "mxn";

  if (expectedAmount && typeof session.amount_total === "number") {
    const currencyUpper = (session.currency ?? expectedCurrency).toUpperCase();
    const zeroDecimal = currencyUpper === "JPY" || currencyUpper === "KRW";
    const expectedMinorUnits = zeroDecimal
      ? Math.round(Number(expectedAmount))
      : Math.round(Number(expectedAmount) * 100);
    if (Number.isFinite(expectedMinorUnits) && expectedMinorUnits !== session.amount_total) {
      console.error("Diferencia entre el monto esperado y el cobrado en Stripe", {
        sessionId: session.id,
        expectedMinorUnits,
        amountTotal: session.amount_total,
      });
      throw new Error("Monto cobrado distinto al esperado");
    }
  }

  const payload = {
    clientId,
    planTypeId,
    modality,
    courseId: courseId ?? null,
    startDate: startIso,
    notes,
  };

  try {
    const paymentIntent =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? null;

    if (planTypeId) {
      const preparedPlan = await preparePlanPurchase(payload);
      await commitPlanPurchase(preparedPlan, {
        status: "SUCCESS",
        providerRef: session.id,
        notes: `Stripe checkout ${session.id}${paymentIntent ? ` / PI ${paymentIntent}` : ""}`,
        paidAt: session.created ? dayjs.unix(session.created).toISOString() : dayjs().toISOString(),
      });
    } else if (membershipTypeId) {
      const termYears = Number(getString(metadata, "termYears") ?? "1");
      const membershipPayload = {
        clientId,
        membershipTypeId,
        startDate: startIso,
        termYears,
        notes,
      };
      const preparedMembership = await prepareMembershipPurchase(membershipPayload);
      await commitMembershipPurchase(preparedMembership, {
        status: "SUCCESS",
        providerRef: session.id,
        notes: `Stripe checkout ${session.id}${paymentIntent ? ` / PI ${paymentIntent}` : ""}`,
        paidAt: session.created ? dayjs.unix(session.created).toISOString() : dayjs().toISOString(),
      });
    }
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    if (status >= 500) {
      throw error;
    }
    console.warn("Stripe checkout ignorado por validacion de negocio", {
      sessionId: session.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
