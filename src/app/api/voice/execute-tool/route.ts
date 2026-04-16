import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Evolution v2: el `id` del contacto es un ULID interno (cmnqz2eh…). El JID
// real está en remoteJid con sufijo @s.whatsapp.net (sendable) o @lid
// (linked ID — NO sendable, Baileys suele rechazar envíos). Devolvemos null
// si no hay dígitos válidos.
function extractEvoPhone(c: Record<string, unknown>): { phone: string; sendable: boolean } | null {
  const candidates = [
    { v: c.remoteJid, isJid: true },
    { v: c.owner, isJid: true },
    { v: c.jid, isJid: true },
    { v: c.phoneNumber, isJid: false },
    { v: c.number, isJid: false },
    { v: c.id, isJid: true },
  ];
  for (const { v, isJid } of candidates) {
    if (!v) continue;
    const s = String(v);
    const m = s.match(/^(\d{8,15})(@(.+))?$/);
    if (!m) continue;
    const suffix = m[3] || "";
    const sendable = !isJid || !suffix || suffix === "s.whatsapp.net" || suffix === "c.us";
    return { phone: m[1], sendable };
  }
  return null;
}

/**
 * POST /api/voice/execute-tool
 * Body: { userId, toolName, args }
 *
 * When the Realtime model emits a function_call event, the client posts
 * here. We execute against Supabase / Gmail / etc. and return the result
 * as a JSON string, which the client then feeds back to the model via
 * conversation.item.create + response.create.
 *
 * Scoped to "core" tools that make sense over voice — reminders, expenses,
 * basic queries. Browser automation / email sending require visual
 * confirmation and stay text-only.
 */
