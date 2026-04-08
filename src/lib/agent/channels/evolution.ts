const BASE_URL = process.env.EVOLUTION_API_URL || "";
const API_KEY = process.env.EVOLUTION_API_KEY || "";

async function evoFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      apikey: API_KEY,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Evolution API error ${res.status}: ${text}`);
  }
  return res.json();
}

// ── Instance Management ──

export async function createInstance(instanceName: string) {
  return evoFetch("/instance/create", {
    method: "POST",
    body: JSON.stringify({
      instanceName,
      integration: "WHATSAPP-BAILEYS",
      qrcode: true,
    }),
  });
}

export async function getInstanceStatus(instanceName: string) {
  return evoFetch(`/instance/connectionState/${instanceName}`);
}

export async function getQRCode(instanceName: string) {
  return evoFetch(`/instance/connect/${instanceName}`);
}

export async function deleteInstance(instanceName: string) {
  return evoFetch(`/instance/delete/${instanceName}`, { method: "DELETE" });
}

export async function logoutInstance(instanceName: string) {
  return evoFetch(`/instance/logout/${instanceName}`, { method: "DELETE" });
}

// ── Send Messages ──

export async function sendTextMessage(
  instanceName: string,
  to: string,
  text: string
) {
  return evoFetch(`/message/sendText/${instanceName}`, {
    method: "POST",
    body: JSON.stringify({
      number: to,
      text,
    }),
  });
}

export async function sendMediaMessage(
  instanceName: string,
  to: string,
  mediaUrl: string,
  caption?: string,
  mediaType: "image" | "video" | "document" = "image"
) {
  return evoFetch(`/message/sendMedia/${instanceName}`, {
    method: "POST",
    body: JSON.stringify({
      number: to,
      mediatype: mediaType,
      media: mediaUrl,
      caption: caption || "",
    }),
  });
}

export async function sendAudioMessage(
  instanceName: string,
  to: string,
  audioBase64: string
) {
  return evoFetch(`/message/sendWhatsAppAudio/${instanceName}`, {
    method: "POST",
    body: JSON.stringify({
      number: to,
      audio: audioBase64,
    }),
  });
}

export async function sendLocationMessage(
  instanceName: string,
  to: string,
  lat: number,
  lng: number,
  name?: string
) {
  return evoFetch(`/message/sendLocation/${instanceName}`, {
    method: "POST",
    body: JSON.stringify({
      number: to,
      latitude: lat,
      longitude: lng,
      name: name || "",
    }),
  });
}

export async function sendReaction(
  instanceName: string,
  messageId: string,
  emoji: string
) {
  return evoFetch(`/message/sendReaction/${instanceName}`, {
    method: "POST",
    body: JSON.stringify({
      key: { id: messageId },
      reaction: emoji,
    }),
  });
}

// ── Read Messages & Contacts ──

export async function getContacts(instanceName: string) {
  return evoFetch(`/chat/findContacts/${instanceName}`, { method: "POST", body: JSON.stringify({}) });
}

export async function getChats(instanceName: string) {
  return evoFetch(`/chat/findChats/${instanceName}`);
}

export async function getChatMessages(
  instanceName: string,
  remoteJid: string,
  limit = 20
) {
  return evoFetch(`/chat/findMessages/${instanceName}`, {
    method: "POST",
    body: JSON.stringify({
      where: { key: { remoteJid } },
      limit,
    }),
  });
}

// ── Groups ──

export async function getGroups(instanceName: string) {
  return evoFetch(`/group/fetchAllGroups/${instanceName}?getParticipants=false`);
}

export async function sendGroupMessage(
  instanceName: string,
  groupJid: string,
  text: string
) {
  return evoFetch(`/message/sendText/${instanceName}`, {
    method: "POST",
    body: JSON.stringify({
      number: groupJid,
      text,
    }),
  });
}

// ── Webhook ──

export async function setWebhook(instanceName: string, webhookUrl: string) {
  return evoFetch(`/webhook/set/${instanceName}`, {
    method: "POST",
    body: JSON.stringify({
      enabled: true,
      url: webhookUrl,
      webhookByEvents: true,
      events: [
        "CONNECTION_UPDATE",
        "MESSAGES_UPSERT",
        "QRCODE_UPDATED",
      ],
    }),
  });
}
