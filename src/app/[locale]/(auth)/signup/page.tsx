"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { Link, useRouter } from "@/i18n/navigation";

export default function SignupPage() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !name.trim() || !password.trim()) return;
    if (password.length < 6) { setError("La contraseña debe tener al menos 6 caracteres"); return; }
    setLoading(true);
    setError("");

    const supabase = createBrowserSupabase();
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    // Create user profile in our users table
    if (data.user) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("users") as any).upsert({
        id: data.user.id,
        email,
        name,
        locale: navigator.language || "es-ES",
      }, { onConflict: "id" });
    }

    // If email confirmation is required
    if (data.user && !data.session) {
      setSuccess(true);
      setLoading(false);
      return;
    }

    router.push("/chat");
  }

  async function handleGoogleSignup() {
    const supabase = createBrowserSupabase();
    const locale = window.location.pathname.split("/")[1] || "es";
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/${locale}/auth/callback` },
    });
  }

  if (success) {
    return (
      <main className="flex items-center justify-center min-h-dvh px-6">
        <div className="w-full max-w-sm text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-green-500/20 border border-green-500/30 mb-4">
            <span className="text-xl">✓</span>
          </div>
          <p className="text-sm text-[var(--muted)]">{t("checkEmail")}</p>
          <p className="text-xs text-[var(--dim)] mt-2">{email}</p>
          <Link href="/login" className="text-xs text-[var(--accent)] mt-4 inline-block">{t("login")}</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex items-center justify-center min-h-dvh px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[var(--bg2)] border border-[var(--border)] mb-4">
            <span className="text-xl font-bold">D</span>
          </div>
          <p className="text-[var(--muted)] text-sm">{t("signup")}</p>
        </div>

        {error && <p className="text-red-400 text-xs text-center mb-3">{error}</p>}

        <form onSubmit={handleSubmit} className="space-y-3">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("name")} required className="w-full px-4 py-3 rounded-xl bg-[var(--bg2)] border border-[var(--border)] text-white placeholder-[var(--dim)] focus:outline-none focus:border-[var(--muted)] transition text-sm" />
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("email")} required className="w-full px-4 py-3 rounded-xl bg-[var(--bg2)] border border-[var(--border)] text-white placeholder-[var(--dim)] focus:outline-none focus:border-[var(--muted)] transition text-sm" />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required minLength={6} className="w-full px-4 py-3 rounded-xl bg-[var(--bg2)] border border-[var(--border)] text-white placeholder-[var(--dim)] focus:outline-none focus:border-[var(--muted)] transition text-sm" />
          <button type="submit" disabled={loading} className="w-full px-4 py-3 rounded-xl bg-white text-black font-medium text-sm hover:bg-gray-200 transition disabled:opacity-50">{loading ? "..." : t("signup")}</button>
        </form>

        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[var(--border)]" /></div>
          <div className="relative flex justify-center text-xs"><span className="px-2 bg-[var(--bg)] text-[var(--dim)]">o</span></div>
        </div>

        <button onClick={handleGoogleSignup} className="w-full px-4 py-3 rounded-xl bg-[var(--bg2)] border border-[var(--border)] text-white text-sm hover:bg-[var(--bg3)] transition flex items-center justify-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          {t("google")}
        </button>

        <p className="text-center text-xs text-[var(--dim)] mt-5">
          <Link href="/login" className="text-[var(--muted)] hover:text-white">{t("login")}</Link>
        </p>
      </div>
    </main>
  );
}
