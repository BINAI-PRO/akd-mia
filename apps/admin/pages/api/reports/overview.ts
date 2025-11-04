import type { NextApiRequest, NextApiResponse } from "next";
import dayjs from "dayjs";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";
import { supabaseAdmin } from "@/lib/supabase-admin";

dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);

type MonthlyRevenue = { month: string; label: string; total: number };
type TopPlan = { id: string; label: string; total: number; percentage: number };
type ExpirationRow = {
  id: string;
  client: string;
  label: string;
  type: "MEMBERSHIP" | "PLAN";
  endDate: string;
  daysLeft: number;
};

type ReportsResponse = {
  metrics: {
    totalClients: number;
    activeMemberships: number;
    activePlans: number;
    upcomingSessions: number;
  };
  revenue: {
    monthly: MonthlyRevenue[];
    topPlans: TopPlan[];
  };
  expirations: ExpirationRow[];
  sessions: {
    scheduled: number;
    reserved: number;
    attended: number;
    lostByExpiration: number;
  };
};

const ACTIVE_BOOKING_STATUSES = new Set(["CONFIRMED", "CHECKED_IN", "CHECKED_OUT", "REBOOKED"]);
const ATTENDED_STATUSES = new Set(["CHECKED_IN", "CHECKED_OUT"]);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ReportsResponse | { error: string }>
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Metodo no permitido" });
  }

  try {
    const today = dayjs().startOf("day");
    const monthlyWindowStart = today.clone().subtract(11, "month").startOf("month");
    const monthlyWindowEnd = today.clone().endOf("day");
    const upcomingBoundary = today.clone().add(30, "day").endOf("day");
    const upcomingSessionsBoundary = today.clone().add(7, "day").endOf("day");

    const [
      clientsCountRes,
      membershipsCountRes,
      plansCountRes,
      upcomingSessionsRes,
      membershipPaymentsRes,
      planPaymentsRes,
      membershipExpirationsRes,
      planExpirationsRes,
      expiredPlansRes,
    ] = await Promise.all([
      supabaseAdmin
        .from("clients")
        .select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("memberships")
        .select("id", { count: "exact", head: true })
        .eq("status", "ACTIVE")
        .gte("end_date", today.format("YYYY-MM-DD")),
      supabaseAdmin
        .from("plan_purchases")
        .select("id", { count: "exact", head: true })
        .eq("status", "ACTIVE")
        .or(
          `expires_at.is.null,expires_at.gte.${today.format("YYYY-MM-DD")}`
        ),
      supabaseAdmin
        .from("sessions")
        .select("id,start_time")
        .gte("start_time", today.toISOString())
        .lte("start_time", upcomingSessionsBoundary.toISOString())
        .order("start_time", { ascending: true }),
      supabaseAdmin
        .from("membership_payments")
        .select("amount, paid_at, memberships ( membership_types ( name ) )")
        .eq("status", "SUCCESS")
        .gte("paid_at", monthlyWindowStart.toISOString())
        .lte("paid_at", monthlyWindowEnd.toISOString()),
      supabaseAdmin
        .from("plan_payments")
        .select("amount, paid_at, plan_purchases ( plan_types ( id, name ) )")
        .eq("status", "SUCCESS")
        .gte("paid_at", monthlyWindowStart.toISOString())
        .lte("paid_at", monthlyWindowEnd.toISOString()),
      supabaseAdmin
        .from("memberships")
        .select(
          "id, end_date, clients:clients!memberships_client_id_fkey ( full_name ), membership_types:membership_type_id ( name )"
        )
        .eq("status", "ACTIVE")
        .gte("end_date", today.format("YYYY-MM-DD"))
        .lte("end_date", upcomingBoundary.format("YYYY-MM-DD"))
        .order("end_date", { ascending: true }),
      supabaseAdmin
        .from("plan_purchases")
        .select(
          "id, expires_at, status, remaining_classes, clients:clients!plan_purchases_client_id_fkey ( full_name ), plan_types ( name )"
        )
        .eq("status", "ACTIVE")
        .not("expires_at", "is", null)
        .gte("expires_at", today.format("YYYY-MM-DD"))
        .lte("expires_at", upcomingBoundary.format("YYYY-MM-DD"))
        .order("expires_at", { ascending: true }),
      supabaseAdmin
        .from("plan_purchases")
        .select("remaining_classes")
        .eq("status", "EXPIRED")
        .gt("remaining_classes", 0),
    ]);

    if (clientsCountRes.error) throw clientsCountRes.error;
    if (membershipsCountRes.error) throw membershipsCountRes.error;
    if (plansCountRes.error) throw plansCountRes.error;
    if (upcomingSessionsRes.error) throw upcomingSessionsRes.error;
    if (membershipPaymentsRes.error) throw membershipPaymentsRes.error;
    if (planPaymentsRes.error) throw planPaymentsRes.error;
    if (membershipExpirationsRes.error) throw membershipExpirationsRes.error;
    if (planExpirationsRes.error) throw planExpirationsRes.error;
    if (expiredPlansRes.error) throw expiredPlansRes.error;

    const totalClients = clientsCountRes.count ?? 0;
    const activeMemberships = membershipsCountRes.count ?? 0;
    const activePlans = plansCountRes.count ?? 0;

    const upcomingSessionsData = (upcomingSessionsRes.data ?? []).filter((row) => {
      const startTime = dayjs(row.start_time);
      return startTime.isSameOrAfter(today) && startTime.isSameOrBefore(upcomingSessionsBoundary);
    });
    const upcomingSessionIds = upcomingSessionsData.map((row) => row.id);
    const scheduledSessions = upcomingSessionsData.length;

    let bookingRows: { status: string | null; session_id: string }[] = [];
    if (upcomingSessionIds.length > 0) {
      const { data: upcomingBookings, error: bookingsError } = await supabaseAdmin
        .from("bookings")
        .select("status, session_id")
        .in("session_id", upcomingSessionIds);
      if (bookingsError) throw bookingsError;
      bookingRows = upcomingBookings ?? [];
    }

    let reservedSessions = 0;
    let attendedSessions = 0;

    for (const booking of bookingRows) {
      const status = (booking.status ?? "").toString().toUpperCase();
      if (ACTIVE_BOOKING_STATUSES.has(status)) {
        reservedSessions += 1;
      }
      if (ATTENDED_STATUSES.has(status)) {
        attendedSessions += 1;
      }
    }

    const lostByExpiration = (expiredPlansRes.data ?? []).reduce(
      (acc, row) => acc + Math.max(Number(row.remaining_classes) || 0, 0),
      0
    );

    const revenueMap = new Map<string, number>();
    const addRevenue = (iso: string | null, amount: number) => {
      if (!iso) return;
      const monthKey = dayjs(iso).format("YYYY-MM");
      if (!revenueMap.has(monthKey)) {
        revenueMap.set(monthKey, 0);
      }
      revenueMap.set(monthKey, (revenueMap.get(monthKey) ?? 0) + amount);
    };

    const planTotalsMap = new Map<string, { label: string; total: number }>();
    const addPlanTotal = (key: string, label: string, amount: number) => {
      if (!planTotalsMap.has(key)) {
        planTotalsMap.set(key, { label, total: 0 });
      }
      const current = planTotalsMap.get(key);
      if (current) {
        current.total += amount;
      }
    };

    for (const row of membershipPaymentsRes.data ?? []) {
      const amount = Number(row.amount) || 0;
      addRevenue(row.paid_at, amount);
      const membershipName = row.memberships?.membership_types?.name ?? "Membres\u00eda";
      const key = `membership-${membershipName}`;
      addPlanTotal(key, `Membres\u00eda - ${membershipName}`, amount);
    }

    for (const row of planPaymentsRes.data ?? []) {
      const amount = Number(row.amount) || 0;
      addRevenue(row.paid_at, amount);
      const planName = row.plan_purchases?.plan_types?.name ?? "Plan";
      const key = `plan-${planName}`;
      addPlanTotal(key, planName, amount);
    }

    const monthlyRevenue: MonthlyRevenue[] = [];
    for (let i = 0; i < 12; i += 1) {
      const reference = monthlyWindowStart.clone().add(i, "month");
      const key = reference.format("YYYY-MM");
      monthlyRevenue.push({
        month: key,
        label: reference.format("MMM YYYY"),
        total: Number(revenueMap.get(key) ?? 0),
      });
    }

    const planTotals = Array.from(planTotalsMap.values()).sort((a, b) => b.total - a.total);
    const totalRevenue = planTotals.reduce((acc, item) => acc + item.total, 0) || 1;
    const topPlans: TopPlan[] = planTotals.map((item) => ({
      id: item.label,
      label: item.label,
      total: item.total,
      percentage: item.total / totalRevenue,
    }));

    const expirations: ExpirationRow[] = [];

    for (const item of membershipExpirationsRes.data ?? []) {
      if (!item.end_date) continue;
      const endDate = dayjs(item.end_date);
      expirations.push({
        id: item.id,
        type: "MEMBERSHIP",
        client: item.clients?.full_name ?? "Cliente",
        label: item.membership_types?.name ?? "Membres\u00eda",
        endDate: endDate.toISOString(),
        daysLeft: endDate.diff(today, "day"),
      });
    }

    for (const item of planExpirationsRes.data ?? []) {
      if (!item.expires_at) continue;
      const endDate = dayjs(item.expires_at);
      expirations.push({
        id: item.id,
        type: "PLAN",
        client: item.clients?.full_name ?? "Cliente",
        label: item.plan_types?.name ?? "Plan",
        endDate: endDate.toISOString(),
        daysLeft: endDate.diff(today, "day"),
      });
    }

    expirations.sort((a, b) => dayjs(a.endDate).valueOf() - dayjs(b.endDate).valueOf());

    const response: ReportsResponse = {
      metrics: {
        totalClients,
        activeMemberships,
        activePlans,
        upcomingSessions: scheduledSessions,
      },
      revenue: {
        monthly: monthlyRevenue,
        topPlans,
      },
      expirations,
      sessions: {
        scheduled: scheduledSessions,
        reserved: reservedSessions,
        attended: attendedSessions,
        lostByExpiration,
      },
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error("/api/reports/overview", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return res.status(500).json({ error: message });
  }
}
