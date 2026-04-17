"use client";

import { useTranslations, useLocale } from "next-intl";
import { useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { Link, useRouter } from "@/i18n/navigation";

export default function SignupPage() {
  const t = useTranslations("auth");
  const router = useRouter();
  const locale = useLocale();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refCode] = useState(() => {
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).get("ref") || "";
    }
    return "";
  });
  const [joinCode] = useState(() => {
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).get("join") || "";
    }
    return "";
  });
  const postAuthPath = joinCode ? `/join/${joinCode}` : "/pin-setup";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !name.trim() || !password.trim()) return;
    if (password.length < 6) { setError(t("minChars")); return; }
    setLoading(true);
    setError("");

    const supabase = createBrowserSupabase();
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (typeof window !== "undefined" ? window.location.origin : "");
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
        emailRedirectTo: `${appUrl}/${locale}/auth/callback${joinCode ? `?next=/join/${joinCode}` : ""}`,
      },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    // Create user profile
    if (data.user) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("users") as any).upsert({
        id: data.user.id,
        email,
        name,
        locale: navigator.language || "es-ES",
        referred_by: refCode || null,
      }, { onConflict: "id" });

      // Track referral signup
      if (refCode) {
        try {
          await fetch("/api/referral", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: refCode, event: "signup", newUserId: data.user.id }),
            signal: AbortSignal.timeout(10000),
          });
        } catch { /* skip */ }
      }
    }

    // If email confirmation is required by Supabase
    if (data.user && !data.session) {
      setError(t("checkEmail"));
      setLoading(false);
      return;
    }

    // Save email for PIN login later
    localStorage.setItem("dilo-email", email.trim());

    // Go to invite redeem if came from /join/[code], else PIN setup
    router.push(postAuthPath);
  }

  return (
    <main className="flex items-center justify-center min-h-dvh px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--bg2)] border border-[var(--border)] mb-4">
            <span className="text-2xl font-bold">D</span>
          </div>
          <h1 className="text-lg font-semibold">DILO</h1>
          <p className="text-[var(--dim)] text-xs mt-1">{t("signup")}</p>
        </div>

        {error && <p role="alert" className="text-red-400 text-xs text-center mb-3">{error}</p>}

        <form onSubmit={handleSubmit} className="space-y-3">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("name")} aria-label={t("name")} required autoComplete="name" className="w-full px-4 py-3 rounded-xl bg-[var(--bg2)] border border-[var(--border)] text-white placeholder-[var(--dim)] focus:outline-none focus:border-[var(--muted)] transition text-sm" />
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("email")} aria-label={t("email")} required autoComplete="email" className="w-full px-4 py-3 rounded-xl bg-[var(--bg2)] border border-[var(--border)] text-white placeholder-[var(--dim)] focus:outline-none focus:border-[var(--muted)] transition text-sm" />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t("password")} aria-label={t("password")} required minLength={6} autoComplete="new-password" className="w-full px-4 py-3 rounded-xl bg-[var(--bg2)] border border-[var(--border)] text-white placeholder-[var(--dim)] focus:outline-none focus:border-[var(--muted)] transition text-sm" />
          <button type="submit" disabled={loading} className="w-full px-4 py-3 rounded-xl bg-white text-black font-medium text-sm hover:bg-gray-200 transition disabled:opacity-50">{loading ? "..." : t("signup")}</button>
        </form>

        <p className="text-center text-xs text-[var(--dim)] mt-5">
          <Link
            href={joinCode ? `/login?join=${joinCode}` : "/login"}
            className="text-[var(--muted)] hover:text-white"
          >
            {t("login")}
          </Link>
        </p>
      </div>
    </main>
  );
}
