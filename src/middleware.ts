import { NextRequest, NextResponse } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { createServerClient } from "@supabase/ssr";
import { routing } from "./i18n/routing";

const intlMiddleware = createIntlMiddleware(routing);

const BLOCKED_PATHS = new Set([
  "/.env", "/.env.local", "/.env.production", "/.env.development",
  "/.npmrc", "/package.json", "/package-lock.json",
  "/tsconfig.json", "/docker-compose.yml", "/docker-compose.yaml",
  "/yarn.lock", "/pnpm-lock.yaml", "/.gitignore",
  "/vercel.json", "/.file-locks", "/CLAUDE.md", "/AGENTS.md",
]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Block sensitive files
  if (BLOCKED_PATHS.has(pathname) || /^\/.env(\..+)?$/.test(pathname)) {
    return new NextResponse(null, { status: 404 });
  }

  // Skip intl middleware for auth callback (it's a route handler, not a page)
  if (pathname.includes("/auth/callback")) {
    return NextResponse.next();
  }

  // Run intl middleware first (locale detection, redirects)
  const response = intlMiddleware(request);

  // Refresh Supabase auth session on every request (keeps cookies alive)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, {
              ...options,
              httpOnly: true,
              secure: process.env.NODE_ENV === "production",
            });
          });
        },
      },
    }
  );

  // This refreshes the session if expired
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    // Sensitive files at root (override the dot exclusion)
    "/.env",
    "/.env.local",
    "/.env.production",
    "/.env.development",
    "/.npmrc",
    "/package.json",
    "/package-lock.json",
    "/tsconfig.json",
    "/docker-compose.yml",
    "/docker-compose.yaml",
    "/.gitignore",
    "/vercel.json",
    "/.file-locks",
    "/CLAUDE.md",
    "/AGENTS.md",
    // All pages (existing pattern)
    "/((?!api|_next|icons|.*\\..*).*)"],
};
