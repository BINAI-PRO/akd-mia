import { supabaseAdmin } from "@/lib/supabase-admin";

export type InstructorRecord = {
  id: string;
  full_name: string | null;
  staff_id: string | null;
};

export async function fetchInstructorByStaffId(staffId: string) {
  const { data, error } = await supabaseAdmin
    .from("instructors")
    .select("id, full_name, staff_id")
    .eq("staff_id", staffId)
    .maybeSingle<InstructorRecord>();

  if (error) {
    throw error;
  }

  return data ?? null;
}

export async function listAllInstructors() {
  const { data, error } = await supabaseAdmin
    .from("instructors")
    .select("id, full_name, staff_id")
    .order("full_name", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as InstructorRecord[];
}
