import { NextResponse } from "next/server";

export async function GET() {
  const clientId = process.env.TINK_CLIENT_ID;
  const clientSecret = process.env.TINK_CLIENT_SECRET;

  const result: Record<string, unknown> = {
    hasClientId: !!clientId,
    hasClientSecret: !!clientSecret,
    clientIdLength: clientId?.length || 0,
  };

  if (!clientId || !clientSecret) {
    return NextResponse.json({ ...result, error: "Missing env vars" });
  }

  // Test token
  try {
    const res = await fetch("https://api.tink.com/api/v1/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials&scope=user:create`,
    });
    const data = await res.json();
    result.tokenOk = !!data.access_token;
    result.tokenError = data.errorMessage || null;

    if (data.access_token) {
      // Test user creation
      const userRes = await fetch("https://api.tink.com/api/v1/user/create", {
        method: "POST",
        headers: { Authorization: `Bearer ${data.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ external_user_id: "test-endpoint-" + Date.now(), market: "ES", locale: "es_ES" }),
      });
      result.userCreateStatus = userRes.status;
      result.userCreateBody = await userRes.json();

      // Test auth grant
      const grantTokenRes = await fetch("https://api.tink.com/api/v1/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials&scope=authorization:grant`,
      });
      const grantTokenData = await grantTokenRes.json();

      if (grantTokenData.access_token) {
        const grantRes = await fetch("https://api.tink.com/api/v1/oauth/authorization-grant", {
          method: "POST",
          headers: { Authorization: `Bearer ${grantTokenData.access_token}`, "Content-Type": "application/x-www-form-urlencoded" },
          body: `external_user_id=test-endpoint-${Date.now()}&scope=accounts:read,balances:read,transactions:read`,
        });
        result.grantStatus = grantRes.status;
        result.grantBody = await grantRes.json();
      }
    }
  } catch (err) {
    result.error = String(err);
  }

  return NextResponse.json(result);
}

export const dynamic = "force-dynamic";
