import type { NextApiRequest, NextApiResponse } from "next";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

type StaffRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  staff_roles: { slug: string | null; name: string | null } | null;
};

async function assertMasterAccess(req: NextApiRequest, res: NextApiResponse) {
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
    .select("staff_roles ( slug )")
    .eq("auth_user_id", session.user.id)
    .maybeSingle<{ staff_roles: { slug: string | null } | null }>();

  if (staffError) {
    res.status(500).json({ error: staffError.message });
    return null;
  }

  const slug = staffRow?.staff_roles?.slug ?? null;
  if (!slug || slug.toUpperCase() !== "MASTER") {
    res.status(403).json({ error: "Solo un usuario MASTER puede realizar esta acción" });
    return null;
  }

  return session.user.id;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Metodo no permitido" });
  }

  const masterUserId = await assertMasterAccess(req, res);
  if (!masterUserId) return;

  const { staffId, roleSlug } = req.body as { staffId?: string; roleSlug?: string };
  if (!staffId || typeof staffId !== "string" || !roleSlug || typeof roleSlug !== "string") {
    return res.status(400).json({ error: "Parametros incompletos" });
  }

  const normalizedSlug = roleSlug.trim().toUpperCase();

  const { data: role, error: roleError } = await supabaseAdmin
    .from("staff_roles")
    .select("id, slug, name")
    .eq("slug", normalizedSlug)
    .maybeSingle<{ id: string; slug: string; name: string | null }>();

  if (roleError) {
    return res.status(500).json({ error: roleError.message });
  }

  if (!role) {
    return res.status(404).json({ error: "Rol no encontrado" });
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("staff")
    .update({ role_id: role.id, updated_at: new Date().toISOString() })
    .eq("id", staffId)
    .select("id, full_name, email, phone, staff_roles ( slug, name )")
    .maybeSingle<StaffRow>();

  if (updateError) {
    return res.status(500).json({ error: updateError.message });
  }

  if (!updated) {
    return res.status(404).json({ error: "Miembro del staff no encontrado" });
  }

  return res.status(200).json({
    staff: {
      id: updated.id,
      fullName: updated.full_name,
      email: updated.email,
      phone: updated.phone,
      roleSlug: updated.staff_roles?.slug ?? role.slug,
      roleName: updated.staff_roles?.name ?? role.name,
    },
  });
}
