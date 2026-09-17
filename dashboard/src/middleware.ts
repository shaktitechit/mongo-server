import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySessionToken } from "@/lib/jwt";

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // Public paths bypass authentication
  if (
    pathname === "/login" ||
    pathname === "/api/auth/login" ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico")
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get("dashboard_session")?.value;

  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { success: false, error: "Unauthorized. Session token missing." },
        { status: 401 }
      );
    }
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  const session = await verifySessionToken(token);

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { success: false, error: "Unauthorized. Session expired or invalid." },
        { status: 401 }
      );
    }
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Database-Scoped Authorization Check for Non-Super-Admins
  if (!session.isSuperAdmin && session.allowedDbs && !session.allowedDbs.includes("*")) {
    // 1. Check Explorer Page URL Query Parameter (`/explorer?db=...`)
    if (pathname === "/explorer") {
      const requestedDb = searchParams.get("db");
      if (requestedDb && !session.allowedDbs.includes(requestedDb)) {
        // Redirect scoped user to their own allowed database explorer
        const fallbackDb = session.allowedDbs[0] || session.db;
        const redirectUrl = new URL(`/explorer?db=${fallbackDb}`, request.url);
        return NextResponse.redirect(redirectUrl);
      }
    }

    // 2. Check Database API Path Parameters (`/api/databases/[db]/...`)
    const dbApiMatch = pathname.match(/^\/api\/databases\/([^\/]+)/);
    if (dbApiMatch) {
      const requestedDb = dbApiMatch[1];
      if (requestedDb !== "route" && !session.allowedDbs.includes(requestedDb)) {
        return NextResponse.json(
          { success: false, error: `Forbidden. You do not have access to database '${requestedDb}'.` },
          { status: 403 }
        );
      }
    }

    // 3. Admin-only operations (Cluster User Creation, Central Backup operations, Reset Password)
    const adminOnlyApiRoutes = [
      "/api/create-user",
      "/api/reset-password",
      "/api/backups",
    ];

    if (adminOnlyApiRoutes.some((route) => pathname.startsWith(route))) {
      return NextResponse.json(
        { success: false, error: "Forbidden. Administrative privilege required." },
        { status: 403 }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/explorer/:path*",
    "/login",
    "/api/:path*",
  ],
};
