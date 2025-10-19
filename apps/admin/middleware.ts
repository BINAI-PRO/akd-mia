import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@/types/database";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next({ request: { headers: req.headers } });
  const supabase = createMiddlewareClient<Database>({ req, res });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const { pathname, search } = req.nextUrl;
  const isAuthRoute = pathname.startsWith("/login") || pathname.startsWith("/api/auth");

  if (!session && !isAuthRoute) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    const redirectTo = `${pathname}${search}`;
    if (redirectTo && redirectTo !== "/") {
      loginUrl.searchParams.set("redirectTo", redirectTo);
    }
    return NextResponse.redirect(loginUrl);
  }

  if (session && pathname.startsWith("/login")) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next|api/|favicon.ico|sw.js|manifest.json|robots.txt).*)"],
};
