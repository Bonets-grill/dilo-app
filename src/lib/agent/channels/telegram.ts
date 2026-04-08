const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function tgFetch(method: string, body?: Record<string, unknown>) {
  const res = await fetch(`${BASE}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Telegram API error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function sendMessage(chatId: string | number, text: string, replyMarkup?: Record<string, unknown>) {
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: "Markdown",
  };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  return tgFetch("sendMessage", payload);
}

export async function sendPhoto(chatId: string | number, photoUrl: string, caption?: string) {
  return tgFetch("sendPhoto", {
    chat_id: chatId,
    photo: photoUrl,
    caption,
  });
}

export async function sendDocument(chatId: string | number, documentUrl: string, caption?: string) {
  return tgFetch("sendDocument", {
    chat_id: chatId,
    document: documentUrl,
    caption,
  });
}

export async function sendLocation(chatId: string | number, lat: number, lng: number) {
  return tgFetch("sendLocation", {
    chat_id: chatId,
    latitude: lat,
    longitude: lng,
  });
}

export async function setWebhook(url: string) {
  return tgFetch("setWebhook", { url });
}

export async function getMe() {
  return tgFetch("getMe");
}
