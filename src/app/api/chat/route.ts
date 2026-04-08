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
  const { messages: allMessages, locale = "es", conversationId, userId } = await req.json();

  if (!allMessages?.length) return new Response("Missing messages", { status: 400 });

  // Only send last 6 messages to avoid rate limits
  const messages = allMessages.slice(-6);

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
    const { data } = await supabase.from("reminders").select("text, due_at, status")
      .eq("user_id", userId).eq("status", "pending").order("due_at", { ascending: true }).limit(10);

    let response: string;
    if (!data?.length) {
      response = "No tienes recordatorios pendientes.";
    } else {
      const lines = data.map(r => `• ${r.text} — ${new Date(r.due_at).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })}`).join("\n");
      response = `**Recordatorios pendientes:**\n\n${lines}`;
    }

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
        controller.enqueue(encoder.encode("Generando imagen...\n\n"));
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
            controller.enqueue(encoder.encode(`![Imagen generada](${imageUrl})`));
            if (userId && imgConvId) {
              await supabase.from("messages").insert({ conversation_id: imgConvId, user_id: userId, role: "assistant", content: `![Imagen generada](${imageUrl})`, model: "stability-xl" });
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

  const systemPrompt = `Eres DILO, un asistente personal inteligente y un AMIGO de verdad.

IDIOMA: Responde SIEMPRE en ${langName}.
HORA ACTUAL: ${now}

PERSONALIDAD:
- Eres cálido, empático y genuino. Como un amigo cercano que se preocupa de verdad.
- Tutea al usuario. Usa su nombre si lo conoces.
- Respuestas cortas y directas, pero con calidez humana.
- Celebra los logros del usuario, por pequeños que sean.
- Si el usuario parece triste o estresado, muestra empatía real.

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

REGLAS OPERATIVAS:
1. GASTOS → USA track_expense SIEMPRE.
2. RECORDATORIO → USA create_reminder SIEMPRE.
3. WHATSAPP → USA send_whatsapp. Preview primero, enviar después.
4. NÚMEROS DE TELÉFONO: Limpia guiones/espacios automáticamente. NUNCA preguntes por el formato.
5. Sé EFICIENTE. Si tienes la info, actúa.`;

  // encoder already declared above
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
