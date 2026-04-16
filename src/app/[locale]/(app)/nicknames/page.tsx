"use client";

import { useEffect, useState } from "react";
import { UserCircle2, Plus, Trash2, Loader2, Check } from "lucide-react";

interface Nickname {
  id: string;
  nickname: string;
  phone: string;
  note: string | null;
}

export default function NicknamesPage() {
  const [list, setList] = useState<Nickname[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [nick, setNick] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/contacts/nicknames", { cache: "no-store" });
      const d = await r.json();
      setList(d.nicknames || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function save() {
    const digits = phone.replace(/\D/g, "");
    if (!nick.trim() || digits.length < 8) return;
    setSaving(true);
    try {
      const r = await fetch("/api/contacts/nicknames", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: nick.trim(), phone: digits, note: note.trim() || undefined }),
      });
      if (r.ok) {
        setNick(""); setPhone(""); setNote(""); setAdding(false);
        await load();
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("¿Borrar este apodo?")) return;
    await fetch(`/api/contacts/nicknames?id=${id}`, { method: "DELETE" });
    setList((xs) => xs.filter((x) => x.id !== id));
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-4 py-5 max-w-lg mx-auto space-y-4">
        <div className="flex items-center gap-2">
          <UserCircle2 size={20} className="text-[var(--accent)]" />
          <h1 className="text-lg font-semibold">Apodos</h1>
        </div>

        <div className="rounded-xl bg-blue-500/10 border border-blue-500/20 p-3">
          <p className="text-[11px] text-[var(--muted)] leading-relaxed">
            💡 WhatsApp no puede leer los nombres de tu agenda del móvil — solo ve el nombre que
            cada contacto puso en su propio perfil. Aquí guardas los apodos que tú usas, para que
            DILO encuentre a esa persona aunque en WhatsApp se llame de otra forma.
          </p>
        </div>

        {!adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="w-full py-3 rounded-xl bg-[var(--accent)] text-white text-sm font-semibold flex items-center justify-center gap-2"
          >
            <Plus size={16} /> Añadir apodo
          </button>
        ) : (
          <div className="rounded-xl bg-[var(--bg2)] border border-[var(--border)] p-4 space-y-3">
            <div>
              <label className="text-[11px] text-[var(--dim)] block mb-1">Apodo (como tú lo llamas)</label>
              <input
                type="text"
                placeholder="Macho B"
                value={nick}
                onChange={(e) => setNick(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-[var(--bg3)] border border-[var(--border)] text-sm outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] text-[var(--dim)] block mb-1">Teléfono con prefijo país (sin +)</label>
              <input
                type="tel"
                inputMode="numeric"
                placeholder="34661064610"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-[var(--bg3)] border border-[var(--border)] text-sm font-mono outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] text-[var(--dim)] block mb-1">Nota (opcional)</label>
              <input
                type="text"
                placeholder="Ej: es Elenita Macho"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-[var(--bg3)] border border-[var(--border)] text-sm outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setAdding(false); setNick(""); setPhone(""); setNote(""); }}
                className="flex-1 py-2.5 rounded-lg bg-[var(--bg3)] text-[var(--muted)] text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving || !nick.trim() || phone.replace(/\D/g,"").length < 8}
                className="flex-1 py-2.5 rounded-lg bg-[var(--accent)] text-white text-xs font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Guardar
              </button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 size={20} className="animate-spin text-[var(--dim)]" />
            </div>
          ) : list.length === 0 ? (
            <p className="text-center text-[11px] text-[var(--dim)] py-6">
              Aún no tienes apodos. Añade el primero arriba.
            </p>
          ) : (
            list.map((n) => (
              <div
                key={n.id}
                className="rounded-xl bg-[var(--bg2)] border border-[var(--border)] p-3 flex items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{n.nickname}</p>
                  <p className="text-[11px] text-[var(--muted)] font-mono">+{n.phone}</p>
                  {n.note && <p className="text-[10px] text-[var(--dim)] mt-0.5 truncate">{n.note}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => remove(n.id)}
                  className="p-2 rounded-lg text-red-400 hover:bg-red-500/10"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
