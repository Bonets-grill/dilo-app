"use client";

import { useState } from "react";
import { Lock, Loader2 } from "lucide-react";

export default function AdminLoginPage() {
  const [secret, setSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!secret || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error === "invalid" ? "Secret incorrecto" : "Error de servidor");
        return;
      }
      window.location.href = "/admin";
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-[var(--accent)]/10 border border-[var(--accent)]/30 flex items-center justify-center">
            <Lock size={24} className="text-[var(--accent)]" />
          </div>
        </div>
        <h1 className="text-xl font-bold text-center mb-1">DILO Admin</h1>
        <p className="text-xs text-[var(--dim)] text-center mb-6">
          Introduce el ADMIN_SECRET configurado en Vercel
        </p>

        <form onSubmit={submit} className="space-y-3">
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Admin secret"
            autoFocus
            className="w-full bg-[var(--bg2)] border border-[var(--border)] rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-[var(--accent)]"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={!secret || loading}
            className="w-full py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            Entrar
          </button>
        </form>
      </div>
    </div>
  );
}
