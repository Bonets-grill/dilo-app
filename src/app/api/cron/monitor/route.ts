import { NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron/auth";
import { getServiceRoleClient } from "@/lib/supabase/service";

const supabase = getServiceRoleClient();

const EVO_URL = process.env.EVOLUTION_API_URL || "";
const EVO_KEY = process.env.EVOLUTION_API_KEY || "";

// Mario's user ID — receives all monitoring alerts
const ADMIN_USER_ID = "def038c9-19dc-45cf-93d3-60b6fc65887f";

// All crons that should run daily (name → expected schedule description)
const EXPECTED_CRONS: Record<string, string> = {
  "reminders": "every minute",
  "briefing": "8:00 AM",
  "insights": "21:00",
  "friendly": "10:00, 15:00, 20:00",
  "trading-learn": "7:00 L-V",
  "trading-snapshot": "22:00 L-V",
  "trading-strategy": "7:00 L-V",
  "trading-sniper": "*/15 kill zones L-V",
  "price-check": "10:00",
  "proactive": "10:00, 13:00, 18:00, 21:00",
};

/**
 * Cron Monitor — runs at 23:00 daily
 * Checks if all crons executed today. Alerts via WhatsApp if something is wrong.
 */
export async function GET(req: NextRequest) {
  const gate = requireCronAuth(req); if (gate) return gate;
  const today = new Date().toISOString().slice(0, 10);
  const todayStart = `${today}T00:00:00.000Z`;
  const now = new Date().toISOString();

  // Get all cron logs from today
  const { data: logs } = await supabase
    .from("cron_logs")
    .select("cron_name, status, metrics, error, created_at")
    .gte("created_at", todayStart)
    .lte("created_at", now)
    .order("created_at", { ascending: false });

  const logsByName: Record<string, typeof logs> = {};
  if (logs) {
    for (const log of logs) {
      if (!logsByName[log.cron_name]) logsByName[log.cron_name] = [];
      logsByName[log.cron_name]!.push(log);
    }
  }

  const issues: string[] = [];
  const summary: string[] = [];

  // Check weekend — trading crons don't run on weekends
  const dayOfWeek = new Date().getDay(); // 0=Sun, 6=Sat
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  for (const [cronName, schedule] of Object.entries(EXPECTED_CRONS)) {
    const cronLogs = logsByName[cronName];

    // Skip trading crons on weekends
    if (isWeekend && (cronName === "trading-learn" || cronName === "trading-snapshot" || cronName === "trading-strategy" || cronName === "trading-sniper")) {
      continue;
    }

    if (!cronLogs || cronLogs.length === 0) {
      issues.push(`❌ ${cronName} — NO ejecutó hoy (esperado: ${schedule})`);
    } else {
      const errors = cronLogs.filter(l => l.status === "error");
      const successes = cronLogs.filter(l => l.status === "success");

      if (errors.length > 0 && successes.length === 0) {
        issues.push(`🔴 ${cronName} — FALLÓ: ${errors[0].error}`);
      } else if (errors.length > 0) {
        issues.push(`🟡 ${cronName} — ${successes.length} OK, ${errors.length} errores`);
      } else {
        summary.push(`✅ ${cronName} — ${successes.length}x OK`);
      }
    }
  }

  // Send WhatsApp alert if there are issues
  if (issues.length > 0 && EVO_URL && EVO_KEY) {
    const { data: channel } = await supabase
      .from("channels")
      .select("id, instance_name, phone")
      .eq("user_id", ADMIN_USER_ID)
      .eq("type", "whatsapp")
      .eq("status", "connected")
      .limit(1)
      .maybeSingle();

    const instName = channel?.instance_name || `dilo_${ADMIN_USER_ID.slice(0, 8)}`;
    let phone = channel?.phone;

    // If no phone saved, fetch from Evolution API
    if (!phone && channel) {
      try {
        const infoRes = await fetch(`${EVO_URL}/instance/fetchInstances`, { headers: { apikey: EVO_KEY } });
        if (infoRes.ok) {
          const instances = await infoRes.json();
          const inst = Array.isArray(instances) ? instances.find((i: Record<string, unknown>) => i.name === instName) : null;
          if (inst?.ownerJid) {
            phone = String(inst.ownerJid).replace("@s.whatsapp.net", "");
            await supabase.from("channels").update({ phone }).eq("id", channel.id);
          }
        }
      } catch { /* skip */ }
    }

    if (phone) {
      const message = `🔧 *DILO Cron Monitor — ${today}*\n\n${issues.join("\n")}\n\n${summary.length > 0 ? summary.join("\n") : ""}`;

      // System alert to the admin — skipPresence=true (no typing indicator
      // because it's a machine-to-machine ping, not a conversation), still
      // gated by anti-ban to respect kill-switch + caps.
      const { safeSendWhatsAppText } = await import("@/lib/wa/anti-ban");
      await safeSendWhatsAppText({
        instance: instName,
        to: phone,
        text: message,
        userId: ADMIN_USER_ID,
        proactive: true,
        skipPresence: true,
      }).catch(() => {});
    }
  }

  // Log the monitor itself
  const { logCronResult } = await import("@/lib/cron/logger");
  await logCronResult("monitor", {
    issues: issues.length,
    ok: summary.length,
    details: [...issues, ...summary],
  });

  return NextResponse.json({
    date: today,
    issues,
    ok: summary,
    alert_sent: issues.length > 0,
  });
}

export const dynamic = "force-dynamic";
