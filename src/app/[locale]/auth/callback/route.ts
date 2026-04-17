import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next");
  const safeNext = nextParam && /^\/[a-zA-Z0-9_\-/]+$/.test(nextParam) ? nextParam : null;
  const locale = request.nextUrl.pathname.split("/")[1] || "es";

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Check if user profile exists, create if not
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("users")
          .select("id")
          .eq("id", user.id)
          .single();

        if (!profile) {
          const browserLocale = request.headers.get("accept-language")?.split(",")[0] || "es-ES";
          await supabase.from("users").insert({
            id: user.id,
            email: user.email || "",
            name: user.user_metadata?.name || user.user_metadata?.full_name || null,
            avatar_url: user.user_metadata?.avatar_url || null,
            locale: browserLocale,
          });
        }
      }

      const dest = safeNext ? `${origin}/${locale}${safeNext}` : `${origin}/${locale}/chat`;
      return NextResponse.redirect(dest);
    }
  }

  return NextResponse.redirect(`${origin}/${locale}/login`);
}
