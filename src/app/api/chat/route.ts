import { NextRequest } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const langNames: Record<string, string> = {
  es: "español", en: "English", fr: "français", it: "italiano", de: "Deutsch",
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

import { EXTENDED_TOOLS, ALL_TRADING_TOOLS, FOREX_TOOLS, TRADING_MEMORY_TOOLS, KNOWLEDGE_TOOLS, ENTERTAINMENT_TOOLS, TRADING_EMOTIONAL_TOOLS, executeExtendedTool } from "@/lib/skills";
import { planAgents, getAgentDefinition, executeAgent, synthesize } from "@/lib/agent/orchestrator";

// Tool definitions for OpenAI function calling (base — trading added dynamically)
const baseTools: OpenAI.ChatCompletionTool[] = [
  ...EXTENDED_TOOLS,
  {
    type: "function",
    function: {
      name: "create_reminder",
      description: "Create a reminder. Use ALWAYS when user asks to be reminded of something.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "What to remind about" },
          due_at: { type: "string", description: "ISO 8601 datetime. Calculate from current time." },
          repeat_count: { type: "number", description: "How many times. Default 1." },
        },
        required: ["text", "due_at"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_reminders",
      description: "List pending reminders.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "cancel_reminder",
      description: "Cancel a reminder by text match.",
      parameters: {
        type: "object",
        properties: { search_text: { type: "string" } },
        required: ["search_text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "track_expense",
      description: "Record expenses. Use ALWAYS when user mentions spending money.",
      parameters: {
        type: "object",
        properties: {
          expenses: {
            type: "array",
            items: {
              type: "object",
              properties: {
                amount: { type: "number" },
                category: { type: "string", enum: ["food", "transport", "entertainment", "home", "health", "shopping", "bills", "auto", "subscriptions", "education", "other"] },
                description: { type: "string" },
              },
              required: ["amount", "description"],
            },
          },
        },
        required: ["expenses"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_expenses",
      description: "Get expense summary for today/week/month.",
      parameters: {
        type: "object",
        properties: { period: { type: "string", enum: ["today", "week", "month"] } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate",
      description: "Math calculation.",
      parameters: {
        type: "object",
        properties: { expression: { type: "string" } },
        required: ["expression"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_image",
      description: "Generate an image from a text description. Use when user asks to create, draw, design, or generate an image, logo, illustration, etc.",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Detailed image description in English for best results" },
          style: { type: "string", enum: ["photographic", "digital-art", "comic-book", "fantasy-art", "analog-film", "neon-punk", "3d-model", "pixel-art"], description: "Art style. Default: photographic" },
        },
        required: ["prompt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_contacts",
      description: "Search WhatsApp contacts by name. Use FIRST when user mentions a contact by name.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_whatsapp",
      description: "Read WhatsApp messages from a contact or all chats.",
      parameters: {
        type: "object",
        properties: {
          phone: { type: "string", description: "Phone number or empty for all" },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_whatsapp",
      description: "Send WhatsApp message. ALWAYS show preview first (confirmed=false), then send after user confirms (confirmed=true).",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Phone number (digits only, with country code)" },
          message: { type: "string", description: "Message to send. Translate if user requests another language." },
          target_language: { type: "string", description: "Language code if translation needed" },
          confirmed: { type: "boolean", description: "false=preview, true=send" },
        },
        required: ["to", "message"],
      },
    },
  },
];

// Tool execution (same logic as before)
async function executeTool(name: string, input: Record<string, unknown>, userId: string): Promise<string> {
  const evoUrl = process.env.EVOLUTION_API_URL!;
  const evoKey = process.env.EVOLUTION_API_KEY!;
  const instName = `dilo_${userId.slice(0, 8)}`;

  switch (name) {
    case "create_reminder": {
      const { text, due_at, repeat_count = 1 } = input as { text: string; due_at: string; repeat_count?: number };
      const { data, error } = await supabase.from("reminders").insert({
        user_id: userId, text, due_at, repeat_count, channel: "push", status: "pending", repeat_type: "once",
      }).select("id, text, due_at").single();
      if (error) return JSON.stringify({ error: error.message });
      return JSON.stringify({ success: true, reminder: data });
    }

    case "list_reminders": {
      const { data: pending } = await supabase.from("reminders").select("id, text, due_at, status, repeat_count, repeats_sent")
        .eq("user_id", userId).eq("status", "pending").order("due_at", { ascending: true }).limit(10);
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data: recent } = await supabase.from("reminders").select("id, text, due_at, status")
        .eq("user_id", userId).eq("status", "sent").gte("created_at", weekAgo)
        .order("due_at", { ascending: false }).limit(5);
      return JSON.stringify({ pending: pending || [], recently_sent: recent || [] });
    }

    case "cancel_reminder": {
      const { search_text } = input as { search_text: string };
      const { data: reminders } = await supabase.from("reminders").select("id, text")
        .eq("user_id", userId).eq("status", "pending").ilike("text", `%${search_text}%`);
      if (!reminders?.length) return JSON.stringify({ error: "No matching reminder" });
      await supabase.from("reminders").update({ status: "cancelled" }).eq("id", reminders[0].id);
      return JSON.stringify({ success: true, cancelled: reminders[0].text });
    }

    case "track_expense": {
      const { expenses } = input as { expenses: Array<{ amount: number; category?: string; description: string }> };
      const results = [];
      for (const exp of expenses) {
        const { error } = await supabase.from("expenses").insert({
          user_id: userId, amount: exp.amount, currency: "EUR",
          category: exp.category || "other", description: exp.description,
          date: new Date().toISOString().split("T")[0],
        });
        results.push({ description: exp.description, amount: exp.amount, saved: !error });
      }
      const today = new Date().toISOString().split("T")[0];
      const { data: todayExp } = await supabase.from("expenses").select("amount").eq("user_id", userId).eq("date", today);
      const todayTotal = todayExp?.reduce((s, e) => s + Number(e.amount), 0) || 0;
      return JSON.stringify({ saved: results, today_total: todayTotal });
    }

    case "get_expenses": {
      const { period = "today" } = input as { period?: string };
      const now = new Date();
      let fromDate: string;
      if (period === "week") { const d = new Date(now); d.setDate(d.getDate() - 7); fromDate = d.toISOString().split("T")[0]; }
      else if (period === "month") { fromDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`; }
      else { fromDate = now.toISOString().split("T")[0]; }
      const { data } = await supabase.from("expenses").select("amount, category, description, date")
        .eq("user_id", userId).gte("date", fromDate).order("date", { ascending: false });
      const total = data?.reduce((s, e) => s + Number(e.amount), 0) || 0;
      const byCategory: Record<string, number> = {};
      data?.forEach(e => { byCategory[e.category] = (byCategory[e.category] || 0) + Number(e.amount); });
      return JSON.stringify({ period, total, by_category: byCategory, expenses: data?.slice(0, 20) || [] });
    }

    case "calculate": {
      try {
        const expr = String(input.expression).replace(/[^0-9+\-*/().,%\s]/g, "");
        const result = Function(`"use strict"; return (${expr})`)();
        return JSON.stringify({ result });
      } catch { return JSON.stringify({ error: "Invalid expression" }); }
    }

    case "generate_image": {
      const { prompt, style = "photographic" } = input as { prompt: string; style?: string };

      // Try Stability AI first (cheaper), fallback to DALL-E
      const stabilityKey = process.env.STABILITY_API_KEY;

      if (stabilityKey && stabilityKey !== "placeholder") {
        try {
          const res = await fetch("https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${stabilityKey}`, Accept: "application/json" },
            body: JSON.stringify({
              text_prompts: [{ text: prompt, weight: 1 }],
              cfg_scale: 7, height: 1024, width: 1024, steps: 30, samples: 1,
              style_preset: style,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            const base64 = data.artifacts?.[0]?.base64;
            if (base64) {
              const imageUrl = `data:image/png;base64,${base64}`;
              return JSON.stringify({ success: true, image_url: imageUrl, prompt });
            }
          }
        } catch { /* fallback to DALL-E */ }
      }

      // Fallback: DALL-E 3
      try {
        const dalle = await openai.images.generate({
          model: "dall-e-3", prompt, n: 1, size: "1024x1024", quality: "standard",
        });
        const imageUrl = dalle.data?.[0]?.url;
        if (imageUrl) return JSON.stringify({ success: true, image_url: imageUrl, prompt });
        return JSON.stringify({ error: "Image generation failed" });
      } catch (e) {
        return JSON.stringify({ error: e instanceof Error ? e.message : "Image generation failed" });
      }
    }

    case "search_contacts": {
      try {
        const res = await fetch(`${evoUrl}/chat/findContacts/${instName}`, {
          method: "POST", headers: { "Content-Type": "application/json", apikey: evoKey },
          body: JSON.stringify({ where: { pushName: { contains: String(input.query) } } }),
        });
        let contactsRaw = await res.json();
        // Handle multiple response formats: array, { contacts: [] }, or other wrapper
        const contactsList = Array.isArray(contactsRaw) ? contactsRaw
          : Array.isArray(contactsRaw?.contacts) ? contactsRaw.contacts
          : Array.isArray(contactsRaw?.data) ? contactsRaw.data : [];

        const q = String(input.query).toLowerCase();
        // Search in multiple name fields for robustness
        const matches = contactsList
          .filter((c: Record<string, unknown>) => {
            const searchable = [
              c.pushName, c.name, c.profileName, c.verifiedName, c.shortName, c.formattedName,
            ].filter(Boolean).map(v => String(v).toLowerCase()).join(" ");
            return searchable.includes(q);
          })
          .slice(0, 10).map((c: Record<string, unknown>) => ({
            name: c.pushName || c.profileName || c.name || c.verifiedName || c.shortName || "Sin nombre",
            phone: String(c.id || c.remoteJid || c.jid || "").replace("@s.whatsapp.net", ""),
          }));

        // If no matches with pre-filter, try fetching ALL contacts and searching locally
        if (matches.length === 0) {
          const res2 = await fetch(`${evoUrl}/chat/findContacts/${instName}`, {
            method: "POST", headers: { "Content-Type": "application/json", apikey: evoKey },
            body: JSON.stringify({}),
          });
          let allRaw = await res2.json();
          const allList = Array.isArray(allRaw) ? allRaw
            : Array.isArray(allRaw?.contacts) ? allRaw.contacts
            : Array.isArray(allRaw?.data) ? allRaw.data : [];

          const fallbackMatches = allList
            .filter((c: Record<string, unknown>) => {
              const searchable = [
                c.pushName, c.name, c.profileName, c.verifiedName, c.shortName, c.formattedName,
              ].filter(Boolean).map(v => String(v).toLowerCase()).join(" ");
              return searchable.includes(q);
            })
            .slice(0, 10).map((c: Record<string, unknown>) => ({
              name: c.pushName || c.profileName || c.name || c.verifiedName || c.shortName || "Sin nombre",
              phone: String(c.id || c.remoteJid || c.jid || "").replace("@s.whatsapp.net", ""),
            }));

          return JSON.stringify({ found: fallbackMatches.length, contacts: fallbackMatches, total_contacts: allList.length });
        }

        return JSON.stringify({ found: matches.length, contacts: matches });
      } catch (err) { return JSON.stringify({ error: "WhatsApp not connected", details: String(err) }); }
    }

    case "read_whatsapp": {
      const { phone, limit = 10 } = input as { phone?: string; limit?: number };
      try {
        if (phone) {
          const res = await fetch(`${evoUrl}/chat/findMessages/${instName}`, {
            method: "POST", headers: { "Content-Type": "application/json", apikey: evoKey },
            body: JSON.stringify({ where: { key: { remoteJid: `${phone}@s.whatsapp.net` } }, limit }),
          });
          const data = await res.json();
          const messages = Array.isArray(data) ? data : data?.messages || [];
          return JSON.stringify({ messages: messages.slice(0, limit).map((m: Record<string, unknown>) => ({
            from: (m.key as Record<string, unknown>)?.fromMe ? "Tú" : (m.pushName || phone),
            text: ((m.message as Record<string, unknown>)?.conversation || "[media]") as string,
          }))});
        }
        const res = await fetch(`${evoUrl}/chat/findChats/${instName}`, { headers: { apikey: evoKey } });
        const chats = await res.json();
        return JSON.stringify({ chats: Array.isArray(chats) ? chats.slice(0, limit).map((c: Record<string, unknown>) => ({
          name: c.name || c.id, lastMessage: (c.lastMessage as Record<string, unknown>)?.conversation || "",
        })) : [] });
      } catch { return JSON.stringify({ error: "WhatsApp not connected" }); }
    }

    case "send_whatsapp": {
      const { to, message, target_language, confirmed } = input as { to: string; message: string; target_language?: string; confirmed?: boolean };
      let finalMessage = message;

      // Translate if needed
      if (target_language && !confirmed) {
        try {
          const tr = await openai.chat.completions.create({
            model: "gpt-4o-mini", max_tokens: 500,
            messages: [{ role: "user", content: `Translate to ${target_language}. Return ONLY the translation:\n\n${message}` }],
          });
          finalMessage = tr.choices[0]?.message?.content?.trim() || message;
        } catch { /* use original */ }
      }

      if (!confirmed) {
        return JSON.stringify({ preview: true, to, message: finalMessage, original: target_language ? message : undefined });
      }

      try {
        const res = await fetch(`${evoUrl}/message/sendText/${instName}`, {
          method: "POST", headers: { "Content-Type": "application/json", apikey: evoKey },
          body: JSON.stringify({ number: to, text: finalMessage }),
        });
        const data = await res.json();
        if (!res.ok) return JSON.stringify({ error: "Failed to send", details: data });
        return JSON.stringify({ success: true, sent_to: to, message: finalMessage });
      } catch { return JSON.stringify({ error: "WhatsApp not connected" }); }
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

export async function POST(req: NextRequest) {
  const { messages: allMessages, locale = "es", conversationId, userId } = await req.json();

  // Detect user's city: user_facts (most accurate) → Vercel IP (fallback)
  let userCity: string | null = null;

  // Method 1: user_facts — DILO learned where user lives from conversations
  if (userId) {
    const { data: cityFact } = await supabase.from("user_facts")
      .select("fact").eq("user_id", userId).eq("category", "identity")
      .or("fact.ilike.%vivo en%,fact.ilike.%vive en%,fact.ilike.%ubicación%,fact.ilike.%ciudad%")
      .limit(1).maybeSingle();
    if (cityFact?.fact) {
      // Extract city from fact like "Vivo en Icod de los Vinos, Tenerife"
      const match = cityFact.fact.match(/(?:viv[oe] en|ciudad[:\s]+|ubicaci[oó]n[:\s]+)\s*(.+)/i);
      userCity = match ? match[1].trim() : cityFact.fact;
    }
    if (!userCity) {
      const { data: cityFact2 } = await supabase.from("user_facts")
        .select("fact").eq("user_id", userId).eq("category", "identity")
        .or("fact.ilike.%Tenerife%,fact.ilike.%Canarias%,fact.ilike.%Madrid%,fact.ilike.%Barcelona%")
        .limit(1).maybeSingle();
      if (cityFact2?.fact) {
        userCity = cityFact2.fact;
      }
    }
  }

  // Method 2: Vercel IP geolocation (less accurate — ISP node, not real location)
  if (!userCity) {
    const vercelCity = req.headers.get("x-vercel-ip-city");
    if (vercelCity && vercelCity !== "unknown") {
      userCity = decodeURIComponent(vercelCity);
    }
  }

  if (!allMessages?.length) return new Response("Missing messages", { status: 400 });

  // Send last 20 messages for better context (images stripped to avoid token explosion)
  const messages = allMessages.slice(-20).map((m: { role: string; content: string }) => ({
    ...m,
    content: m.content.startsWith("__IMAGE__") ? "[Foto adjunta]"
      : m.content.startsWith("![") ? "[Imagen generada]"
      : m.content.replace(/Generando imagen\.\.\./, "").trim() || m.content,
  })).filter((m: { content: string }) => m.content);

  // ═══════════════════════════════════════════
  // SMART ROUTER — bypass LLM for simple actions
  // ═══════════════════════════════════════════
  const { detectIntent } = await import("@/lib/agent/router");
  const lastMsgContent = allMessages[allMessages.length - 1]?.content || "";
  const intent = allMessages[allMessages.length - 1]?.role === "user" ? detectIntent(lastMsgContent) : { type: "chat" as const };

  // Helper: save message + create conv if needed
  async function saveMsg(role: string, content: string, convIdRef: string | null): Promise<string | null> {
    let cid = convIdRef;
    if (!userId) return cid;
    if (!cid) {
      const { data: conv } = await supabase.from("conversations")
        .insert({ user_id: userId, title: lastMsgContent.slice(0, 50) }).select("id").single();
      cid = conv?.id || null;
    }
    if (cid) await supabase.from("messages").insert({ conversation_id: cid, user_id: userId, role, content });
    return cid;
  }

  const encoder = new TextEncoder();

  // ── EXPENSE (direct, no LLM) ──
  if (intent.type === "expense" && intent.data?.expenses) {
    const expenses = intent.data.expenses as Array<{ amount: number; description: string; category: string }>;
    let cid = await saveMsg("user", lastMsgContent, conversationId);

    for (const exp of expenses) {
      await supabase.from("expenses").insert({
        user_id: userId, amount: exp.amount, currency: "EUR",
        category: exp.category, description: exp.description,
        date: new Date().toISOString().split("T")[0],
      });
    }

    const today = new Date().toISOString().split("T")[0];
    const { data: todayExp } = await supabase.from("expenses").select("amount").eq("user_id", userId).eq("date", today);
    const todayTotal = todayExp?.reduce((s, e) => s + Number(e.amount), 0) || 0;

    const lines = expenses.map(e => `• ${e.description}: €${e.amount.toFixed(2)}`).join("\n");
    const response = `✅ Gastos registrados:\n${lines}\n\n**Total hoy: €${todayTotal.toFixed(2)}**`;
    cid = await saveMsg("assistant", response, cid);

    return new Response(response, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "X-Conversation-Id": cid || "" },
    });
  }

  // ── EXPENSE QUERY (direct, no LLM) ──
  if (intent.type === "expense_query") {
    const period = (intent.data?.period as string) || "today";
    let cid = await saveMsg("user", lastMsgContent, conversationId);

    const now = new Date();
    let fromDate: string;
    if (period === "week") { const d = new Date(now); d.setDate(d.getDate() - 7); fromDate = d.toISOString().split("T")[0]; }
    else if (period === "month") { fromDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`; }
    else { fromDate = now.toISOString().split("T")[0]; }

    const { data } = await supabase.from("expenses").select("amount, category, description, date")
      .eq("user_id", userId).gte("date", fromDate).order("date", { ascending: false });

    const total = data?.reduce((s, e) => s + Number(e.amount), 0) || 0;
    const periodLabel = period === "week" ? "esta semana" : period === "month" ? "este mes" : "hoy";
    let response: string;

    if (!data?.length) {
      response = `No tienes gastos registrados ${periodLabel}.`;
    } else {
      const lines = data.slice(0, 15).map(e => `• ${e.description}: €${Number(e.amount).toFixed(2)}`).join("\n");
      response = `**Gastos ${periodLabel}: €${total.toFixed(2)}**\n\n${lines}`;
    }

    cid = await saveMsg("assistant", response, cid);
    return new Response(response, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "X-Conversation-Id": cid || "" },
    });
  }

  // ── REMINDER QUERY (direct, no LLM) ──
  if (intent.type === "reminder_query") {
    let cid = await saveMsg("user", lastMsgContent, conversationId);

    // Show pending reminders
    const { data: pending } = await supabase.from("reminders").select("text, due_at, status")
      .eq("user_id", userId).eq("status", "pending").order("due_at", { ascending: true }).limit(10);

    // Also show recently sent/created (last 7 days) so user sees everything
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data: recent } = await supabase.from("reminders").select("text, due_at, status")
      .eq("user_id", userId).eq("status", "sent").gte("created_at", weekAgo)
      .order("due_at", { ascending: false }).limit(5);

    let response: string;
    const pendingLines = pending?.map(r => `• ${r.text} — ${new Date(r.due_at).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })}`) || [];
    const sentLines = recent?.map(r => `• ~~${r.text}~~ ✓ (enviado ${new Date(r.due_at).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })})`) || [];

    if (pendingLines.length === 0 && sentLines.length === 0) {
      response = "No tienes recordatorios pendientes.";
    } else {
      const parts: string[] = [];
      if (pendingLines.length > 0) parts.push(`**Pendientes:**\n${pendingLines.join("\n")}`);
      if (sentLines.length > 0) parts.push(`**Enviados recientemente:**\n${sentLines.join("\n")}`);
      response = parts.join("\n\n");
    }

    cid = await saveMsg("assistant", response, cid);
    return new Response(response, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "X-Conversation-Id": cid || "" },
    });
  }

  // ── ELECTRICIDAD (REE API, gratis, tiempo real) ──
  if (intent.type === "electricidad") {
    let cid = await saveMsg("user", lastMsgContent, conversationId);
    const { getElectricityPrices } = await import("@/lib/skills/electricidad");
    const response = await getElectricityPrices();
    cid = await saveMsg("assistant", response, cid);
    return new Response(response, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Conversation-Id": cid || "" } });
  }

  // ── FARMACIA (Serper Shopping) ──
  if (intent.type === "farmacia") {
    let cid = await saveMsg("user", lastMsgContent, conversationId);
    const { compareMedication } = await import("@/lib/skills/ahorro");
    const response = await compareMedication(lastMsgContent, userCity || undefined);
    cid = await saveMsg("assistant", response, cid);
    return new Response(response, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Conversation-Id": cid || "" } });
  }

  // ── SEGUROS (búsqueda web comparadores) ──
  if (intent.type === "seguros") {
    let cid = await saveMsg("user", lastMsgContent, conversationId);
    const { compareInsurance } = await import("@/lib/skills/ahorro");
    const response = await compareInsurance((intent.data?.insuranceType as string) || "general", userCity || undefined);
    cid = await saveMsg("assistant", response, cid);
    return new Response(response, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Conversation-Id": cid || "" } });
  }

  // ── TELEFONIA (búsqueda web comparadores) ──
  if (intent.type === "telefonia") {
    let cid = await saveMsg("user", lastMsgContent, conversationId);
    const { comparePhonePlans } = await import("@/lib/skills/ahorro");
    const response = await comparePhonePlans();
    cid = await saveMsg("assistant", response, cid);
    return new Response(response, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Conversation-Id": cid || "" } });
  }

  // ── AYUDAS PUBLICAS (búsqueda web) ──
  if (intent.type === "ayudas_publicas") {
    let cid = await saveMsg("user", lastMsgContent, conversationId);
    const { findPublicAid } = await import("@/lib/skills/ahorro");
    const response = await findPublicAid(lastMsgContent);
    cid = await saveMsg("assistant", response, cid);
    return new Response(response, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Conversation-Id": cid || "" } });
  }

  // ── CUPONES DELIVERY (búsqueda web) ──
  if (intent.type === "cupones_delivery") {
    let cid = await saveMsg("user", lastMsgContent, conversationId);
    const { findFoodDeals } = await import("@/lib/skills/ahorro");
    const city = userCity || "España";
    const response = await findFoodDeals(city);
    cid = await saveMsg("assistant", response, cid);
    return new Response(response, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Conversation-Id": cid || "" } });
  }

  // ── CONECTAR GOOGLE (Gmail + Calendar) ──
  if (intent.type === "conectar_google") {
    if (!userId) {
      let cid = await saveMsg("user", lastMsgContent, conversationId);
      const response = "Necesitas iniciar sesión para conectar Google.";
      cid = await saveMsg("assistant", response, cid);
      return new Response(response, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Conversation-Id": cid || "" } });
    }
    if (!process.env.GOOGLE_CLIENT_ID) {
      let cid = await saveMsg("user", lastMsgContent, conversationId);
      const response = "Google OAuth no está configurado todavía.";
      cid = await saveMsg("assistant", response, cid);
      return new Response(response, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Conversation-Id": cid || "" } });
    }
    // Check if user already has a valid Google token — if so, fall through to LLM with tools
    const { hasGoogleConnection } = await import("@/lib/oauth/google");
    const connected = await hasGoogleConnection(userId);
    if (!connected) {
      let cid = await saveMsg("user", lastMsgContent, conversationId);
      const oauthUrl = `https://dilo-app-five.vercel.app/api/oauth/google?userId=${userId}`;
      const response = `Para poder leer tus emails y gestionar tu calendario, necesito que conectes tu cuenta de Google primero.\n\n👉 [Conectar Google](${oauthUrl})\n\nEs una conexión segura via Google OAuth. Puedes desconectar cuando quieras.`;
      cid = await saveMsg("assistant", response, cid);
      return new Response(response, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Conversation-Id": cid || "" } });
    }
    // User is connected — fall through to LLM which has gmail_* and calendar_* tools
  }

  // ── TRADING CONNECT ──
  if (intent.type === "trading_connect") {
    if (!userId) {
      let cid = await saveMsg("user", lastMsgContent, conversationId);
      const response = "Necesitas iniciar sesión para conectar tu broker.";
      cid = await saveMsg("assistant", response, cid);
      return new Response(response, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Conversation-Id": cid || "" } });
    }
    const { hasAlpacaConnection } = await import("@/lib/oauth/alpaca");
    const connected = await hasAlpacaConnection(userId);
    if (!connected) {
      let cid = await saveMsg("user", lastMsgContent, conversationId);
      const response = `Para conectar tu cuenta de trading, necesitas tus API keys de Alpaca.\n\n**Pasos:**\n1. Crea una cuenta gratis en [alpaca.markets](https://alpaca.markets) (incluye $100K virtuales para practicar)\n2. Ve a tu Dashboard → API\n3. Copia tu API Key ID y Secret Key\n4. Ve a tu **Perfil** en DILO y pégalas\n\nUna vez conectado, podré ver tu portfolio, analizar tu rendimiento, y ayudarte con la gestión de riesgo.`;
      cid = await saveMsg("assistant", response, cid);
      return new Response(response, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Conversation-Id": cid || "" } });
    }
    let cid = await saveMsg("user", lastMsgContent, conversationId);
    const response = "Tu broker ya está conectado. Puedes preguntarme por tu portfolio, rendimiento, o pedirme que analice tu riesgo.";
    cid = await saveMsg("assistant", response, cid);
    return new Response(response, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Conversation-Id": cid || "" } });
  }

  // ── TRADING (portfolio, performance, etc.) ──
  if (intent.type === "trading") {
    if (!userId) {
      let cid = await saveMsg("user", lastMsgContent, conversationId);
      const response = "Necesitas iniciar sesión para acceder a tu trading.";
      cid = await saveMsg("assistant", response, cid);
      return new Response(response, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Conversation-Id": cid || "" } });
    }
    const { hasAlpacaConnection } = await import("@/lib/oauth/alpaca");
    const connected = await hasAlpacaConnection(userId);
    if (!connected) {
      let cid = await saveMsg("user", lastMsgContent, conversationId);
      const response = `Para acceder a tu trading, primero configura tus API keys de Alpaca en tu **Perfil**.\n\nSi no tienes cuenta, crea una gratis en [alpaca.markets](https://alpaca.markets).`;
      cid = await saveMsg("assistant", response, cid);
      return new Response(response, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Conversation-Id": cid || "" } });
    }
    // Connected — fall through to LLM which has trading_* tools
  }

  // ── TRADING PORTFOLIO (direct execution — bypasses LLM) ──
  if (intent.type === "trading_portfolio") {
    let cid = await saveMsg("user", lastMsgContent, conversationId);
    if (!userId) {
      const response = "Necesitas iniciar sesión para ver tu portfolio.";
      cid = await saveMsg("assistant", response, cid);
      return new Response(response, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Conversation-Id": cid || "" } });
    }
    const { getAlpacaKeys } = await import("@/lib/oauth/alpaca");
    const keys = await getAlpacaKeys(userId);
    if (!keys) {
      const response = "Configura tus API keys de Alpaca en tu **Perfil** para ver tu portfolio.";
      cid = await saveMsg("assistant", response, cid);
      return new Response(response, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Conversation-Id": cid || "" } });
    }
    const { executeTrading } = await import("@/lib/skills/trading");
    const response = await executeTrading("trading_portfolio", {}, keys, userId);
    cid = await saveMsg("assistant", response, cid);
    return new Response(response, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Conversation-Id": cid || "" } });
  }

  // ── TRADING CALENDAR (direct execution) ──
  if (intent.type === "trading_calendar") {
    let cid = await saveMsg("user", lastMsgContent, conversationId);
    if (!userId) {
      const response = "Necesitas iniciar sesión para ver tu calendario de trading.";
      cid = await saveMsg("assistant", response, cid);
      return new Response(response, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Conversation-Id": cid || "" } });
    }
    const { executeTradingCalendar } = await import("@/lib/skills/trading-calendar");
    const response = await executeTradingCalendar("trading_calendar", {}, userId);
    cid = await saveMsg("assistant", response, cid);
    return new Response(response, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Conversation-Id": cid || "" } });
  }

  // ── MARKET SCAN (direct execution — bypasses LLM tool selection) ──
  if (intent.type === "market_scan") {
    let cid = await saveMsg("user", lastMsgContent, conversationId);
    if (!userId) {
      const response = "Necesitas iniciar sesión para acceder al análisis de mercado.";
      cid = await saveMsg("assistant", response, cid);
      return new Response(response, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Conversation-Id": cid || "" } });
    }
    const { hasAlpacaConnection } = await import("@/lib/oauth/alpaca");
    const connected = await hasAlpacaConnection(userId);
    if (!connected) {
      const response = `Para acceder al análisis de mercado, primero configura tus API keys de Alpaca en tu **Perfil**.`;
      cid = await saveMsg("assistant", response, cid);
      return new Response(response, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Conversation-Id": cid || "" } });
    }
    const { executeMarketAnalysis } = await import("@/lib/skills/market-analysis");
    const response = await executeMarketAnalysis("market_scan_opportunities", {});
    cid = await saveMsg("assistant", response, cid);
    return new Response(response, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Conversation-Id": cid || "" } });
  }

  // ── MARKET ANALYZE (direct execution — bypasses LLM tool selection) ──
  if (intent.type === "market_analyze" && intent.data?.symbol) {
    let cid = await saveMsg("user", lastMsgContent, conversationId);
    if (!userId) {
      const response = "Necesitas iniciar sesión para acceder al análisis de mercado.";
      cid = await saveMsg("assistant", response, cid);
      return new Response(response, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Conversation-Id": cid || "" } });
    }
    const { hasAlpacaConnection } = await import("@/lib/oauth/alpaca");
    const connected = await hasAlpacaConnection(userId);
    if (!connected) {
      const response = `Para acceder al análisis de mercado, primero configura tus API keys de Alpaca en tu **Perfil**.`;
      cid = await saveMsg("assistant", response, cid);
      return new Response(response, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Conversation-Id": cid || "" } });
    }
    const { executeMarketAnalysis } = await import("@/lib/skills/market-analysis");
    const response = await executeMarketAnalysis("market_analyze_stock", { symbol: intent.data.symbol });
    cid = await saveMsg("assistant", response, cid);
    return new Response(response, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Conversation-Id": cid || "" } });
  }

  // ── SUSCRIPCIONES (manual — el usuario dice qué paga) ──
  if (intent.type === "suscripciones") {
    let cid = await saveMsg("user", lastMsgContent, conversationId);
    if (!userId) {
      const response = "Necesitas iniciar sesión para gestionar tus suscripciones.";
      cid = await saveMsg("assistant", response, cid);
      return new Response(response, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Conversation-Id": cid || "" } });
    }
    const { addSubscriptions, listSubscriptions, cancelSubscription } = await import("@/lib/skills/subscriptions");
    const lower = lastMsgContent.toLowerCase();
    let response: string;
    if (/cancel/i.test(lower)) {
      const name = lower.replace(/.*cancel\w*\s+/i, "").trim();
      response = await cancelSubscription(userId, name);
    } else if (/(?:pago|tengo|añad|registro|subscri)/i.test(lower) && /\d/.test(lower)) {
      response = await addSubscriptions(userId, lastMsgContent);
    } else {
      response = await listSubscriptions(userId);
    }
    cid = await saveMsg("assistant", response, cid);
    return new Response(response, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Conversation-Id": cid || "" } });
  }

  // ── CUPONES (buscar códigos descuento) ──
  if (intent.type === "cupones") {
    let cid = await saveMsg("user", lastMsgContent, conversationId);
    const { findCoupons } = await import("@/lib/skills/cupones");
    const response = await findCoupons(lastMsgContent);
    cid = await saveMsg("assistant", response, cid);
    return new Response(response, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Conversation-Id": cid || "" } });
  }

  // ── ALERTA PRECIO (rastrear precio de un producto) ──
  if (intent.type === "alerta_precio") {
    let cid = await saveMsg("user", lastMsgContent, conversationId);
    if (!userId) {
      const response = "Necesitas iniciar sesión para crear alertas de precio.";
      cid = await saveMsg("assistant", response, cid);
      return new Response(response, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Conversation-Id": cid || "" } });
    }
    const { createPriceAlert } = await import("@/lib/skills/price-alerts");
    const response = await createPriceAlert(userId, lastMsgContent);
    cid = await saveMsg("assistant", response, cid);
    return new Response(response, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Conversation-Id": cid || "" } });
  }

  // ── COMPARAR PRODUCTO (Google Shopping) ──
  if (intent.type === "comparar_producto") {
    let cid = await saveMsg("user", lastMsgContent, conversationId);
    const { compareProductPrice } = await import("@/lib/skills/ahorro");
    const response = await compareProductPrice(lastMsgContent);
    cid = await saveMsg("assistant", response, cid);
    return new Response(response, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Conversation-Id": cid || "" } });
  }

  // ── Helper: extract REAL city name from message (filter out vague phrases) ──
  function extractCityFromMessage(msg: string): string | null {
    const vague = ["donde estoy", "aqui", "aquí", "cerca", "mi zona", "mi ciudad", "mi pueblo", "mi barrio", "ahora mismo", "ahora", "here", "nearby", "my area"];
    const match = msg.match(/(?:en|cerca de|de|desde)\s+([A-ZÁÉÍÓÚa-záéíóúñÑ\s]{3,40})/i);
    if (!match) return null;
    const candidate = match[1].trim().toLowerCase();
    // Filter out vague phrases
    if (vague.some(v => candidate.includes(v))) return null;
    // Filter out common non-city words
    if (/^(donde|aqui|aquí|cerca|mi |ahora|la |el |los |las |un |una )/.test(candidate)) return null;
    return match[1].trim();
  }

  // ── RESTAURANTES (Serper Places + Bayesian weighted rating) ──
  if (intent.type === "restaurantes") {
    let cid = await saveMsg("user", lastMsgContent, conversationId);
    const cityFromMsg = extractCityFromMessage(lastMsgContent);
    const city = cityFromMsg || userCity || null;
    if (!city) {
      const response = "¿En qué ciudad buscas restaurantes? Ejemplo: 'Restaurantes en Icod de los Vinos'.";
      cid = await saveMsg("assistant", response, cid);
      return new Response(response, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Conversation-Id": cid || "" } });
    }
    const { findRestaurants } = await import("@/lib/skills/restaurantes");
    const cuisine = intent.data?.cuisine as string | undefined;
    const response = await findRestaurants(city, cuisine);
    cid = await saveMsg("assistant", response, cid);
    return new Response(response, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "X-Conversation-Id": cid || "" },
    });
  }

  // ── GASOLINERAS (API Ministerio, gratis, tiempo real) ──
  if (intent.type === "gasolineras") {
    let cid = await saveMsg("user", lastMsgContent, conversationId);
    const { findCheapestGasByCity } = await import("@/lib/skills/gasolineras");
    const fuelType = (intent.data?.fuelType as "gasolina95" | "gasoleoA") || "gasolina95";
    const cityFromMsg = extractCityFromMessage(lastMsgContent);
    const city = cityFromMsg || userCity || null;
    if (!city) {
      const response = "¿En qué ciudad estás? Ejemplo: 'Gasolina barata en Icod de los Vinos'.";
      cid = await saveMsg("assistant", response, cid);
      return new Response(response, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Conversation-Id": cid || "" } });
    }
    const response = await findCheapestGasByCity(city, fuelType);
    cid = await saveMsg("assistant", response, cid);
    return new Response(response, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "X-Conversation-Id": cid || "" },
    });
  }

  // ── SHOPPING COMPARE (Google Shopping real prices) ──
  if (intent.type === "shopping_compare") {
    let cid = await saveMsg("user", lastMsgContent, conversationId);

    // Extract product names from the message
    const extractCompletion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 150,
      temperature: 0,
      messages: [
        { role: "system", content: 'Extract product names from the shopping request. Return ONLY a JSON array of product search terms in Spanish, optimized for Google Shopping. Example: ["leche entera 1L","pan de molde","arroz 1kg"]. Keep terms short and specific.' },
        { role: "user", content: lastMsgContent },
      ],
    });
    let products: string[] = [];
    try {
      const content = extractCompletion.choices[0]?.message?.content?.trim() || "[]";
      products = JSON.parse(content.replace(/```json\n?/g, "").replace(/```/g, ""));
    } catch { /* */ }

    if (products.length === 0) {
      const response = "Dime qué productos necesitas comprar y te comparo precios entre supermercados. Ejemplo: 'Necesito leche, pan, arroz y pollo'.";
      cid = await saveMsg("assistant", response, cid);
      return new Response(response, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Conversation-Id": cid || "" } });
    }

    const { compareShoppingList } = await import("@/lib/skills/shopping");
    const response = await compareShoppingList(products);

    cid = await saveMsg("assistant", response, cid);
    return new Response(response, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "X-Conversation-Id": cid || "" },
    });
  }

  // ── WEB SEARCH (Serper → real Google results → LLM summarizes → real links appended) ──
  if (intent.type === "web_search") {
    let cid = await saveMsg("user", lastMsgContent, conversationId);
    const { searchSerper } = await import("@/lib/skills/web-search");

    // ONE search call — get both text and links
    const searchQuery = userCity
      ? `${intent.data?.query || lastMsgContent} ${userCity}`
      : (intent.data?.query as string || lastMsgContent);
    const search = await searchSerper(searchQuery);

    if (!search.results.length) {
      const response = "No encontré resultados para esa búsqueda. Intenta reformularla.";
      cid = await saveMsg("assistant", response, cid);
      return new Response(response, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Conversation-Id": cid || "" } });
    }

    // Build context for LLM — only text, no links (we add real ones after)
    const context = search.results.map((r, i) => `${i + 1}. ${r.title}: ${r.snippet}`).join("\n");

    const searchCompletion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 400,
      messages: [
        { role: "system", content: `Eres DILO. Resume los resultados de búsqueda de forma útil. Reglas ESTRICTAS:
- SOLO usa información de los resultados proporcionados.
- SOLO euros (€). ELIMINA cualquier precio en COP, MXN, USD, o cualquier moneda que no sea euros. Si solo hay precios en otras monedas, di "consulta el enlace para ver precios".
- NO inventes links ni URLs. NO pongas ningún enlace. Los enlaces reales se añaden automáticamente al final.
- Sé breve: máximo 4-5 líneas de resumen.
- Responde en ${langNames[locale.split("-")[0]] || "español"}.` },
        { role: "user", content: lastMsgContent },
        { role: "assistant", content: `Resultados de Google:\n${context}` },
      ],
    });
    let response = searchCompletion.choices[0]?.message?.content || "No encontré resultados.";

    // Remove any links the LLM might have sneaked in
    response = response.replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, "$1");
    response = response.replace(/https?:\/\/\S+/g, "");

    // FORCE remove any COP/MXN/USD amounts — strip entire sentences containing them
    response = response.replace(/[^.]*\d[\d.,]+\s*(?:COP|MXN|USD|pesos?|dólares?)[^.]*/gi, "");
    response = response.replace(/\n\s*\n/g, "\n");

    // Append REAL links from Serper
    response += "\n\n**Ver resultados:**\n";
    for (const r of search.results.slice(0, 5)) {
      response += `- [${r.title}](${r.link})\n`;
    }
    response += "\n*Precios orientativos del momento de búsqueda. Verifica el precio final en el enlace antes de comprar.*";

    cid = await saveMsg("assistant", response, cid);
    return new Response(response, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "X-Conversation-Id": cid || "" },
    });
  }

  // ── CALCULATOR (direct, no LLM) ──
  if (intent.type === "calculator" && intent.data?.expression) {
    let cid = await saveMsg("user", lastMsgContent, conversationId);
    try {
      const expr = String(intent.data.expression).replace(/[^0-9+\-*/().,%\s]/g, "").replace(/,/g, ".");
      const result = Function(`"use strict"; return (${expr})`)();
      const response = `**${intent.data.expression} = ${result}**`;
      cid = await saveMsg("assistant", response, cid);
      return new Response(response, {
        headers: { "Content-Type": "text/plain; charset=utf-8", "X-Conversation-Id": cid || "" },
      });
    } catch { /* fall through to LLM */ }
  }

  // ── IMAGE (direct, no LLM) ──
  const lastMsg = lastMsgContent.toLowerCase();
  const isImageRequest = /(?:crea|genera|dibuja|hazme|diseña|haz).*(?:imagen|foto|ilustracion|logo|dibujo)/i.test(lastMsg)
    || /(?:create|generate|draw|make).*(?:image|photo|picture|logo)/i.test(lastMsg);

  if (isImageRequest && allMessages[allMessages.length - 1]?.role === "user") {
    const prompt = allMessages[allMessages.length - 1].content;
    const encoder = new TextEncoder();

    // Save user message first
    let imgConvId = conversationId;
    if (userId) {
      if (!imgConvId) {
        const { data: conv } = await supabase.from("conversations")
          .insert({ user_id: userId, title: prompt.slice(0, 50) }).select("id").single();
        imgConvId = conv?.id;
      }
      if (imgConvId) {
        await supabase.from("messages").insert({ conversation_id: imgConvId, user_id: userId, role: "user", content: prompt });
      }
    }

    const readable = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode("Generando imagen..."));
        try {
          // Try Stability AI first
          const stabilityKey = process.env.STABILITY_API_KEY;
          let imageUrl: string | null = null;

          if (stabilityKey && stabilityKey !== "placeholder") {
            const res = await fetch("https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${stabilityKey}`, Accept: "application/json" },
              body: JSON.stringify({ text_prompts: [{ text: prompt, weight: 1 }], cfg_scale: 7, height: 1024, width: 1024, steps: 30, samples: 1 }),
            });
            if (res.ok) {
              const data = await res.json();
              const base64 = data.artifacts?.[0]?.base64;
              if (base64) imageUrl = `data:image/png;base64,${base64}`;
            }
          }

          // Fallback to DALL-E
          if (!imageUrl) {
            const dalle = await openai.images.generate({ model: "dall-e-3", prompt, n: 1, size: "1024x1024", quality: "standard" });
            imageUrl = dalle.data?.[0]?.url || null;
          }

          if (imageUrl) {
            controller.enqueue(encoder.encode(`__IMAGE__${imageUrl}`));
            if (userId && imgConvId) {
              await supabase.from("messages").insert({ conversation_id: imgConvId, user_id: userId, role: "assistant", content: `__IMAGE__${imageUrl}`, model: "stability-xl" });
            }
          } else {
            controller.enqueue(encoder.encode("No se pudo generar la imagen. Inténtalo de nuevo."));
          }
        } catch (e) {
          controller.enqueue(encoder.encode(`Error: ${e instanceof Error ? e.message : "desconocido"}`));
        }
        controller.close();
      },
    });

    return new Response(readable, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "X-Conversation-Id": imgConvId || "" },
    });
  }

  // Save user message
  let convId = conversationId;
  const lastUserMsg = allMessages[allMessages.length - 1];
  if (userId && lastUserMsg?.role === "user") {
    try {
      if (!convId) {
        const { data: conv } = await supabase.from("conversations")
          .insert({ user_id: userId, title: lastUserMsg.content.slice(0, 50) }).select("id").single();
        convId = conv?.id;
      }
      if (convId) {
        await supabase.from("messages").insert({ conversation_id: convId, user_id: userId, role: "user", content: lastUserMsg.content });
      }
    } catch { /* */ }
  }

  const lang = locale.split("-")[0] || "es";
  const langName = langNames[lang] || "español";
  const now = new Date().toISOString();

  // Load what DILO knows about this user
  const { loadUserFacts } = await import("@/lib/agent/facts");
  const userFacts = userId ? await loadUserFacts(userId) : "";

  // Load journal knowledge (lessons + goals)
  let journalKnowledge = "";
  if (userId) {
    try {
      const [lessonsRes, goalsRes, recentJournalRes] = await Promise.all([
        supabase.from("user_lessons").select("lesson, category").eq("user_id", userId).eq("active", true).order("times_relevant", { ascending: false }).limit(10),
        supabase.from("user_goals").select("goal, status, progress_pct").eq("user_id", userId).eq("status", "active").limit(5),
        supabase.from("user_journal").select("content, mood, category, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(3),
      ]);
      const lessons = lessonsRes.data || [];
      const goals = goalsRes.data || [];
      const recentJournal = recentJournalRes.data || [];

      if (lessons.length > 0 || goals.length > 0 || recentJournal.length > 0) {
        journalKnowledge = "\n\nDIARIO Y APRENDIZAJES DEL USUARIO:";
        if (lessons.length > 0) {
          journalKnowledge += "\nLecciones aprendidas:\n" + lessons.map(l => `- [${l.category}] ${l.lesson}`).join("\n");
        }
        if (goals.length > 0) {
          journalKnowledge += "\nMetas activas:\n" + goals.map(g => `- ${g.goal} (${g.progress_pct || 0}%)`).join("\n");
        }
        if (recentJournal.length > 0) {
          journalKnowledge += "\nEntradas recientes del diario:\n" + recentJournal.map(j => `- [${j.mood || "?"}] ${j.content?.slice(0, 100)}`).join("\n");
        }
        journalKnowledge += "\nUsa esta info para personalizar tus respuestas. Si el usuario repite un error que ya aprendió, recuérdaselo con tacto.";
      }
    } catch { /* skip if journal tables don't exist */ }
  }

  // Load user's name from profile
  let userName = "";
  if (userId) {
    const { data: userRow } = await supabase.from("users").select("name, email").eq("id", userId).single();
    userName = userRow?.name || userRow?.email?.split("@")[0] || "";
  }

  const systemPrompt = `Eres DILO, un asistente personal inteligente y un AMIGO de verdad.

IDIOMA: Responde SIEMPRE en ${langName}.
HORA ACTUAL: ${now}${userName ? `\nNOMBRE DEL USUARIO: ${userName}` : ""}

PERSONALIDAD:
- Eres cálido, empático y genuino. Como un amigo cercano que se preocupa de verdad.
- Tutea al usuario. Usa su nombre si lo conoces.
- Respuestas cortas y directas, pero con calidez humana.
- Celebra los logros del usuario, por pequeños que sean.
- Si el usuario parece triste o estresado, muestra empatía real.

CONTEXTO CONVERSACIONAL (CRÍTICO):
- SIEMPRE lee y recuerda los mensajes anteriores de la conversación.
- Si el usuario dice "eso", "ese mensaje", "lo anterior", "tradúceme eso" → se refiere al contenido del mensaje anterior.
- Si analizaste una imagen y el usuario pide traducir/resumir/explicar → usa el texto que extrajiste de la imagen.
- Si el usuario pide algo relacionado con un mensaje previo, BUSCA en el historial y responde con contexto.
- NUNCA digas "no sé a qué te refieres" si hay contexto disponible en los mensajes anteriores.

REDACCIÓN DE MENSAJES:
- Cuando el usuario te pida escribir un mensaje para alguien, sé CREATIVO y AUTÉNTICO.
- Si pide algo romántico: escribe algo que haga sentir especial a la persona. Usa metáforas, sé poético pero natural. No seas genérico.
- Si pide algo gracioso: sé realmente divertido.
- Si pide algo formal: sé profesional pero humano.
- SIEMPRE adapta el tono a lo que el usuario te pide. Si dice "estoy loco por ella", el mensaje debe transmitir esa pasión.
- Escribe como un amigo con talento para las palabras, no como un robot.

REGLAS DE SEGURIDAD (MÁXIMA PRIORIDAD):
- NUNCA des consejos médicos, diagnósticos, ni recomendaciones sobre medicamentos.
- NUNCA hables positivamente del suicidio, autolesión, o violencia.
- Si el usuario menciona pensamientos suicidas, depresión severa, o autolesión:
  1. Muestra EMPATÍA genuina. Hazle saber que importa y que no está solo.
  2. Recuérdale lo hermosa que es la vida y que los momentos difíciles pasan.
  3. Comparte una historia breve e inspiradora de alguien que pasó por algo similar y hoy es muy feliz.
  4. Anímale a hablar con alguien de confianza o un profesional.
  5. Ofrece el teléfono de ayuda: Teléfono de la Esperanza (717 003 717) o equivalente.
  6. NUNCA minimices su dolor, pero SIEMPRE muestra esperanza.
- Si piden consejos sobre salud, di que consulte a un profesional.

REGLA MÁXIMA DE HERRAMIENTAS:
- SOLO usa trading/market tools cuando el usuario EXPLÍCITAMENTE pide análisis de acciones, forex, o trading.
- Preguntas generales, noticias, conversación, opiniones → responde con tu conocimiento o usa web_search. NO uses market_analyze_stock.
- "Cómo va Cuba", "qué pasa en el mundo", "noticias de hoy" → son preguntas de NOTICIAS, usa web_search.
- "Cómo va Apple" o "analiza Tesla" → SÍ son preguntas de trading, usa market_analyze_stock.
- Si NO estás seguro si es trading o noticias → pregunta al usuario antes de usar tools.
- Si NO tienes datos de una tool, NO inventes la respuesta.

REGLAS OPERATIVAS:
1. GASTOS → USA track_expense SIEMPRE.
2. RECORDATORIO → USA create_reminder SIEMPRE.
3. WHATSAPP → USA send_whatsapp. Preview primero, enviar después.
4. NÚMEROS DE TELÉFONO: Limpia guiones/espacios automáticamente. NUNCA preguntes por el formato.
5. Sé EFICIENTE. Si tienes la info, actúa.
6. BÚSQUEDAS → USA web_search SIEMPRE que el usuario pregunte por precios, vuelos, noticias, clima, eventos, productos, o CUALQUIER información actual/en tiempo real. NUNCA respondas de memoria sobre datos que pueden cambiar — BUSCA SIEMPRE.
7. CALENDARIO → USA calendar_list_events/calendar_create_event si el usuario pregunta por su agenda o quiere crear eventos.
8. EMAIL → USA gmail_read_inbox/gmail_send_email si el usuario quiere leer o enviar emails. IMPORTANTE: Cuando redactes un email, SIEMPRE firma con el nombre real del usuario (de los datos que conoces). NUNCA pongas "[Tu Nombre]" ni placeholders — usa el nombre que sabes.
9. TRADING → SIEMPRE USA LAS TOOLS DE TRADING. NUNCA respondas sobre trading sin datos reales.
   - "mi portfolio" / "mis posiciones" → USA trading_portfolio OBLIGATORIAMENTE
   - "mi rendimiento" / "win rate" → USA trading_performance OBLIGATORIAMENTE
   - "sincroniza mis trades" → USA trading_journal_sync OBLIGATORIAMENTE
   - "análisis de riesgo" → USA trading_risk_analysis OBLIGATORIAMENTE
   - "regla de riesgo" / "límite" → USA trading_rules_set OBLIGATORIAMENTE
   - "compra X" / "vende X" → USA trading_place_order (confirmed=false primero, SIEMPRE preview)
   - "qué compro" / "oportunidades" / "analiza el mercado" → USA market_scan_opportunities OBLIGATORIAMENTE
   - "analiza AAPL" / "qué tal Tesla?" → USA market_analyze_stock OBLIGATORIAMENTE
   - "compara AAPL y MSFT" → USA market_compare_stocks OBLIGATORIAMENTE
   - "earnings esta semana" → USA market_earnings_calendar OBLIGATORIAMENTE
   - "mi calendario" / "resultados del mes" → USA trading_calendar OBLIGATORIAMENTE
   - "señal para AAPL" / "dame un setup" → USA trading_generate_signal OBLIGATORIAMENTE
   - "hay manipulación?" / "check sweeps" → USA trading_check_sweeps OBLIGATORIAMENTE
   - FLUJO DE TRADING: 1) Verifica sweeps con trading_check_sweeps 2) Genera señal con trading_generate_signal (incluye entry, SL, TP, ratio, riesgo) 3) Si el usuario dice "compra" → trading_place_order con preview 4) Si confirma → ejecuta.
   - SIEMPRE verifica liquidity sweeps ANTES de generar una señal.
   - "¿cómo me va en AAPL?" / "mi historial" / "qué has aprendido" → USA trading_memory o trading_insights OBLIGATORIAMENTE.
   - NUNCA inventes estadísticas de trading. Si el usuario pregunta win rate, rendimiento, historial → USA LA HERRAMIENTA.

REGLAS DE TRADING (CRÍTICAS — INCUMPLIR = ERROR GRAVE):
- NUNCA JAMÁS inventes, asumas o supongas datos sobre posiciones, portfolio, o trades del usuario. Si el usuario pregunta por sus posiciones, USA trading_portfolio OBLIGATORIAMENTE. Si no llamas a la tool, NO TIENES información.
- NUNCA digas "no tienes posiciones" sin haber llamado a trading_portfolio primero. Puede ser que SÍ tenga.
- NUNCA digas "no puedo operar en META/AMZN" sin verificar con trading_portfolio que realmente no existen.
- Para CUALQUIER pregunta sobre el estado de la cuenta, posiciones, P&L → LLAMA A LA TOOL PRIMERO, RESPONDE DESPUÉS.
- Para oportunidades de ACCIONES US (AAPL, TSLA, etc.) → USA market_scan_opportunities o market_analyze_stock (Finnhub). NUNCA web_search para trading.
- Para FOREX (EUR/USD, GBP/JPY, etc.) y ORO (XAU/USD) → USA forex_analyze o forex_analyze_mtf. NUNCA market_analyze_stock para forex/oro.
- Para precio forex/oro → USA forex_quote. Para escaneo forex → USA forex_scan.
- Para cuenta/posiciones forex → USA forex_account y forex_positions.
- Para señales de acciones → USA trading_generate_signal. NUNCA inventes señales sin datos.
- Para sweeps/manipulación → USA trading_check_sweeps.
- Si el usuario dice "hazlo" o "compra" → USA trading_place_order con confirmed=false (preview primero).
- SIEMPRE verifica las reglas de riesgo del usuario antes de cualquier operación.
- Si detectas FOMO, revenge trading o pánico → advierte con datos y empatía.
- SIEMPRE incluye: "La decisión final es tuya. Todo trading conlleva riesgo."

REGLAS DE NUTRICIÓN:
- Para configurar perfil nutricional → USA nutrition_setup. Pide edad, peso, altura, sexo, actividad, objetivo.
- Para registrar comida → USA nutrition_log con nombre, calorías estimadas y macros.
- Para plan de comidas → USA nutrition_plan.
- Para recetas → USA nutrition_recipe.
- Para progreso del día → USA nutrition_progress.
- Para agua → USA nutrition_water.
- Para peso → USA nutrition_weight.
- Para lista de compras → USA nutrition_shopping.
- NUNCA bajes de 1200 kcal (mujer) o 1500 kcal (hombre).
- Si el usuario tiene diabetes, embarazo, trastorno alimentario o enfermedad renal → NO generes plan, deriva a profesional.

REGLAS DE BIENESTAR EMOCIONAL:
- Si el usuario dice que se siente mal, estresado, ansioso, triste, agobiado → USA wellness_checkin OBLIGATORIAMENTE.
- Si el usuario quiere relajarse, meditar, respirar → USA wellness_breathing o wellness_gratitude OBLIGATORIAMENTE.
- NUNCA respondas solo con texto cuando hay herramientas de bienestar disponibles. USA LA HERRAMIENTA.
- Después de usar la herramienta, añade empatía y seguimiento.

REGLAS DE ENTRETENIMIENTO:
- Si el usuario pide películas, series, qué ver → USA entertainment_search OBLIGATORIAMENTE con género en inglés (comedy, action, horror, etc.).
- NUNCA inventes películas de tu memoria. USA LA HERRAMIENTA para datos reales de OMDb.
${userFacts}${journalKnowledge}`;

  // Build tools list — trading tools per connection type
  let userTools = [...baseTools, ...FOREX_TOOLS, ...TRADING_MEMORY_TOOLS, ...KNOWLEDGE_TOOLS, ...ENTERTAINMENT_TOOLS, ...TRADING_EMOTIONAL_TOOLS]; // All tools always available
  let tradingProfilePrompt = "";
  if (userId) {
    const { hasAlpacaConnection } = await import("@/lib/oauth/alpaca");
    const hasAlpaca = await hasAlpacaConnection(userId);
    if (hasAlpaca) {
      userTools = [...baseTools, ...ALL_TRADING_TOOLS, ...FOREX_TOOLS, ...TRADING_MEMORY_TOOLS, ...KNOWLEDGE_TOOLS, ...ENTERTAINMENT_TOOLS];

      // Load personalized trading profile if exists
      const { getTradingProfile, generateTradingPrompt, resetDailyCounters } = await import("@/lib/trading/profile");
      const profile = await getTradingProfile(userId);
      if (profile?.onboarding_complete) {
        const today = new Date().toISOString().slice(0, 10);
        if (profile.last_reset_date !== today) await resetDailyCounters(userId);
        tradingProfilePrompt = "\n\n" + generateTradingPrompt(profile);
      }
    }
  }

  // encoder already declared above
  let fullResponse = "";
  let pendingSendMarker: { to: string; message: string } | null = null;

  const readable = new ReadableStream({
    async start(controller) {
      try {
        let chatMessages: OpenAI.ChatCompletionMessageParam[] = [
          { role: "system", content: systemPrompt + tradingProfilePrompt },
          ...messages.map((m: { role: string; content: string }) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
        ];

        // ── MULTI-AGENT ORCHESTRATOR ──
        // 1. Plan which agents to spawn
        const lastUserMsg = messages[messages.length - 1]?.content || "";
        const agentSpecs = await planAgents(lastUserMsg);

        // 2. Execute each agent independently
        const executeToolFn = async (name: string, input: Record<string, unknown>, uid: string) => {
          const extResult = await executeExtendedTool(name, input, uid);
          if (extResult !== null) return extResult;
          return await executeTool(name, input, uid);
        };

        const agentResults = await Promise.all(
          agentSpecs.map(spec => {
            const definition = getAgentDefinition(spec.role, userName, lang, userTools);
            return executeAgent(spec, definition, chatMessages.slice(-6), executeToolFn, userId || "anonymous");
          })
        );

        // Track WhatsApp previews from agent results
        for (const ar of agentResults) {
          if (ar.toolsCalled.includes("send_whatsapp") && ar.result.includes("preview")) {
            try {
              const parsed = JSON.parse(ar.result);
              if (parsed.preview) {
                pendingSendMarker = { to: parsed.to, message: parsed.message };
              }
            } catch { /* ignore */ }
          }
        }

        // 3. Synthesize results into one response
        const finalResponse = await synthesize(lastUserMsg, agentResults, userName, lang);

        // 4. Stream the final response
        fullResponse += finalResponse;
        controller.enqueue(encoder.encode(finalResponse));

        // Append structured marker so client can show confirm/cancel buttons
        if (pendingSendMarker) {
          const marker = `\n__PENDING_SEND__${JSON.stringify(pendingSendMarker)}__END_PENDING__`;
          controller.enqueue(encoder.encode(marker));
        }

        // Save assistant response
        if (userId && convId && fullResponse) {
          supabase.from("messages").insert({
            conversation_id: convId, user_id: userId, role: "assistant",
            content: fullResponse, model: "gpt-4o-mini",
          }).then(() => {
            supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId).then(() => {});
          });

          // Extract personal facts from this exchange (fire-and-forget)
          const { extractFacts } = await import("@/lib/agent/facts");
          extractFacts(userId, lastMsgContent, fullResponse).catch(() => {});
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Error";
        controller.enqueue(encoder.encode(`\n\n[Error: ${msg}]`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "X-Conversation-Id": convId || "" },
  });
}
