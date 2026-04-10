/**
 * Wolfram Alpha Short Answers API client
 * Free tier: 2,000 calls/month
 * Requires WOLFRAM_APP_ID env var
 */

export interface WolframResult {
  answer: string;
  success: boolean;
}

/**
 * Query Wolfram Alpha for a short answer to a calculation or factual question
 */
export async function queryWolfram(query: string): Promise<WolframResult> {
  const appId = process.env.WOLFRAM_APP_ID;
  if (!appId) {
    return { answer: "Wolfram Alpha no está configurado (falta WOLFRAM_APP_ID)", success: false };
  }

  try {
    const res = await fetch(
      `https://api.wolframalpha.com/v1/result?appid=${appId}&i=${encodeURIComponent(query)}&units=metric`,
      { signal: AbortSignal.timeout(10000) }
    );

    if (!res.ok) {
      const text = await res.text();
      return { answer: text || "No se pudo calcular", success: false };
    }

    const answer = await res.text();
    return { answer, success: true };
  } catch {
    return { answer: "Error al conectar con Wolfram Alpha", success: false };
  }
}
