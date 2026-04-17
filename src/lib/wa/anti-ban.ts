/**
 * WhatsApp anti-ban layer for Evolution API.
 *
 * WhatsApp detects and bans accounts that behave like bots. The banable
 * patterns are well-documented: instant replies, no typing indicator, >1 msg
 * per second, same-template blasts, sending in the dead of night, and fresh
 * numbers that spam on day one.
 *
 * This module wraps every outbound send with the counter-patterns:
 *   1. spacing — minimum 2s between messages to the SAME JID
 *   2. jitter — random 500–1500ms pre-send pause so timings are not robotic
 *   3. presence — emits "composing" + waits N seconds proportional to length
 *   4. daily cap — 800 msgs/instance/day, reduced to 30/h between 02–08 CET
 *   5. warmup — first 72h after connect only replies (no proactive outbound)
 *   6. kill-switch — 3 consecutive Evolution errors → pause instance 30 min
 *
 * ALL writes go through the service role client (admin). Clients can only
 * READ their own logs via RLS.
 *
 * Usage:
 *   import { safeSendWhatsAppText } from "@/lib/wa/anti-ban";
 *   const res = await safeSendWhatsAppText({
 *     instance: "dilo_user_123",
 *     to: "34600000000",
 *     text: "Hola!",
 *     userId: user.id,
 *     proactive: true,        // true for crons, false for replies
 *   });
 *   if (!res.ok) console.warn("blocked:", res.reason);
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceRoleClient } from "@/lib/supabase/service";

const EVO_URL = process.env.EVOLUTION_API_URL || "";
const EVO_KEY = process.env.EVOLUTION_API_KEY || "";

const admin: SupabaseClient = getServiceRoleClient();

// ── Tunables (all in ms unless noted) ────────────────────────────────────────
const MIN_SPACING_TO_SAME_JID_MS = 2_000;
const JITTER_MIN_MS = 500;
const JITTER_MAX_MS = 1_500;
const TYPING_MS_PER_CHAR = 20;        // average typing speed ~50 wpm
const TYPING_MIN_MS = 1_000;
const TYPING_MAX_MS = 6_000;
const ERROR_STREAK_FOR_KILL = 3;
const KILL_SWITCH_PAUSE_MIN = 30;
const DAILY_CAP_DEFAULT = 800;
const DAILY_CAP_QUIET_HOURS_PER_HOUR = 30;
const QUIET_HOURS_CET = { startH: 2, endH: 8 }; // 02:00 – 07:59 Madrid

// ── Types ────────────────────────────────────────────────────────────────────

export interface SafeSendOpts {
  instance: string;
  to: string;            // phone or JID
  text: string;
  userId: string | null;
  proactive: boolean;    // true = cron/outbound; false = reply to inbound
  mediaUrl?: string;
  mediaType?: "image" | "video" | "document";
  /**
   * If set, skip typing indicator (useful for short system pings like
   * "se ha caído el cron" from monitor). Default false.
   */
  skipPresence?: boolean;
}

