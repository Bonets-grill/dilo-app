/**
 * Google OAuth Token Helper — retrieves and auto-refreshes tokens
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** Get a valid Google access token for a user (auto-refreshes if expired) */
export async function getGoogleAccessToken(userId: string): Promise<string | null> {
  try {
    const { data: user } = await supabase.from("users").select("preferences").eq("id", userId).single();
    const prefs = (user?.preferences as Record<string, unknown>) || {};
    const oauth = prefs.google_oauth as Record<string, unknown> | undefined;

    if (!oauth?.access_token) return null;

    const accessToken = Buffer.from(oauth.access_token as string, "base64").toString();
    const expiresAt = (oauth.expires_at as number) || 0;
    const refreshToken = oauth.refresh_token ? Buffer.from(oauth.refresh_token as string, "base64").toString() : null;

    // If token is still valid (with 60s buffer), return it
    if (Date.now() < expiresAt - 60000) {
      return accessToken;
    }

    // Token expired — try to refresh
    if (!refreshToken) return null;

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!res.ok) {
      console.error("[OAuth] Token refresh failed:", await res.text());
      return null;
    }

    const tokens = await res.json();
    const newAccessToken = tokens.access_token;

    // Update stored tokens
    oauth.access_token = Buffer.from(newAccessToken).toString("base64");
    oauth.expires_at = Date.now() + (tokens.expires_in || 3600) * 1000;
    if (tokens.refresh_token) {
      oauth.refresh_token = Buffer.from(tokens.refresh_token).toString("base64");
    }
    prefs.google_oauth = oauth;
    await supabase.from("users").update({ preferences: prefs }).eq("id", userId);

    return newAccessToken;
  } catch (err) {
    console.error("[OAuth] getGoogleAccessToken error:", err);
    return null;
  }
}

/** Check if user has Google connected */
export async function hasGoogleConnection(userId: string): Promise<boolean> {
  const token = await getGoogleAccessToken(userId);
  return token !== null;
}
