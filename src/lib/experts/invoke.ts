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

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: expert.system_prompt },
    ...history.slice(-10).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userMessage },
  ];

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    max_tokens: 1200,
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
