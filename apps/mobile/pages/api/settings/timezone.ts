import type { NextApiRequest, NextApiResponse } from "next";
import { studioTimezoneApiHandler } from "@/lib/api/studio-timezone-handler";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  return studioTimezoneApiHandler(req, res);
}
