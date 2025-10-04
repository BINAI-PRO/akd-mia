import type { NextApiRequest, NextApiResponse } from "next";
import dayjs from "dayjs";
import { supabaseAdmin } from "@/lib/supabase-admin";

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "POST") {
    try {
      const {
        title,
        description,
        shortDescription,
        price,
        currency,
        durationLabel,
        level,
        category,
        visibility,
        status,
        tags,
        coverImageUrl,
      } = req.body as {
        title?: string;
        description?: string;
        shortDescription?: string;
        price?: string | number | null;
        currency?: string;
        durationLabel?: string;
        level?: string;
        category?: string;
        visibility?: string;
        status?: string;
        tags?: string[];
        coverImageUrl?: string;
      };

      if (!title || title.trim().length === 0) {
        return res.status(400).json({ error: "El nombre del curso es obligatorio" });
      }

      const parsedPrice = price === null || price === undefined || price === ""
        ? null
        : Number(price);
      if (parsedPrice !== null && !Number.isFinite(parsedPrice)) {
        return res.status(400).json({ error: "El precio no es v�lido" });
      }

      const payload = {
        title: title.trim(),
        slug: slugify(title),
        description: description ?? null,
        short_description: shortDescription ?? null,
        price: parsedPrice !== null ? parsedPrice.toFixed(2) : null,
        currency: (currency ?? "MXN").toUpperCase(),
        duration_label: durationLabel ?? null,
        level: level ?? null,
        category: category ?? null,
        visibility: (visibility ?? "PUBLIC").toUpperCase(),
        status: (status ?? "DRAFT").toUpperCase(),
        tags: Array.isArray(tags)
          ? tags.filter(Boolean).map((tag) => tag.trim()).filter((tag) => tag.length > 0)
          : [],
        cover_image_url: coverImageUrl ?? null,
      };

      const { data, error } = await supabaseAdmin
        .from("courses")
        .insert(payload)
        .select("*")
        .single();

      if (error || !data) {
        console.error("/api/admin/courses", error);
        return res.status(500).json({ error: error?.message ?? "No se pudo crear el curso" });
      }

      return res.status(200).json({
        course: data,
        createdAt: dayjs(data.created_at).toISOString(),
      });
    } catch (error: any) {
      console.error("/api/admin/courses", error);
      return res.status(500).json({ error: error?.message ?? "Error inesperado" });
    }
  }

  if (req.method === "GET") {
    try {
      const { data, error } = await supabaseAdmin
        .from("courses")
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) {
        throw error;
      }

      return res.status(200).json({ courses: data ?? [] });
    } catch (error: any) {
      console.error("/api/admin/courses", error);
      return res.status(500).json({ error: error?.message ?? "No se pudieron cargar los cursos" });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "M�todo no permitido" });
}
