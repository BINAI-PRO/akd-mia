import type { NextApiRequest, NextApiResponse } from "next";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

type StaffRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  created_at: string | null;
  last_login_at: string | null;
  staff_roles: { slug: string | null; name: string | null } | null;
};

type RoleRow = { id: string; slug: string; name: string | null };

async function findAuthUserByEmail(normalizedEmail: string): Promise<User | null> {
  const perPage = 200;
  let page = 1;

  while (true) {
    const listResult = await supabaseAdmin.auth.admin.listUsers({ page, perPage });

    if (listResult.error) {
      throw listResult.error;
    }

    const match =
      listResult.data?.users?.find((user) => user.email?.toLowerCase() === normalizedEmail) ?? null;

    if (match) return match;

    const nextPage = listResult.data?.nextPage ?? null;
    const lastPage = listResult.data?.lastPage ?? null;

    if (!nextPage || nextPage === page || (lastPage !== null && page >= lastPage)) {
      break;
    }

    page = nextPage;
  }

  return null;
}

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

  try {
    const masterUserId = await assertMasterAccess(req, res);
    if (!masterUserId) return;

    const { email, fullName, roleSlug, phone } = req.body as {
      email?: string;
      fullName?: string;
      roleSlug?: string;
      phone?: string | null;
    };

    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "Email requerido" });
    }
    if (!fullName || typeof fullName !== "string") {
      return res.status(400).json({ error: "Nombre requerido" });
    }
    if (!roleSlug || typeof roleSlug !== "string") {
      return res.status(400).json({ error: "Rol requerido" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedSlug = roleSlug.trim().toUpperCase();

    const { data: role, error: roleError } = await supabaseAdmin
      .from("staff_roles")
      .select("id, slug, name")
      .eq("slug", normalizedSlug)
      .maybeSingle<RoleRow>();

    if (roleError) {
      return res.status(500).json({ error: roleError.message });
    }

    if (!role) {
      return res.status(404).json({ error: "Rol no encontrado" });
    }

    let authUserId: string | null = null;

    const existingLookup = await findAuthUserByEmail(normalizedEmail);

    if (existingLookup) {
      authUserId = existingLookup.id;
      await supabaseAdmin.auth.admin.updateUserById(authUserId, {
        user_metadata: { full_name: fullName },
      });
    } else {
      const inviteResponse = await supabaseAdmin.auth.admin.inviteUserByEmail(normalizedEmail, {
        data: { full_name: fullName },
      });

      if (inviteResponse.error || !inviteResponse.data?.user) {
        return res.status(500).json({
          error: inviteResponse.error?.message ?? "No se pudo invitar al usuario",
        });
      }
      authUserId = inviteResponse.data.user.id;
    }

    if (!authUserId) {
      return res.status(500).json({ error: "No se pudo resolver el usuario" });
    }

    const payload = {
      auth_user_id: authUserId,
      full_name: fullName.trim(),
      email: normalizedEmail,
      phone: phone ? String(phone).trim() : null,
      role_id: role.id,
      updated_at: new Date().toISOString(),
    };

    const { data: upserted, error: upsertError } = await supabaseAdmin
      .from("staff")
      .upsert(payload, { onConflict: "auth_user_id" })
      .select("id, full_name, email, phone, created_at, last_login_at, staff_roles ( slug, name )")
      .maybeSingle<StaffRow>();

    if (upsertError) {
      return res.status(500).json({ error: upsertError.message });
    }

    if (!upserted) {
      return res.status(500).json({ error: "No se pudo registrar al staff" });
    }

    return res.status(200).json({
      staff: {
        id: upserted.id,
        fullName: upserted.full_name,
        email: upserted.email,
        phone: upserted.phone,
        createdAt: upserted.created_at,
        lastLoginAt: upserted.last_login_at,
        roleSlug: upserted.staff_roles?.slug ?? role.slug,
        roleName: upserted.staff_roles?.name ?? role.name,
      },
    });
  } catch (error) {
    console.error("/api/staff/invite", error);
    const status =
      typeof error === "object" && error && "status" in error && typeof (error as { status?: number }).status === "number"
        ? ((error as { status?: number }).status ?? 500)
        : 500;
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
        ? error
        : "Error interno al procesar la invitación";
    return res.status(status).json({ error: message });
  }
}
