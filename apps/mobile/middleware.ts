import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@/types/database";
import { isRefreshTokenMissingError } from "./lib/edge-auth-errors";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next({ request: { headers: req.headers } });
  const supabase = createMiddlewareClient<Database>({ req, res });

  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  const shouldForceSignOut = isRefreshTokenMissingError(error);

  if (shouldForceSignOut) {
    await supabase.auth.signOut();
  }

  const activeSession = error ? null : session;

  const { pathname, search } = req.nextUrl;
  const isAuthRoute =
    pathname.startsWith("/login") || pathname.startsWith("/api/auth") || pathname.startsWith("/auth");

  if (!activeSession && !isAuthRoute) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    const redirectTo = `${pathname}${search}`;
    if (redirectTo && redirectTo !== "/login") {
      loginUrl.searchParams.set("redirectTo", redirectTo);
    }
    return NextResponse.redirect(loginUrl);
  }

  if (activeSession && pathname.startsWith("/login")) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/schedule";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|api/|favicon.ico|sw.js|manifest.json|robots.txt|logo.png|logo-icon-192.png|logo-icon-512.png|logo-icon-1024.png|logo.webp).*)",
  ],
};


