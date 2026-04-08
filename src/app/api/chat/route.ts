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
    name: "send_whatsapp",
    description: "Send a WhatsApp message to a contact on behalf of the user. ALWAYS show the message preview first and ask for confirmation before sending. Use when user says 'tell X that...' or 'send a message to X'.",
    input_schema: {
      type: "object" as const,
      properties: {
        to: { type: "string", description: "Phone number with country code (e.g. 34612345678) or contact name" },
        message: { type: "string", description: "The message text to send" },
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

    case "calculate": {
      try {
        const expr = String(input.expression).replace(/[^0-9+\-*/().,%\s]/g, "");
        const result = Function(`"use strict"; return (${expr})`)();
        return JSON.stringify({ result });
      } catch {
        return JSON.stringify({ error: "Invalid expression" });
      }
    }

    case "send_whatsapp": {
      const { to, message, confirmed } = input as { to: string; message: string; confirmed?: boolean };

      if (!confirmed) {
        return JSON.stringify({
          preview: true,
          to,
          message,
          instruction: "Show this preview to the user and ask for confirmation. Call this tool again with confirmed=true after user confirms.",
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
          body: JSON.stringify({ number: to, text: message }),
        });
        const data = await res.json();
        if (!res.ok) return JSON.stringify({ error: "Failed to send", details: data });
        return JSON.stringify({ success: true, sent_to: to, message });
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

REGLAS IMPORTANTES:
1. Cuando el usuario pida un recordatorio → USA create_reminder. NO simules.
2. Cuando pida enviar WhatsApp → USA send_whatsapp con confirmed=false primero, muestra el preview, y espera confirmación.
3. Cuando el usuario confirme ("sí", "envíalo", "ok") → USA send_whatsapp con confirmed=true.
4. Para cálculos → USA calculate.

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
