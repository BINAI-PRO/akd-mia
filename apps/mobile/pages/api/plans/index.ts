import type { NextApiRequest, NextApiResponse } from "next";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  ClientLinkConflictError,
  ensureClientForAuthUser,
} from "@/lib/resolve-client";
import { isRefreshTokenMissingError } from "@/lib/auth-errors";

type PlanTypeRow = {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  currency: string | null;
  class_count: number | null;
  validity_days: number | null;
  privileges: string | null;
};

type PlanPurchaseRow = {
  id: string;
  status: string | null;
  start_date: string | null;
  expires_at: string | null;
  initial_classes: number | null;
  remaining_classes: number | null;
  modality: string | null;
  plan_types: { name: string | null; currency: string | null } | null;
};

type PlansResponse = {
  planTypes: Array<{
    id: string;
    name: string;
    description: string | null;
    price: number | null;
    currency: string | null;
    classCount: number | null;
    validityDays: number | null;
    privileges: string | null;
  }>;
  activePlans: Array<{
    id: string;
    name: string;
    status: string;
    startDate: string | null;
    expiresAt: string | null;
    initialClasses: number;
    remainingClasses: number;
    modality: string | null;
    currency: string | null;
  }>;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PlansResponse | { error: string }>
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
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

  const { data: planTypesData, error: planTypesError } = await supabaseAdmin
    .from("plan_types")
    .select("id, name, description, price, currency, class_count, validity_days, privileges")
    .order("price", { ascending: true })
    .returns<PlanTypeRow[]>();

  if (planTypesError) {
    return res.status(500).json({ error: planTypesError.message });
  }

  const { data: planPurchasesData, error: planPurchasesError } = await supabaseAdmin
    .from("plan_purchases")
    .select(
      `id, status, start_date, expires_at, initial_classes, remaining_classes, modality,
       plan_types ( name, currency )`
    )
    .eq("client_id", clientId)
    .order("start_date", { ascending: false })
    .returns<PlanPurchaseRow[]>();

  if (planPurchasesError) {
    return res.status(500).json({ error: planPurchasesError.message });
  }

  const planTypes = (planTypesData ?? []).map((plan) => ({
    id: plan.id,
    name: plan.name,
    description: plan.description,
    price: plan.price,
    currency: plan.currency,
    classCount: plan.class_count,
    validityDays: plan.validity_days,
    privileges: plan.privileges,
  }));

  const activePlans = (planPurchasesData ?? []).map((plan) => ({
    id: plan.id,
    name: plan.plan_types?.name ?? "Plan",
    status: plan.status ?? "UNKNOWN",
    startDate: plan.start_date,
    expiresAt: plan.expires_at,
    initialClasses: plan.initial_classes ?? 0,
    remainingClasses: plan.remaining_classes ?? 0,
    modality: plan.modality ?? null,
    currency: plan.plan_types?.currency ?? null,
  }));

  return res.status(200).json({ planTypes, activePlans });
}
