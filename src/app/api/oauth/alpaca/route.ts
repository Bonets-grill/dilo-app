import { NextRequest } from "next/server";

/**
 * Start Alpaca OAuth flow — redirects user to Alpaca consent screen
 */
export async function GET(req: NextRequest) {
  const clientId = process.env.ALPACA_CLIENT_ID;
  if (!clientId) {
    return new Response("Alpaca OAuth not configured", { status: 500 });
  }

  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");
  if (!userId) {
    return new Response("Missing userId", { status: 400 });
  }

  const state = Buffer.from(JSON.stringify({ userId })).toString("base64url");
  const redirectUri = `${url.origin}/api/oauth/alpaca/callback`;
  const scope = "account:write trading data";

  const authUrl = `https://app.alpaca.markets/oauth/authorize?` +
    `response_type=code` +
    `&client_id=${clientId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}` +
    `&scope=${encodeURIComponent(scope)}`;

  return new Response(null, { status: 302, headers: { Location: authUrl } });
}

export const dynamic = "force-dynamic";
