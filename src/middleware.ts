import { NextRequest, NextResponse } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { createServerClient } from "@supabase/ssr";
import { routing } from "./i18n/routing";
import { limitLLM, limitImage, rateLimitResponse } from "./lib/rate-limit";

const intlMiddleware = createIntlMiddleware(routing);

const BLOCKED_PATHS = new Set([
  "/.env", "/.env.local", "/.env.production", "/.env.development",
  "/.npmrc", "/package.json", "/package-lock.json",
  "/tsconfig.json", "/docker-compose.yml", "/docker-compose.yaml",
  "/yarn.lock", "/pnpm-lock.yaml", "/.gitignore",
  "/vercel.json", "/.file-locks", "/CLAUDE.md", "/AGENTS.md",
]);

// LLM-cost endpoints that need rate limiting. Extended from the minimal
// (chat|journal|transcribe|skills) set to cover every paid-API endpoint
// that a scripted caller could hit to drain budget (CN-011).
const LLM_PATHS = /^\/api\/(chat|journal|transcribe|skills\/|tts|ocr|voice\/|study\/(chat|plan|upload-material)|nutrition\/generate-plan|horoscope\/|memory\/add|dm\/suggest|chat\/suggest)/;
const IMG_PATHS = /^\/api\/(enhance-image|image-edit)/;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Block sensitive files
  if (BLOCKED_PATHS.has(pathname) || /^\/.env(\..+)?$/.test(pathname)) {
    return new NextResponse(null, { status: 404 });
  }

  // Rate limit LLM endpoints (cost bomb + DoS protection)
  if (LLM_PATHS.test(pathname) || IMG_PATHS.test(pathname)) {
    const userId = request.cookies.get("sb-access-token")?.value
      || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || request.headers.get("x-real-ip")
      || "anon";
    const result = IMG_PATHS.test(pathname) ? await limitImage(userId) : await limitLLM(userId);
    if (!result.ok) return rateLimitResponse(result);
    return NextResponse.next();
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
              // CN-024: force Secure always (not gated on NODE_ENV), and
              // default to SameSite=Lax which is fine for auth cookies.
              secure: true,
              sameSite: options?.sameSite ?? "lax",
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
    // Rate-limited LLM/paid endpoints — must match LLM_PATHS/IMG_PATHS regex
    "/api/chat/:path*",
    "/api/journal/:path*",
    "/api/transcribe/:path*",
    "/api/skills/:path*",
    "/api/enhance-image/:path*",
    "/api/image-edit/:path*",
    "/api/tts/:path*",
    "/api/ocr/:path*",
    "/api/voice/:path*",
    "/api/study/:path*",
    "/api/horoscope/:path*",
    "/api/memory/:path*",
    "/api/nutrition/:path*",
    "/api/dm/:path*",
    // All pages (existing pattern)
    "/((?!api|_next|icons|.*\\..*).*)"],
};
