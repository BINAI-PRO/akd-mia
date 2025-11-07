import type { NextApiRequest, NextApiResponse } from "next";
import { renderQrImage } from "@/lib/api/qr-image";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  return renderQrImage(req, res);
}

