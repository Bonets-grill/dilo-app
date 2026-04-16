"use client";

import { useEffect, useState } from "react";
import { Users, LogIn, Loader2, Check, X } from "lucide-react";
import FamilyCard from "@/components/FamilyCard";

export default function FamilyPage() {
  const [code, setCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [me, setMe] = useState<{ family_role: string | null; parent_user_id: string | null } | null>(null);

  useEffect(() => {
    fetch("/api/user/me").then((r) => r.ok ? r.json() : null).then((d) => {
      if (d) setMe({ family_role: d.family_role, parent_user_id: d.parent_user_id });
    }).catch(() => {});
  }, []);

  async function redeem() {
    if (!code) return;
    setRedeeming(true);
    setResult(null);
    try {
      const r = await fetch("/api/family/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.toUpperCase() }),
      });
      const d = await r.json();
      if (r.ok) {
        setResult({ ok: true, msg: "Vinculado con tu padre. Ya puedes empezar a estudiar." });
        setCode("");
        setMe({ family_role: "kid", parent_user_id: d.parent_user_id });
      } else {
        const messages: Record<string, string> = {
          invalid_code: "Código no válido",
          code_already_used: "Ese código ya lo usó otra persona",
          code_expired: "Código caducado — pide uno nuevo",
          cannot_invite_self: "No puedes invitarte a ti mismo",
          already_linked_to_another_parent: "Ya estás vinculado a otro padre",
        };
        setResult({ ok: false, msg: messages[d.error] || "Error al canjear el código" });
      }
    } catch {
      setResult({ ok: false, msg: "Error de red" });
    } finally {
      setRedeeming(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-4 py-5 max-w-lg mx-auto space-y-4">
        <div className="flex items-center gap-2">
          <Users size={20} className="text-[var(--accent)]" />
          <h1 className="text-lg font-semibold">Familia</h1>
        </div>

        {/* Card de hijos (solo se muestra si el usuario tiene hijos vinculados) */}
        <FamilyCard />

        {/* Canje de código — para el hijo */}
        {(!me?.parent_user_id) && (
          <div className="rounded-2xl bg-[var(--bg2)] border border-[var(--border)] p-4 space-y-3">
            <div className="flex items-center gap-2">
              <LogIn size={16} className="text-green-400" />
              <p className="text-sm font-semibold">¿Tienes un código de tus padres?</p>
            </div>
            <p className="text-xs text-[var(--muted)] leading-relaxed">
              Si tu padre/madre usa DILO y quiere ayudarte con los estudios, pégale aquí el código
              que te dio (6 caracteres).
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Ej: FAM3K9"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={8}
                className="flex-1 px-3 py-2.5 rounded-lg bg-[var(--bg3)] border border-[var(--border)] text-sm font-mono tracking-wider uppercase outline-none"
              />
              <button
                type="button"
                onClick={redeem}
                disabled={redeeming || code.length < 4}
                className="px-4 py-2.5 rounded-lg bg-[var(--accent)] text-white text-xs font-semibold disabled:opacity-60"
              >
                {redeeming ? <Loader2 className="animate-spin" size={14} /> : "Vincular"}
              </button>
            </div>
            {result && (
              <div className={`flex items-center gap-2 text-xs ${result.ok ? "text-green-400" : "text-red-400"}`}>
                {result.ok ? <Check size={14} /> : <X size={14} />}
                {result.msg}
              </div>
            )}
          </div>
        )}

        {me?.family_role === "kid" && me.parent_user_id && (
          <div className="rounded-2xl bg-blue-500/10 border border-blue-500/30 p-4">
            <p className="text-sm font-semibold text-blue-400">Estás vinculado como hijo</p>
            <p className="text-xs text-[var(--muted)] mt-1 leading-relaxed">
              Tu padre/madre puede ver cuánto estudias y qué materias — no el contenido de tus chats.
              Usa <a href="/study" className="text-[var(--accent)] underline">Modo Estudio</a> para
              que cuente tu tiempo.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
