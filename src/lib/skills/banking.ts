/**
 * Open Banking via Tink — connect bank accounts, read transactions
 * Tink (by Visa) is free for EU Open Banking
 *
 * Flow:
 * 1. Create Tink user for our user
 * 2. Generate Tink Link URL (user connects their bank)
 * 3. Read transactions to detect subscriptions, spending patterns
 */

const TINK_API = "https://api.tink.com/api/v1";
const CLIENT_ID = process.env.TINK_CLIENT_ID!;
const CLIENT_SECRET = process.env.TINK_CLIENT_SECRET!;

/** Get client access token */
async function getClientToken(scope: string): Promise<string | null> {
  try {
    const res = await fetch(`${TINK_API}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&grant_type=client_credentials&scope=${scope}`,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.access_token || null;
  } catch { return null; }
}

/** Create a Tink user for a DILO user */
export async function createTinkUser(diloUserId: string): Promise<string | null> {
  const token = await getClientToken("user:create");
  if (!token) return null;

  try {
    const res = await fetch(`${TINK_API}/user/create`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        external_user_id: diloUserId,
        market: "ES",
        locale: "es_ES",
      }),
    });
    if (!res.ok) {
      // User already exists is OK
      const err = await res.text();
      console.log("[Tink] Create user response:", res.status, err);
      return diloUserId; // Continue anyway — user likely already exists
    }
    const data = await res.json();
    return data.user_id || diloUserId;
  } catch { return null; }
}

/** Generate a Tink Link URL for user to connect their bank */
export async function generateBankConnectionLink(diloUserId: string, redirectUrl: string): Promise<string | null> {
  // First ensure Tink user exists
  const tinkUser = await createTinkUser(diloUserId);
  console.log("[Tink] User created/exists:", tinkUser);

  // Get authorization grant for this user
  const token = await getClientToken("authorization:grant");
  if (!token) { console.error("[Tink] Failed to get auth grant token"); return null; }

  try {
    const res = await fetch(`${TINK_API}/oauth/authorization-grant`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: `external_user_id=${diloUserId}&scope=accounts:read,balances:read,transactions:read,credentials:read`,
    });
    if (!res.ok) { console.error("[Tink] Auth grant error:", await res.text()); return null; }
    const data = await res.json();
    const code = data.code;
    if (!code) return null;

    // Build Tink Link URL
    const tinkLink = `https://link.tink.com/1.0/transactions/connect-accounts` +
      `?client_id=${CLIENT_ID}` +
      `&redirect_uri=${encodeURIComponent(redirectUrl)}` +
      `&authorization_code=${code}` +
      `&market=ES` +
      `&locale=es_ES`;

    return tinkLink;
  } catch { return null; }
}

/** Get user access token (after bank is connected) */
async function getUserToken(diloUserId: string): Promise<string | null> {
  const token = await getClientToken("authorization:grant");
  if (!token) return null;

  try {
    const res = await fetch(`${TINK_API}/oauth/authorization-grant`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: `external_user_id=${diloUserId}&scope=accounts:read,balances:read,transactions:read`,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const code = data.code;
    if (!code) return null;

    // Exchange code for user token
    const tokenRes = await fetch(`${TINK_API}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&grant_type=authorization_code&code=${code}`,
    });
    if (!tokenRes.ok) return null;
    const tokenData = await tokenRes.json();
    return tokenData.access_token || null;
  } catch { return null; }
}

interface Transaction {
  description: string;
  amount: number;
  date: string;
  category: string;
}

/** Fetch recent transactions for a connected user */
export async function getTransactions(diloUserId: string, days: number = 30): Promise<Transaction[]> {
  const token = await getUserToken(diloUserId);
  if (!token) return [];

  try {
    const res = await fetch(`${TINK_API}/search`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        queryString: "*",
        limit: 100,
        sort: "DATE",
        order: "DESC",
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();

    return (data.results || []).map((t: Record<string, unknown>) => ({
      description: String(t.description || ""),
      amount: Number(t.amount || 0),
      date: String(t.date || ""),
      category: String((t.categoryType as string) || "OTHER"),
    }));
  } catch { return []; }
}

/** Detect recurring subscriptions from transactions */
export async function detectSubscriptions(diloUserId: string): Promise<string> {
  const transactions = await getTransactions(diloUserId, 90);

  if (transactions.length === 0) {
    return "No pude acceder a tus transacciones. ¿Has conectado tu banco? Dime 'Conectar mi banco' para empezar.";
  }

  // Find recurring charges (same description + similar amount, 2+ times)
  const recurring = new Map<string, { count: number; totalAmount: number; amounts: number[] }>();

  for (const t of transactions) {
    if (t.amount >= 0) continue; // Only expenses
    const key = t.description.toLowerCase().replace(/\d{2}\/\d{2}/g, "").trim();
    if (!recurring.has(key)) recurring.set(key, { count: 0, totalAmount: 0, amounts: [] });
    const r = recurring.get(key)!;
    r.count++;
    r.totalAmount += Math.abs(t.amount);
    r.amounts.push(Math.abs(t.amount));
  }

  // Filter: at least 2 occurrences, consistent amount (±20%)
  const subscriptions: Array<{ name: string; monthlyAmount: number; count: number }> = [];
  for (const [name, data] of recurring) {
    if (data.count < 2) continue;
    const avg = data.totalAmount / data.count;
    const consistent = data.amounts.every(a => Math.abs(a - avg) / avg < 0.2);
    if (consistent && avg > 1) {
      subscriptions.push({ name, monthlyAmount: Math.round(avg * 100) / 100, count: data.count });
    }
  }

  if (subscriptions.length === 0) {
    return "No detecté suscripciones recurrentes en tus últimas transacciones.";
  }

  subscriptions.sort((a, b) => b.monthlyAmount - a.monthlyAmount);
  const total = subscriptions.reduce((s, sub) => s + sub.monthlyAmount, 0);

  let response = `**📱 Suscripciones detectadas** *(últimos 3 meses)*\n\n`;
  for (const sub of subscriptions) {
    response += `- **${sub.name}**: ${sub.monthlyAmount.toFixed(2)} €/mes (${sub.count} cargos)\n`;
  }
  response += `\n**Total suscripciones: ${total.toFixed(2)} €/mes (${(total * 12).toFixed(0)} €/año)**\n`;
  response += `\n¿Quieres que revise cuáles no estás usando para cancelarlas?`;

  return response;
}
