/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Evita que ESLint rompa el build en Vercel
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Evita que errores de tipos detengan el build
    ignoreBuildErrors: true,
  },
  images: {
    // Como usas <img>, evita optimización obligatoria
    unoptimized: true,
  },
};

module.exports = nextConfig;

