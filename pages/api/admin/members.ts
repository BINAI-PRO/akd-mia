import type { NextApiRequest, NextApiResponse } from "next";
import dayjs from "dayjs";
import { supabaseAdmin } from "@/lib/supabase-admin";

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
      membershipTypeId,
      profileStatus,
      notes,
    } = req.body as {
      fullName?: string;
      email?: string | null;
      phone?: string | null;
      membershipTypeId?: string;
      profileStatus?: string;
      notes?: string | null;
    };

    if (!fullName || !membershipTypeId) {
      return res.status(400).json({ error: "Nombre y plan son obligatorios" });
    }

    const { data: membershipType, error: membershipTypeError } = await supabaseAdmin
      .from("membership_types")
      .select("id, name, billing_period, class_quota, trial_days")
      .eq("id", membershipTypeId)
      .single();

    if (membershipTypeError || !membershipType) {
      console.error("/api/admin/members", membershipTypeError);
      return res.status(400).json({ error: "El plan seleccionado no existe" });
    }

    let clientId: string | null = null;
    const lookupFilters: Record<string, any>[] = [];
    if (email) lookupFilters.push({ column: "email", value: email });
    if (phone) lookupFilters.push({ column: "phone", value: phone });

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
          email: email ?? null,
          phone: phone ?? null,
        })
        .eq("id", clientId);
      if (updateClientError) {
        console.error("/api/admin/members", updateClientError);
        return res.status(500).json({ error: "No se pudo actualizar el miembro" });
      }
    } else {
      const { data: newClient, error: createClientError } = await supabaseAdmin
        .from("clients")
        .insert({
          full_name: fullName,
          email: email ?? null,
          phone: phone ?? null,
        })
        .select("id")
        .single();

      if (createClientError || !newClient) {
        console.error("/api/admin/members", createClientError);
        return res.status(500).json({ error: "No se pudo crear el miembro" });
      }

      clientId = newClient.id;
    }

    if (!clientId) {
      return res.status(500).json({ error: "No se pudo resolver el miembro" });
    }

    const statusValue = (profileStatus ?? "ACTIVE").toUpperCase();
    const { error: profileError } = await supabaseAdmin
      .from("client_profiles")
      .upsert({
        client_id: clientId,
        status: statusValue,
      }, { onConflict: "client_id" });

    if (profileError) {
      console.error("/api/admin/members", profileError);
      return res.status(500).json({ error: "No se pudo actualizar el perfil" });
    }

    const startDate = dayjs().format("YYYY-MM-DD");
    let endDate = startDate;

    if (membershipType.billing_period === "MONTHLY") {
      endDate = dayjs(startDate).add(1, "month").format("YYYY-MM-DD");
    } else if (membershipType.billing_period === "ANNUAL") {
      endDate = dayjs(startDate).add(1, "year").format("YYYY-MM-DD");
    }

    if (typeof membershipType.trial_days === "number" && membershipType.trial_days > 0) {
      endDate = dayjs(endDate).add(membershipType.trial_days, "day").format("YYYY-MM-DD");
    }

    const remainingClasses = membershipType.class_quota ?? null;

    const { data: membership, error: membershipError } = await supabaseAdmin
      .from("memberships")
      .insert({
        client_id: clientId,
        membership_type_id: membershipTypeId,
        status: "ACTIVE",
        start_date: startDate,
        end_date: endDate,
        next_billing_date: endDate,
        auto_renew: true,
        remaining_classes: remainingClasses,
        notes: notes ?? null,
      })
      .select("id")
      .single();

    if (membershipError || !membership) {
      console.error("/api/admin/members", membershipError);
      return res.status(500).json({ error: "No se pudo asignar la membresia" });
    }

    const { data: freshMember, error: fetchError } = await supabaseAdmin
      .from("clients")
      .select(`
        id,
        full_name,
        email,
        phone,
        created_at,
        client_profiles(status),
        memberships(
          id,
          status,
          next_billing_date,
          membership_types(name)
        )
      `)
      .eq("id", clientId)
      .single();

    if (fetchError || !freshMember) {
      console.error("/api/admin/members", fetchError);
      return res.status(500).json({ error: "No se pudo recuperar la informacion del miembro" });
    }

    return res.status(200).json({ member: freshMember });
  } catch (error: any) {
    console.error("/api/admin/members", error);
    return res.status(500).json({ error: error?.message ?? "Error inesperado" });
  }
}
