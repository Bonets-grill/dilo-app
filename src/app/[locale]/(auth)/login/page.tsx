"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { Link, useRouter } from "@/i18n/navigation";

export default function LoginPage() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setLoading(true);
    setError("");

    const supabase = createBrowserSupabase();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    router.push("/chat");
  }

  return (
    <main className="flex items-center justify-center min-h-dvh px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[var(--bg2)] border border-[var(--border)] mb-4">
            <span className="text-xl font-bold">D</span>
          </div>
          <p className="text-[var(--muted)] text-sm">{t("login")}</p>
        </div>

        {error && <p className="text-red-400 text-xs text-center mb-3">{error}</p>}

        <form onSubmit={handleSubmit} className="space-y-3">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("email")} required className="w-full px-4 py-3 rounded-xl bg-[var(--bg2)] border border-[var(--border)] text-white placeholder-[var(--dim)] focus:outline-none focus:border-[var(--muted)] transition text-sm" />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required className="w-full px-4 py-3 rounded-xl bg-[var(--bg2)] border border-[var(--border)] text-white placeholder-[var(--dim)] focus:outline-none focus:border-[var(--muted)] transition text-sm" />
          <button type="submit" disabled={loading} className="w-full px-4 py-3 rounded-xl bg-white text-black font-medium text-sm hover:bg-gray-200 transition disabled:opacity-50">
            {loading ? "..." : t("login")}
          </button>
        </form>

        <p className="text-center text-xs text-[var(--dim)] mt-5">
          <Link href="/signup" className="text-[var(--muted)] hover:text-white">{t("signup")}</Link>
        </p>
      </div>
    </main>
  );
}
