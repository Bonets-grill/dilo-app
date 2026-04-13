import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Alpaca OAuth callback — exchanges code for tokens and stores them
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error || !code || !state) {
    return new Response(null, { status: 302, headers: { Location: "/es/chat?oauth=alpaca_error" } });
  }

  let userId: string;
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString());
    userId = decoded.userId;
  } catch {
    return new Response(null, { status: 302, headers: { Location: "/es/chat?oauth=alpaca_error" } });
  }

  const clientId = process.env.ALPACA_CLIENT_ID!;
  const clientSecret = process.env.ALPACA_CLIENT_SECRET!;
  const redirectUri = `${url.origin}/api/oauth/alpaca/callback`;

  try {
    const tokenRes = await fetch("https://api.alpaca.markets/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      console.error("[Alpaca OAuth] Token exchange failed:", await tokenRes.text());
      return new Response(null, { status: 302, headers: { Location: "/es/chat?oauth=alpaca_error" } });
    }

    const tokens = await tokenRes.json();

    const tokenData = {
      access_token: Buffer.from(tokens.access_token).toString("base64"),
      refresh_token: tokens.refresh_token ? Buffer.from(tokens.refresh_token).toString("base64") : null,
      expires_at: Date.now() + (tokens.expires_in || 3600) * 1000,
      scope: tokens.scope,
    };

    const { data: user } = await supabase.from("users").select("preferences").eq("id", userId).single();
    const prefs = (user?.preferences as Record<string, unknown>) || {};
    prefs.alpaca_oauth = tokenData;

    await supabase.from("users").update({ preferences: prefs }).eq("id", userId);

    return new Response(null, { status: 302, headers: { Location: "/es/chat?oauth=alpaca_success" } });
  } catch (err) {
    console.error("[Alpaca OAuth] Error:", err);
    return new Response(null, { status: 302, headers: { Location: "/es/chat?oauth=alpaca_error" } });
  }
}

export const dynamic = "force-dynamic";
