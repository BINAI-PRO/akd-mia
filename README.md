This monorepo hosts the **BInAI Akadēmia** mobile PWA and admin panel. Both apps share Supabase for authentication and data. See `docs/auth-workflow.md` for the end-to-end auth setup guide (linking `auth.users` with `public.clients`, creating admin accounts, etc.). For copy guidelines (acentos, UTF-8 y localización), revisa `docs/language-style.md`.


## Autenticacion hibrida (Supabase + Google en Vercel)

- Google OAuth ahora se maneja con NextAuth/Auth.js para que todo el flujo ocurra bajo tu dominio publico (`https://madrid-chamberi.atpilatestime.com`). Configura los nuevos secretos en `.env.local` y en Vercel:
  - `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` (los del proyecto en Google Cloud).
  - `NEXTAUTH_SECRET` (un string aleatorio, por ejemplo `openssl rand -base64 32`). `NEXTAUTH_URL` lo define Vercel en produccion; en desarrollo usa `http://localhost:3000`.
- Registra `https://<TU_DOMINIO>/api/auth/callback/google` como Redirect URI en Google Cloud. NextAuth usa esa ruta para completar el login.
- Luego, la pagina publica `/auth/google` intercambia el `id_token` de Google con Supabase mediante `signInWithIdToken`, asi que la app sigue usando el token de Supabase (RLS, realtime, etc.) sin mostrar el dominio `*.supabase.co`.
- El login por email/contrasena sigue funcionando directamente con Supabase Auth, no hay que cambiar nada en ese flujo.

---

This project was originally bootstrapped with [`create-next-app`](https://nextjs.org/docs/pages/api-reference/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `pages/index.tsx`. The page auto-updates as you edit the file.

[API routes](https://nextjs.org/docs/pages/building-your-application/routing/api-routes) can be accessed on [http://localhost:3000/api/hello](http://localhost:3000/api/hello). This endpoint can be edited in `pages/api/hello.ts`.

The `pages/api` directory is mapped to `/api/*`. Files in this directory are treated as [API routes](https://nextjs.org/docs/pages/building-your-application/routing/api-routes) instead of React pages.

This project uses [`next/font`](https://nextjs.org/docs/pages/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn-pages-router) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/pages/building-your-application/deploying) for more details.



