import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  // Telegram signs each request with the secret_token set during setWebhook.
  // Without this check, anyone can POST forged updates attributed to any chat.
  const tgSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (tgSecret && tgSecret !== "placeholder") {
    const got = req.headers.get("x-telegram-bot-api-secret-token");
    if (got !== tgSecret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  try {
    const update = await req.json();

    if (update.message) {
      const { chat, text, from } = update.message;
      const chatId = chat.id;


      if (text === "/start") {
        // In production: link telegram chat_id to user account
        // The user would send /start with a token from the PWA: /start TOKEN
        // We verify the token and link the telegram_id to the user
      }

      // In production: process message through agent core
      // or send auto-reply based on user's settings
    }

    if (update.callback_query) {
    }

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("[Telegram Webhook] Error:", err);
    return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
  }
}
