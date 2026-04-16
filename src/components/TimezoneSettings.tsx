"use client";

import { useEffect, useState } from "react";
import { Clock, Check, Loader2 } from "lucide-react";

const COMMON_TIMEZONES = [
  { id: "Atlantic/Canary",     label: "Canarias",            offset: "UTC+0 / +1 verano" },
  { id: "Europe/Madrid",       label: "España peninsular",   offset: "UTC+1 / +2 verano" },
  { id: "Europe/Lisbon",       label: "Portugal",            offset: "UTC+0 / +1 verano" },
  { id: "Europe/London",       label: "Reino Unido",         offset: "UTC+0 / +1 verano" },
  { id: "Europe/Paris",        label: "Francia",             offset: "UTC+1 / +2 verano" },
  { id: "Europe/Berlin",       label: "Alemania",            offset: "UTC+1 / +2 verano" },
  { id: "Europe/Rome",         label: "Italia",              offset: "UTC+1 / +2 verano" },
  { id: "America/Mexico_City", label: "México",              offset: "UTC-6" },
  { id: "America/Bogota",      label: "Colombia",            offset: "UTC-5" },
  { id: "America/Argentina/Buenos_Aires", label: "Argentina", offset: "UTC-3" },
  { id: "America/Santiago",    label: "Chile",               offset: "UTC-4 / -3 verano" },
  { id: "America/Lima",        label: "Perú",                offset: "UTC-5" },
  { id: "America/New_York",    label: "Nueva York (EE.UU.)", offset: "UTC-5 / -4 verano" },
  { id: "America/Los_Angeles", label: "Los Ángeles (EE.UU.)",offset: "UTC-8 / -7 verano" },
];

export default function TimezoneSettings({ userId }: { userId: string | null }) {
  const [current, setCurrent] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const res = await fetch(`/api/user/timezone?userId=${userId}`);
        const d = await res.json();
        if (d.timezone) {
          setCurrent(d.timezone);
        } else {
          // First-time: auto-detect from the device and persist silently.
          const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
          if (detected) {
            await fetch("/api/user/timezone", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userId, timezone: detected }),
            });
            setCurrent(detected);
          }
        }
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, [userId]);

  async function save(tz: string) {
    if (!userId || saving) return;
    setSaving(tz);
    try {
      await fetch("/api/user/timezone", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, timezone: tz }),
      });
      setCurrent(tz);
      setExpanded(false);
    } finally {
      setSaving(null);
    }
  }

  const currentLabel = current
    ? (COMMON_TIMEZONES.find((t) => t.id === current)?.label || current)
    : "—";

  return (
    <div className="rounded-xl bg-[var(--bg2)] border border-[var(--border)] overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3.5 py-2.5 flex items-center gap-3 border-b border-[var(--border)] active:bg-[var(--bg3)]"
      >
        <Clock size={16} className="text-[var(--dim)]" />
        <div className="text-left flex-1">
          <p className="text-sm">Zona horaria</p>
          <p className="text-[10px] text-[var(--dim)]">
            {loading ? "Detectando..." : currentLabel}
          </p>
        </div>
        <span className="text-xs text-[var(--dim)]">{expanded ? "−" : "cambiar"}</span>
      </button>

      {expanded && (
        <div className="py-1">
          {COMMON_TIMEZONES.map((tz) => {
            const isCurrent = current === tz.id;
            const isSaving = saving === tz.id;
            return (
              <button
                key={tz.id}
                type="button"
                onClick={() => save(tz.id)}
                disabled={isSaving || isCurrent}
                className={`w-full px-3.5 py-2 flex items-center justify-between text-left hover:bg-[var(--bg3)] ${
                  isCurrent ? "bg-[var(--accent)]/10" : ""
                }`}
              >
                <div>
                  <p className="text-sm">{tz.label}</p>
                  <p className="text-[10px] text-[var(--dim)]">{tz.offset}</p>
                </div>
                {isSaving ? (
                  <Loader2 size={14} className="animate-spin text-[var(--dim)]" />
                ) : isCurrent ? (
                  <Check size={14} className="text-[var(--accent)]" />
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
