import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const langNames: Record<string, string> = {
  es: "español", en: "English", fr: "français", it: "italiano", de: "Deutsch",
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Tool definitions for Claude
const tools: Anthropic.Tool[] = [
  {
    name: "create_reminder",
    description: "Create a reminder for the user. Use this whenever the user asks to be reminded of something, set an alarm, or schedule a notification.",
    input_schema: {
      type: "object" as const,
      properties: {
        text: { type: "string", description: "What to remind about" },
        due_at: { type: "string", description: "ISO 8601 datetime when to send the reminder. Calculate from current time if user says 'in 5 minutes' or 'at 7pm'. Current time will be provided in the system prompt." },
        repeat_count: { type: "number", description: "How many times to send the reminder. Default 1." },
        channel: { type: "string", enum: ["push", "whatsapp"], description: "Channel to send reminder through. Default 'push'." },
      },
      required: ["text", "due_at"],
    },
  },
  {
    name: "list_reminders",
    description: "List the user's pending reminders. Use when user asks 'what reminders do I have' or similar.",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "cancel_reminder",
    description: "Cancel a reminder by its text (partial match). Use when user says 'cancel the dentist reminder' or similar.",
    input_schema: {
      type: "object" as const,
      properties: {
        search_text: { type: "string", description: "Text to search for in reminders to cancel" },
      },
      required: ["search_text"],
    },
  },
  {
    name: "track_expense",
    description: "Record an expense for the user. Use this EVERY TIME the user mentions spending money, buying something, or any cost. Can record multiple expenses at once. ALWAYS use this tool, never just do math.",
    input_schema: {
      type: "object" as const,
      properties: {
        expenses: {
          type: "array",
          description: "Array of expenses to record",
          items: {
            type: "object",
            properties: {
              amount: { type: "number", description: "Amount spent" },
              category: { type: "string", enum: ["food", "transport", "entertainment", "home", "health", "shopping", "bills", "other"], description: "Category" },
              description: { type: "string", description: "What was purchased" },
            },
            required: ["amount", "description"],
          },
        },
      },
      required: ["expenses"],
    },
  },
  {
    name: "get_expenses",
    description: "Get user's expense summary. Use when user asks 'how much did I spend', 'my expenses', 'gastos de hoy', etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        period: { type: "string", enum: ["today", "week", "month"], description: "Time period. Default 'today'." },
      },
    },
  },
  {
    name: "calculate",
    description: "Perform a mathematical calculation.",
    input_schema: {
      type: "object" as const,
      properties: {
        expression: { type: "string", description: "Math expression to evaluate" },
      },
      required: ["expression"],
    },
  },
  {
    name: "read_whatsapp",
    description: "Read recent WhatsApp messages from a contact or all chats. Use when user asks 'read my messages', 'what did X say', 'any new messages', etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        phone: { type: "string", description: "Phone number to read messages from. If empty, reads recent messages from all chats." },
        limit: { type: "number", description: "Number of messages to read. Default 10." },
      },
    },
  },
  {
    name: "search_contacts",
    description: "Search the user's WhatsApp contacts by name. Use this FIRST when the user mentions a contact by name instead of phone number. Shows matching contacts so the user can pick the right one.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Name to search for (e.g. 'Juan', 'mama', 'dentista')" },
      },
      required: ["query"],
    },
  },
  {
    name: "send_whatsapp",
    description: "Send a WhatsApp message to a contact. Use phone number (not name). If user gave a name, use search_contacts first. ALWAYS show preview and ask confirmation. If user asks to send in a specific language (e.g. 'send in English', 'envíalo en francés'), translate the message to that language BEFORE showing preview.",
    input_schema: {
      type: "object" as const,
      properties: {
        to: { type: "string", description: "Phone number with country code (e.g. 34612345678)" },
        message: { type: "string", description: "The message text to send. If user requested a specific language, this should ALREADY be translated to that language." },
        target_language: { type: "string", description: "Language the message is written in (e.g. 'en', 'fr', 'de', 'it', 'es'). Used for context." },
        confirmed: { type: "boolean", description: "Set to true only after user confirms. First call should be false to show preview." },
      },
      required: ["to", "message"],
    },
  },
];

