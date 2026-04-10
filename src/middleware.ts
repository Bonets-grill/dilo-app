import { NextRequest, NextResponse } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { createServerClient } from "@supabase/ssr";
import { routing } from "./i18n/routing";

const intlMiddleware = createIntlMiddleware(routing);

export async function middleware(request: NextRequest) {
  // Skip intl middleware for auth callback (it's a route handler, not a page)
  if (request.nextUrl.pathname.includes("/auth/callback")) {
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
            response.cookies.set(name, value, options);
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
  matcher: ["/((?!api|_next|icons|.*\\..*).*)"],
};
