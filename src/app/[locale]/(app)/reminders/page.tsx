"use client";

import { useTranslations } from "next-intl";
import { useState, useEffect } from "react";
import { Bell, Trash2, Clock, Check } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";

interface Reminder {
  id: string;
  text: string;
  due_at: string;
  status: string;
  channel: string;
  repeat_type: string;
  repeat_count: number;
  repeats_sent: number;
}

export default function RemindersPage() {
  const t = useTranslations("reminders");
  const [pending, setPending] = useState<Reminder[]>([]);
  const [past, setPast] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadReminders() {
    const supabase = createBrowserSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const [pendingRes, pastRes] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.from("reminders") as any)
        .select("id, text, due_at, status, channel, repeat_type, repeat_count, repeats_sent")
        .eq("user_id", user.id)
        .eq("status", "pending")
        .order("due_at", { ascending: true }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.from("reminders") as any)
        .select("id, text, due_at, status, channel, repeat_type, repeat_count, repeats_sent")
        .eq("user_id", user.id)
        .eq("status", "sent")
        .order("due_at", { ascending: false })
        .limit(20),
    ]);

    if (pendingRes.data) setPending(pendingRes.data);
    if (pastRes.data) setPast(pastRes.data);
    setLoading(false);
  }

  useEffect(() => {
    const timer = setTimeout(loadReminders, 0);
    return () => clearTimeout(timer);
  }, []);

  async function cancelReminder(id: string) {
    const supabase = createBrowserSupabase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("reminders") as any).update({ status: "cancelled" }).eq("id", id);
    setPending(prev => prev.filter(r => r.id !== id));
  }

  function formatDate(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const today = now.toDateString();
    const tomorrow = new Date(now.getTime() + 86400000).toDateString();

    const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    if (d.toDateString() === today) return `${t("today")} ${time}`;
    if (d.toDateString() === tomorrow) return `${t("tomorrow")} ${time}`;
    return `${d.toLocaleDateString([], { day: "numeric", month: "short" })} ${time}`;
  }

  function isOverdue(iso: string) {
    return new Date(iso) < new Date();
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Clock className="animate-spin text-[var(--dim)]" size={24} />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto overscroll-y-contain">
      <div className="px-4 py-5 max-w-lg mx-auto">
        <h2 className="text-lg font-semibold mb-4">{t("title")}</h2>

        {pending.length === 0 && past.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-full bg-[var(--bg2)] flex items-center justify-center mb-4">
              <Bell size={24} className="text-[var(--dim)]" />
            </div>
            <p className="text-sm text-[var(--dim)] mb-4">{t("empty")}</p>
            <Link href="/chat" className="text-sm text-[var(--accent)] hover:underline">
              {t("create")} &rarr;
            </Link>
          </div>
        ) : (
          <>
            {/* Pending */}
            {pending.length > 0 && (
              <div className="mb-6">
                <h3 className="text-xs font-medium text-[var(--dim)] uppercase tracking-wider mb-2">{t("upcoming")}</h3>
                <div className="space-y-2">
                  {pending.map(r => (
                    <div key={r.id} className={`rounded-xl bg-[var(--card)] border p-3 flex items-start justify-between gap-3 ${isOverdue(r.due_at) ? "border-red-500/40" : "border-[var(--border)]"}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{r.text}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Clock size={11} className={isOverdue(r.due_at) ? "text-red-400" : "text-[var(--dim)]"} />
                          <span className={`text-[11px] ${isOverdue(r.due_at) ? "text-red-400" : "text-[var(--dim)]"}`}>
                            {formatDate(r.due_at)}
                          </span>
                          {r.repeat_count > 1 && (
                            <span className="text-[10px] text-[var(--dim)]">
                              {r.repeats_sent}/{r.repeat_count}
                            </span>
                          )}
                          <span className="text-[10px] text-[var(--dim)] capitalize">{r.channel}</span>
                        </div>
                      </div>
                      <button type="button"
                        onClick={() => cancelReminder(r.id)}
                        aria-label={`${t("cancel") ?? "Cancel"} ${r.text}`}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-[var(--dim)] hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Past */}
            {past.length > 0 && (
              <div>
                <h3 className="text-xs font-medium text-[var(--dim)] uppercase tracking-wider mb-2">{t("past")}</h3>
                <div className="space-y-2">
                  {past.map(r => (
                    <div key={r.id} className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-3 opacity-60">
                      <div className="flex items-start gap-2">
                        <Check size={14} className="text-green-400 mt-0.5 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm line-through">{r.text}</p>
                          <span className="text-[11px] text-[var(--dim)]">{formatDate(r.due_at)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Create more */}
            <div className="mt-6 text-center">
              <Link href="/chat" className="text-sm text-[var(--accent)] hover:underline">
                {t("create")} &rarr;
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
