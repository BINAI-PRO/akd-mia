import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabase-admin";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type CoursePayload = {
  title?: string;
  description?: string | null;
  shortDescription?: string | null;
  price?: string | number | null;
  currency?: string;
  durationLabel?: string | null;
  level?: string | null;
  category?: string | null;
  visibility?: string;
  status?: string;
  tags?: string[];
  coverImageUrl?: string | null;
  sessionCount?: number | string;
  sessionDurationMinutes?: number | string;
  leadInstructorId?: string | null;
  classTypeId?: string | null;
};

type CourseRecord = {
  created_at: string;
};

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
        sessionCount,
        sessionDurationMinutes,
        leadInstructorId,
        classTypeId,
      } = req.body as CoursePayload;

      if (!title || title.trim().length === 0) {
        return res.status(400).json({ error: "El nombre del curso es obligatorio" });
      }

      const parsedPrice = price === null || price === undefined || price === ""
        ? null
        : Number(price);
      if (parsedPrice !== null && !Number.isFinite(parsedPrice)) {
        return res.status(400).json({ error: "El precio debe ser un numero valido" });
      }

      const parsedSessionCount = Number(sessionCount);
      if (!Number.isFinite(parsedSessionCount) || parsedSessionCount <= 0) {
        return res.status(400).json({ error: "La cantidad de sesiones debe ser mayor a cero" });
      }

      const parsedSessionDuration = Number(sessionDurationMinutes);
      if (!Number.isFinite(parsedSessionDuration) || parsedSessionDuration <= 0) {
        return res.status(400).json({ error: "La duracion de cada sesión debe ser mayor a cero" });
      }

      if (!classTypeId || classTypeId.trim().length === 0) {
        return res.status(400).json({ error: "Debes seleccionar un tipo de curso" });
      }
      const sanitizedClassTypeId = classTypeId.trim();

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
        session_count: Math.trunc(parsedSessionCount),
        session_duration_minutes: Math.trunc(parsedSessionDuration),
        lead_instructor_id: leadInstructorId || null,
        class_type_id: sanitizedClassTypeId,
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
        .select("*, instructors:lead_instructor_id (id, full_name), class_types:class_type_id (id, name)")
        .single();

      if (error || !data) {
        console.error("/api/courses", error);
        return res.status(500).json({ error: error?.message ?? "No se pudo crear el curso" });
      }

      return res.status(200).json({
        course: data,
        createdAt: (data as CourseRecord)?.created_at,
      });
    } catch (error: unknown) {
      console.error("/api/courses", error);
      const message = error instanceof Error ? error.message : "Error inesperado";
      return res.status(500).json({ error: message });
    }
  }

  if (req.method === "GET") {
    try {
      const { data, error } = await supabaseAdmin
        .from("courses")
        .select("*, instructors:lead_instructor_id (id, full_name), class_types:class_type_id (id, name)")
        .order("updated_at", { ascending: false });

      if (error) {
        throw error;
      }

      return res.status(200).json({ courses: data ?? [] });
    } catch (error: unknown) {
      console.error("/api/courses", error);
      const message = error instanceof Error ? error.message : "No se pudieron cargar los cursos";
      return res.status(500).json({ error: message });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Metodo no permitido" });
}


