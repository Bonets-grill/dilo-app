import Anthropic from "@anthropic-ai/sdk";
import { buildPersonalPrompt } from "./prompts/personal";
import { getAvailableTools, executeTool } from "./tools";
import type { User, UserSkill, Contact, Reminder } from "@/lib/supabase/types";
import type { AgentContext } from "./prompts/personal";

// Ensure tools are registered
import "./tools/basic.tool";

export interface ProcessMessageOptions {
  user: User;
  skills: UserSkill[];
  channels: { whatsapp: boolean; telegram: boolean };
  contacts: Pick<Contact, "name" | "alias" | "phone">[];
  pendingReminders: Pick<Reminder, "text" | "due_at">[];
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  locale: string;
}

export async function processMessage(
  options: ProcessMessageOptions
): Promise<ReadableStream<Uint8Array>> {
  const { user, skills, channels, contacts, pendingReminders, messages, locale } = options;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === "placeholder") {
    return createMockStream(messages[messages.length - 1]?.content || "");
  }

  // Check rate limit
  const hasUnlimited = skills.some(
    (s) => s.skill_id === "unlimited" && s.status === "active"
  );
  if (!hasUnlimited && user.daily_messages_used >= 30) {
    return createTextStream(
      "Has alcanzado el límite de 30 mensajes hoy. Activa el skill Mensajes Ilimitados para seguir chateando."
    );
  }

  // Build context
  const storeUrl = `/${locale}/store`;
  const ctx: AgentContext = {
    user,
    skills,
    channels,
    contacts,
    pendingReminders,
    storeUrl,
  };

  const systemPrompt = buildPersonalPrompt(ctx);
  const tools = getAvailableTools(skills);

  // Select model
  const useAdvanced = skills.some(
    (s) => s.skill_id === "ai_advanced" && s.status === "active"
  );
  const model = useAdvanced
    ? "claude-sonnet-4-6"
    : "claude-haiku-4-5-20251001";

  const client = new Anthropic({ apiKey });

  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        let currentMessages = messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

        // Tool use loop (max 5 iterations)
        for (let i = 0; i < 5; i++) {
          const stream = await client.messages.stream({
            model,
            max_tokens: 1024,
            system: systemPrompt,
            messages: currentMessages,
            ...(tools.length > 0 && { tools: tools as Anthropic.Tool[] }),
          });

          let hasToolUse = false;
          let accumulatedText = "";
          const toolUseBlocks: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

          for await (const event of stream) {
            if (event.type === "content_block_delta") {
              if (event.delta.type === "text_delta") {
                accumulatedText += event.delta.text;
                controller.enqueue(encoder.encode(event.delta.text));
              }
            }
            if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
              hasToolUse = true;
              toolUseBlocks.push({
                id: event.content_block.id,
                name: event.content_block.name,
                input: {},
              });
            }
            if (event.type === "content_block_delta" && event.delta.type === "input_json_delta") {
              // Accumulate tool input JSON
              const last = toolUseBlocks[toolUseBlocks.length - 1];
              if (last) {
                try {
                  const partial = JSON.parse(event.delta.partial_json);
                  Object.assign(last.input, partial);
                } catch {
                  // Partial JSON, will be complete by end
                }
              }
            }
          }

          if (!hasToolUse) break;

          // Execute tools and continue conversation
          const finalMessage = await stream.finalMessage();
          currentMessages = [
            ...currentMessages,
            { role: "assistant" as const, content: finalMessage.content as unknown as string },
          ];

          for (const toolBlock of toolUseBlocks) {
            const result = await executeTool(toolBlock.name, toolBlock.input, user.id);
            currentMessages.push({
              role: "user" as const,
              content: JSON.stringify({
                type: "tool_result",
                tool_use_id: toolBlock.id,
                content: JSON.stringify(result),
              }),
            });
          }
        }

        controller.close();
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Agent error";
        controller.enqueue(encoder.encode(`\n\n[Error: ${errorMsg}]`));
        controller.close();
      }
    },
  });
}

function createTextStream(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

function createMockStream(input: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const lower = input.toLowerCase();
  let response = "¡Hola! Soy DILO. Estoy en modo desarrollo. Cuando conectemos la API de Claude, podré ayudarte con todo.";

  if (lower.includes("whatsapp") || lower.includes("mensaje"))
    response = "Para enviar mensajes por WhatsApp necesitas el skill **Mensajería WhatsApp** (€1.99/mes). [Ver en tienda →](/store)";
  else if (lower.includes("recordar") || lower.includes("remind"))
    response = "Para recordatorios avanzados necesitas el skill **Recordatorios Pro** (€0.99/mes). [Ver en tienda →](/store)";
  else if (lower.includes("gast") || lower.includes("expense"))
    response = "Para controlar gastos necesitas el skill **Finanzas Personales** (€1.49/mes). [Ver en tienda →](/store)";

  return new ReadableStream({
    async start(controller) {
      for (const char of response) {
        controller.enqueue(encoder.encode(char));
        await new Promise((r) => setTimeout(r, 12));
      }
      controller.close();
    },
  });
}
