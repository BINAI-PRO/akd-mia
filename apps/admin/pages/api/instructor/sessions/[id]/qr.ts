import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import { requireAdminFeature } from "@/lib/api/require-admin-feature";
import { fetchInstructorByStaffId } from "@/lib/instructors";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { madridDayjs } from "@/lib/timezone";

type SuccessResponse = {
  token: string;
  expiresAt: string;
  qrUrl: string;
  session: { id: string; classType: string; startTime: string; endTime: string };
};

type ErrorResponse = { error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SuccessResponse | ErrorResponse>
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Metodo no permitido" });
  }

  const { id } = req.query;
  if (typeof id !== "string" || !id) {
    return res.status(400).json({ error: "Identificador de sesiA3n requerido" });
  }

  const access = await requireAdminFeature(req, res, "instructorApp", "EDIT");
  if (!access) return;

  let instructorId: string | null = null;
  try {
    const instructor = await fetchInstructorByStaffId(access.staffId);
    if (!instructor) {
      return res.status(404).json({ error: "No se encontrA3 tu perfil de instructor" });
    }
    instructorId = instructor.id;
  } catch (error) {
    console.error("/api/instructor/sessions/[id]/qr fetch instructor", error);
    return res.status(500).json({ error: "No se pudo validar tu perfil" });
  }

  try {
    const { data: sessionRow, error: sessionError } = await supabaseAdmin
      .from("sessions")
      .select("id, instructor_id, start_time, end_time, class_types ( name )")
      .eq("id", id)
      .maybeSingle<{
        id: string;
        instructor_id: string;
        start_time: string;
        end_time: string;
        class_types: { name: string | null } | null;
      }>();

    if (sessionError) {
      throw sessionError;
    }

    if (!sessionRow) {
      return res.status(404).json({ error: "SesiA3n no encontrada" });
    }

    if (sessionRow.instructor_id !== instructorId) {
      return res.status(403).json({ error: "Solo puedes generar QR para tus propias sesiones" });
    }

    const expiresAt = madridDayjs().add(10, "second").toISOString();
    const raw = crypto.randomBytes(8).toString("base64url").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const token = `INST${raw.slice(0, 12)}`;

    const { error: insertError } = await supabaseAdmin.from("instructor_qr_tokens").insert({
      instructor_id: instructorId,
      session_id: sessionRow.id,
      staff_id: access.staffId,
      token,
      expires_at: expiresAt,
    });

    if (insertError) {
      throw insertError;
    }

    return res.status(200).json({
      token,
      expiresAt,
      qrUrl: `/api/qr/${token}`,
      session: {
        id: sessionRow.id,
        classType: sessionRow.class_types?.name ?? "Clase",
        startTime: sessionRow.start_time,
        endTime: sessionRow.end_time,
      },
    });
  } catch (error) {
    console.error("/api/instructor/sessions/[id]/qr", error);
    return res.status(500).json({ error: "No se pudo generar el QR" });
  }
}
