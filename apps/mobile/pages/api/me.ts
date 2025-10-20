import type { NextApiRequest, NextApiResponse } from "next";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Tables } from "@/types/database";

type ClientRow = Tables<"clients"> & {
  client_profiles?: Pick<Tables<"client_profiles">, "avatar_url" | "status"> | null;
};

type MeResponse = {
  profile: {
    authUserId: string;
    clientId: string | null;
    fullName: string;
    email: string | null;
    phone: string | null;
    avatarUrl: string | null;
    status: string | null;
    role: string | null;
    isAdmin: boolean;
  };
};

function extractMetadata(entry: {
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
  email?: string;
}) {
  const metadata = (entry.user_metadata ?? {}) as Record<string, unknown>;
  const appMetadata = (entry.app_metadata ?? {}) as Record<string, unknown>;

  const fullName =
    (metadata.full_name as string | undefined) ??
    (metadata.name as string | undefined) ??
    (metadata.display_name as string | undefined) ??
    entry.email?.split("@")[0] ??
    "Usuario";

  const avatarUrl =
    (metadata.avatar_url as string | undefined) ??
    (metadata.avatar as string | undefined) ??
    null;

  const phone = (metadata.phone as string | undefined) ?? null;
  const role =
    (metadata.role as string | undefined) ??
    (appMetadata.role as string | undefined) ??
    null;

  const isAdmin =
    Boolean(appMetadata.is_admin ?? metadata.is_admin ?? metadata.admin) ||
    role === "admin";

  return { fullName, avatarUrl, phone, role, isAdmin };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<MeResponse | { error: string }>
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

  const { fullName, avatarUrl, phone, role, isAdmin } = extractMetadata(session.user);

  const { data: client, error } = await supabaseAdmin
    .from("clients")
    .select("id, full_name, email, phone, client_profiles ( avatar_url, status )")
    .eq("auth_user_id", session.user.id)
    .maybeSingle();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const profile = client as ClientRow | null;

  return res.status(200).json({
    profile: {
      authUserId: session.user.id,
      clientId: profile?.id ?? null,
      fullName: profile?.full_name ?? fullName,
      email: profile?.email ?? session.user.email ?? null,
      phone: profile?.phone ?? phone,
      avatarUrl:
        profile?.client_profiles?.avatar_url ??
        avatarUrl,
      status: profile?.client_profiles?.status ?? null,
      role,
      isAdmin,
    },
  });
}
