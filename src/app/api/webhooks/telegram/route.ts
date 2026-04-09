import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const update = await req.json();

    if (update.message) {
      const { chat, text, from } = update.message;
      const chatId = chat.id;

      console.log(`[Telegram] Message from ${from?.first_name} (${chatId}): ${text}`);

      if (text === "/start") {
        // In production: link telegram chat_id to user account
        // The user would send /start with a token from the PWA: /start TOKEN
        // We verify the token and link the telegram_id to the user
        console.log(`[Telegram] User wants to link account: chatId=${chatId}`);
      }

      // In production: process message through agent core
      // or send auto-reply based on user's settings
    }

    if (update.callback_query) {
      console.log(`[Telegram] Callback query: ${update.callback_query.data}`);
    }

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("[Telegram Webhook] Error:", err);
    return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
  }
}
