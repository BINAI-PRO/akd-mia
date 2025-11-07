import type { NextApiRequest, NextApiResponse } from "next";
import QRCode from "qrcode";
import path from "path";
import fs from "fs";
import Jimp from "jimp";

function resolveBaseUrl(req: NextApiRequest) {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const forwardedHost = req.headers["x-forwarded-host"];
  const host = typeof forwardedHost === "string" ? forwardedHost : req.headers.host;
  const protocol =
    typeof forwardedProto === "string"
      ? forwardedProto
      : host && host.includes("localhost")
      ? "http"
      : "https";
  return `${protocol}://${host ?? "localhost:3000"}`;
}

function resolveLogoPath() {
  const root = process.cwd();
  const candidates = [
    path.join(root, "apps", "mobile", "public", "logo.png"),
    path.join(root, "apps", "admin", "public", "logo.png"),
    path.join(root, "public", "logo.png"),
  ];

  const match = candidates.find((candidate) => fs.existsSync(candidate));
  if (!match) {
    throw new Error("Logo asset not found for QR generation");
  }
  return match;
}

export async function renderQrImage(req: NextApiRequest, res: NextApiResponse) {
  try {
    const tokenParam = req.query.token;
    const token = Array.isArray(tokenParam) ? tokenParam[0] : tokenParam;

    if (!token) {
      return res.status(400).json({ error: "Token de QR requerido" });
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || resolveBaseUrl(req);
    const qrTargetUrl = `${baseUrl}/qr/${token}`;

    const qrPng: Buffer = await QRCode.toBuffer(qrTargetUrl, {
      errorCorrectionLevel: "H",
      margin: 2,
      scale: 10,
    });

    const qr = await Jimp.read(qrPng);
    const size = qr.getWidth();
    const badge = Math.floor(size * 0.26);
    const x = Math.floor((size - badge) / 2);
    const y = Math.floor((size - badge) / 2);

    const white = await new Jimp(badge, badge, 0xffffffff);
    qr.composite(white, x, y);

    const logoPath = resolveLogoPath();
    const logo = await Jimp.read(logoPath);
    const pad = Math.floor(badge * 0.16);
    const inner = badge - pad * 2;
    logo.contain(inner, inner);
    qr.composite(logo, x + pad, y + pad);

    const out: Buffer = await qr.getBufferAsync(Jimp.MIME_PNG);

    res.setHeader("Content-Type", "image/png");
    if ("download" in req.query) {
      res.setHeader("Content-Disposition", `attachment; filename="AT-QR-${token}.png"`);
    }
    res.status(200).send(out);
  } catch (error) {
    console.error("[qr-image] generation failed", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "No se pudo generar el QR" });
    }
  }
}

