import { NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron/auth";
import OpenAI from "openai";
import { sendPush } from "@/lib/push/send";
import { getServiceRoleClient } from "@/lib/supabase/service";

const supabase = getServiceRoleClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

interface InsightProposal {
  type:
    | "billing_upcoming"
    | "subscription_detected"
    | "meeting_tomorrow"
    | "deadline_approaching"
    | "bill_due"
    | "savings_opportunity"
    | "other";
  title: string;
  body: string;
  action_label?: string;
  priority: 1 | 2 | 3 | 4 | 5;
  valid_hours?: number;
}

const DETECTOR_PROMPT = `Eres "DILO Anticipador". Tu trabajo: ver qué hay en el correo + agenda + memoria del usuario y detectar SOLO cosas accionables que le importen ANTES de que pregunte.

DETECTAR (ejemplos):
- Cobros próximos (Adobe, Netflix, HBO…) con fecha concreta
- Suscripciones que no se usan (detectadas por inactividad vs. cobro)
- Reuniones importantes mañana que necesitan preparación
- Deadlines próximos (fecha límite declaración, vencimiento carnet)
- Facturas pendientes que el usuario no ha pagado
- Tarifas de luz/internet más baratas disponibles

NO DETECTAR:
- Cosas genéricas ("debes hacer ejercicio")
- Recordatorios que el usuario ya tiene creados
- Info estable (su nombre, dirección)
- Spam o promociones sin contexto personal

FORMATO DE SALIDA (SOLO JSON, máx 5 insights, priorizar por urgencia):
{
  "insights": [
    {
      "type": "billing_upcoming",
      "title": "Netflix te cobra 15,99€ mañana",
      "body": "Detectado en tu correo del 14-abr. Si no lo usas, dime y lo cancelamos.",
      "action_label": "Revisar suscripción",
      "priority": 2,
      "valid_hours": 48
    }
  ]
}

Si no hay nada accionable: {"insights":[]}. NO inventes. NO seas alarmista.`;

export async function GET(req: NextRequest) {
  const gate = requireCronAuth(req); if (gate) return gate;
  try {
    // Find users with Google OAuth connected. DILO stores tokens at
    // users.preferences.google_oauth (not a separate table) — filter by
    // presence of the access_token key.
    const { data: allUsers } = await supabase
      .from("users")
      .select("id, preferences")
      .limit(1000);

    const googleUsers = (allUsers || []).filter((u) => {
      const prefs = (u.preferences as Record<string, unknown>) || {};
      const oauth = prefs.google_oauth as Record<string, unknown> | undefined;
      return !!oauth?.access_token;
    });

    if (googleUsers.length === 0) {
      return NextResponse.json({ ok: true, processed: 0, reason: "no users with google" });
    }

    const results = { processed: 0, insights_created: 0, notifs_sent: 0, errors: 0 };

    for (const { id: userId } of googleUsers) {
      try {
        // Gather context for this user
        const context = await gatherContext(userId);
        if (!context.hasAnything) continue;

        const proposals = await detectInsights(context);
        if (proposals.length === 0) continue;

        // Insert each proposal
        for (const p of proposals) {
          const valid_until = p.valid_hours
            ? new Date(Date.now() + p.valid_hours * 3600_000).toISOString()
            : null;

          const { data: inserted } = await supabase
            .from("proactive_insights")
            .insert({
              user_id: userId,
              type: p.type,
              title: p.title,
              body: p.body,
              action_label: p.action_label || null,
              action_url: `/es/chat?insight=${encodeURIComponent(p.title)}`,
              priority: p.priority,
              valid_until,
              source_payload: null,
            })
            .select("id")
            .single();

          if (inserted) {
            results.insights_created++;
            // Send push only for priority 1-2 (critical/high)
            if (p.priority <= 2) {
              await notifyUser(userId, p);
              results.notifs_sent++;
            }
          }
        }
        results.processed++;
      } catch (err) {
        console.error("[anticipate] user", userId, "failed:", err);
        results.errors++;
      }
    }

    return NextResponse.json({ ok: true, ...results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

interface UserContext {
  userId: string;
  emails: Array<{ from: string; subject: string; snippet: string; date: string }>;
  events: Array<{ summary: string; start: string; end: string; attendees?: string[] }>;
  memoryFacts: Array<{ fact: string; category: string }>;
  hasAnything: boolean;
}

async function gatherContext(userId: string): Promise<UserContext> {
  const ctx: UserContext = { userId, emails: [], events: [], memoryFacts: [], hasAnything: false };

  try {
    const { getGoogleAccessToken } = await import("@/lib/oauth/google");
    const token = await getGoogleAccessToken(userId);
    if (!token) return ctx;

    // Gmail: last 7 days, focus on invoices / subscriptions / receipts
    const gmailQuery = "newer_than:7d (invoice OR factura OR recibo OR subscription OR suscripci\u00f3n OR renewal)";
    const gmailRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(gmailQuery)}&maxResults=15`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (gmailRes.ok) {
      const gmailData = await gmailRes.json();
      if (gmailData.messages) {
        for (const m of gmailData.messages.slice(0, 10)) {
          const detailRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (!detailRes.ok) continue;
          const d = await detailRes.json();
          const headers = Object.fromEntries(
            (d.payload?.headers || []).map((h: { name: string; value: string }) => [h.name, h.value])
          );
          ctx.emails.push({
            from: headers.From || "",
            subject: headers.Subject || "",
            snippet: d.snippet || "",
            date: headers.Date || "",
          });
        }
      }
    }

    // Calendar: events in the next 48 hours
    const now = new Date();
    const in48h = new Date(now.getTime() + 48 * 3600_000);
    const calRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now.toISOString()}&timeMax=${in48h.toISOString()}&singleEvents=true&orderBy=startTime`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (calRes.ok) {
      const calData = await calRes.json();
      ctx.events = (calData.items || []).slice(0, 10).map((e: {
        summary?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string }; attendees?: Array<{ email: string }>;
      }) => ({
        summary: e.summary || "",
        start: e.start?.dateTime || e.start?.date || "",
        end: e.end?.dateTime || e.end?.date || "",
        attendees: e.attendees?.map((a) => a.email) || [],
      }));
    }
  } catch (e) {
    console.error("[anticipate] gather failed:", e);
  }

  // Mem0 memory: fetch a small identity/finance snapshot
  try {
    const { data: facts } = await supabase
      .from("memory_facts")
      .select("fact, category")
      .eq("user_id", userId)
      .is("valid_to", null)
      .in("category", ["identity", "location", "work", "finance", "routines"])
      .limit(10);
    ctx.memoryFacts = facts || [];
  } catch { /* ignore */ }

  ctx.hasAnything = ctx.emails.length > 0 || ctx.events.length > 0;
  return ctx;
}

async function detectInsights(ctx: UserContext): Promise<InsightProposal[]> {
  const context = [
    ctx.memoryFacts.length ? `MEMORIA:\n${ctx.memoryFacts.map((f) => `- [${f.category}] ${f.fact}`).join("\n")}` : "",
    ctx.emails.length ? `EMAILS (últimos 7d, filtrados por facturas/suscripciones):\n${ctx.emails.map((e) => `- ${e.date.slice(0, 16)} | ${e.from} | ${e.subject} | ${e.snippet.slice(0, 120)}`).join("\n")}` : "",
    ctx.events.length ? `EVENTOS (próximas 48h):\n${ctx.events.map((e) => `- ${e.start} → ${e.summary}${e.attendees?.length ? ` (con ${e.attendees.join(", ")})` : ""}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");

  if (!context) return [];

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 600,
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: DETECTOR_PROMPT },
      { role: "user", content: context },
    ],
  });

  const raw = completion.choices[0]?.message?.content || "{}";
  try {
    const parsed = JSON.parse(raw) as { insights?: InsightProposal[] };
    if (!Array.isArray(parsed.insights)) return [];
    return parsed.insights
      .filter((i) => i?.type && i?.title && i?.body && typeof i?.priority === "number")
      .slice(0, 5);
  } catch {
    return [];
  }
}

async function notifyUser(userId: string, p: InsightProposal): Promise<void> {
  try {
    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("endpoint, keys")
      .eq("user_id", userId);
    if (!subs?.length) return;
    for (const s of subs) {
      await sendPush(
        { endpoint: s.endpoint, keys: s.keys as { p256dh: string; auth: string } },
        { title: `💡 ${p.title}`, body: p.body, url: "/chat" }
      );
    }
    await supabase
      .from("proactive_insights")
      .update({ notified_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("title", p.title);
  } catch (e) {
    console.error("[anticipate] notify failed:", e);
  }
}

export const dynamic = "force-dynamic";
export const maxDuration = 300;
