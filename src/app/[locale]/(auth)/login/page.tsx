"use client";

import { useTranslations } from "next-intl";
import { useState, useRef, useEffect } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { Link, useRouter } from "@/i18n/navigation";
import { Lock, Mail, KeyRound } from "lucide-react";

export default function LoginPage() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [mode, setMode] = useState<"pin" | "password">("pin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState(["", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const pinRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Check if user has email saved
  useEffect(() => {
    const saved = localStorage.getItem("dilo-email");
    if (saved) setEmail(saved);
  }, []);

  function handlePinChange(index: number, value: string) {
    if (!/^\d*$/.test(value)) return;
    const newPin = [...pin];
    newPin[index] = value.slice(-1);
    setPin(newPin);

    // Auto-focus next
    if (value && index < 3) {
      pinRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 4 filled
    if (value && index === 3 && newPin.every(d => d)) {
      handlePinLogin(newPin.join(""));
    }
  }

  function handlePinKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !pin[index] && index > 0) {
      pinRefs.current[index - 1]?.focus();
    }
  }

  async function handlePinLogin(pinCode?: string) {
    const code = pinCode || pin.join("");
    if (!email.trim() || code.length < 4) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", email: email.trim(), pin: code }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || t("pinError"));
        setPin(["", "", "", ""]);
        pinRefs.current[0]?.focus();
        setLoading(false);
        return;
      }

      // PIN verified — sign in with Supabase using stored password
      // We use signInWithPassword as fallback
      const supabase = createBrowserSupabase();
      const { error: authErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: code + "_pin_" + data.userId.slice(0, 8),
      });

      if (authErr) {
        // If PIN auth fails with Supabase, try the old password flow
        setMode("password");
        setError(t("passwordFallback"));
        setLoading(false);
        return;
      }

      localStorage.setItem("dilo-email", email.trim());
      router.push("/chat");
    } catch {
      setError(t("connectionError"));
      setLoading(false);
    }
  }

  async function handlePasswordLogin(e: React.FormEvent) {
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

    localStorage.setItem("dilo-email", email.trim());
    router.push("/chat");
  }

  return (
    <main className="flex items-center justify-center min-h-dvh px-6">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--bg2)] border border-[var(--border)] mb-4">
            <span className="text-2xl font-bold">D</span>
          </div>
          <h1 className="text-lg font-semibold">DILO</h1>
          <p className="text-[var(--dim)] text-xs mt-1">{t("login")}</p>
        </div>

        {error && <p className="text-red-400 text-xs text-center mb-4 px-2">{error}</p>}

        {/* Email field (always shown) */}
        <div className="mb-4">
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-[var(--bg2)] border border-[var(--border)]">
            <Mail size={16} className="text-[var(--dim)]" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("email")}
              required
              className="flex-1 bg-transparent text-sm text-white placeholder-[var(--dim)] focus:outline-none"
            />
          </div>
        </div>

        {/* PIN mode */}
        {mode === "pin" && (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-1 mb-2">
              <Lock size={14} className="text-[var(--dim)]" />
              <span className="text-xs text-[var(--dim)]">PIN</span>
            </div>

            <div className="flex justify-center gap-3">
              {pin.map((digit, i) => (
                <input
                  key={i}
                  ref={el => { pinRefs.current[i] = el; }}
                  type="tel"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={e => handlePinChange(i, e.target.value)}
                  onKeyDown={e => handlePinKeyDown(i, e)}
                  className={`w-14 h-14 text-center text-xl font-bold rounded-2xl border-2 bg-[var(--bg2)] focus:outline-none transition-all ${
                    digit ? "border-white/30 text-white" : "border-[var(--border)] text-[var(--dim)]"
                  } focus:border-white/50`}
                />
              ))}
            </div>

            {loading && <p className="text-center text-xs text-[var(--dim)]">...</p>}

            <button
              onClick={() => setMode("password")}
              className="w-full text-center text-xs text-[var(--dim)] mt-4 py-2 flex items-center justify-center gap-1.5"
            >
              <KeyRound size={12} />
              {t("usePassword")}
            </button>
          </div>
        )}

        {/* Password mode */}
        {mode === "password" && (
          <form onSubmit={handlePasswordLogin} className="space-y-3">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("password")}
              required
              className="w-full px-4 py-3 rounded-xl bg-[var(--bg2)] border border-[var(--border)] text-white placeholder-[var(--dim)] focus:outline-none focus:border-[var(--muted)] transition text-sm"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-3 rounded-xl bg-white text-black font-medium text-sm hover:bg-gray-200 transition disabled:opacity-50"
            >
              {loading ? "..." : t("login")}
            </button>

            <button
              type="button"
              onClick={() => { setMode("pin"); setError(""); }}
              className="w-full text-center text-xs text-[var(--dim)] py-2 flex items-center justify-center gap-1.5"
            >
              <Lock size={12} />
              {t("usePin")}
            </button>
          </form>
        )}

        <p className="text-center text-xs text-[var(--dim)] mt-6">
          <Link href="/signup" className="text-[var(--muted)] hover:text-white">{t("signup")}</Link>
        </p>
      </div>
    </main>
  );
}