export async function POST(req: NextRequest) {
  const { userId, toolName, args } = (await req.json()) as {
    userId?: string;
    toolName?: string;
    args?: Record<string, unknown>;
  };

  if (!userId || !toolName) {
    return NextResponse.json({ error: "Missing userId or toolName" }, { status: 400 });
  }

  try {
    const a = args || {};

    // CREATE REMINDER
    if (toolName === "create_reminder") {
      const text = String(a.text || "").trim();
      const due_at = String(a.due_at || "").trim();
      if (!text || !due_at) {
        return NextResponse.json({ result: JSON.stringify({ error: "missing_fields" }) });
      }
      // Validate datetime is valid AND in the future (prevents the classic
      // "LLM forgot timezone offset → reminder fires immediately" bug).
      const parsed = new Date(due_at).getTime();
      if (isNaN(parsed)) {
        return NextResponse.json({
          result: JSON.stringify({ error: "invalid_due_at", message: "due_at inválido. Usa ISO 8601 con offset." }),
        });
      }
      if (parsed <= Date.now() + 30_000) {
        return NextResponse.json({
          result: JSON.stringify({
            error: "due_at_in_past",
            message: `Esa hora ya pasó. Ahora: ${new Date().toISOString()}. Recalcula con el offset del usuario e inténtalo otra vez.`,
          }),
        });
      }
      const { data, error } = await supabase
        .from("reminders")
        .insert({ user_id: userId, text, due_at })
        .select("id, text, due_at")
        .single();
      if (error) {
        return NextResponse.json({ result: JSON.stringify({ error: error.message }) });
      }
      return NextResponse.json({
        result: JSON.stringify({ success: true, reminder: data }),
      });
    }

    // LIST REMINDERS
    if (toolName === "list_reminders") {
      const { data: pending } = await supabase
        .from("reminders")
        .select("id, text, due_at, status")
        .eq("user_id", userId)
        .eq("status", "pending")
        .order("due_at", { ascending: true })
        .limit(10);
      return NextResponse.json({ result: JSON.stringify({ pending: pending || [] }) });
    }

    // CANCEL REMINDER (fuzzy match by text)
    if (toolName === "cancel_reminder") {
      const textMatch = String(a.text_match || "").trim().toLowerCase();
      if (!textMatch) {
        return NextResponse.json({ result: JSON.stringify({ error: "missing_text_match" }) });
      }
      const { data: reminders } = await supabase
        .from("reminders")
        .select("id, text")
        .eq("user_id", userId)
        .eq("status", "pending");
      const match = (reminders || []).find((r) => r.text.toLowerCase().includes(textMatch));
      if (!match) {
        return NextResponse.json({ result: JSON.stringify({ error: "no_match" }) });
      }
      await supabase.from("reminders").update({ status: "cancelled" }).eq("id", match.id);
      return NextResponse.json({ result: JSON.stringify({ success: true, cancelled: match }) });
    }

    // CREATE EXPENSE
    if (toolName === "create_expense") {
      const amount = Number(a.amount);
      const description = String(a.description || "").trim();
      const category = String(a.category || "otros").trim();
      if (!amount || !description) {
        return NextResponse.json({ result: JSON.stringify({ error: "missing_fields" }) });
      }
      const { data, error } = await supabase
        .from("expenses")
        .insert({
          user_id: userId,
          amount,
          currency: "EUR",
          category,
          description,
          date: new Date().toISOString().split("T")[0],
        })
        .select("id, amount, description")
        .single();
      if (error) {
        return NextResponse.json({ result: JSON.stringify({ error: error.message }) });
      }
      return NextResponse.json({ result: JSON.stringify({ success: true, expense: data }) });
    }

    // LIST EXPENSES (today / week / month)
    if (toolName === "list_expenses") {
      const period = String(a.period || "today");
      const now = new Date();
      let since: Date;
      if (period === "week") {
        since = new Date(now.getTime() - 7 * 86400000);
      } else if (period === "month") {
        since = new Date(now.getFullYear(), now.getMonth(), 1);
      } else {
        since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      }
      const { data } = await supabase
        .from("expenses")
        .select("amount, description, category, date")
        .eq("user_id", userId)
        .gte("date", since.toISOString().split("T")[0])
        .order("date", { ascending: false });
      const total = (data || []).reduce((s, e) => s + Number(e.amount || 0), 0);
      return NextResponse.json({
        result: JSON.stringify({ period, total, count: data?.length || 0, items: data || [] }),
      });
    }

    // ── WHATSAPP TOOLS ──
    // Instance name matches channels/page.tsx convention: dilo_<first-8-of-uuid>
    const instName = `dilo_${userId.slice(0, 8)}`;
    const evoUrl = process.env.EVOLUTION_API_URL || "";
    const evoKey = process.env.EVOLUTION_API_KEY || "";
    const hasEvo = Boolean(evoUrl && evoKey);

    if (toolName === "search_contacts") {
      if (!hasEvo) {
        return NextResponse.json({ result: JSON.stringify({ error: "WhatsApp not connected" }) });
      }
      const q = String(a.query || "").trim().toLowerCase();
      if (!q) return NextResponse.json({ result: JSON.stringify({ error: "missing_query" }) });
      try {
        const res = await fetch(`${evoUrl}/chat/findContacts/${instName}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: evoKey },
          body: JSON.stringify({}),
        });
        const raw = await res.json().catch(() => []);
        const list: Record<string, unknown>[] = Array.isArray(raw) ? raw
          : Array.isArray(raw?.contacts) ? raw.contacts
          : Array.isArray(raw?.data) ? raw.data : [];

        // Multi-word AND semantics + fallback OR si no hay match estricto
        const words = q.split(/\s+/).filter(Boolean);

        const candidates = list
          .map((c) => {
            const name = String(c.pushName || c.name || c.profileName || c.verifiedName || "").trim();
            if (!name) return null;
            const ext = extractEvoPhone(c);
            if (!ext) return null;
            return { name, low: name.toLowerCase(), phone: ext.phone, sendable: ext.sendable };
          })
          .filter((x): x is { name: string; low: string; phone: string; sendable: boolean } => x !== null);

        function rank(arr: typeof candidates) {
          return arr
            .map((c) => {
              let score = c.low === q ? 100 : c.low.startsWith(q) ? 50 : 10;
              if (c.sendable) score += 5;
              return { c, score };
            })
            .sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name))
            .map((x) => ({ name: x.c.name, phone: x.c.phone, sendable: x.c.sendable }));
        }

        const strict = candidates.filter((c) => words.every((w) => c.low.includes(w)));
        const exact = rank(strict).slice(0, 8);

        let suggestions: ReturnType<typeof rank> = [];
        if (exact.length === 0 && words.length > 0) {
          const partial = candidates.filter((c) => words.some((w) => c.low.includes(w)));
          suggestions = rank(partial).slice(0, 5);
        }

        return NextResponse.json({
          result: JSON.stringify({
            found: exact.length,
            contacts: exact,
            suggestions: suggestions.length > 0 ? suggestions : undefined,
            hint: exact.length === 0
              ? (suggestions.length > 0
                  ? `No hay match exacto. Ofrécele al usuario las sugerencias verbalmente ('¿Querías decir Elenita Macho?'). WhatsApp no lee los nombres de la agenda del móvil.`
                  : "Ningún contacto coincide. Pídele el teléfono directo.")
              : undefined,
          }),
        });
      } catch (err) {
        return NextResponse.json({ result: JSON.stringify({ error: "WhatsApp not connected", detail: String(err).slice(0, 120) }) });
      }
    }

    if (toolName === "send_whatsapp") {
      if (!hasEvo) {
        return NextResponse.json({ result: JSON.stringify({ error: "WhatsApp not connected" }) });
      }
      const to = String(a.to || "").replace(/\D/g, "");
      const message = String(a.message || "").trim();
      const confirmed = Boolean(a.confirmed);
      if (!to || !message) {
        return NextResponse.json({ result: JSON.stringify({ error: "missing_fields" }) });
      }
      if (!confirmed) {
        return NextResponse.json({
          result: JSON.stringify({
            preview: true,
            to,
            message,
            instruction: "Lee el preview al usuario y pregúntale '¿Lo envío?'. Si dice sí, vuelve a llamar send_whatsapp con confirmed=true.",
          }),
        });
      }
      try {
        const res = await fetch(`${evoUrl}/message/sendText/${instName}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: evoKey },
          body: JSON.stringify({ number: to, text: message }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          return NextResponse.json({ result: JSON.stringify({ error: "send_failed", detail: data }) });
        }
        return NextResponse.json({ result: JSON.stringify({ success: true, sent_to: to }) });
      } catch (err) {
        return NextResponse.json({ result: JSON.stringify({ error: "WhatsApp not connected", detail: String(err).slice(0, 120) }) });
      }
    }

    if (toolName === "read_whatsapp") {
      if (!hasEvo) {
        return NextResponse.json({ result: JSON.stringify({ error: "WhatsApp not connected" }) });
      }
      const phone = a.phone ? String(a.phone).replace(/\D/g, "") : null;
      const limit = Number(a.limit) || 5;
      try {
        if (phone) {
          const res = await fetch(`${evoUrl}/chat/findMessages/${instName}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: evoKey },
            body: JSON.stringify({ where: { key: { remoteJid: `${phone}@s.whatsapp.net` } }, limit }),
          });
          const data = await res.json().catch(() => []);
          const msgs = Array.isArray(data) ? data : data?.messages || [];
          const out = msgs.slice(0, limit).map((m: Record<string, unknown>) => ({
            from: (m.key as Record<string, unknown>)?.fromMe ? "tú" : (m.pushName || phone),
            text: ((m.message as Record<string, unknown>)?.conversation || "[media]") as string,
          }));
          return NextResponse.json({ result: JSON.stringify({ phone, messages: out }) });
        }
        const res = await fetch(`${evoUrl}/chat/findChats/${instName}`, { headers: { apikey: evoKey } });
        const chats = await res.json().catch(() => []);
        const summary = Array.isArray(chats)
          ? chats.slice(0, limit).map((c: Record<string, unknown>) => ({
              name: c.name || c.id,
              last: (c.lastMessage as Record<string, unknown>)?.conversation || "",
            }))
          : [];
        return NextResponse.json({ result: JSON.stringify({ chats: summary }) });
      } catch (err) {
        return NextResponse.json({ result: JSON.stringify({ error: "WhatsApp not connected", detail: String(err).slice(0, 120) }) });
      }
    }

    return NextResponse.json({
      result: JSON.stringify({ error: "unsupported_tool", toolName }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ result: JSON.stringify({ error: msg }) });
  }
}

export const dynamic = "force-dynamic";