// Tool execution
async function executeTool(name: string, input: Record<string, unknown>, userId: string): Promise<string> {
  switch (name) {
    case "create_reminder": {
      const { text, due_at, repeat_count = 1, channel = "push" } = input as {
        text: string; due_at: string; repeat_count?: number; channel?: string;
      };
      const { data, error } = await supabase.from("reminders").insert({
        user_id: userId,
        text,
        due_at,
        repeat_count,
        channel,
        status: "pending",
        repeat_type: "once",
      }).select("id, text, due_at, channel").single();
      if (error) return JSON.stringify({ error: error.message });
      return JSON.stringify({ success: true, reminder: data });
    }

    case "list_reminders": {
      const { data } = await supabase.from("reminders")
        .select("id, text, due_at, channel, status, repeat_count, repeats_sent")
        .eq("user_id", userId)
        .eq("status", "pending")
        .order("due_at", { ascending: true })
        .limit(10);
      return JSON.stringify({ reminders: data || [] });
    }

    case "cancel_reminder": {
      const { search_text } = input as { search_text: string };
      const { data: reminders } = await supabase.from("reminders")
        .select("id, text")
        .eq("user_id", userId)
        .eq("status", "pending")
        .ilike("text", `%${search_text}%`);
      if (!reminders || reminders.length === 0) {
        return JSON.stringify({ error: "No matching reminder found" });
      }
      await supabase.from("reminders")
        .update({ status: "cancelled" })
        .eq("id", reminders[0].id);
      return JSON.stringify({ success: true, cancelled: reminders[0].text });
    }

    case "track_expense": {
      const { expenses } = input as { expenses: Array<{ amount: number; category?: string; description: string }> };
      const results = [];
      for (const exp of expenses) {
        const { error } = await supabase.from("expenses").insert({
          user_id: userId,
          amount: exp.amount,
          currency: "EUR",
          category: exp.category || "other",
          description: exp.description,
          date: new Date().toISOString().split("T")[0],
        });
        if (error) {
          results.push({ description: exp.description, error: error.message });
        } else {
          results.push({ description: exp.description, amount: exp.amount, saved: true });
        }
      }
      // Get today's total
      const today = new Date().toISOString().split("T")[0];
      const { data: todayExpenses } = await supabase.from("expenses")
        .select("amount")
        .eq("user_id", userId)
        .eq("date", today);
      const todayTotal = todayExpenses?.reduce((sum, e) => sum + Number(e.amount), 0) || 0;
      return JSON.stringify({ saved: results, today_total: todayTotal });
    }

    case "get_expenses": {
      const { period = "today" } = input as { period?: string };
      const now = new Date();
      let fromDate: string;
      if (period === "week") {
        const d = new Date(now); d.setDate(d.getDate() - 7);
        fromDate = d.toISOString().split("T")[0];
      } else if (period === "month") {
        fromDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      } else {
        fromDate = now.toISOString().split("T")[0];
      }
      const { data } = await supabase.from("expenses")
        .select("amount, category, description, date")
        .eq("user_id", userId)
        .gte("date", fromDate)
        .order("date", { ascending: false });
      const total = data?.reduce((sum, e) => sum + Number(e.amount), 0) || 0;
      // Group by category
      const byCategory: Record<string, number> = {};
      data?.forEach(e => { byCategory[e.category] = (byCategory[e.category] || 0) + Number(e.amount); });
      return JSON.stringify({ period, total, by_category: byCategory, expenses: data?.slice(0, 20) || [] });
    }

    case "calculate": {
      try {
        const expr = String(input.expression).replace(/[^0-9+\-*/().,%\s]/g, "");
        const result = Function(`"use strict"; return (${expr})`)();
        return JSON.stringify({ result });
      } catch {
        return JSON.stringify({ error: "Invalid expression" });
      }
    }

    case "search_contacts": {
      const { query } = input as { query: string };
      const instName = `dilo_${userId.slice(0, 8)}`;
      const evoUrl = process.env.EVOLUTION_API_URL!;
      const evoKey = process.env.EVOLUTION_API_KEY!;

      try {
        const res = await fetch(`${evoUrl}/chat/findContacts/${instName}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: evoKey },
          body: JSON.stringify({}),
        });
        const contacts = await res.json();
        const q = query.toLowerCase();
        const matches = Array.isArray(contacts)
          ? contacts
              .filter((c: Record<string, unknown>) => {
                const name = String(c.pushName || c.name || "").toLowerCase();
                const phone = String(c.id || "").replace("@s.whatsapp.net", "");
                return name.includes(q) || phone.includes(q);
              })
              .slice(0, 10)
              .map((c: Record<string, unknown>) => ({
                name: c.pushName || c.name || "Sin nombre",
                phone: String(c.id || "").replace("@s.whatsapp.net", ""),
              }))
          : [];
        if (matches.length === 0) {
          return JSON.stringify({ found: 0, message: `No contacts matching "${query}"` });
        }
        return JSON.stringify({ found: matches.length, contacts: matches });
      } catch {
        return JSON.stringify({ error: "Could not search contacts. Make sure WhatsApp is connected." });
      }
    }

    case "read_whatsapp": {
      const { phone, limit = 10 } = input as { phone?: string; limit?: number };
      const instName = `dilo_${userId.slice(0, 8)}`;
      const evoUrl = process.env.EVOLUTION_API_URL!;
      const evoKey = process.env.EVOLUTION_API_KEY!;

      try {
        if (phone) {
          // Read messages from specific contact
          const res = await fetch(`${evoUrl}/chat/findMessages/${instName}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: evoKey },
            body: JSON.stringify({ where: { key: { remoteJid: `${phone}@s.whatsapp.net` } }, limit }),
          });
          const data = await res.json();
          const messages = Array.isArray(data) ? data : data?.messages || [];
          const formatted = messages.slice(0, limit).map((m: Record<string, unknown>) => {
            const k = m.key as Record<string, unknown> || {};
            const msg = m.message as Record<string, unknown> || {};
            return {
              from: k.fromMe ? "Tú" : (m.pushName || phone),
              text: (msg.conversation || (msg.extendedTextMessage as Record<string, unknown>)?.text || "[media]") as string,
            };
          });
          return JSON.stringify({ messages: formatted });
        } else {
          // Read recent chats
          const res = await fetch(`${evoUrl}/chat/findChats/${instName}`, {
            headers: { apikey: evoKey },
          });
          const chats = await res.json();
          const recent = Array.isArray(chats) ? chats.slice(0, limit).map((c: Record<string, unknown>) => ({
            name: c.name || c.id,
            lastMessage: (c.lastMessage as Record<string, unknown>)?.conversation || "",
          })) : [];
          return JSON.stringify({ chats: recent });
        }
      } catch {
        return JSON.stringify({ error: "Could not read messages. Make sure WhatsApp is connected." });
      }
    }

    case "send_whatsapp": {
      const { to, message, target_language, confirmed } = input as { to: string; message: string; target_language?: string; confirmed?: boolean };

      // If target language specified and not confirmed yet, translate the message
      let finalMessage = message;
      if (target_language && target_language !== "es" && !confirmed) {
        const langMap: Record<string, string> = { en: "English", fr: "French", de: "German", it: "Italian", pt: "Portuguese", zh: "Chinese", ja: "Japanese", ko: "Korean", ar: "Arabic", ru: "Russian", nl: "Dutch" };
        const targetLang = langMap[target_language] || target_language;
        const apiKey = process.env.ANTHROPIC_API_KEY!;
        const translateClient = new Anthropic({ apiKey });
        const tr = await translateClient.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 500,
          messages: [{ role: "user", content: `Translate the following text to ${targetLang}. Return ONLY the translation, nothing else:\n\n${message}` }],
        });
        const translated = tr.content[0].type === "text" ? tr.content[0].text.trim() : message;
        finalMessage = translated;
      }

      if (!confirmed) {
        return JSON.stringify({
          preview: true,
          to,
          message: finalMessage,
          original: target_language ? message : undefined,
          translated_to: target_language || undefined,
          instruction: "Show this preview to the user and ask for confirmation. Show the translated message.",
        });
      }

      // Find user's WhatsApp instance
      const { data: channel } = await supabase.from("channels")
        .select("instance_name")
        .eq("user_id", userId)
        .eq("type", "whatsapp")
        .eq("status", "connected")
        .single();

      const instanceName = channel?.instance_name || `dilo_${userId.slice(0, 8)}`;

      try {
        const evoUrl = process.env.EVOLUTION_API_URL!;
        const evoKey = process.env.EVOLUTION_API_KEY!;
        const res = await fetch(`${evoUrl}/message/sendText/${instanceName}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: evoKey },
          body: JSON.stringify({ number: to, text: finalMessage }),
        });
        const data = await res.json();
        if (!res.ok) return JSON.stringify({ error: "Failed to send", details: data });
        return JSON.stringify({ success: true, sent_to: to, message: finalMessage });
      } catch (e) {
        return JSON.stringify({ error: "WhatsApp not connected. Connect WhatsApp in Channels first." });
      }
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

export async function POST(req: NextRequest) {
  const { messages, locale = "es", conversationId, userId } = await req.json();

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return new Response("Missing messages", { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === "placeholder") {
    return new Response("API key not configured", { status: 500 });
  }

  // Save user message to DB
  let convId = conversationId;
  const lastUserMsg = messages[messages.length - 1];

  if (userId && lastUserMsg?.role === "user") {
    try {
      if (!convId) {
        const { data: conv } = await supabase
          .from("conversations")
          .insert({ user_id: userId, title: lastUserMsg.content.slice(0, 50) })
          .select("id")
          .single();
        convId = conv?.id;
      }
      if (convId) {
        await supabase.from("messages").insert({
          conversation_id: convId, user_id: userId, role: "user", content: lastUserMsg.content,
        });
      }
    } catch (e) {
      console.error("DB save error:", e);
    }
  }

  const lang = locale.split("-")[0] || "es";
  const langName = langNames[lang] || "español";
  const now = new Date().toISOString();

  const systemPrompt = `Eres DILO, un asistente personal inteligente.

IDIOMA: Responde SIEMPRE en ${langName}.
HORA ACTUAL: ${now}
TIMEZONE del usuario: Europe/Madrid

ESTILO:
- Respuestas cortas y directas.
- Habla como un amigo inteligente. Tutea al usuario.
- Máximo 2-3 párrafos cortos.

HERRAMIENTAS DISPONIBLES:
- create_reminder: Crea recordatorios REALES que se guardan y envían como notificación. SIEMPRE usa esta herramienta cuando el usuario pida un recordatorio.
- list_reminders: Lista los recordatorios pendientes del usuario.
- cancel_reminder: Cancela un recordatorio.
- calculate: Realiza cálculos matemáticos.
- send_whatsapp: Envía un mensaje de WhatsApp a un contacto del usuario. SIEMPRE muestra preview del mensaje primero (confirmed=false) y pide confirmación. Solo envía cuando el usuario confirme (confirmed=true).

REGLAS ABSOLUTAS (NUNCA ignorar):
1. RECORDATORIO → USA create_reminder SIEMPRE. NO respondas con texto simulando que lo creaste.
2. GASTOS → USA track_expense SIEMPRE que el usuario mencione dinero gastado, compras, pagos, costes. NO hagas solo la suma con texto. GUARDA cada gasto con track_expense.
3. WHATSAPP → USA send_whatsapp con confirmed=false para preview. Cuando confirme → send_whatsapp con confirmed=true.
4. CÁLCULOS → USA calculate.
5. CONSULTAR GASTOS → USA get_expenses cuando pregunten cuánto gastaron.
6. TRADUCCIÓN: Si piden enviar en otro idioma, traduce el mensaje antes del preview.
7. TRADUCCIÓN AL RECIBIR: Traduce mensajes recibidos al idioma del usuario (${langName}).

CRÍTICO: Si el usuario dice "gasté X en Y", DEBES usar track_expense. Si dice "recuérdame X", DEBES usar create_reminder. NUNCA respondas solo con texto cuando hay un tool disponible.

CAPACIDADES DE TEXTO (sin herramienta):
- Responder preguntas, traducir, recetas, redactar textos, explicar cosas, conversar.`;

  const client = new Anthropic({ apiKey });
  const encoder = new TextEncoder();
  let fullResponse = "";

  const readable = new ReadableStream({
    async start(controller) {
      try {
        // Build Claude messages (only user/assistant roles)
        let claudeMessages: Anthropic.MessageParam[] = messages.map((m: { role: string; content: string }) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

        // Tool use loop (max 3 iterations)
        for (let iteration = 0; iteration < 3; iteration++) {
          const response = await client.messages.create({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 1024,
            system: systemPrompt,
            messages: claudeMessages,
            tools,
          });

          // Process response blocks
          let hasToolUse = false;
          const toolResults: Anthropic.MessageParam[] = [];

          for (const block of response.content) {
            if (block.type === "text") {
              fullResponse += block.text;
              controller.enqueue(encoder.encode(block.text));
            } else if (block.type === "tool_use") {
              hasToolUse = true;
              // Execute the tool
              const result = await executeTool(
                block.name,
                block.input as Record<string, unknown>,
                userId || "anonymous"
              );

              // Add assistant message with tool use + tool result
              claudeMessages = [
                ...claudeMessages,
                { role: "assistant", content: response.content },
                {
                  role: "user",
                  content: [{
                    type: "tool_result",
                    tool_use_id: block.id,
                    content: result,
                  }],
                },
              ];
            }
          }

          // If no tool was used, we're done
          if (!hasToolUse) break;

          // If tool was used, continue the loop to get Claude's follow-up response
        }

        // Save assistant response to DB
        if (userId && convId && fullResponse) {
          supabase.from("messages").insert({
            conversation_id: convId, user_id: userId, role: "assistant",
            content: fullResponse, model: "claude-haiku-4-5-20251001",
          }).then(() => {
            supabase.from("conversations")
              .update({ updated_at: new Date().toISOString() })
              .eq("id", convId).then(() => {});
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
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Conversation-Id": convId || "",
    },
  });
}
