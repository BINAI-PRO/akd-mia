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
  defaultRoomId?: string | null;
  bookingWindowDays?: number | string | null;
};

type NormalizedPayload = {
  title: string;
  description: string | null;
  shortDescription: string | null;
  parsedPrice: number | null;
  currency: string;
  durationLabel: string | null;
  level: string | null;
  category: string;
  sessionCount: number;
  sessionDuration: number;
  visibility: string;
  status: string;
  tags: string[];
  coverImageUrl: string | null;
  leadInstructorId: string | null;
  classTypeId: string;
  defaultRoomId: string | null;
  bookingWindowDays: number | null;
};

function normalizePayload(input: CoursePayload): NormalizedPayload {
  if (!input.title || input.title.trim().length === 0) {
    throw new Error("El nombre del curso es obligatorio");
  }

  const parsedPrice =
    input.price === null || input.price === undefined || input.price === ""
      ? null
      : Number(input.price);
  if (parsedPrice !== null && !Number.isFinite(parsedPrice)) {
    throw new Error("El precio debe ser un numero valido");
  }

  const parsedSessionCount = Number(input.sessionCount);
  if (!Number.isFinite(parsedSessionCount) || parsedSessionCount <= 0) {
    throw new Error("La cantidad de sesiones debe ser mayor a cero");
  }

  const parsedSessionDuration = Number(input.sessionDurationMinutes);
  if (!Number.isFinite(parsedSessionDuration) || parsedSessionDuration <= 0) {
    throw new Error("La duracion de cada sesion debe ser mayor a cero");
  }

  const parsedWindow =
    input.bookingWindowDays === null ||
    input.bookingWindowDays === undefined ||
    input.bookingWindowDays === ""
      ? null
      : Number(input.bookingWindowDays);
  if (parsedWindow !== null && (!Number.isFinite(parsedWindow) || parsedWindow < 0)) {
    throw new Error("La ventana de reserva debe ser un numero mayor o igual a cero");
  }

  if (!input.classTypeId || input.classTypeId.trim().length === 0) {
    throw new Error("Debes seleccionar un tipo de curso");
  }

  if (!input.category || input.category.trim().length === 0) {
    throw new Error("Debes seleccionar una categoria");
  }

  return {
    title: input.title.trim(),
    description: input.description ?? null,
    shortDescription: input.shortDescription ?? null,
    parsedPrice,
    currency: (input.currency ?? "MXN").toUpperCase(),
    durationLabel: input.durationLabel ?? null,
    level: input.level ?? null,
    category: input.category.trim(),
    sessionCount: Math.trunc(parsedSessionCount),
    sessionDuration: Math.trunc(parsedSessionDuration),
    visibility: (input.visibility ?? "PUBLIC").toUpperCase(),
    status: (input.status ?? "DRAFT").toUpperCase(),
    tags: Array.isArray(input.tags)
      ? input.tags
          .filter((tag) => typeof tag === "string" && tag.trim().length > 0)
          .map((tag) => tag.trim())
      : [],
    coverImageUrl: input.coverImageUrl ?? null,
    leadInstructorId: input.leadInstructorId || null,
    classTypeId: input.classTypeId.trim(),
    defaultRoomId: input.defaultRoomId?.trim() || null,
    bookingWindowDays: parsedWindow === null ? null : Math.trunc(parsedWindow),
  };
}

function buildDatabasePayload(normalized: NormalizedPayload) {
  return {
    title: normalized.title,
    slug: slugify(normalized.title),
    description: normalized.description,
    short_description: normalized.shortDescription,
    price: normalized.parsedPrice !== null ? normalized.parsedPrice.toFixed(2) : null,
    currency: normalized.currency,
    duration_label: normalized.durationLabel,
    level: normalized.level,
    category: normalized.category,
    session_count: normalized.sessionCount,
    session_duration_minutes: normalized.sessionDuration,
    visibility: normalized.visibility,
    status: normalized.status,
    tags: normalized.tags,
    cover_image_url: normalized.coverImageUrl,
    lead_instructor_id: normalized.leadInstructorId,
    class_type_id: normalized.classTypeId,
    default_room_id: normalized.defaultRoomId,
    booking_window_days: normalized.bookingWindowDays,
  };
}

const selectColumns =
  "*, instructors:lead_instructor_id (id, full_name), class_types:class_type_id (id, name), rooms:default_room_id (id, name)";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "POST") {
    try {
      const normalized = normalizePayload(req.body as CoursePayload);
      const payload = buildDatabasePayload(normalized);

      const { data, error } = await supabaseAdmin
        .from("courses")
        .insert(payload)
        .select(selectColumns)
        .single();

      if (error || !data) {
        console.error("/api/courses POST", error);
        return res.status(500).json({ error: error?.message ?? "No se pudo crear el curso" });
      }

      return res.status(200).json({ course: data });
    } catch (error) {
      console.error("/api/courses POST", error);
      return res.status(400).json({
        error: error instanceof Error ? error.message : "No se pudo crear el curso",
      });
    }
  }

  if (req.method === "PATCH") {
    try {
      const { id, ...rest } = req.body as CoursePayload & { id?: string };
      if (!id) {
        return res.status(400).json({ error: "Identificador del curso faltante" });
      }

      const normalized = normalizePayload(rest);
      const payload = buildDatabasePayload(normalized);

      const { data, error } = await supabaseAdmin
        .from("courses")
        .update(payload)
        .eq("id", id)
        .select(selectColumns)
        .single();

      if (error || !data) {
        console.error("/api/courses PATCH", error);
        return res.status(500).json({ error: error?.message ?? "No se pudo actualizar el curso" });
      }

      return res.status(200).json({ course: data });
    } catch (error) {
      console.error("/api/courses PATCH", error);
      return res.status(400).json({
        error: error instanceof Error ? error.message : "No se pudo actualizar el curso",
      });
    }
  }

  if (req.method === "GET") {
    try {
      const { data, error } = await supabaseAdmin
        .from("courses")
        .select(selectColumns)
        .order("updated_at", { ascending: false });

      if (error) {
        throw error;
      }

      return res.status(200).json({ courses: data ?? [] });
    } catch (error) {
      console.error("/api/courses GET", error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : "No se pudieron cargar los cursos",
      });
    }
  }

  res.setHeader("Allow", "GET, POST, PATCH");
  return res.status(405).json({ error: "Metodo no permitido" });
}
