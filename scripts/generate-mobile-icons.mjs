import { createCanvas, loadImage } from "canvas";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const mobilePublicDir = path.join(projectRoot, "apps", "mobile", "public");
const sourceLogo = path.join(mobilePublicDir, "logo.svg");

const ICON_SIZES = [
  { size: 192, name: "logo-icon-192.png" },
  { size: 512, name: "logo-icon-512.png" },
];

async function ensureSquareIcons() {
  const image = await loadImage(sourceLogo);

  await Promise.all(
    ICON_SIZES.map(async ({ size, name }) => {
      const canvas = createCanvas(size, size);
      const ctx = canvas.getContext("2d");

      // White background to avoid transparent splash artefacts on some devices.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size, size);

      const maxLogoSize = size * 0.72;
      const scale = Math.min(maxLogoSize / image.width, maxLogoSize / image.height);
      const targetWidth = image.width * scale;
      const targetHeight = image.height * scale;
      const offsetX = (size - targetWidth) / 2;
      const offsetY = (size - targetHeight) / 2;

      ctx.drawImage(image, offsetX, offsetY, targetWidth, targetHeight);

      const buffer = canvas.toBuffer("image/png");
      const outputPath = path.join(mobilePublicDir, name);
      await fs.writeFile(outputPath, buffer);
      console.log(`Generated ${name}`);
    })
  );
}

ensureSquareIcons().catch((error) => {
  console.error("Failed to generate icons", error);
  process.exitCode = 1;
});
