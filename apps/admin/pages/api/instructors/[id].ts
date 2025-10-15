// pages/api/admin/instructors/[id].ts
// Encoding: UTF-8
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  cloneOverrideWeek,
  cloneWeek,
  createEmptyWeek,
  groupOverridesByInstructor,
  groupWeeklyByInstructor,
  normalizeWeek,
  serializeOverridesForInsert,
  serializeWeeklyForInsert,
  weekKeyFromStartDate,
  WEEKDAY_NUMBER_TO_KEY,
  type InstructorAvailability,
  type OverrideRowWithSlots,
} from "@/lib/instructor-availability";
import type { Database } from "@/types/database";

type InstructorRow = Database["public"]["Tables"]["instructors"]["Row"];
type PivotRow = Database["public"]["Tables"]["instructor_class_types"]["Row"];
type WeeklyRow = Database["public"]["Tables"]["instructor_weekly_availability"]["Row"];

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
        availability,
      } = req.body as {
        firstName: string;
        lastName: string;
        email: string;
        phone1: string;
        phone2: string;
        phone1WhatsApp: boolean;
        phone2WhatsApp: boolean;
        classTypeIds: string[];
        availability?: InstructorAvailability;
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

      const incomingAvailability: InstructorAvailability = {
        weekly: availability?.weekly ?? createEmptyWeek(),
        overrides: availability?.overrides ?? [],
      };

      const { error: weeklyDeleteErr } = await supabaseAdmin
        .from("instructor_weekly_availability")
        .delete()
        .eq("instructor_id", id);
      if (weeklyDeleteErr) throw weeklyDeleteErr;

      const weeklyInsert = serializeWeeklyForInsert(incomingAvailability.weekly, id);
      if (weeklyInsert.length > 0) {
        const { error: weeklyInsertErr } = await supabaseAdmin
          .from("instructor_weekly_availability")
          .insert(weeklyInsert);
        if (weeklyInsertErr) throw weeklyInsertErr;
      }

      const weeklyResponse = createEmptyWeek();
      weeklyInsert.forEach((slot) => {
        const dayKey = WEEKDAY_NUMBER_TO_KEY[slot.weekday];
        if (!dayKey) return;
        weeklyResponse[dayKey].push({ start: slot.start_time, end: slot.end_time });
      });

      const { error: overridesDeleteErr } = await supabaseAdmin
        .from("instructor_week_overrides")
        .delete()
        .eq("instructor_id", id);
      if (overridesDeleteErr) throw overridesDeleteErr;

      const overridePayloads = serializeOverridesForInsert(incomingAvailability.overrides, id);
      const savedOverrides: InstructorAvailability["overrides"] = [];

      for (const payload of overridePayloads) {
        const { data: insertedOverride, error: overrideInsertErr } = await supabaseAdmin
          .from("instructor_week_overrides")
          .insert({
            instructor_id: payload.instructor_id,
            week_start_date: payload.week_start_date,
            label: payload.label,
            notes: payload.notes,
          })
          .select("id, week_start_date, label, notes")
          .single();
        if (overrideInsertErr) throw overrideInsertErr;

        if (payload.slots.length > 0) {
          const slotRows = payload.slots.map((slot) => ({
            override_id: insertedOverride.id,
            weekday: slot.weekday,
            start_time: slot.start_time,
            end_time: slot.end_time,
          }));
          const { error: slotsInsertErr } = await supabaseAdmin
            .from("instructor_week_override_slots")
            .insert(slotRows);
          if (slotsInsertErr) throw slotsInsertErr;
        }

        const days = createEmptyWeek();
        payload.slots.forEach((slot) => {
          const dayKey = WEEKDAY_NUMBER_TO_KEY[slot.weekday];
          if (!dayKey) return;
          days[dayKey].push({ start: slot.start_time, end: slot.end_time });
        });

        savedOverrides.push({
          id: insertedOverride.id,
          weekKey: weekKeyFromStartDate(insertedOverride.week_start_date),
          weekStartDate: insertedOverride.week_start_date,
          label: insertedOverride.label ?? null,
          notes: insertedOverride.notes ?? null,
          days: normalizeWeek(days),
        });
      }

      const availabilityResponse: InstructorAvailability = {
        weekly: normalizeWeek(weeklyResponse),
        overrides: savedOverrides,
      };

      return res.status(200).json({
        id: updated.id,
        fullName: updated.full_name,
        email: updated.email,
        phone1: updated.phone1,
        phone2: updated.phone2,
        phone1HasWhatsapp: !!updated.phone1_has_whatsapp,
        phone2HasWhatsapp: !!updated.phone2_has_whatsapp,
        classTypeIds: classTypeIds ?? [],
        availability: availabilityResponse,
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

      const { data: weeklyRows, error: weeklyErr } = await supabaseAdmin
        .from("instructor_weekly_availability")
        .select("id, instructor_id, weekday, start_time, end_time")
        .eq("instructor_id", id)
        .returns<WeeklyRow[]>();
      if (weeklyErr) throw weeklyErr;

      const { data: overrideRows, error: overrideErr } = await supabaseAdmin
        .from("instructor_week_overrides")
        .select("id, instructor_id, week_start_date, label, notes, instructor_week_override_slots ( id, weekday, start_time, end_time )")
        .eq("instructor_id", id)
        .returns<OverrideRowWithSlots[]>();
      if (overrideErr) throw overrideErr;

      const weeklyMap = groupWeeklyByInstructor(weeklyRows);
      const overridesMap = groupOverridesByInstructor(overrideRows);

      const availability: InstructorAvailability = {
        weekly: weeklyMap.get(id) ? cloneWeek(weeklyMap.get(id)!) : createEmptyWeek(),
        overrides: overridesMap.get(id)?.map((ov) => cloneOverrideWeek(ov)) ?? [],
      };

      return res.status(200).json({
        id: row.id,
        fullName: row.full_name,
        email: row.email,
        phone1: row.phone1,
        phone2: row.phone2,
        phone1HasWhatsapp: !!row.phone1_has_whatsapp,
        phone2HasWhatsapp: !!row.phone2_has_whatsapp,
        classTypeIds: (piv ?? []).map((p) => p.class_type_id),
        availability,
      });
    }

    res.setHeader("Allow", "GET,PUT");
    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (err: unknown) {
    console.error("[API][instructors/:id]", err);
    const message = err instanceof Error ? err.message : "Unexpected server error";
    return res.status(500).json({ error: message });
  }
}

