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

// Tool definitions for OpenAI function calling
const tools: OpenAI.ChatCompletionTool[] = [
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
                category: { type: "string", enum: ["food", "transport", "entertainment", "home", "health", "shopping", "bills", "other"] },
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
      const { data } = await supabase.from("reminders").select("id, text, due_at, status, repeat_count, repeats_sent")
        .eq("user_id", userId).eq("status", "pending").order("due_at", { ascending: true }).limit(10);
      return JSON.stringify({ reminders: data || [] });
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

    case "search_contacts": {
      try {
        const res = await fetch(`${evoUrl}/chat/findContacts/${instName}`, {
          method: "POST", headers: { "Content-Type": "application/json", apikey: evoKey }, body: JSON.stringify({}),
        });
        const contacts = await res.json();
        const q = String(input.query).toLowerCase();
        const matches = Array.isArray(contacts) ? contacts
          .filter((c: Record<string, unknown>) => String(c.pushName || c.name || "").toLowerCase().includes(q))
          .slice(0, 10).map((c: Record<string, unknown>) => ({
            name: c.pushName || c.name || "Sin nombre",
            phone: String(c.id || "").replace("@s.whatsapp.net", ""),
          })) : [];
        return JSON.stringify({ found: matches.length, contacts: matches });
      } catch { return JSON.stringify({ error: "WhatsApp not connected" }); }
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
  const { messages, locale = "es", conversationId, userId } = await req.json();

  if (!messages?.length) return new Response("Missing messages", { status: 400 });

  // Save user message
  let convId = conversationId;
  const lastUserMsg = messages[messages.length - 1];
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

  const systemPrompt = `Eres DILO, un asistente personal inteligente.

IDIOMA: Responde SIEMPRE en ${langName}.
HORA ACTUAL: ${now}

ESTILO: Respuestas cortas y directas. Tutea al usuario. Máximo 2-3 párrafos.

REGLAS ABSOLUTAS:
1. GASTOS → USA track_expense SIEMPRE. NUNCA solo hagas la suma con texto.
2. RECORDATORIO → USA create_reminder SIEMPRE. NUNCA simules.
3. WHATSAPP → USA send_whatsapp. Preview primero (confirmed=false), enviar después (confirmed=true).
4. NÚMEROS DE TELÉFONO: Limpia guiones/espacios automáticamente. 34-692-325-738 = 34692325738. NUNCA preguntes por el formato.
5. Sé EFICIENTE. Si tienes la info, actúa.`;

  const encoder = new TextEncoder();
  let fullResponse = "";

  const readable = new ReadableStream({
    async start(controller) {
      try {
        let chatMessages: OpenAI.ChatCompletionMessageParam[] = [
          { role: "system", content: systemPrompt },
          ...messages.map((m: { role: string; content: string }) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
        ];

        // Tool loop (max 5 iterations)
        for (let i = 0; i < 5; i++) {
          const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            max_tokens: 1024,
            messages: chatMessages,
            tools,
            stream: false,
          });

          const choice = response.choices[0];
          const msg = choice.message;

          // If there are tool calls, execute them
          if (msg.tool_calls && msg.tool_calls.length > 0) {
            chatMessages.push(msg);

            for (const tc of msg.tool_calls) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const fn = (tc as any).function;
              const args = JSON.parse(fn.arguments);
              const result = await executeTool(fn.name, args, userId || "anonymous");
              chatMessages.push({ role: "tool", tool_call_id: tc.id, content: result });
            }

            // If there's also text content, stream it
            if (msg.content) {
              fullResponse += msg.content;
              controller.enqueue(encoder.encode(msg.content));
            }

            continue; // Loop to get follow-up response
          }

          // No tool calls — stream the text response
          if (msg.content) {
            fullResponse += msg.content;
            controller.enqueue(encoder.encode(msg.content));
          }
          break;
        }

        // Save assistant response
        if (userId && convId && fullResponse) {
          supabase.from("messages").insert({
            conversation_id: convId, user_id: userId, role: "assistant",
            content: fullResponse, model: "gpt-4o-mini",
          }).then(() => {
            supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId).then(() => {});
          });
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
