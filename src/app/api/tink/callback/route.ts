import { NextRequest } from "next/server";

/**
 * Tink callback — user returns here after connecting their bank
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const credentialsId = url.searchParams.get("credentialsId");

  // Redirect to chat with success message
  const locale = "es"; // default
  const redirectUrl = credentialsId
    ? `/${locale}/chat?bank=connected`
    : `/${locale}/chat?bank=error`;

  return new Response(null, {
    status: 302,
    headers: { Location: redirectUrl },
  });
}

export const dynamic = "force-dynamic";
