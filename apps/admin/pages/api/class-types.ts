import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminFeature } from "@/lib/api/require-admin-feature";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!["POST", "PATCH", "DELETE"].includes(req.method ?? "")) {
    res.setHeader("Allow", "POST, PATCH, DELETE");
    return res.status(405).json({ error: "Metodo no permitido" });
  }

  try {
    if (req.method === "POST") {
      const access = await requireAdminFeature(req, res, "classTypes", "EDIT");
      if (!access) return;
      return await handleCreate(req, res);
    }

    if (req.method === "PATCH") {
      const access = await requireAdminFeature(req, res, "classTypes", "EDIT");
      if (!access) return;
      return await handleUpdate(req, res);
    }

    if (req.method === "DELETE") {
      const access = await requireAdminFeature(req, res, "classTypes", "FULL");
      if (!access) return;
      return await handleDelete(req, res);
    }
  } catch (error) {
    console.error("[api/class-types]", error);
    const message = error instanceof Error ? error.message : "Error interno";
    return res.status(500).json({ error: message });
  }
}

async function handleCreate(req: NextApiRequest, res: NextApiResponse) {
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
    classType: mapRow(data),
  });
}

async function handleUpdate(req: NextApiRequest, res: NextApiResponse) {
  const { id, name, description, intensity, targetAudience } = req.body as {
    id?: string;
    name?: string;
    description?: string | null;
    intensity?: string | null;
    targetAudience?: string | null;
  };

  if (!id || typeof id !== "string") {
    return res.status(400).json({ error: "Falta el id de la clase" });
  }
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
    .update(payload)
    .eq("id", id)
    .select("id, name, description, intensity, target_audience")
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return res.status(404).json({ error: "Clase no encontrada" });
  }

  return res.status(200).json({
    message: "Clase actualizada",
    classType: mapRow(data),
  });
}

async function handleDelete(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.body as { id?: string };
  if (!id || typeof id !== "string") {
    return res.status(400).json({ error: "Falta el id de la clase" });
  }

  const { error } = await supabaseAdmin.from("class_types").delete().eq("id", id);
  if (error) {
    throw error;
  }

  return res.status(200).json({ message: "Clase eliminada", id });
}

function mapRow(data: {
  id: string;
  name: string;
  description: string | null;
  intensity: string | null;
  target_audience: string | null;
}) {
  return {
    id: data.id,
    name: data.name,
    description: data.description ?? null,
    intensity: data.intensity ?? null,
    targetAudience: data.target_audience ?? null,
    createdAt: null,
  };
}
