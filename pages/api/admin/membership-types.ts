import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabase-admin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "POST") {
    try {
      const {
        name,
        description,
        billingPeriod,
        price,
        currency,
        classQuota,
        trialDays,
        accessClasses,
        accessCourses,
        accessType,
        isActive,
      } = req.body as {
        name?: string;
        description?: string;
        billingPeriod?: string;
        price?: string | number;
        currency?: string;
        classQuota?: number | null;
        trialDays?: number | null;
        accessClasses?: boolean;
        accessCourses?: boolean;
        accessType?: string;
        isActive?: boolean;
      };

      if (!name || !billingPeriod || !price) {
        return res.status(400).json({ error: "Nombre, periodo de cobro y precio son obligatorios" });
      }

      const numericPrice = Number(price);
      if (!Number.isFinite(numericPrice) || numericPrice < 0) {
        return res.status(400).json({ error: "El precio debe ser un numero valido" });
      }

      const payload = {
        name: name.trim(),
        description: description ?? null,
        billing_period: (billingPeriod ?? "MONTHLY").toUpperCase(),
        access_type: (accessType ?? "OPEN_CLASS").toUpperCase(),
        price: numericPrice.toFixed(2),
        currency: (currency ?? "MXN").toUpperCase(),
        class_quota: classQuota ?? null,
        trial_days: trialDays ?? null,
        access_classes: accessClasses ?? true,
        access_courses: accessCourses ?? false,
        is_active: isActive ?? true,
      };

      const { data, error } = await supabaseAdmin
        .from("membership_types")
        .insert(payload)
        .select("*")
        .single();

      if (error || !data) {
        console.error("/api/admin/membership-types", error);
        return res.status(500).json({ error: error?.message ?? "No se pudo crear el plan" });
      }

      return res.status(200).json({ membershipType: data });
    } catch (error: any) {
      console.error("/api/admin/membership-types", error);
      return res.status(500).json({ error: error?.message ?? "Error inesperado" });
    }
  }

  if (req.method === "PATCH") {
    try {
      const { id, isActive, description, accessClasses, accessCourses, classQuota, trialDays } = req.body as {
        id?: string;
        isActive?: boolean;
        description?: string | null;
        accessClasses?: boolean;
        accessCourses?: boolean;
        classQuota?: number | null;
        trialDays?: number | null;
      };

      if (!id) {
        return res.status(400).json({ error: "El identificador del plan es obligatorio" });
      }

      const updatePayload: Record<string, any> = {};

      if (typeof isActive === "boolean") updatePayload.is_active = isActive;
      if (description !== undefined) updatePayload.description = description;
      if (accessClasses !== undefined) updatePayload.access_classes = accessClasses;
      if (accessCourses !== undefined) updatePayload.access_courses = accessCourses;
      if (classQuota !== undefined) updatePayload.class_quota = classQuota;
      if (trialDays !== undefined) updatePayload.trial_days = trialDays;

      if (Object.keys(updatePayload).length === 0) {
        return res.status(400).json({ error: "No se recibieron cambios" });
      }

      const { data, error } = await supabaseAdmin
        .from("membership_types")
        .update(updatePayload)
        .eq("id", id)
        .select("*")
        .single();

      if (error || !data) {
        console.error("/api/admin/membership-types", error);
        return res.status(500).json({ error: error?.message ?? "No se pudo actualizar el plan" });
      }

      return res.status(200).json({ membershipType: data });
    } catch (error: any) {
      console.error("/api/admin/membership-types", error);
      return res.status(500).json({ error: error?.message ?? "Error inesperado" });
    }
  }

  res.setHeader("Allow", "POST, PATCH");
  return res.status(405).json({ error: "Metodo no permitido" });
}
