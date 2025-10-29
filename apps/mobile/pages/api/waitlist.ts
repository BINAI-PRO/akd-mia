import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { countPendingWaitlist, resequenceWaitlist, type WaitlistStatus } from "@/lib/waitlist";

type WaitlistEntryResponse = {
  entry: {
    id: string;
    position: number;
    status: "PENDING" | "PROMOTED" | "CANCELLED";
  };
  waitlistCount: number;
};

type WaitlistDeleteResponse = {
  removed: boolean;
  waitlistCount: number;
};

async function handlePost(req: NextApiRequest, res: NextApiResponse<WaitlistEntryResponse | { error: string }>) {
  const { sessionId, clientId } = req.body ?? {};

  if (typeof sessionId !== "string" || typeof clientId !== "string") {
    return res.status(400).json({ error: "Missing sessionId or clientId" });
  }

  const now = new Date().toISOString();

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("session_waitlist")
    .select("id, position, status")
    .eq("session_id", sessionId)
    .eq("client_id", clientId)
    .maybeSingle();

  if (existingError) {
    return res.status(500).json({ error: existingError.message });
  }

  if (existing && existing.status !== "CANCELLED") {
    const waitlistCount = await countPendingWaitlist(sessionId);
    return res.status(200).json({
      entry: {
        id: existing.id,
        position: existing.position,
        status: existing.status as "PENDING" | "PROMOTED" | "CANCELLED",
      },
      waitlistCount,
    });
  }

  const { count: currentPendingCount, error: countError } = await supabaseAdmin
    .from("session_waitlist")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .eq("status", "PENDING");

  if (countError) {
    return res.status(500).json({ error: countError.message });
  }

  const nextPosition = (currentPendingCount ?? 0) + 1;
  let entryId: string | null = null;

  if (existing) {
    const { error: updateError } = await supabaseAdmin
      .from("session_waitlist")
      .update({ status: "PENDING", position: nextPosition, updated_at: now })
      .eq("id", existing.id);

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }
    entryId = existing.id;
  } else {
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("session_waitlist")
      .insert({
        session_id: sessionId,
        client_id: clientId,
        position: nextPosition,
        status: "PENDING",
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      return res.status(500).json({ error: insertError?.message ?? "Failed to join waitlist" });
    }
    entryId = inserted.id;
  }

  await resequenceWaitlist(sessionId);

  const { data: refreshed, error: refreshError } = await supabaseAdmin
    .from("session_waitlist")
    .select("id, position, status")
    .eq("id", entryId)
    .maybeSingle();

  if (refreshError) {
    return res.status(500).json({ error: refreshError.message });
  }

  const waitlistCount = await countPendingWaitlist(sessionId);

  return res.status(200).json({
    entry: {
      id: refreshed?.id ?? entryId,
      position: refreshed?.position ?? nextPosition,
      status: (refreshed?.status as WaitlistStatus) ?? "PENDING",
    },
    waitlistCount,
  });
}

async function handleDelete(req: NextApiRequest, res: NextApiResponse<WaitlistDeleteResponse | { error: string }>) {
  const { waitlistId, sessionId, clientId } = req.body ?? {};

  let entryId: string | null = null;
  let targetSessionId: string | null = null;

  if (typeof waitlistId === "string") {
    const { data, error } = await supabaseAdmin
      .from("session_waitlist")
      .select("id, session_id, position, status")
      .eq("id", waitlistId)
      .maybeSingle();
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    if (!data) {
      return res.status(404).json({ error: "Waitlist entry not found" });
    }
    entryId = data.id;
    targetSessionId = data.session_id;
    if (data.status === "CANCELLED") {
      const waitlistCount = await countPendingWaitlist(targetSessionId);
      return res.status(200).json({ removed: true, waitlistCount });
    }
  } else if (typeof sessionId === "string" && typeof clientId === "string") {
    const { data, error } = await supabaseAdmin
      .from("session_waitlist")
      .select("id, session_id, position, status")
      .eq("session_id", sessionId)
      .eq("client_id", clientId)
      .maybeSingle();
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    if (!data) {
      return res.status(404).json({ error: "Waitlist entry not found" });
    }
    entryId = data.id;
    targetSessionId = data.session_id;
    if (data.status === "CANCELLED") {
      const waitlistCount = await countPendingWaitlist(sessionId);
      return res.status(200).json({ removed: true, waitlistCount });
    }
  } else {
    return res.status(400).json({ error: "Missing identifiers to remove waitlist entry" });
  }

  if (!entryId || !targetSessionId) {
    return res.status(500).json({ error: "Could not resolve waitlist entry" });
  }

  const { error: updateError } = await supabaseAdmin
    .from("session_waitlist")
    .update({ status: "CANCELLED", updated_at: new Date().toISOString() })
    .eq("id", entryId);

  if (updateError) {
    return res.status(500).json({ error: updateError.message });
  }

  await resequenceWaitlist(targetSessionId);

  const waitlistCount = await countPendingWaitlist(targetSessionId);

  return res.status(200).json({ removed: true, waitlistCount });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WaitlistEntryResponse | WaitlistDeleteResponse | { error: string }>
) {
  if (req.method === "POST") {
    return handlePost(req, res);
  }

  if (req.method === "DELETE") {
    return handleDelete(req, res);
  }

  res.setHeader("Allow", "POST, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
