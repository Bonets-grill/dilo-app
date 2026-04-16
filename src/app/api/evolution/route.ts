import { NextRequest, NextResponse } from "next/server";

const EVO_URL = process.env.EVOLUTION_API_URL!;
const EVO_KEY = process.env.EVOLUTION_API_KEY!;

async function evoFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${EVO_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", apikey: EVO_KEY, ...options.headers },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data, status: res.status };
}

export async function POST(req: NextRequest) {
  const { action, instanceName, to, text, phoneNumber } = await req.json();

  switch (action) {
    case "create": {
      const { ok, data } = await evoFetch("/instance/create", {
        method: "POST",
        body: JSON.stringify({ instanceName, integration: "WHATSAPP-BAILEYS", qrcode: true }),
      });
      if (!ok) return NextResponse.json({ error: data }, { status: 400 });
      return NextResponse.json(data);
    }

    case "qr": {
      const { ok, data } = await evoFetch(`/instance/connect/${instanceName}`);
      if (!ok) return NextResponse.json({ error: "Could not get QR" }, { status: 400 });
      return NextResponse.json(data);
    }

    case "pair": {
      // Pairing code path — user enters phone, gets 8-char code to paste in
      // WhatsApp → Dispositivos vinculados → Vincular con número. No QR needed.
      const num = String(phoneNumber || "").replace(/\D/g, "");
      if (!num || num.length < 8) {
        return NextResponse.json({ error: "phoneNumber invalid (digits only, with country code)" }, { status: 400 });
      }
      const { ok, data } = await evoFetch(`/instance/connect/${instanceName}?number=${num}`);
      if (!ok) return NextResponse.json({ error: data || "Could not get pairing code" }, { status: 400 });
      return NextResponse.json(data);
    }

    case "status": {
      const { ok, data } = await evoFetch(`/instance/connectionState/${instanceName}`);
      if (!ok) return NextResponse.json({ error: "Could not get status" }, { status: 400 });
      return NextResponse.json(data);
    }

    case "send": {
      const { ok, data } = await evoFetch(`/message/sendText/${instanceName}`, {
        method: "POST",
        body: JSON.stringify({ number: to, text }),
      });
      if (!ok) return NextResponse.json({ error: data }, { status: 400 });
      return NextResponse.json({ success: true, data });
    }

    case "contacts": {
      const { ok, data } = await evoFetch(`/chat/findContacts/${instanceName}`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (!ok) return NextResponse.json({ error: data }, { status: 400 });
      return NextResponse.json(data);
    }

    case "logout": {
      await evoFetch(`/instance/logout/${instanceName}`, { method: "DELETE" });
      return NextResponse.json({ success: true });
    }

    case "delete": {
      await evoFetch(`/instance/delete/${instanceName}`, { method: "DELETE" });
      return NextResponse.json({ success: true });
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
