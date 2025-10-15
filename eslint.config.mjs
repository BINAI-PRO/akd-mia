import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const config = [
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/out/**",
      "**/build/**",
      "**/dist/**",
      "**/*.d.ts",
      "**/next.config.{js,cjs,mjs}",
      "supabase/**",
      "pgsql/**",
      "pg_bin.zip",
      "schema.sql",
      "types/database.ts",
    ],
  },
  {
    settings: {
      next: {
        rootDir: ["apps/mobile", "apps/admin"],
      },
    },
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    files: ["apps/**/*.{js,jsx,ts,tsx}"],
    rules: {
      "@next/next/no-html-link-for-pages": [
        "error",
        ["apps/mobile/pages", "apps/admin/pages"],
      ],
      "@next/next/no-img": "off",
      "@next/next/no-img-element": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
];

export default config;
