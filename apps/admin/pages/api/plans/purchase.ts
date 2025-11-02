import type { NextApiRequest, NextApiResponse } from "next";
import dayjs from "dayjs";
import {
  commitPlanPurchase,
  preparePlanPurchase,
  type PlanPurchasePayload,
  type PlanPaymentPayload,
} from "@/lib/plan-purchase";

const VALID_MODALITIES = new Set<"FLEXIBLE" | "FIXED">(["FLEXIBLE", "FIXED"]);

function normalizeModality(value: unknown): "FLEXIBLE" | "FIXED" {
  if (typeof value === "string") {
    const upper = value.toUpperCase();
    if (upper === "FIXED") return "FIXED";
  }
  return "FLEXIBLE";
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
  } = req.body as {
    clientId?: string;
    planTypeId?: string;
    startDate?: string | null;
    notes?: string | null;
    modality?: string;
    courseId?: string | null;
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

    const payment: PlanPaymentPayload = {
      status: "SUCCESS",
      providerRef: "MANUAL_ADMIN",
      notes: notes ?? null,
      paidAt: dayjs().toISOString(),
    };

    const result = await commitPlanPurchase(prepared, payment);

    return res.status(200).json({
      message: "Plan registrado correctamente",
      member: result.memberSnapshot,
    });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    const message = error instanceof Error ? error.message : "Error inesperado";
    if (status >= 500) {
      console.error("/api/plans/purchase", error);
    }
    return res.status(status).json({ error: message });
  }
}
