import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { loadStudioSettings } from "@/lib/studio-settings";
import { normalizePhoneInput } from "@/lib/phone";
import { ensureClientAppAccess } from "@/lib/supabase-client-auth";

type LookupFilter = { column: "email" | "phone"; value: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Metodo no permitido" });
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
      phoneCountryIso,
      customDialCode,
      createAuthUser,
      authPassword,
    } = req.body as {
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
      phoneCountryIso?: string | null;
      customDialCode?: string | null;
      createAuthUser?: boolean;
      authPassword?: string | null;
    };

    if (!fullName) {
      return res.status(400).json({ error: "El nombre del miembro es obligatorio" });
    }

    const settings = await loadStudioSettings();
    const normalizedPhone = normalizePhoneInput(phone ?? "", {
      countryIso: phoneCountryIso ?? settings.phoneCountry,
      customDialCode,
      fallbackCountry: settings.phoneCountry,
    });
    if (!normalizedPhone.ok) {
      return res.status(400).json({ error: normalizedPhone.error });
    }
    const normalizedPhoneValue = normalizedPhone.value;
    const trimmedEmail = email?.trim() ?? null;

    let clientId: string | null = null;
    const lookupFilters: LookupFilter[] = [];
    if (trimmedEmail) lookupFilters.push({ column: "email", value: trimmedEmail });
    lookupFilters.push({ column: "phone", value: normalizedPhoneValue });

    if (lookupFilters.length > 0) {
      for (const filter of lookupFilters) {
        const { data } = await supabaseAdmin
          .from("clients")
          .select("id")
          .eq(filter.column, filter.value)
          .maybeSingle();
        if (data?.id) {
          clientId = data.id;
          break;
        }
      }
    }

    if (clientId) {
      const { error: updateClientError } = await supabaseAdmin
        .from("clients")
        .update({
          full_name: fullName,
          email: trimmedEmail,
          phone: normalizedPhoneValue,
        })
        .eq("id", clientId);
      if (updateClientError) {
        console.error("/api/members", updateClientError);
        return res.status(500).json({ error: "No se pudo actualizar el miembro" });
      }
    } else {
      const { data: newClient, error: createClientError } = await supabaseAdmin
        .from("clients")
        .insert({
          full_name: fullName,
          email: trimmedEmail,
          phone: normalizedPhoneValue,
        })
        .select("id")
        .single();

      if (createClientError || !newClient) {
        console.error("/api/members", createClientError);
        return res.status(500).json({ error: "No se pudo crear el miembro" });
      }

      clientId = newClient.id;
    }

    if (!clientId) {
      return res.status(500).json({ error: "No se pudo resolver el miembro" });
    }

    const { data: clientRecord, error: clientRecordError } = await supabaseAdmin
      .from("clients")
      .select("auth_user_id")
      .eq("id", clientId)
      .maybeSingle<{ auth_user_id: string | null }>();

    if (clientRecordError) {
      console.error("/api/members client lookup", clientRecordError);
      return res.status(500).json({ error: "No se pudo consultar el miembro" });
    }

    const shouldCreateAuthUser = Boolean(createAuthUser);
    if (shouldCreateAuthUser) {
      if (!trimmedEmail) {
        return res.status(400).json({ error: "El correo es obligatorio para crear el acceso" });
      }
      if (typeof authPassword !== "string" || authPassword.length < 8) {
        return res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres" });
      }
      try {
        await ensureClientAppAccess({
          clientId,
          email: trimmedEmail,
          password: authPassword,
          fullName,
          phone: normalizedPhoneValue,
          existingAuthUserId: clientRecord?.auth_user_id ?? null,
        });
      } catch (authError) {
        const message =
          authError instanceof Error ? authError.message : "No se pudo crear el acceso a la app";
        return res.status(400).json({ error: message });
      }
    }

    const statusValue = (profileStatus ?? "ON_HOLD").toUpperCase();
    const { error: profileError } = await supabaseAdmin
      .from("client_profiles")
      .upsert({
        client_id: clientId,
        status: statusValue,
        avatar_url: avatarUrl?.trim() || null,
        birthdate: birthdate?.trim() || null,
        occupation: occupation?.trim() || null,
        notes: profileNotes?.trim() || null,
        emergency_contact_name: emergencyContactName?.trim() || null,
        emergency_contact_phone: emergencyContactPhone?.trim() || null,
        preferred_apparatus:
          Array.isArray(preferredApparatus) && preferredApparatus.length > 0
            ? preferredApparatus
                .map((item) => (typeof item === "string" ? item.trim() : ""))
                .filter((item) => item.length > 0)
            : [],
      }, { onConflict: "client_id" });

    if (profileError) {
      console.error("/api/members", profileError);
      return res.status(500).json({ error: "No se pudo actualizar el perfil" });
    }

    const { data: freshMember, error: fetchError } = await supabaseAdmin
      .from("clients")
      .select(`
        id,
        full_name,
        email,
        phone,
        created_at,
        auth_user_id,
        client_profiles(status),
        memberships(
          id,
          status,
          start_date,
          end_date,
          next_billing_date,
          membership_types(name),
          membership_payments(amount, currency, paid_at, period_start, period_end, period_years)
        ),
        plan_purchases(
          id,
          status,
          initial_classes,
          remaining_classes,
          start_date,
          expires_at,
          plan_types(name)
        )
      `)
      .eq("id", clientId)
      .single();

    if (fetchError || !freshMember) {
      console.error("/api/members", fetchError);
      return res.status(500).json({ error: "No se pudo recuperar la informacion del miembro" });
    }

    return res.status(200).json({ member: freshMember });
  } catch (error: unknown) {
    console.error("/api/members", error);
    const message = error instanceof Error ? error.message : "Error inesperado";
    return res.status(500).json({ error: message });
  }
}

