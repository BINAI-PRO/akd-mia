// pages/api/admin/instructors/[id].ts
// Encoding: UTF-8
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Database } from "@/types/database";

type InstructorRow = Database["public"]["Tables"]["instructors"]["Row"];
type PivotRow = Database["public"]["Tables"]["instructor_class_types"]["Row"];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query as { id: string };

  try {
    if (req.method === "PUT") {
      const {
        firstName,
        lastName,
        email,
        phone1,
        phone2,
        phone1WhatsApp,
        phone2WhatsApp,
        classTypeIds,
      } = req.body as {
        firstName: string;
        lastName: string;
        email: string;
        phone1: string;
        phone2: string;
        phone1WhatsApp: boolean;
        phone2WhatsApp: boolean;
        classTypeIds: string[];
      };

      const full_name = [firstName?.trim(), lastName?.trim()].filter(Boolean).join(" ");

      // 1) Update instructor
      const { data: updated, error: e1 } = await supabaseAdmin
        .from("instructors")
        .update({
          full_name,
          email: email?.trim() || null,
          phone1: phone1?.trim() || null,
          phone2: phone2?.trim() || null,
          phone1_has_whatsapp: !!phone1WhatsApp,
          phone2_has_whatsapp: !!phone2WhatsApp,
        })
        .eq("id", id)
        .select()
        .single<InstructorRow>();
      if (e1) throw e1;

      // 2) Reset tipos de clase (pivot)
      const { error: delErr } = await supabaseAdmin
        .from("instructor_class_types")
        .delete()
        .eq("instructor_id", id);
      if (delErr) throw delErr;

      if (Array.isArray(classTypeIds) && classTypeIds.length > 0) {
        const rows: PivotRow[] = classTypeIds.map((ctId) => ({
          instructor_id: id,
          class_type_id: ctId,
          certified: true,
          certified_at: null,
          notes: null,
        }));
        const { error: insErr } = await supabaseAdmin
          .from("instructor_class_types")
          .insert(rows);
        if (insErr) throw insErr;
      }

      return res.status(200).json({
        id: updated.id,
        fullName: updated.full_name,
        email: updated.email,
        phone1: updated.phone1,
        phone2: updated.phone2,
        phone1HasWhatsapp: !!updated.phone1_has_whatsapp,
        phone2HasWhatsapp: !!updated.phone2_has_whatsapp,
        classTypeIds: classTypeIds ?? [],
      });
    }

    if (req.method === "GET") {
      const { data: row, error } = await supabaseAdmin
        .from("instructors")
        .select("id, full_name, email, phone1, phone2, phone1_has_whatsapp, phone2_has_whatsapp")
        .eq("id", id)
        .single<InstructorRow>();
      if (error) throw error;

      const { data: piv, error: e2 } = await supabaseAdmin
        .from("instructor_class_types")
        .select("class_type_id")
        .eq("instructor_id", id);
      if (e2) throw e2;

      return res.status(200).json({
        id: row.id,
        fullName: row.full_name,
        email: row.email,
        phone1: row.phone1,
        phone2: row.phone2,
        phone1HasWhatsapp: !!row.phone1_has_whatsapp,
        phone2HasWhatsapp: !!row.phone2_has_whatsapp,
        classTypeIds: (piv ?? []).map((p) => p.class_type_id),
      });
    }

    res.setHeader("Allow", "GET,PUT");
    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (err: any) {
    console.error("[API][instructors/:id]", err);
    return res.status(500).json({ error: err?.message || "Unexpected server error" });
  }
}
