import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminFeature } from "@/lib/api/require-admin-feature";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const method = req.method ?? "";
  if (!["POST", "PATCH", "DELETE"].includes(method)) {
    res.setHeader("Allow", "POST, PATCH, DELETE");
    return res.status(405).json({ error: "Metodo no permitido" });
  }

  const requiredLevel = method === "DELETE" ? "FULL" : "EDIT";
  const access = await requireAdminFeature(req, res, "membershipTypes", requiredLevel);
  if (!access) return;

  if (req.method === "POST") {
    try {
      const {
        name,
        description,
        price,
        currency,
        privileges,
        allowMultiYear,
        maxPrepaidYears,
        isActive,
      } = req.body as {
        name?: string;
        description?: string | null;
        price?: string | number;
        currency?: string;
        privileges?: string | null;
        allowMultiYear?: boolean;
        maxPrepaidYears?: number | null;
        isActive?: boolean;
      };

      if (!name || price === undefined || price === null) {
        return res.status(400).json({ error: "Nombre y precio son obligatorios" });
      }

      const numericPrice = Number(price);
      if (!Number.isFinite(numericPrice) || numericPrice < 0) {
        return res.status(400).json({ error: "El precio debe ser un número válido" });
      }

      const parsedMaxYears =
        maxPrepaidYears === undefined || maxPrepaidYears === null
          ? null
          : Number(maxPrepaidYears);

      if (parsedMaxYears !== null && (!Number.isInteger(parsedMaxYears) || parsedMaxYears < 1)) {
        return res.status(400).json({ error: "El maximo de anios prepagados debe ser un entero positivo" });
      }

      const payload = {
        name: name.trim(),
        description: description?.trim() || null,
        billing_period: "ANNUAL",
        access_type: "OPEN_CLASS",
        price: numericPrice.toFixed(2),
        currency: (currency ?? "MXN").toUpperCase(),
        class_quota: null,
        trial_days: null,
        access_classes: false,
        access_courses: false,
        privileges: privileges?.trim() || null,
        allow_multi_year: allowMultiYear ?? true,
        max_prepaid_years: parsedMaxYears,
        is_active: isActive ?? true,
      };

      const { data, error } = await supabaseAdmin
        .from("membership_types")
        .insert(payload)
        .select("*")
        .single();

      if (error || !data) {
        console.error("/api/membership-annual-types", error);
        return res.status(500).json({ error: error?.message ?? "No se pudo crear el plan" });
      }

      return res.status(200).json({ membershipType: data });
    } catch (error: unknown) {
      console.error("/api/membership-annual-types", error);
      const message = error instanceof Error ? error.message : "Error inesperado";
      return res.status(500).json({ error: message });
    }
  }

  if (req.method === "PATCH") {
    try {
      const {
        id,
        name,
        description,
        price,
        currency,
        privileges,
        allowMultiYear,
        maxPrepaidYears,
        isActive,
      } = req.body as {
        id?: string;
        name?: string;
        description?: string | null;
        price?: string | number;
        currency?: string;
        privileges?: string | null;
        allowMultiYear?: boolean;
        maxPrepaidYears?: number | null;
        isActive?: boolean;
      };

      if (!id) {
        return res.status(400).json({ error: "El identificador del tipo es obligatorio" });
      }

      const updatePayload: Record<string, unknown> = {};

      if (typeof name === "string") updatePayload.name = name.trim();
      if (description !== undefined) updatePayload.description = description?.trim() || null;
      if (price !== undefined) {
        const numericPrice = Number(price);
        if (!Number.isFinite(numericPrice) || numericPrice < 0) {
          return res.status(400).json({ error: "El precio debe ser un número válido" });
        }
        updatePayload.price = numericPrice.toFixed(2);
      }
      if (currency !== undefined) updatePayload.currency = currency.toUpperCase();
      if (privileges !== undefined) updatePayload.privileges = privileges?.trim() || null;
      if (typeof allowMultiYear === "boolean") updatePayload.allow_multi_year = allowMultiYear;
      if (maxPrepaidYears !== undefined) {
        if (maxPrepaidYears === null) {
          updatePayload.max_prepaid_years = null;
        } else {
          const parsed = Number(maxPrepaidYears);
          if (!Number.isInteger(parsed) || parsed < 1) {
            return res.status(400).json({ error: "El maximo de anios debe ser un entero positivo" });
          }
          updatePayload.max_prepaid_years = parsed;
        }
      }
      if (typeof isActive === "boolean") updatePayload.is_active = isActive;

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
        console.error("/api/membership-annual-types", error);
        return res.status(500).json({ error: error?.message ?? "No se pudo actualizar el tipo" });
      }

      return res.status(200).json({ membershipType: data });
    } catch (error: unknown) {
      console.error("/api/membership-annual-types", error);
      const message = error instanceof Error ? error.message : "Error inesperado";
      return res.status(500).json({ error: message });
    }
  }

  if (req.method === "DELETE") {
    try {
      const { id } = req.body as { id?: string };
      if (!id) {
        return res.status(400).json({ error: "El identificador del tipo es obligatorio" });
      }

      const { error } = await supabaseAdmin.from("membership_types").delete().eq("id", id);

      if (error) {
        if (error.code === "23503") {
          return res.status(400).json({
            error: "No puedes eliminar esta membresía porque tiene registros asociados",
          });
        }
        console.error("/api/membership-annual-types DELETE", error);
        return res.status(500).json({ error: "No se pudo eliminar la membresía" });
      }

      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error("/api/membership-annual-types DELETE", error);
      const message = error instanceof Error ? error.message : "Error inesperado";
      return res.status(500).json({ error: message });
    }
  }

  return res.status(405).json({ error: "Metodo no permitido" });
}
