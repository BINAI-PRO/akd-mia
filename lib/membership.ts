import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Tables } from "@/types/database";

type MembershipTypeRow = Pick<Tables<"membership_types">, "id" | "name" | "price" | "currency"> & {
  category?: string | null;
};

type MembershipRow = Tables<"memberships"> & {
  membership_types?: MembershipTypeRow | null;
};

export type MembershipSummary = {
  id: string;
  name: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  nextBillingDate: string | null;
  autoRenew: boolean;
  isActive: boolean;
  price: number | null;
  currency: string | null;
  category: string | null;
};

const statusPriority = (status: string | null | undefined) => {
  switch ((status ?? "").toUpperCase()) {
    case "ACTIVE":
      return 0;
    case "PENDING":
      return 1;
    case "PAUSED":
      return 2;
    case "EXPIRED":
      return 3;
    case "CANCELLED":
      return 4;
    default:
      return 5;
  }
};

function isMissingCategoryColumn(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const message = "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  const lower = message.toLowerCase();
  return lower.includes("column") && lower.includes("category") && lower.includes("does not exist");
}

async function loadMembershipRows(clientId: string, includeCategory: boolean) {
  const columns = includeCategory
    ? `id, status, start_date, end_date, next_billing_date, auto_renew,
       membership_types:membership_type_id ( id, name, price, currency, category )`
    : `id, status, start_date, end_date, next_billing_date, auto_renew,
       membership_types:membership_type_id ( id, name, price, currency )`;

  return supabaseAdmin
    .from("memberships")
    .select(columns)
    .eq("client_id", clientId)
    .order("start_date", { ascending: false })
    .returns<MembershipRow[]>();
}

export async function fetchMembershipSummary(
  clientId: string
): Promise<MembershipSummary | null> {
  let { data, error } = await loadMembershipRows(clientId, true);

  if (error && isMissingCategoryColumn(error)) {
    ({ data, error } = await loadMembershipRows(clientId, false));
  }

  if (error) {
    throw new Error(error.message);
  }

  if (!data || data.length === 0) {
    return null;
  }

  const sorted = [...data].sort((a, b) => {
    const priorityDiff = statusPriority(a.status) - statusPriority(b.status);
    if (priorityDiff !== 0) return priorityDiff;

    const endA = a.end_date ? new Date(a.end_date).getTime() : 0;
    const endB = b.end_date ? new Date(b.end_date).getTime() : 0;
    return endB - endA;
  });

  const selected = sorted[0];
  if (!selected) return null;

  const status = selected.status ?? "UNKNOWN";
  const membershipType = selected.membership_types ?? null;

  let price: number | null = null;
  if (membershipType?.price !== null && membershipType?.price !== undefined) {
    const parsed = Number(membershipType.price);
    price = Number.isFinite(parsed) ? parsed : null;
  }

  return {
    id: selected.id,
    name: membershipType?.name ?? "Membresía",
    status,
    startDate: selected.start_date ?? null,
    endDate: selected.end_date ?? null,
    nextBillingDate: selected.next_billing_date ?? null,
    autoRenew: Boolean(selected.auto_renew),
    isActive: status.toUpperCase() === "ACTIVE",
    price,
    currency: membershipType?.currency ?? null,
    category: membershipType?.category ?? null,
  };
}
