import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { invokeExpert, type ExpertMessage } from "@/lib/experts/invoke";
import { getExpertBySlug } from "@/lib/experts/registry";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const expert = getExpertBySlug(slug);
  if (!expert) return NextResponse.json({ error: "Expert not found" }, { status: 404 });

  const body = await req.json();
  const { userId, message, conversationId } = body as {
    userId?: string;
    message?: string;
    conversationId?: string;
  };

  if (!userId || !message) {
    return NextResponse.json({ error: "Missing userId or message" }, { status: 400 });
  }

  let convId = conversationId;
  if (!convId) {
    const { data, error } = await supabase
      .from("expert_conversations")
      .insert({ user_id: userId, expert_slug: slug })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    convId = data.id;
  }

  const { data: prevMsgs } = await supabase
    .from("expert_messages")
    .select("role, content")
    .eq("conversation_id", convId)
    .order("created_at", { ascending: true })
    .limit(20);

  const history: ExpertMessage[] = (prevMsgs || []).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  await supabase.from("expert_messages").insert({
    conversation_id: convId,
    user_id: userId,
    role: "user",
    content: message,
  });

  const result = await invokeExpert(slug, message, history);

  await supabase.from("expert_messages").insert({
    conversation_id: convId,
    user_id: userId,
    role: "assistant",
    content: result.reply,
    tokens_prompt: result.tokens.prompt,
    tokens_completion: result.tokens.completion,
  });

  return NextResponse.json({
    conversationId: convId,
    expert: result.expert,
    reply: result.reply,
    tokens: result.tokens,
  });
}
