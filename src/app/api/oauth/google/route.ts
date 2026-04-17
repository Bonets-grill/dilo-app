import { NextRequest } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase/service";

const supabase = getServiceRoleClient();

/**
 * Start Google OAuth flow — redirects user to Google consent screen
 */
export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return new Response("Google OAuth not configured", { status: 500 });
  }

  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");
  if (!userId) {
    return new Response("Missing userId", { status: 400 });
  }

  // Store userId in state parameter so we can link it after callback
  const state = Buffer.from(JSON.stringify({ userId })).toString("base64url");

  // OJO: siempre usamos NEXT_PUBLIC_APP_URL para que el consent screen de
  // Google muestre "ordydilo.com" en vez del dominio de vista previa de Vercel.
  // Si cae a url.origin, queda "dilo-app-five.vercel.app" que asusta al usuario.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || url.origin;
  const redirectUri = `${appUrl}/api/oauth/google/callback`;
  const scopes = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.events",
  ].join(" ");

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${clientId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&access_type=offline` +
    `&prompt=consent` +
    `&state=${state}`;

  return new Response(null, { status: 302, headers: { Location: authUrl } });
}

export const dynamic = "force-dynamic";
