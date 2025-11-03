import type { NextApiRequest, NextApiResponse } from "next";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  ClientLinkConflictError,
  ensureClientForAuthUser,
} from "@/lib/resolve-client";
import type { Tables } from "@/types/database";
import { isRefreshTokenMissingError } from "@/lib/auth-errors";

type ClientRow = Tables<"clients"> & {
  client_profiles?: Pick<Tables<"client_profiles">, "avatar_url" | "status"> | null;
};

type StaffRow = {
  role_id: string | null;
  full_name: string | null;
  staff_roles: { slug: string | null } | null;
};

type PermissionRow = {
  admin_permissions: { code: string | null } | null;
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
    permissions: string[];
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
    if (isRefreshTokenMissingError(sessionError)) {
      await supabase.auth.signOut();
      return res.status(401).json({ error: "Not authenticated" });
    }
    return res.status(500).json({ error: sessionError.message });
  }

  if (!session?.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { fullName, avatarUrl, phone, role, isAdmin } = extractMetadata(session.user);

  let resolvedRole = role;
  let resolvedIsAdmin = isAdmin;
  let permissions: string[] = [];

  const { data: staffRow, error: staffError } = await supabaseAdmin
    .from("staff")
    .select("role_id, full_name, staff_roles ( slug )")
    .eq("auth_user_id", session.user.id)
    .maybeSingle<StaffRow>();

  if (staffError) {
    return res.status(500).json({ error: staffError.message });
  }

  let staffFullName: string | null = null;

  if (staffRow) {
    staffFullName = staffRow.full_name ?? null;
    const roleSlug =
      ((staffRow.staff_roles as { slug: string | null } | null)?.slug ?? null) ||
      null;
    if (roleSlug) {
      resolvedRole = roleSlug;
      if (roleSlug.toUpperCase() === "MASTER") {
        resolvedIsAdmin = true;
      }
    }

    if (staffRow.role_id) {
      const { data: permissionRows, error: permissionsError } = await supabaseAdmin
        .from("staff_role_permissions")
        .select("admin_permissions ( code )")
        .eq("role_id", staffRow.role_id)
        .returns<PermissionRow[]>();

      if (permissionsError) {
        return res.status(500).json({ error: permissionsError.message });
      }

      permissions =
        permissionRows?.map((entry) => {
          const record = entry.admin_permissions as { code: string | null } | null;
          return record?.code ?? null;
        }).filter((code): code is string => typeof code === "string") ?? [];
    }
  }

  const { data: client, error } = await supabaseAdmin
    .from("clients")
    .select("id, full_name, email, phone, client_profiles ( avatar_url, status )")
    .eq("auth_user_id", session.user.id)
    .maybeSingle();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  let profile = client as ClientRow | null;

  if (!profile) {
    try {
      const ensured = await ensureClientForAuthUser({
        authUserId: session.user.id,
        email: session.user.email ?? null,
        fullName,
        phone,
      });

      if (ensured?.id) {
        const {
          data: hydrated,
          error: hydrateError,
        } = await supabaseAdmin
          .from("clients")
          .select(
            "id, full_name, email, phone, client_profiles ( avatar_url, status )"
          )
          .eq("id", ensured.id)
          .maybeSingle();

        if (hydrateError) {
          return res.status(500).json({ error: hydrateError.message });
        }

        profile = hydrated as ClientRow | null;
      }
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

  const displayFullName =
    staffFullName ??
    profile?.full_name ??
    fullName;

  return res.status(200).json({
    profile: {
      authUserId: session.user.id,
      clientId: profile?.id ?? null,
      fullName: displayFullName,
      email: profile?.email ?? session.user.email ?? null,
      phone: profile?.phone ?? phone,
      avatarUrl:
        profile?.client_profiles?.avatar_url ??
        avatarUrl,
      status: profile?.client_profiles?.status ?? null,
      role: resolvedRole,
      isAdmin: resolvedIsAdmin,
      permissions,
    },
  });
}
