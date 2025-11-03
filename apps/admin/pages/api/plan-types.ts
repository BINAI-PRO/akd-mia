import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabase-admin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "POST") {
    try {
      const {
        name,
        description,
        price,
        currency,
        classCount,
        validityDays,
        privileges,
        isActive,
        category,
        appOnly,
      } = req.body as {
        name?: string;
        description?: string | null;
        price?: string | number;
        currency?: string;
        classCount?: number | string | null;
        validityDays?: number | string | null;
        privileges?: string | null;
        isActive?: boolean;
        category?: string;
        appOnly?: boolean;
      };

      if (!name) {
        return res.status(400).json({ error: "El nombre es obligatorio" });
      }

      const numericPrice = price === undefined || price === null || price === "" ? 0 : Number(price);
      if (!Number.isFinite(numericPrice) || numericPrice < 0) {
        return res.status(400).json({ error: "El precio debe ser un numero valido" });
      }

      let numericClassCount: number | null = null;
      if (classCount !== undefined && classCount !== null && classCount !== "") {
        numericClassCount = Number(classCount);
        if (!Number.isInteger(numericClassCount) || numericClassCount <= 0) {
          return res.status(400).json({ error: "Las sesiones deben ser un entero positivo o puedes dejarlo vacio para plan ilimitado" });
        }
      }

      let numericValidityDays: number | null = null;
      if (validityDays !== undefined && validityDays !== null && validityDays !== "") {
        const candidate = Number(validityDays);
        if (!Number.isInteger(candidate) || candidate <= 0) {
          return res.status(400).json({ error: "La vigencia debe ser un entero positivo" });
        }
        numericValidityDays = candidate;
      }

      const normalizedCategory = category?.trim();
      if (!normalizedCategory) {
        return res.status(400).json({ error: "Debes seleccionar una categoria" });
      }

      const payload = {
        name: name.trim(),
        description: description?.trim() || null,
        price: numericPrice,
        currency: (currency ?? "MXN").toUpperCase(),
        class_count: numericClassCount,
        validity_days: numericValidityDays,
        privileges: privileges?.trim() || null,
        is_active: isActive ?? true,
        category: normalizedCategory,
        app_only: appOnly ?? false,
      };

      const { data, error } = await supabaseAdmin.from("plan_types").insert(payload).select("*").single();

      if (error || !data) {
        console.error("/api/plan-types", error);
        return res.status(500).json({ error: error?.message ?? "No se pudo crear el plan" });
      }

      return res.status(200).json({ planType: data });
    } catch (error) {
      console.error("/api/plan-types", error);
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
        classCount,
        validityDays,
        privileges,
        isActive,
        category,
        appOnly,
      } = req.body as {
        id?: string;
        name?: string;
        description?: string | null;
        price?: string | number;
        currency?: string;
        classCount?: number | string | null;
        validityDays?: number | string | null;
        privileges?: string | null;
        isActive?: boolean;
        category?: string;
        appOnly?: boolean;
      };

      if (!id) {
        return res.status(400).json({ error: "El identificador del plan es obligatorio" });
      }

      const updatePayload: Record<string, unknown> = {};

      if (name !== undefined) {
        const trimmed = name.trim();
        if (!trimmed) return res.status(400).json({ error: "El nombre no puede estar vacio" });
        updatePayload.name = trimmed;
      }

      if (description !== undefined) {
        updatePayload.description = description?.trim() || null;
      }

      if (price !== undefined) {
        const numericPrice = price === "" || price === null ? 0 : Number(price);
        if (!Number.isFinite(numericPrice) || numericPrice < 0) {
          return res.status(400).json({ error: "El precio debe ser un numero valido" });
        }
        updatePayload.price = numericPrice;
      }

      if (currency !== undefined) {
        const trimmed = currency.trim();
        if (!trimmed) return res.status(400).json({ error: "La moneda no puede estar vacia" });
        updatePayload.currency = trimmed.toUpperCase();
      }

      if (classCount !== undefined) {
        if (classCount === "" || classCount === null) {
          updatePayload.class_count = null;
        } else {
          const numericClassCount = Number(classCount);
          if (!Number.isInteger(numericClassCount) || numericClassCount <= 0) {
            return res.status(400).json({ error: "Las sesiones deben ser un entero positivo" });
          }
          updatePayload.class_count = numericClassCount;
        }
      }

      if (validityDays !== undefined) {
        if (validityDays === "" || validityDays === null) {
          updatePayload.validity_days = null;
        } else {
          const numericValidityDays = Number(validityDays);
          if (!Number.isInteger(numericValidityDays) || numericValidityDays <= 0) {
            return res.status(400).json({ error: "La vigencia debe ser un entero positivo" });
          }
          updatePayload.validity_days = numericValidityDays;
        }
      }

      if (privileges !== undefined) {
        updatePayload.privileges = privileges?.trim() || null;
      }

      if (category !== undefined) {
        const normalizedCategory = category?.trim();
        if (!normalizedCategory) {
          return res.status(400).json({ error: "Debes seleccionar una categoria" });
        }
        updatePayload.category = normalizedCategory;
      }

      if (typeof isActive === "boolean") {
        updatePayload.is_active = isActive;
      }

      if (typeof appOnly === "boolean") {
        updatePayload.app_only = appOnly;
      }

      if (Object.keys(updatePayload).length === 0) {
        return res.status(400).json({ error: "No se recibieron cambios" });
      }

      const { data, error } = await supabaseAdmin
        .from("plan_types")
        .update(updatePayload)
        .eq("id", id)
        .select("*")
        .single();

      if (error || !data) {
        console.error("/api/plan-types", error);
        return res.status(500).json({ error: error?.message ?? "No se pudo actualizar el plan" });
      }

      return res.status(200).json({ planType: data });
    } catch (error) {
      console.error("/api/plan-types", error);
      const message = error instanceof Error ? error.message : "Error inesperado";
      return res.status(500).json({ error: message });
    }
  }

  res.setHeader("Allow", "POST, PATCH");
  return res.status(405).json({ error: "Metodo no permitido" });
}
