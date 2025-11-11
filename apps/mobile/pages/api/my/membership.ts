import type { NextApiRequest, NextApiResponse } from "next";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchMembershipSummary, type MembershipSummary } from "@/lib/membership";
import {
  ClientLinkConflictError,
  ensureClientForAuthUser,
} from "@/lib/resolve-client";
import { isRefreshTokenMissingError } from "@/lib/auth-errors";
import { loadStudioSettings } from "@/lib/studio-settings";

type MembershipResponse = {
  membership: MembershipSummary | null;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<MembershipResponse | { error: string }>
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

  const settings = await loadStudioSettings();
  if (!settings.membershipsEnabled) {
    return res.status(200).json({ membership: null });
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

  try {
    const membership = await fetchMembershipSummary(clientId);
    return res.status(200).json({ membership });
  } catch (membershipError) {
    const message =
      membershipError instanceof Error ? membershipError.message : "No se pudo consultar la membresía";
    return res.status(500).json({ error: message });
  }
}
