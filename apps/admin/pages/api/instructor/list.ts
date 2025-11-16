import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminFeature } from "@/lib/api/require-admin-feature";
import { listAllInstructors } from "@/lib/instructors";

type ResponsePayload = {
  instructors: Array<{ id: string; name: string; staffId: string | null }>;
};

type ErrorResponse = { error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponsePayload | ErrorResponse>
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Metodo no permitido" });
  }

  const access = await requireAdminFeature(req, res, "instructorApp", "READ");
  if (!access) return;

  try {
    const instructors = await listAllInstructors();
    return res.status(200).json({
      instructors: instructors.map((instructor) => ({
        id: instructor.id,
        name: instructor.full_name ?? "Instructor sin nombre",
        staffId: instructor.staff_id ?? null,
      })),
    });
  } catch (error) {
    console.error("/api/instructor/list", error);
    return res.status(500).json({ error: "No se pudieron cargar los instructores" });
  }
}
