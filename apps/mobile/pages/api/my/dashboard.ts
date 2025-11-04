import type { NextApiRequest, NextApiResponse } from "next";
import dayjs from "dayjs";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  ClientLinkConflictError,
  ensureClientForAuthUser,
} from "@/lib/resolve-client";
import { isRefreshTokenMissingError } from "@/lib/auth-errors";
import { fetchMembershipSummary } from "@/lib/membership";

dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);

type DashboardResponse = {
  membership: Awaited<ReturnType<typeof fetchMembershipSummary>> | null;
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
    displayExpiresAt: string | null;
    initialClasses: number | null;
    remainingClasses: number | null;
    modality: string;
    isUnlimited: boolean;
    category: string | null;
    reservedCount: number;
  }>;
  recentBookings: Array<{
    id: string;
    classType: string;
    instructor: string;
    room: string;
    startTime: string;
    startLabel: string;
    planName: string | null;
    planPurchaseId: string | null;
  }>;
};

function columnMissing(error: unknown, column: string) {
  if (!error || typeof error !== "object") return false;
  const message = "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  const lower = message.toLowerCase();
  return lower.includes("column") && lower.includes(column.toLowerCase()) && lower.includes("does not exist");
}

async function loadPlanPurchases(clientId: string, includeCategory: boolean) {
  const columns = includeCategory
    ? `id, status, start_date, expires_at, initial_classes, remaining_classes, modality,
       plan_types ( name, category )`
    : `id, status, start_date, expires_at, initial_classes, remaining_classes, modality,
       plan_types ( name )`;

  return supabaseAdmin
    .from("plan_purchases")
    .select(columns)
    .eq("client_id", clientId)
    .order("purchased_at", { ascending: false });
}

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
    if (isRefreshTokenMissingError(sessionError)) {
      await supabase.auth.signOut();
      return res.status(401).json({ error: "Not authenticated" });
    }
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
    // bring all statuses; we'll filter client-side to avoid enum mismatches

  if (bookingsError) {
    return res.status(500).json({ error: bookingsError.message });
  }

  let { data: planData, error: plansError } = await loadPlanPurchases(clientId, true);
  if (plansError && columnMissing(plansError, "category")) {
    ({ data: planData, error: plansError } = await loadPlanPurchases(clientId, false));
  }

  if (plansError) {
    return res.status(500).json({ error: plansError.message });
  }

  const planNameMap = new Map<string, string>();
  (planData ?? []).forEach((plan) => {
    if (plan?.id) {
      planNameMap.set(plan.id, plan?.plan_types?.name ?? "");
    }
  });

  const now = dayjs();
  const membership = await fetchMembershipSummary(clientId);

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
      if (!startTime) return null;

      const bookingStatus = (row.status ?? "").toUpperCase();
      if (!["CONFIRMED", "CHECKED_IN"].includes(bookingStatus)) {
        return null;
      }

      if (!dayjs(startTime).isSameOrAfter(now, "minute")) {
        return null;
      }

      return {
        id: row.id,
        status: bookingStatus,
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
  upcomingBookings.sort((a, b) => dayjs(a.startTime).valueOf() - dayjs(b.startTime).valueOf());

  const reservedCountMap = upcomingBookings.reduce<Map<string, number>>((acc, booking) => {
    if (!booking.planPurchaseId) return acc;
    acc.set(booking.planPurchaseId, (acc.get(booking.planPurchaseId) ?? 0) + 1);
    return acc;
  }, new Map());

  const computeDisplayExpiry = (startDate?: string | null, expiresAt?: string | null) => {
    if (!startDate || !expiresAt) return expiresAt ?? null;
    const start = dayjs(startDate);
    const expiry = dayjs(expiresAt);
    if (!start.isValid() || !expiry.isValid()) return expiresAt;
    if (expiry.isBefore(start)) return expiresAt;

    let cursor = start.endOf("month");
    let candidate: dayjs.Dayjs | null = null;

    while (cursor.isSameOrBefore(expiry)) {
      candidate = cursor;
      cursor = cursor.add(1, "month").endOf("month");
    }

    if (candidate && candidate.isSameOrBefore(expiry)) {
      return candidate.format("YYYY-MM-DD");
    }

    return expiry.format("YYYY-MM-DD");
  };

  const plans = (planData ?? []).map((plan) => ({
    id: plan.id,
    name: plan.plan_types?.name ?? "Plan",
    status: plan.status,
    startDate: plan.start_date,
    expiresAt: plan.expires_at ?? null,
    displayExpiresAt: computeDisplayExpiry(plan.start_date ?? null, plan.expires_at ?? null),
    initialClasses: plan.initial_classes,
    remainingClasses: plan.remaining_classes,
    modality: plan.modality ?? "FLEXIBLE",
    isUnlimited: plan.initial_classes === null,
    category: plan.plan_types?.category ?? null,
    reservedCount: reservedCountMap.get(plan.id) ?? 0,
  }));

  const fifteenDaysAgo = now.subtract(15, "day");
  const recentBookings = (bookingsData ?? [])
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

      if (!sessionRow?.start_time) return null;

      const startTime = dayjs(sessionRow.start_time);
      if (!startTime.isValid()) return null;
      if (startTime.isAfter(now)) return null;
      if (startTime.isBefore(fifteenDaysAgo)) return null;

      const status = (row.status ?? "").toUpperCase();
      if (status !== "CHECKED_IN" && status !== "CHECKED_OUT") {
        return null;
      }

      return {
        id: row.id,
        classType: sessionRow.class_types?.name ?? "Clase",
        instructor: sessionRow.instructors?.full_name ?? "",
        room: sessionRow.rooms?.name ?? "",
        startTime: sessionRow.start_time,
        startLabel: startTime.format("DD MMM YYYY HH:mm"),
        planName: row.plan_purchase_id ? planNameMap.get(row.plan_purchase_id) ?? null : null,
        planPurchaseId: row.plan_purchase_id ?? null,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort((a, b) => dayjs(b.startTime).valueOf() - dayjs(a.startTime).valueOf()) as DashboardResponse["recentBookings"];

  return res.status(200).json({ membership, upcomingBookings, plans, recentBookings });
}
