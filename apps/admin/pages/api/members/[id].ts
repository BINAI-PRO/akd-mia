import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabase-admin";

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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "PATCH") {
    res.setHeader("Allow", "PATCH");
    return res.status(405).json({ error: "Metodo no permitido" });
  }

  const { id } = req.query;
  if (typeof id !== "string" || id.length === 0) {
    return res.status(400).json({ error: "ID de miembro invalido" });
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
    if (typeof fullName === "string" && fullName.trim().length > 0) {
      clientUpdates.full_name = fullName.trim();
    }
    if (email !== undefined) {
      clientUpdates.email = email && email.trim().length > 0 ? email.trim() : null;
    }
    if (phone !== undefined) {
      clientUpdates.phone = phone && phone.trim().length > 0 ? phone.trim() : null;
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
        return res.status(500).json({ error: "No se pudo recuperar la membresia del miembro" });
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
          return res.status(500).json({ error: "No se pudo actualizar la membresia" });
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
