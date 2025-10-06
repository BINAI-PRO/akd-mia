// pages/api/admin/instructors/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabase-admin";

export default async function handler(_: NextApiRequest, res: NextApiResponse) {
  const { data, error } = await supabaseAdmin
    .from("instructors")
    .select("id, full_name, email");
  if (error) return res.status(500).json({ error: error.message });
  res.status(200).json(data);
}
