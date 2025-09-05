import type { NextApiRequest, NextApiResponse } from "next";
import QRCode from "qrcode";
import path from "path";
import Jimp from "jimp";  // 👈 aquí default import

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const token = req.query.token as string;
    const base = process.env.NEXT_PUBLIC_BASE_URL || `http://${req.headers.host}`;
    const url = `${base}/qr/${token}`;

    // 1) QR base
    const qrPng: Buffer = await QRCode.toBuffer(url, {
      errorCorrectionLevel: "H",
      margin: 2,
      scale: 10,
    });

    // 2) Leer QR con Jimp
    const qr = await Jimp.read(qrPng);
    const size = qr.getWidth();
    const badge = Math.floor(size * 0.26);
    const x = Math.floor((size - badge) / 2);
    const y = Math.floor((size - badge) / 2);

    // Pastilla blanca al centro
    const white = await new Jimp(badge, badge, 0xffffffff);
    qr.composite(white, x, y);

    // Logo centrado
    const logoPath = path.join(process.cwd(), "public", "logo.png");
    const logo = await Jimp.read(logoPath);
    const pad = Math.floor(badge * 0.16);
    const inner = badge - pad * 2;
    logo.contain(inner, inner);
    qr.composite(logo, x + pad, y + pad);

    // 3) Buffer PNG
    const out: Buffer = await qr.getBufferAsync(Jimp.MIME_PNG);

    res.setHeader("Content-Type", "image/png");
    if (req.query.download) {
      res.setHeader("Content-Disposition", `attachment; filename="AT-QR-${token}.png"`);
    }
    res.status(200).send(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "QR generation failed" });
  }
}
