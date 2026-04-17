/**
 * Subscription Tracker — user tells DILO what they pay monthly
 * DILO tracks, calculates totals, and flags unused ones
 */

import OpenAI from "openai";
import { getServiceRoleClient } from "@/lib/supabase/service";

const supabase = getServiceRoleClient();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

interface Subscription {
  name: string;
  amount: number;
  frequency: string;
}

/** Parse subscriptions from natural language using LLM */
async function parseSubscriptions(text: string): Promise<Subscription[]> {
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 300,
      temperature: 0,
      messages: [
        { role: "system", content: 'Extract subscriptions/recurring payments from the text. Return ONLY a JSON array. Each item: {"name":"Netflix","amount":13.99,"frequency":"monthly"}. If no subscriptions found, return []. frequency can be: monthly, yearly, weekly.' },
        { role: "user", content: text },
      ],
    });
    const content = res.choices[0]?.message?.content?.trim() || "[]";
    return JSON.parse(content.replace(/```json\n?/g, "").replace(/```/g, ""));
  } catch { return []; }
}

/** Add subscriptions for a user */
export async function addSubscriptions(userId: string, text: string): Promise<string> {
  const subs = await parseSubscriptions(text);

  if (subs.length === 0) {
    return "No detecté suscripciones en tu mensaje. Dime algo como: 'Pago Netflix 13.99, Spotify 10.99, gym 39.90 al mes'.";
  }

  let added = 0;
  for (const sub of subs) {
    // Check if already exists
    const { data: existing } = await supabase.from("subscriptions")
      .select("id").eq("user_id", userId).ilike("name", `%${sub.name}%`).eq("status", "active").maybeSingle();

    if (existing) {
      // Update amount
      await supabase.from("subscriptions").update({ amount: sub.amount }).eq("id", existing.id);
    } else {
      await supabase.from("subscriptions").insert({
        user_id: userId,
        name: sub.name,
        amount: sub.amount,
        frequency: sub.frequency,
      });
      added++;
    }
  }

  // Get totals
  return listSubscriptions(userId);
}

/** List all active subscriptions with totals */
export async function listSubscriptions(userId: string): Promise<string> {
  const { data } = await supabase.from("subscriptions")
    .select("name, amount, frequency, status, created_at")
    .eq("user_id", userId).eq("status", "active")
    .order("amount", { ascending: false });

  if (!data?.length) {
    return "No tienes suscripciones registradas. Dime tus pagos mensuales y los trackeo. Ejemplo: 'Pago Netflix 13.99, Spotify 10.99 y gym 39.90'.";
  }

  let monthlyTotal = 0;
  let response = "**📱 Tus suscripciones activas:**\n\n";

  for (const sub of data) {
    const monthly = sub.frequency === "yearly" ? sub.amount / 12 : sub.frequency === "weekly" ? sub.amount * 4.33 : sub.amount;
    monthlyTotal += monthly;
    response += `- **${sub.name}**: ${sub.amount.toFixed(2)} €/${sub.frequency === "monthly" ? "mes" : sub.frequency === "yearly" ? "año" : "semana"}\n`;
  }

  const yearlyTotal = monthlyTotal * 12;
  response += `\n**Total mensual: ${monthlyTotal.toFixed(2)} €/mes**\n`;
  response += `**Total anual: ${yearlyTotal.toFixed(0)} €/año**\n`;

  if (monthlyTotal > 50) {
    response += `\n💡 *Consejo: revisa si usas todas. ¿Hay alguna que no uses? Dime 'cancelar [nombre]' y la marco.*`;
  }

  return response;
}

/** Cancel a subscription */
export async function cancelSubscription(userId: string, name: string): Promise<string> {
  const { data } = await supabase.from("subscriptions")
    .select("id, name, amount").eq("user_id", userId).eq("status", "active")
    .ilike("name", `%${name}%`).limit(1).maybeSingle();

  if (!data) return `No encontré una suscripción llamada "${name}".`;

  await supabase.from("subscriptions").update({
    status: "cancelled",
    cancelled_at: new Date().toISOString(),
  }).eq("id", data.id);

  return `✅ **${data.name}** cancelada. Ahorras ${data.amount.toFixed(2)} €/mes (${(data.amount * 12).toFixed(0)} €/año).`;
}
