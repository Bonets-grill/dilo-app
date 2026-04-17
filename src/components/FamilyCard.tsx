"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Users, Plus, Copy, Check } from "lucide-react";

function buildShareUrl(locale: string, code: string) {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/${locale}/join/${code}`;
}

interface KidStatus {
  id: string;
  name: string;
  status: "studying" | "idle" | "offline";
  current: null | {
    session_id: string;
    subject: string;
    started_at: string;
    last_heartbeat: string;
    active_seconds: number;
    wall_seconds: number;
  };
  today: { active_seconds: number; wall_seconds: number; subjects: string[] };
  last_closed: null | {
    subject: string;
    started_at: string;
    ended_at: string;
    active_seconds: number;
    llm_summary: string | null;
  };
}

function fmtShort(s: number) {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export default function FamilyCard() {
  const locale = useLocale();
  const [kids, setKids] = useState<KidStatus[] | null>(null);
  const [error, setError] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [nickname, setNickname] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  async function load() {
    try {
      const r = await fetch("/api/family/kids-status", { cache: "no-store" });
      if (!r.ok) { setError(true); return; }
      const d = await r.json();
      setKids(d.kids || []);
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    load();
    // Refresca cada 15s mientras la card esté montada
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, []);

  async function createInvite() {
    setLoading(true);
    try {
      const r = await fetch("/api/family/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kid_nickname: nickname || undefined }),
      });
      const d = await r.json();
      if (d?.code) setCode(d.code);
    } finally {
      setLoading(false);
    }
  }

  async function copyCode() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }

  // Nada que mostrar si no hay hijos y no está abierto el invite
  if (error) return null;
  if (kids === null) return null; // loading silencioso
  if (kids.length === 0 && !showInvite) {
    return (
      <div className="rounded-2xl bg-[var(--bg2)] border border-[var(--border)] p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <Users size={18} className="text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Plan Familiar</p>
            <p className="text-xs text-[var(--dim)]">Invita a tus hijos para seguir sus estudios</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowInvite(true)}
          className="w-full py-2 rounded-lg bg-[var(--accent)] text-white text-xs font-semibold flex items-center justify-center gap-2"
        >
          <Plus size={14} /> Invitar a un hijo
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-[var(--bg2)] border border-[var(--border)] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-blue-400" />
          <h3 className="text-sm font-semibold">Hijos</h3>
        </div>
        <button
          type="button"
          onClick={() => setShowInvite((v) => !v)}
          className="p-1.5 rounded-lg bg-[var(--bg3)] text-[var(--muted)]"
          title="Invitar a otro hijo"
        >
          <Plus size={14} />
        </button>
      </div>

      {showInvite && (
        <div className="rounded-xl bg-[var(--bg3)] border border-[var(--border)] p-3 space-y-2">
          {!code ? (
            <>
              <input
                type="text"
                placeholder="Nombre del hijo (opcional)"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg2)] border border-[var(--border)] text-sm outline-none"
              />
              <button
                type="button"
                onClick={createInvite}
                disabled={loading}
                className="w-full py-2 rounded-lg bg-[var(--accent)] text-white text-xs font-semibold disabled:opacity-60"
              >
                {loading ? "Generando..." : "Generar código"}
              </button>
            </>
          ) : (
            <>
              <p className="text-[10px] text-[var(--dim)] text-center">
                Comparte este enlace directo con tu hijo — abre, se registra y queda vinculado:
              </p>
              <a
                href={`/join/${code}`}
                className="block text-center text-xs text-[var(--accent)] font-mono underline truncate"
                onClick={(e) => {
                  e.preventDefault();
                  const url = buildShareUrl(locale, code);
                  navigator.clipboard?.writeText(url).catch(() => {});
                  alert("Enlace copiado: " + url);
                }}
              >
                {buildShareUrl(locale, code)}
              </a>
              <p className="text-[10px] text-[var(--dim)] text-center mt-2">
                O que pegue este código en DILO → Más → Familia:
              </p>
              <div className="flex items-center gap-2">
                <p className="flex-1 text-2xl font-black tracking-[0.2em] font-mono text-center text-[var(--accent)] bg-[var(--bg)] rounded-lg py-2 select-all" data-selectable>
                  {code}
                </p>
                <button
                  type="button"
                  onClick={copyCode}
                  className="p-2 rounded-lg bg-[var(--bg2)] text-[var(--muted)]"
                >
                  {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                </button>
              </div>
              <button
                type="button"
                onClick={() => { setCode(null); setNickname(""); setShowInvite(false); }}
                className="w-full py-1.5 rounded-lg text-[11px] text-[var(--dim)]"
              >
                Cerrar
              </button>
            </>
          )}
        </div>
      )}

      {kids.map((k) => {
        const dot =
          k.status === "studying" ? "bg-green-400 animate-pulse"
          : k.status === "idle" ? "bg-yellow-400"
          : "bg-[var(--dim)]";
        const label =
          k.status === "studying" ? `Estudiando ${k.current?.subject || ""}`
          : k.status === "idle" ? "Inactivo ahora"
          : "Fuera";
        return (
          <div key={k.id} className="rounded-xl bg-[var(--bg3)] border border-[var(--border)] p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{k.name}</p>
                  <p className="text-[11px] text-[var(--muted)] truncate">{label}</p>
                </div>
              </div>
              {k.current && (
                <div className="text-right flex-shrink-0">
                  <p className="text-xs font-bold text-green-400 font-mono">{fmtShort(k.current.active_seconds)}</p>
                  <p className="text-[9px] text-[var(--dim)]">activo</p>
                </div>
              )}
            </div>

            <div className="mt-2 pt-2 border-t border-[var(--border)] flex items-center justify-between text-[10px] text-[var(--dim)]">
              <span>Hoy: {fmtShort(k.today.active_seconds)} activos</span>
              <span className="truncate max-w-[160px]">{k.today.subjects.slice(0, 3).join(", ") || "sin sesiones"}</span>
            </div>

            {k.last_closed?.llm_summary && (
              <p className="mt-2 text-[10px] text-[var(--muted)] leading-relaxed italic">
                Última sesión ({k.last_closed.subject}): {k.last_closed.llm_summary}
              </p>
            )}
          </div>
        );
      })}

      <Link href="/family" className="block text-center text-[11px] text-[var(--accent)] font-medium">
        Ver historial completo →
      </Link>
    </div>
  );
}