export interface SafeSendResult {
  ok: boolean;
  reason?: string;
  sentAt?: string;
  retryAfterMs?: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function jitterMs(): number {
  return JITTER_MIN_MS + Math.floor(Math.random() * (JITTER_MAX_MS - JITTER_MIN_MS));
}

function typingDelayMs(text: string): number {
  const n = Math.min(text.length, 500);
  const raw = n * TYPING_MS_PER_CHAR + 500;
  return Math.max(TYPING_MIN_MS, Math.min(TYPING_MAX_MS, raw));
}

/** Returns true if current UTC time falls in the Madrid quiet window. */
function isQuietHour(now = new Date()): boolean {
  // Convert UTC to Madrid (CEST in summer = UTC+2, CET winter = UTC+1).
  // We approximate with UTC+2 April-Oct, UTC+1 otherwise; accuracy is not
  // critical for a 6-hour window check.
  const month = now.getUTCMonth() + 1;
  const offsetH = (month >= 4 && month <= 10) ? 2 : 1;
  const madridH = (now.getUTCHours() + offsetH) % 24;
  return madridH >= QUIET_HOURS_CET.startH && madridH < QUIET_HOURS_CET.endH;
}

// ── State access ─────────────────────────────────────────────────────────────

/**
 * All DB helpers swallow errors and return safe defaults. Rationale: if
 * migration 049_wa_antiban.sql has not been applied yet, the outbound
 * send must still go through (anti-ban degrades to no-op) rather than
 * crash every send path with "relation wa_send_log does not exist".
 */

export async function ensureInstanceState(instance: string, userId: string | null) {
  try {
    await admin.from("wa_instance_state")
      .upsert({ instance, user_id: userId }, { onConflict: "instance", ignoreDuplicates: true });
  } catch (err) { console.warn("[wa.anti-ban] ensureInstanceState skipped:", err); }
}

async function getInstanceState(instance: string) {
  try {
    const { data } = await admin
      .from("wa_instance_state")
      .select("warmup_ends_at, paused_until, error_streak")
      .eq("instance", instance)
      .maybeSingle();
    return data as { warmup_ends_at: string | null; paused_until: string | null; error_streak: number } | null;
  } catch { return null; }
}

async function countSentToday(instance: string): Promise<number> {
  try {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    const { count } = await admin
      .from("wa_send_log")
      .select("*", { count: "exact", head: true })
      .eq("instance", instance)
      .eq("status", "ok")
      .gte("sent_at", since.toISOString());
    return count || 0;
  } catch { return 0; }
}

async function countSentLastHour(instance: string): Promise<number> {
  try {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("wa_send_log")
      .select("*", { count: "exact", head: true })
      .eq("instance", instance)
      .eq("status", "ok")
      .gte("sent_at", since);
    return count || 0;
  } catch { return 0; }
}

async function lastSendToJid(instance: string, toJid: string): Promise<number | null> {
  try {
    const { data } = await admin
      .from("wa_send_log")
      .select("sent_at")
      .eq("instance", instance)
      .eq("to_jid", toJid)
      .eq("status", "ok")
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const sentAt = (data as { sent_at?: string } | null)?.sent_at;
    return sentAt ? new Date(sentAt).getTime() : null;
  } catch { return null; }
}

async function logSend(row: {
  instance: string; to: string; status: SafeSendResult["reason"] | "ok" | "error"; error?: string;
  userId: string | null; contentLen?: number; proactive: boolean;
}) {
  try {
    await admin.from("wa_send_log").insert({
      user_id: row.userId,
      instance: row.instance,
      to_jid: row.to,
      status: row.status,
      error_text: row.error?.slice(0, 500) ?? null,
      content_len: row.contentLen ?? null,
      proactive: row.proactive,
    });
  } catch (err) { console.warn("[wa.anti-ban] logSend skipped:", err); }
}

async function recordErrorStreak(instance: string) {
  try {
    const { data } = await admin
      .from("wa_instance_state")
      .select("error_streak")
      .eq("instance", instance)
      .maybeSingle();
    const next = ((data as { error_streak?: number } | null)?.error_streak ?? 0) + 1;
    const updates: Record<string, unknown> = {
      error_streak: next,
      last_error_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (next >= ERROR_STREAK_FOR_KILL) {
      updates.paused_until = new Date(Date.now() + KILL_SWITCH_PAUSE_MIN * 60_000).toISOString();
      updates.error_streak = 0;
      console.warn(`[wa.anti-ban] KILL-SWITCH instance=${instance} paused for ${KILL_SWITCH_PAUSE_MIN}min`);
    }
    await admin.from("wa_instance_state").update(updates).eq("instance", instance);
  } catch (err) { console.warn("[wa.anti-ban] recordErrorStreak skipped:", err); }
}

async function resetErrorStreak(instance: string) {
  try {
    await admin.from("wa_instance_state").update({ error_streak: 0 }).eq("instance", instance);
  } catch { /* no-op */ }
}

// ── Pre-flight check ─────────────────────────────────────────────────────────

async function canSend(opts: SafeSendOpts): Promise<{ ok: boolean; reason?: SafeSendResult["reason"] }> {
  const state = await getInstanceState(opts.instance);
  if (!state) {
    await ensureInstanceState(opts.instance, opts.userId);
  }

  // Kill-switch pause
  if (state?.paused_until && new Date(state.paused_until) > new Date()) {
    return { ok: false, reason: "blocked_paused" };
  }

  // Warmup — first 3 days, only replies allowed
  if (opts.proactive && state?.warmup_ends_at && new Date(state.warmup_ends_at) > new Date()) {
    return { ok: false, reason: "blocked_warmup" };
  }

  // Daily cap
  const sentToday = await countSentToday(opts.instance);
  if (sentToday >= DAILY_CAP_DEFAULT) {
    return { ok: false, reason: "blocked_cap" };
  }

  // Quiet-hours throttle
  if (isQuietHour()) {
    const sentLastHour = await countSentLastHour(opts.instance);
    if (sentLastHour >= DAILY_CAP_QUIET_HOURS_PER_HOUR) {
      return { ok: false, reason: "blocked_cap" };
    }
  }

  // Per-JID spacing
  const last = await lastSendToJid(opts.instance, opts.to);
  if (last && Date.now() - last < MIN_SPACING_TO_SAME_JID_MS) {
    return { ok: false, reason: "blocked_spacing" };
  }

  return { ok: true };
}

// ── Evolution API raw calls ──────────────────────────────────────────────────

async function evoPresence(instance: string, to: string, state: "composing" | "paused") {
  if (!EVO_URL || !EVO_KEY) return;
  await fetch(`${EVO_URL}/chat/sendPresence/${instance}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: EVO_KEY },
    body: JSON.stringify({ number: to, presence: state, delay: 1200 }),
  }).catch((err) => console.warn("[wa.anti-ban] presence fail", err));
}

async function evoSendText(instance: string, to: string, text: string) {
  const res = await fetch(`${EVO_URL}/message/sendText/${instance}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: EVO_KEY },
    body: JSON.stringify({ number: to, text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`evo ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Gated, human-paced text send. Returns { ok: false, reason } if blocked —
 * caller can decide whether to retry later (e.g., cron skip) or drop.
 */
export async function safeSendWhatsAppText(opts: SafeSendOpts): Promise<SafeSendResult> {
  const pre = await canSend(opts);
  if (!pre.ok) {
    await logSend({
      instance: opts.instance,
      to: opts.to,
      status: pre.reason!,
      userId: opts.userId,
      contentLen: opts.text.length,
      proactive: opts.proactive,
    });
    return { ok: false, reason: pre.reason };
  }

  // Random pre-send jitter so sends are not robotic
  await sleep(jitterMs());

  // Typing indicator (skip for tiny system pings)
  if (!opts.skipPresence) {
    await evoPresence(opts.instance, opts.to, "composing");
    await sleep(typingDelayMs(opts.text));
    await evoPresence(opts.instance, opts.to, "paused");
  }

  try {
    await evoSendText(opts.instance, opts.to, opts.text);
    await resetErrorStreak(opts.instance);
    await logSend({
      instance: opts.instance,
      to: opts.to,
      status: "ok",
      userId: opts.userId,
      contentLen: opts.text.length,
      proactive: opts.proactive,
    });
    return { ok: true, sentAt: new Date().toISOString() };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await recordErrorStreak(opts.instance);
    await logSend({
      instance: opts.instance,
      to: opts.to,
      status: "error",
      error: msg,
      userId: opts.userId,
      contentLen: opts.text.length,
      proactive: opts.proactive,
    });
    return { ok: false, reason: "error" };
  }
}
