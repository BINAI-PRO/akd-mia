import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Tables } from "@/types/database";

type ApparatusRow = Tables<"apparatus">;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("apparatus")
      .select("id, name, created_at")
      .order("name", { ascending: true })
      .returns<ApparatusRow[]>();
    if (error) throw error;

    return res.status(200).json(
      (data ?? []).map((row) => ({ id: row.id, name: row.name, createdAt: row.created_at }))
    );
  } catch (err: any) {
    console.error("[API][admin/rooms/apparatus]", err);
    return res.status(500).json({ error: err?.message ?? "Unexpected server error" });
  }
}

