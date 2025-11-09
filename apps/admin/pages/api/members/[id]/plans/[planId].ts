import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminFeature } from "@/lib/api/require-admin-feature";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { id, planId } = req.query;
  const memberId = typeof id === "string" ? id : null;
  if (!memberId || memberId.length === 0 || typeof planId !== "string") {
    return res.status(400).json({ error: "Identificadores inválidos" });
  }

  const access = await requireAdminFeature(req, res, "memberDetail", "FULL");
  if (!access) return;

  const { data: planRecord, error: planError } = await supabaseAdmin
    .from("plan_purchases")
    .select("id, client_id, status")
    .eq("id", planId)
    .maybeSingle<{ id: string; client_id: string; status: string | null }>();

  if (planError) {
    console.error("/api/members/[memberId]/plans/[planId] lookup", planError);
    return res.status(500).json({ error: "No se pudo obtener el plan" });
  }

  if (!planRecord || planRecord.client_id !== memberId) {
    return res.status(404).json({ error: "Plan no encontrado para este miembro" });
  }

  const { count: bookingCount, error: bookingError } = await supabaseAdmin
    .from("bookings")
    .select("id", { head: true, count: "exact" })
    .eq("plan_purchase_id", planId)
    .neq("status", "CANCELLED");

  if (bookingError) {
    console.error("/api/members/[memberId]/plans/[planId] bookings check", bookingError);
    return res.status(500).json({ error: "No se pudieron revisar las reservas vinculadas" });
  }

  if ((bookingCount ?? 0) > 0) {
    return res.status(400).json({
      error: "No puedes eliminar este plan porque tiene reservas asociadas. Cancela o reasigna esas reservas primero.",
    });
  }

  const { count: usageCount, error: usageError } = await supabaseAdmin
    .from("plan_usages")
    .select("id", { head: true, count: "exact" })
    .eq("plan_purchase_id", planId);

  if (usageError) {
    console.error("/api/members/[memberId]/plans/[planId] usage check", usageError);
    return res.status(500).json({ error: "No se pudieron revisar los créditos utilizados" });
  }

  if ((usageCount ?? 0) > 0) {
    return res.status(400).json({
      error: "Este plan ya tiene créditos utilizados. Cancela las reservas relacionadas antes de eliminarlo.",
    });
  }

  await supabaseAdmin.from("plan_payments").delete().eq("plan_purchase_id", planId);
  await supabaseAdmin.from("plan_usages").delete().eq("plan_purchase_id", planId);

  const { error: deletePlanError } = await supabaseAdmin
    .from("plan_purchases")
    .delete()
    .eq("id", planId);

  if (deletePlanError) {
    console.error("/api/members/[memberId]/plans/[planId] delete", deletePlanError);
    return res.status(500).json({ error: "No se pudo eliminar el plan" });
  }

  return res.status(200).json({ success: true });
}
