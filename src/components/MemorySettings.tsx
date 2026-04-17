"use client";

import { useEffect, useState } from "react";
import { Brain, Trash2, Plus, ChevronDown, Loader2, X } from "lucide-react";

interface MemoryFact {
  id: string;
  fact: string;
  category: string;
  confidence: number;
  source: string;
  created_at: string;
}

interface ListResponse {
  total: number;
  by_category: Record<string, MemoryFact[]>;
  flat: MemoryFact[];
}

const CATEGORY_LABELS: Record<string, { es: string; emoji: string }> = {
  identity:      { es: "Identidad",     emoji: "👤" },
  location:      { es: "Ubicación",     emoji: "📍" },
  work:          { es: "Trabajo",       emoji: "💼" },
  finance:       { es: "Finanzas",      emoji: "💰" },
  health:        { es: "Salud",         emoji: "🥗" },
  relationships: { es: "Relaciones",    emoji: "👥" },
  preferences:   { es: "Preferencias",  emoji: "❤️" },
  goals:         { es: "Objetivos",     emoji: "🎯" },
  routines:      { es: "Rutinas",       emoji: "🔁" },
  interests:     { es: "Intereses",     emoji: "✨" },
};

export default function MemorySettings({ userId }: { userId: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [addingText, setAddingText] = useState("");
  const [addingCategory, setAddingCategory] = useState<string>("preferences");
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  async function load() {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/memory/list?userId=${userId}`);
      const d: ListResponse = await res.json();
      setData(d);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (expanded && userId && !data) load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, userId]);

  async function deleteFact(id: string) {
    if (!userId) return;
    await fetch(`/api/memory/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    load();
  }

  async function addFact() {
    if (!userId || !addingText.trim() || saving) return;
    setSaving(true);
    try {
      const r = await fetch("/api/memory/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, fact: addingText.trim(), category: addingCategory }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        alert("No se pudo guardar: " + (body?.error || r.status));
        return;
      }
      const body = await r.json().catch(() => ({}));
      if (body?.embedding_degraded) {
        alert("Guardado, pero la búsqueda semántica no está disponible ahora (cuota de OpenAI agotada). El hecho quedó registrado.");
      }
      setAddingText("");
      setShowAdd(false);
      load();
    } finally {
      setSaving(false);
    }
  }

  const categories = data ? Object.entries(data.by_category) : [];

  return (
    <div className="rounded-xl bg-[var(--bg2)] border border-[var(--border)] overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3.5 py-2.5 flex items-center gap-3 border-b border-[var(--border)] active:bg-[var(--bg3)]"
      >
        <Brain size={16} className="text-purple-400" />
        <span className="text-sm flex-1 text-left">Tu memoria</span>
        <span className="text-xs text-[var(--dim)]">
          {data ? `${data.total} hechos` : "—"}
        </span>
        <ChevronDown
          size={16}
          className={`text-[var(--dim)] transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded && (
        <div className="px-3.5 py-3 space-y-3">
          {loading && (
            <div className="flex justify-center py-4">
              <Loader2 size={18} className="animate-spin text-[var(--dim)]" />
            </div>
          )}

          {!loading && data && data.total === 0 && (
            <p className="text-xs text-[var(--dim)] text-center py-4">
              DILO todavía no ha aprendido nada de ti. Conforme hables con él irá
              guardando hechos útiles.
            </p>
          )}

          {!loading && data && categories.map(([cat, facts]) => (
            <div key={cat}>
              <p className="text-[10px] uppercase tracking-wider text-[var(--dim)] mb-1.5 flex items-center gap-1.5">
                <span>{CATEGORY_LABELS[cat]?.emoji || "•"}</span>
                {CATEGORY_LABELS[cat]?.es || cat}
                <span className="ml-auto normal-case tracking-normal">({facts.length})</span>
              </p>
              <div className="space-y-1.5">
                {facts.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-start gap-2 bg-[var(--bg1)] border border-[var(--border)] rounded-lg px-2.5 py-2"
                  >
                    <p className="text-xs text-white flex-1 leading-snug">{f.fact}</p>
                    <button
                      type="button"
                      onClick={() => deleteFact(f.id)}
                      className="p-1 rounded text-[var(--dim)] active:bg-red-500/20 active:text-red-400 shrink-0"
                      aria-label="Eliminar memoria"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Add manually */}
          {!showAdd ? (
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-[var(--border)] text-[var(--dim)] active:bg-[var(--bg3)]"
            >
              <Plus size={14} />
              <span className="text-xs">Añadir a mano</span>
            </button>
          ) : (
            <div className="border border-purple-500/30 rounded-lg p-2.5 space-y-2 bg-purple-500/5">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-wider text-purple-400">Nueva memoria</p>
                <button type="button" onClick={() => { setShowAdd(false); setAddingText(""); }}>
                  <X size={12} className="text-[var(--dim)]" />
                </button>
              </div>
              <textarea
                value={addingText}
                onChange={(e) => setAddingText(e.target.value)}
                placeholder='Ej: "Mi cumpleaños es el 12 de marzo"'
                rows={2}
                className="w-full bg-[var(--bg1)] border border-[var(--border)] rounded px-2 py-1.5 text-xs text-white placeholder-[var(--dim)] focus:outline-none focus:border-purple-500/50 resize-none"
              />
              <div className="flex gap-2">
                <select
                  value={addingCategory}
                  onChange={(e) => setAddingCategory(e.target.value)}
                  className="flex-1 bg-[var(--bg1)] border border-[var(--border)] rounded px-2 py-1.5 text-xs text-white focus:outline-none"
                >
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v.emoji} {v.es}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={addFact}
                  disabled={saving || !addingText.trim()}
                  className="px-3 py-1.5 rounded bg-purple-600 text-white text-xs font-medium disabled:opacity-40 flex items-center gap-1"
                >
                  {saving ? <Loader2 size={12} className="animate-spin" /> : "Guardar"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
