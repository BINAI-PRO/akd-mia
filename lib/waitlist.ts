import { supabaseAdmin } from "./supabase-admin";

export type WaitlistStatus = "PENDING" | "PROMOTED" | "CANCELLED";

type WaitlistRow = {
  id: string;
  position: number;
};

export async function resequenceWaitlist(sessionId: string) {
  const { data, error } = await supabaseAdmin
    .from("session_waitlist")
    .select("id")
    .eq("session_id", sessionId)
    .eq("status", "PENDING")
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;

  const rows: WaitlistRow[] = (data ?? []) as WaitlistRow[];
  await Promise.all(
    rows.map((row, index) =>
      supabaseAdmin
        .from("session_waitlist")
        .update({ position: index + 1 })
        .eq("id", row.id)
    )
  );
}

export async function countPendingWaitlist(sessionId: string) {
  const { count } = await supabaseAdmin
    .from("session_waitlist")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .eq("status", "PENDING");

  return count ?? 0;
}
