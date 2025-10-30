import type { NextApiRequest, NextApiResponse } from "next";
import dayjs from "dayjs";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  ClientLinkConflictError,
  ensureClientForAuthUser,
} from "@/lib/resolve-client";

type DashboardResponse = {
  upcomingBookings: Array<{
    id: string;
    status: string;
    classType: string;
    instructor: string;
    room: string;
    startTime: string;
    endTime: string;
    startLabel: string;
    planPurchaseId: string | null;
    planName: string | null;
  }>;
  plans: Array<{
    id: string;
    name: string;
    status: string;
    startDate: string;
    expiresAt: string | null;
    initialClasses: number;
    remainingClasses: number;
    modality: string;
  }>;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DashboardResponse | { error: string }>
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
    return res.status(500).json({ error: sessionError.message });
  }

  if (!session?.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { data: client, error: clientError } = await supabaseAdmin
    .from("clients")
    .select("id")
    .eq("auth_user_id", session.user.id)
    .maybeSingle();

  if (clientError) {
    return res.status(500).json({ error: clientError.message });
  }

  let clientId = client?.id ?? null;

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

  const now = dayjs().toISOString();

  const { data: bookingsData, error: bookingsError } = await supabaseAdmin
    .from("bookings")
    .select(
      `id, status, plan_purchase_id,
       sessions:session_id (
         id, start_time, end_time,
         class_types ( name ),
         instructors ( full_name ),
         rooms ( name )
       ),
       qr_tokens ( token )`
    )
    .eq("client_id", clientId)
    .in("status", ["CONFIRMED", "CHECKED_IN"])
    .order("sessions.start_time", { ascending: true })
    .gte("sessions.start_time", now);

  if (bookingsError) {
    return res.status(500).json({ error: bookingsError.message });
  }

  const { data: planData, error: plansError } = await supabaseAdmin
    .from("plan_purchases")
    .select(
      `id, status, start_date, expires_at, initial_classes, remaining_classes, modality,
       plan_types ( name )`
    )
    .eq("client_id", clientId)
    .order("purchased_at", { ascending: false });

  if (plansError) {
    return res.status(500).json({ error: plansError.message });
  }

  const planNameMap = new Map<string, string>();
  (planData ?? []).forEach((plan) => {
    if (plan?.id) {
      planNameMap.set(plan.id, plan?.plan_types?.name ?? "");
    }
  });

  const upcomingBookings = (bookingsData ?? [])
    .map((row) => {
      const sessionRow = row.sessions as
        | {
            start_time: string;
            end_time: string;
            class_types?: { name?: string } | null;
            instructors?: { full_name?: string } | null;
            rooms?: { name?: string } | null;
          }
        | null;

      if (!sessionRow) return null;

      const startTime = sessionRow.start_time;
      return {
        id: row.id,
        status: row.status,
        classType: sessionRow.class_types?.name ?? "Clase",
        instructor: sessionRow.instructors?.full_name ?? "",
        room: sessionRow.rooms?.name ?? "",
        startTime,
        endTime: sessionRow.end_time,
        startLabel: dayjs(startTime).format("DD MMM YYYY HH:mm"),
        planPurchaseId: row.plan_purchase_id ?? null,
        planName: row.plan_purchase_id ? planNameMap.get(row.plan_purchase_id) ?? null : null,
      };
    })
    .filter(Boolean) as DashboardResponse["upcomingBookings"];

  const plans = (planData ?? []).map((plan) => ({
    id: plan.id,
    name: plan.plan_types?.name ?? "Plan",
    status: plan.status,
    startDate: plan.start_date,
    expiresAt: plan.expires_at ?? null,
    initialClasses: plan.initial_classes ?? 0,
    remainingClasses: plan.remaining_classes ?? 0,
    modality: plan.modality ?? "FLEXIBLE",
  }));

  return res.status(200).json({ upcomingBookings, plans });
}
