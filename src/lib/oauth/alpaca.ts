/**
 * Alpaca API Key Helper — retrieves user's stored API keys
 * Users store their Alpaca API Key + Secret in their DILO profile.
 * No OAuth needed — simple key-based auth.
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface AlpacaKeys {
  keyId: string;
  secretKey: string;
  paperMode: boolean;
}

/** Get stored Alpaca API keys for a user */
export async function getAlpacaKeys(userId: string): Promise<AlpacaKeys | null> {
  try {
    const { data: user } = await supabase.from("users").select("preferences").eq("id", userId).single();
    const prefs = (user?.preferences as Record<string, unknown>) || {};
    const alpaca = prefs.alpaca_keys as Record<string, unknown> | undefined;

    if (!alpaca?.key_id || !alpaca?.secret_key) return null;

    return {
      keyId: Buffer.from(alpaca.key_id as string, "base64").toString(),
      secretKey: Buffer.from(alpaca.secret_key as string, "base64").toString(),
      paperMode: (alpaca.paper_mode as boolean) !== false, // default true (safe)
    };
  } catch (err) {
    console.error("[Alpaca] getAlpacaKeys error:", err);
    return null;
  }
}

/** Save Alpaca API keys for a user */
export async function saveAlpacaKeys(userId: string, keyId: string, secretKey: string, paperMode = true): Promise<boolean> {
  try {
    const { data: user } = await supabase.from("users").select("preferences").eq("id", userId).single();
    const prefs = (user?.preferences as Record<string, unknown>) || {};

    prefs.alpaca_keys = {
      key_id: Buffer.from(keyId).toString("base64"),
      secret_key: Buffer.from(secretKey).toString("base64"),
      paper_mode: paperMode,
    };

    await supabase.from("users").update({ preferences: prefs }).eq("id", userId);
    return true;
  } catch (err) {
    console.error("[Alpaca] saveAlpacaKeys error:", err);
    return false;
  }
}

/** Check if user has Alpaca connected */
export async function hasAlpacaConnection(userId: string): Promise<boolean> {
  const keys = await getAlpacaKeys(userId);
  return keys !== null;
}

// Keep backward compat — return null (no longer OAuth-based)
export async function getAlpacaAccessToken(userId: string): Promise<string | null> {
  return null;
}
