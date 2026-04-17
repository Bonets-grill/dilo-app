import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Google OAuth callback — exchanges code for tokens and stores them
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error || !code || !state) {
    return new Response(null, { status: 302, headers: { Location: "/es/chat?oauth=error" } });
  }

  // Decode state to get userId
  let userId: string;
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString());
    userId = decoded.userId;
  } catch {
    return new Response(null, { status: 302, headers: { Location: "/es/chat?oauth=error" } });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  // Debe coincidir con el redirect_uri del inicio del flow — hardcodeado al
  // APP_URL para que Google acepte el intercambio (si no, "redirect_uri_mismatch").
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || url.origin;
  const redirectUri = `${appUrl}/api/oauth/google/callback`;

  try {
    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      console.error("[OAuth] Token exchange failed:", await tokenRes.text());
      return new Response(null, { status: 302, headers: { Location: "/es/chat?oauth=error" } });
    }

    const tokens = await tokenRes.json();

    // Store tokens in DB (encrypted via base64 for basic protection)
    const tokenData = {
      access_token: Buffer.from(tokens.access_token).toString("base64"),
      refresh_token: tokens.refresh_token ? Buffer.from(tokens.refresh_token).toString("base64") : null,
      expires_at: Date.now() + (tokens.expires_in || 3600) * 1000,
      scope: tokens.scope,
    };

    // Upsert into user preferences
    const { data: user } = await supabase.from("users").select("preferences").eq("id", userId).single();
    const prefs = (user?.preferences as Record<string, unknown>) || {};
    prefs.google_oauth = tokenData;

    await supabase.from("users").update({ preferences: prefs }).eq("id", userId);

    return new Response(null, { status: 302, headers: { Location: "/es/chat?oauth=success" } });
  } catch (err) {
    console.error("[OAuth] Error:", err);
    return new Response(null, { status: 302, headers: { Location: "/es/chat?oauth=error" } });
  }
}

export const dynamic = "force-dynamic";
