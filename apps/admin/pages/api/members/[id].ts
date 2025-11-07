import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { loadStudioSettings } from "@/lib/studio-settings";
import { normalizePhoneInput } from "@/lib/phone";
import type { Tables } from "@/types/database";

type UpdatePayload = {
  fullName?: string;
  email?: string | null;
  phone?: string | null;
  profileStatus?: string;
  avatarUrl?: string | null;
  birthdate?: string | null;
  occupation?: string | null;
  profileNotes?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  preferredApparatus?: string[] | null;
  membershipNotes?: string | null;
};

async function assertMasterAccess(req: NextApiRequest, res: NextApiResponse): Promise<string | null> {
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

type MemberSnapshotRow = Tables<"clients"> & {
  client_profiles: Pick<Tables<"client_profiles">, "status"> | null;
  memberships: Array<
    Tables<"memberships"> & {
      membership_types: Pick<Tables<"membership_types">, "name" | "privileges"> | null;
      membership_payments: Pick<
        Tables<"membership_payments">,
        "amount" | "currency" | "paid_at" | "period_start" | "period_end" | "period_years"
      >[];
    }
  > | null;
  plan_purchases: Array<
    Tables<"plan_purchases"> & {
      plan_types: Pick<Tables<"plan_types">, "name" | "privileges"> | null;
    }
  > | null;
};

async function fetchMemberSnapshot(clientId: string): Promise<MemberSnapshotRow | null> {
  const { data, error } = await supabaseAdmin
    .from("clients")
    .select(
      `
        id,
        full_name,
        email,
        phone,
        created_at,
        client_profiles ( status ),
        memberships (
          id,
          status,
          start_date,
          end_date,
          next_billing_date,
          privileges_snapshot,
          membership_type_id,
          membership_types ( name, privileges ),
          membership_payments ( amount, currency, paid_at, period_start, period_end, period_years )
        ),
        plan_purchases (
          id,
          status,
          start_date,
          expires_at,
          initial_classes,
          remaining_classes,
          modality,
          plan_types ( name, privileges )
        )
      `
    )
    .eq("id", clientId)
    .maybeSingle<MemberSnapshotRow>();

  if (error) {
    console.error("/api/members/[id] snapshot", error);
    throw new Error("No se pudo cargar el miembro solicitado");
  }

  return data ?? null;
}

async function handleDeleteMemberRequest(
  req: NextApiRequest,
  res: NextApiResponse,
  clientId: string
) {
  const masterUserId = await assertMasterAccess(req, res);
  if (!masterUserId) return;

  const { count: bookingCount, error: bookingError } = await supabaseAdmin
    .from("bookings")
    .select("id", { head: true, count: "exact" })
    .eq("client_id", clientId);

  if (bookingError) {
    console.error("/api/members/[id] delete bookings check", bookingError);
    return res.status(500).json({ error: "No se pudo verificar las reservas del miembro" });
  }

  if ((bookingCount ?? 0) > 0) {
    return res.status(400).json({
      error: "El miembro tiene reservas registradas. Cancela o reasigna esas reservas antes de eliminarlo.",
    });
  }

  const { error: planDeleteError } = await supabaseAdmin
    .from("plan_purchases")
    .delete()
    .eq("client_id", clientId);

  if (planDeleteError) {
    console.error("/api/members/[id] delete plan_purchases", planDeleteError);
    return res.status(500).json({ error: "No se pudo limpiar los planes del miembro" });
  }

  const { error: membershipsDeleteError } = await supabaseAdmin
    .from("memberships")
    .delete()
    .eq("client_id", clientId);

  if (membershipsDeleteError) {
    console.error("/api/members/[id] delete memberships", membershipsDeleteError);
    return res.status(500).json({ error: "No se pudo limpiar las membresías del miembro" });
  }

  await supabaseAdmin.from("client_profiles").delete().eq("client_id", clientId);

  const { error: clientDeleteError } = await supabaseAdmin
    .from("clients")
    .delete()
    .eq("id", clientId);

  if (clientDeleteError) {
    console.error("/api/members/[id] delete client", clientDeleteError);
    const message =
      clientDeleteError.code === "23503"
        ? "No se pudo eliminar al miembro porque tiene registros relacionados"
        : clientDeleteError.message ?? "No se pudo eliminar al miembro";
    return res.status(500).json({ error: message });
  }

  return res.status(200).json({ success: true });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  if (typeof id !== "string" || id.length === 0) {
    return res.status(400).json({ error: "ID de miembro invalido" });
  }

  if (req.method === "GET") {
    try {
      const member = await fetchMemberSnapshot(id);
      if (!member) {
        return res.status(404).json({ error: "Miembro no encontrado" });
      }
      return res.status(200).json({ member });
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo obtener la información del miembro";
      return res.status(500).json({ error: message });
    }
  }

  if (req.method !== "PATCH" && req.method !== "DELETE") {
    res.setHeader("Allow", "GET,PATCH,DELETE");
    return res.status(405).json({ error: "Metodo no permitido" });
  }

  if (req.method === "DELETE") {
    await handleDeleteMemberRequest(req, res, id);
    return;
  }

  try {
    const {
      fullName,
      email,
      phone,
      profileStatus,
      avatarUrl,
      birthdate,
      occupation,
      profileNotes,
      emergencyContactName,
      emergencyContactPhone,
      preferredApparatus,
      membershipNotes,
    } = req.body as UpdatePayload;

    const clientUpdates: Record<string, unknown> = {};
    const settings = await loadStudioSettings();
    let normalizedPhone: string | null | undefined = undefined;
    if (phone !== undefined) {
      if (!phone) {
        return res.status(400).json({ error: "El número telefónico es obligatorio" });
      }
      const result = normalizePhoneInput(phone, settings.phoneCountry);
      if (!result.ok) {
        return res.status(400).json({ error: result.error });
      }
      normalizedPhone = result.value;
    }

    if (typeof fullName === "string" && fullName.trim().length > 0) {
      clientUpdates.full_name = fullName.trim();
    }
    if (email !== undefined) {
      clientUpdates.email = email && email.trim().length > 0 ? email.trim() : null;
    }
    if (normalizedPhone !== undefined) {
      clientUpdates.phone = normalizedPhone;
    }

    if (Object.keys(clientUpdates).length > 0) {
      const { error: clientError } = await supabaseAdmin
        .from("clients")
        .update(clientUpdates)
        .eq("id", id);

      if (clientError) {
        console.error("/api/members/[id] client update", clientError);
        return res.status(500).json({ error: "No se pudo actualizar los datos del miembro" });
      }
    }

    const { data: existingProfile, error: profileLookupError } = await supabaseAdmin
      .from("client_profiles")
      .select(
        "status, avatar_url, birthdate, occupation, notes, emergency_contact_name, emergency_contact_phone, preferred_apparatus"
      )
      .eq("client_id", id)
      .maybeSingle();

    if (profileLookupError) {
      console.error("/api/members/[id] profile lookup", profileLookupError);
      return res.status(500).json({ error: "No se pudo recuperar el perfil del miembro" });
    }

    const normalizedApparatus =
      Array.isArray(preferredApparatus) && preferredApparatus.length > 0
        ? preferredApparatus
            .map((item) => (typeof item === "string" ? item.trim() : ""))
            .filter((item) => item.length > 0)
        : existingProfile?.preferred_apparatus ?? [];

    const profilePayload = {
      client_id: id,
      status: (profileStatus ?? existingProfile?.status ?? "ACTIVE").toUpperCase(),
      avatar_url:
        avatarUrl !== undefined
          ? avatarUrl && avatarUrl.trim().length > 0
            ? avatarUrl.trim()
            : null
          : existingProfile?.avatar_url ?? null,
      birthdate:
        birthdate !== undefined ? (birthdate && birthdate.trim().length > 0 ? birthdate.trim() : null) : existingProfile?.birthdate ?? null,
      occupation:
        occupation !== undefined
          ? occupation && occupation.trim().length > 0
            ? occupation.trim()
            : null
          : existingProfile?.occupation ?? null,
      notes:
        profileNotes !== undefined
          ? profileNotes && profileNotes.trim().length > 0
            ? profileNotes.trim()
            : null
          : existingProfile?.notes ?? null,
      emergency_contact_name:
        emergencyContactName !== undefined
          ? emergencyContactName && emergencyContactName.trim().length > 0
            ? emergencyContactName.trim()
            : null
          : existingProfile?.emergency_contact_name ?? null,
      emergency_contact_phone:
        emergencyContactPhone !== undefined
          ? emergencyContactPhone && emergencyContactPhone.trim().length > 0
            ? emergencyContactPhone.trim()
            : null
          : existingProfile?.emergency_contact_phone ?? null,
      preferred_apparatus: normalizedApparatus,
    };

    const { error: profileError } = await supabaseAdmin
      .from("client_profiles")
      .upsert(profilePayload, { onConflict: "client_id" });

    if (profileError) {
      console.error("/api/members/[id] profile upsert", profileError);
      return res.status(500).json({ error: "No se pudo actualizar el perfil del miembro" });
    }

    if (membershipNotes !== undefined) {
      const { data: latestMembership, error: membershipLookupError } = await supabaseAdmin
        .from("memberships")
        .select("id")
        .eq("client_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (membershipLookupError) {
        console.error("/api/members/[id] membership lookup", membershipLookupError);
        return res.status(500).json({ error: "No se pudo recuperar la membresía del miembro" });
      }

      if (latestMembership?.id) {
        const { error: membershipUpdateError } = await supabaseAdmin
          .from("memberships")
          .update({
            notes:
              membershipNotes && membershipNotes.trim().length > 0 ? membershipNotes.trim() : null,
          })
          .eq("id", latestMembership.id);

        if (membershipUpdateError) {
          console.error("/api/members/[id] membership update", membershipUpdateError);
          return res.status(500).json({ error: "No se pudo actualizar la membresía" });
        }
      }
    }

    const { data: freshMember, error: fetchError } = await supabaseAdmin
      .from("clients")
      .select(`
        id,
        full_name,
        email,
        phone,
        created_at,
        client_profiles(
          status,
          avatar_url,
          birthdate,
          occupation,
          notes,
          emergency_contact_name,
          emergency_contact_phone,
          preferred_apparatus
        ),
        memberships(
          id,
          status,
          start_date,
          end_date,
          next_billing_date,
          notes,
          term_years,
          privileges_snapshot,
          membership_types(name, privileges),
          membership_payments(amount, currency, paid_at, period_start, period_end, period_years)
        ),
        plan_purchases(
          id,
          status,
          start_date,
          expires_at,
          initial_classes,
          remaining_classes,
          plan_types(name, privileges)
        )
      `)
      .eq("id", id)
      .single();

    if (fetchError || !freshMember) {
      console.error("/api/members/[id] fetch", fetchError);
      return res.status(500).json({ error: "No se pudo recuperar la informacion del miembro" });
    }

    return res.status(200).json({ member: freshMember });
  } catch (error) {
    console.error("/api/members/[id] PATCH", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return res.status(500).json({ error: message });
  }
}
