import type { NextApiRequest, NextApiResponse } from "next";
import { madridDayjs } from "@/lib/timezone";
import {
  commitMembershipPurchase,
  prepareMembershipPurchase,
  type MembershipPurchasePayload,
} from "@/lib/membership-purchase";
import { loadStudioSettings } from "@/lib/studio-settings";

type SuccessResponse = {
  message: string;
  member: unknown;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SuccessResponse | { error: string }>
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Metodo no permitido" });
  }

  try {
    await loadStudioSettings();

    const payload = req.body as MembershipPurchasePayload;
    const prepared = await prepareMembershipPurchase(payload);

    const result = await commitMembershipPurchase(
      prepared,
      {
        status: "SUCCESS",
        providerRef: null,
        notes: payload.notes ?? null,
        paidAt: madridDayjs().toISOString(),
      },
      { includeSnapshot: true }
    );

    return res.status(200).json({
      message: "Membresía registrada correctamente",
      member: result.memberSnapshot,
    });
  } catch (error) {
    console.error("/api/memberships POST", error);
    const status = (error as { status?: number }).status ?? 500;
    const message = error instanceof Error ? error.message : "Error inesperado";
    return res.status(status).json({ error: message });
  }
}
