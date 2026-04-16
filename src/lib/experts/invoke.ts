import OpenAI from "openai";
import { getExpertBySlug, type Expert } from "./registry";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export interface ExpertMessage {
  role: "user" | "assistant";
  content: string;
}

export interface InvokeResult {
  expert: Pick<Expert, "slug" | "name" | "emoji" | "color">;
  reply: string;
  tokens: { prompt: number; completion: number };
}

export async function invokeExpert(
  slug: string,
  userMessage: string,
  history: ExpertMessage[] = []
): Promise<InvokeResult> {
  const expert = getExpertBySlug(slug);
  if (!expert) throw new Error(`Expert not found: ${slug}`);

  // Cap system prompt at ~6K chars (~1.5K tokens). Some agents have 30KB+
  // prompts which inflate TTFT and cost without improving quality for short
  // conversational turns. Keep the identity/mission intro; drop deep examples.
  const MAX_SYSTEM_CHARS = 6000;
  const systemPrompt =
    expert.system_prompt.length > MAX_SYSTEM_CHARS
      ? expert.system_prompt.slice(0, MAX_SYSTEM_CHARS)
      : expert.system_prompt;

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history.slice(-8).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userMessage },
  ];

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    max_tokens: 800,
    temperature: 0.7,
  });

  const reply = completion.choices[0]?.message?.content ?? "";
  return {
    expert: { slug: expert.slug, name: expert.name, emoji: expert.emoji, color: expert.color },
    reply,
    tokens: {
      prompt: completion.usage?.prompt_tokens ?? 0,
      completion: completion.usage?.completion_tokens ?? 0,
    },
  };
}
