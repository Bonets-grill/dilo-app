"use client";

import { useEffect, useState } from "react";
import { Check, Mail, Calendar, Loader2, LogOut } from "lucide-react";

interface Status {
  connected: boolean;
  email?: string | null;
  expires_at?: number | null;
}

/**
 * Settings card to connect/disconnect the user's Google account.
 * Required for gmail_*, calendar_*, and the anticipate cron to work.
 */
export default function GoogleConnectCard({ userId }: { userId: string | null }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  async function load() {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/oauth/google/status?userId=${userId}`);
      const d = await res.json();
      setStatus(d);
    } catch {
      setStatus({ connected: false });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (userId) load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  function connect() {
    if (!userId) return;
    // The OAuth flow lives at /api/oauth/google?userId=X and redirects to
    // Google's consent screen. The callback saves tokens and redirects back.
    window.location.href = `/api/oauth/google?userId=${encodeURIComponent(userId)}`;
  }

  async function disconnect() {
    if (!userId || disconnecting) return;
    setDisconnecting(true);
    try {
      await fetch(`/api/oauth/google/status?userId=${userId}`, { method: "DELETE" });
      setStatus({ connected: false });
    } finally {
      setDisconnecting(false);
    }
  }

  if (!userId) return null;

  return (
    <div className="rounded-xl bg-[var(--bg2)] border border-[var(--border)] overflow-hidden">
      <div className="px-3.5 py-2.5 flex items-center gap-3 border-b border-[var(--border)]">
        <div className="w-6 h-6 rounded-md bg-white/5 flex items-center justify-center">
          <Mail size={12} className="text-[var(--dim)]" />
        </div>
        <span className="text-sm flex-1">Google (Gmail + Calendar)</span>
        {loading ? (
          <Loader2 size={14} className="animate-spin text-[var(--dim)]" />
        ) : status?.connected ? (
          <span className="text-xs text-green-400 flex items-center gap-1">
            <Check size={12} /> Conectado
          </span>
        ) : null}
      </div>
      <div className="px-3.5 py-3 space-y-2">
        {status?.connected ? (
          <>
            <p className="text-xs text-[var(--dim)]">
              DILO puede leer tus emails, enviar correos por ti, consultar tu
              calendario y crear eventos. {status.email ? `Conectado como: ${status.email}` : ""}
            </p>
            <div className="flex gap-2 items-center text-[11px] text-[var(--dim)]">
              <div className="flex items-center gap-1"><Mail size={11} /> Gmail</div>
              <div className="flex items-center gap-1"><Calendar size={11} /> Calendar</div>
            </div>
            <button
              type="button"
              onClick={disconnect}
              disabled={disconnecting}
              className="w-full py-2 rounded-lg border border-red-500/30 text-red-400 text-xs font-medium flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {disconnecting ? <Loader2 size={12} className="animate-spin" /> : <LogOut size={12} />}
              Desconectar
            </button>
          </>
        ) : (
          <>
            <p className="text-xs text-[var(--dim)]">
              Conecta tu cuenta Google para que DILO lea tus correos, envíe
              emails por ti, vea tu calendario y te avise de cobros o reuniones
              automáticamente.
            </p>
            <button
              type="button"
              onClick={connect}
              className="w-full py-2 rounded-lg bg-white text-black text-sm font-medium flex items-center justify-center gap-2"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Conectar Google
            </button>
          </>
        )}
      </div>
    </div>
  );
}
