"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Sparkles, Loader2 } from "lucide-react";

export default function BirthdayOnboardingPage() {
  const router = useRouter();
  const [birthdate, setBirthdate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [birthPlace, setBirthPlace] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!birthdate) return;
    setSaving(true);
    setError("");
    try {
      const r = await fetch("/api/user/birthdate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ birthdate, birthTime: birthTime || undefined, birthPlace: birthPlace || undefined }),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error === "birthdate_invalid" ? "Fecha inválida" :
                 d.error === "birthdate_unreasonable" ? "Fecha fuera de rango" :
                 d.error || "Error");
        setSaving(false);
        return;
      }
      router.push("/chat");
    } catch {
      setError("Error de red");
      setSaving(false);
    }
  }

  return (
    <main className="min-h-dvh flex items-center justify-center px-6 py-10">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-purple-500/15 border border-purple-500/30">
            <Sparkles size={24} className="text-purple-400" />
          </div>
          <h1 className="text-xl font-semibold">¿Cuándo naciste?</h1>
          <p className="text-sm text-[var(--dim)]">
            DILO usará tu fecha para enviarte cada mañana tu horóscopo, carta astral y audio de motivación personalizado.
          </p>
        </div>

        {error && (
          <p role="alert" className="text-red-400 text-xs text-center">{error}</p>
        )}

        <div className="space-y-3">
          <label className="block">
            <span className="text-xs text-[var(--dim)]">Fecha de nacimiento *</span>
            <input
              type="date"
              value={birthdate}
              onChange={(e) => setBirthdate(e.target.value)}
              required
              max={new Date().toISOString().split("T")[0]}
              className="mt-1 w-full px-4 py-3 rounded-xl bg-[var(--bg2)] border border-[var(--border)] text-white focus:outline-none focus:border-purple-500/50"
            />
          </label>

          <label className="block">
            <span className="text-xs text-[var(--dim)]">Hora de nacimiento (opcional, para carta astral)</span>
            <input
              type="time"
              value={birthTime}
              onChange={(e) => setBirthTime(e.target.value)}
              className="mt-1 w-full px-4 py-3 rounded-xl bg-[var(--bg2)] border border-[var(--border)] text-white focus:outline-none focus:border-purple-500/50"
            />
          </label>

          <label className="block">
            <span className="text-xs text-[var(--dim)]">Ciudad de nacimiento (opcional)</span>
            <input
              type="text"
              value={birthPlace}
              onChange={(e) => setBirthPlace(e.target.value)}
              placeholder="Ej: Madrid, España"
              maxLength={120}
              className="mt-1 w-full px-4 py-3 rounded-xl bg-[var(--bg2)] border border-[var(--border)] text-white placeholder-[var(--dim)] focus:outline-none focus:border-purple-500/50"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={saving || !birthdate}
          className="w-full py-3 rounded-xl bg-purple-600 text-white font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {saving ? "Guardando..." : "Empezar a recibir horóscopo"}
        </button>

        <p className="text-[10px] text-[var(--dim)] text-center">
          Tu fecha nunca se comparte con terceros. Se usa solo para personalizar tu contenido.
        </p>
      </form>
    </main>
  );
}
