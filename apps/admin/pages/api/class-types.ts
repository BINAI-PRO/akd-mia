import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminFeature } from "@/lib/api/require-admin-feature";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Metodo no permitido" });
  }

  const access = await requireAdminFeature(req, res, "classTypes", "FULL");
  if (!access) return;

  try {
    const { name, description, intensity, targetAudience } = req.body as {
      name?: string;
      description?: string | null;
      intensity?: string | null;
      targetAudience?: string | null;
    };

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "El nombre es obligatorio" });
    }

    const payload = {
      name: name.trim(),
      description: description?.trim() || null,
      intensity: intensity ?? null,
      target_audience: targetAudience?.trim() || null,
    };

    const { data, error } = await supabaseAdmin
      .from("class_types")
      .insert(payload)
      .select("id, name, description, intensity, target_audience")
      .single();

    if (error || !data) {
      throw error ?? new Error("No se pudo crear la clase");
    }

    return res.status(200).json({
      message: "Clase creada",
      classType: {
        id: data.id,
        name: data.name,
        description: data.description ?? null,
        intensity: data.intensity ?? null,
        targetAudience: data.target_audience ?? null,
        createdAt: null,
      },
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ error: error instanceof Error ? error.message : "No se pudo crear la clase" });
  }
}


