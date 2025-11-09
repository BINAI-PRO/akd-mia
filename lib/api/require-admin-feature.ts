import type { NextApiRequest, NextApiResponse } from "next";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getAccessLevelForRole,
  isAccessLevelSufficient,
  type AccessLevel,
  type AdminFeatureKey,
} from "@/lib/admin-access";

type StaffRoleRow = {
  id: string;
  staff_roles: {
    slug: string | null;
  } | null;
};

export type AdminApiContext = {
  authUserId: string;
  staffId: string;
  role: string | null;
  level: AccessLevel;
};

export async function requireAdminFeature(
  req: NextApiRequest,
  res: NextApiResponse,
  feature: AdminFeatureKey,
  minLevel: AccessLevel = "READ"
): Promise<AdminApiContext | null> {
  const supabase = createSupabaseServerClient({ req, res });
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session?.user) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }

  const { data: staffRow, error: staffError } = await supabaseAdmin
    .from("staff")
    .select("id, staff_roles ( slug )")
    .eq("auth_user_id", session.user.id)
    .maybeSingle<StaffRoleRow>();

  if (staffError) {
    res.status(500).json({ error: staffError.message });
    return null;
  }

  if (!staffRow) {
    res.status(403).json({ error: "Acceso restringido al personal autorizado" });
    return null;
  }

  const roleSlug = staffRow.staff_roles?.slug ?? null;
  const level = getAccessLevelForRole(roleSlug, feature);
  if (!isAccessLevelSufficient(level, minLevel)) {
    res.status(403).json({ error: "Tu rol no cuenta con permisos para esta acción." });
    return null;
  }

  return {
    authUserId: session.user.id,
    staffId: staffRow.id,
    role: roleSlug,
    level,
  };
}

