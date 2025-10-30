import { supabaseAdmin } from "@/lib/supabase-admin";

type BookingRow = {
  session_id: string;
  status: string | null;
};

const ACTIVE_STATUSES = new Set([
  "CONFIRMED",
  "CHECKED_IN",
  "CHECKED_OUT",
  "REBOOKED",
]);

export async function fetchSessionOccupancy(
  sessionIds: string[]
): Promise<Record<string, number>> {
  if (sessionIds.length === 0) return {};

  const { data, error } = await supabaseAdmin
    .from("bookings")
    .select("session_id, status")
    .in("session_id", sessionIds)
    .returns<BookingRow[]>();

  if (error) {
    throw error;
  }

  const map: Record<string, number> = {};

  for (const id of sessionIds) {
    map[id] = 0;
  }

  for (const row of data ?? []) {
    if (!row?.session_id) continue;
    const status = row.status ?? "";
    if (ACTIVE_STATUSES.has(status.toUpperCase())) {
      map[row.session_id] = (map[row.session_id] ?? 0) + 1;
    }
  }

  return map;
}
