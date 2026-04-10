"use client";

import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { localeNames, localeFlags, locales } from "@/i18n/config";
import type { Locale } from "@/i18n/config";
import { Globe, Moon, Sun, CreditCard, Shield, Info, LogOut, ChevronRight, Sparkles, TrendingUp, Check, Loader2, AlertTriangle, Eye } from "lucide-react";
import { useState, useEffect } from "react";
import { Link } from "@/i18n/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";

const CURRENCIES = [
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "MXN", symbol: "$", name: "Peso Mexicano" },
  { code: "COP", symbol: "$", name: "Peso Colombiano" },
  { code: "CAD", symbol: "$", name: "Canadian Dollar" },
  { code: "CHF", symbol: "Fr", name: "Swiss Franc" },
];

export default function SettingsPage() {
  const t = useTranslations("settings");
  const at = useTranslations("auth");
  const locale = useLocale() as Locale;
  const router = useRouter();

  // Alpaca API keys state
  const [alpacaKeyId, setAlpacaKeyId] = useState("");
  const [alpacaSecret, setAlpacaSecret] = useState("");
  const [alpacaConnected, setAlpacaConnected] = useState(false);
  const [alpacaPaper, setAlpacaPaper] = useState(true);
  const [alpacaSaving, setAlpacaSaving] = useState(false);
  const [alpacaError, setAlpacaError] = useState("");
  const [alpacaSuccess, setAlpacaSuccess] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Learning stats
  const [learningScore, setLearningScore] = useState(0);
  const [learningData, setLearningData] = useState<{ total_knowledge: number; total_signals: number; win_rate: number; days_learning: number } | null>(null);

  // Theme & Currency & Easy Mode
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [currency, setCurrency] = useState("EUR");
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [easyMode, setEasyMode] = useState(false);

  useEffect(() => {
    // Load theme + easy mode from localStorage
    const saved = localStorage.getItem("dilo-theme") as "dark" | "light" | null;
    if (saved) setTheme(saved);
    setEasyMode(localStorage.getItem("dilo-easy") === "true");

    const supabase = createBrowserSupabase();
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id;
      if (uid) {
        setUserId(uid);
        // Load user currency from DB
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.from("users") as any).select("currency").eq("id", uid).single().then(({ data: u }: { data: { currency: string } | null }) => {
          if (u?.currency) setCurrency(u.currency);
        });
        fetch(`/api/trading/keys?userId=${uid}`).then(r => r.json()).then(d => {
          setAlpacaConnected(d.connected);
          setAlpacaPaper(d.paperMode !== false);
        });
        fetch(`/api/trading/learning?userId=${uid}`).then(r => r.json()).then(d => {
          setLearningScore(d.learning_score || 0);
          setLearningData(d);
        }).catch(() => {});
      }
    });
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("dilo-theme", next);
    document.documentElement.setAttribute("data-theme", next);
  }

  function toggleEasyMode() {
    const next = !easyMode;
    setEasyMode(next);
    localStorage.setItem("dilo-easy", String(next));
    if (next) document.documentElement.setAttribute("data-easy", "true");
    else document.documentElement.removeAttribute("data-easy");
  }

  async function changeCurrency(code: string) {
    setCurrency(code);
    setShowCurrencyPicker(false);
    if (userId) {
      const supabase = createBrowserSupabase();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("users") as any).update({ currency: code }).eq("id", userId);
    }
  }

  async function saveAlpacaKeys() {
    if (!alpacaKeyId.trim() || !alpacaSecret.trim()) { setAlpacaError(t("enterBothKeys")); return; }
    let uid = userId;
    if (!uid) {
      const supabase = createBrowserSupabase();
      const { data } = await supabase.auth.getUser();
      uid = data.user?.id || null;
      if (uid) setUserId(uid);
    }
    if (!uid) { setAlpacaError(t("needLogin")); return; }
    setAlpacaSaving(true); setAlpacaError(""); setAlpacaSuccess(false);
    try {
      const res = await fetch("/api/trading/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: uid, keyId: alpacaKeyId.trim(), secretKey: alpacaSecret.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setAlpacaError(data.error); }
      else { setAlpacaConnected(true); setAlpacaPaper(data.paperMode); setAlpacaSuccess(true); setAlpacaKeyId(""); setAlpacaSecret(""); }
    } catch { setAlpacaError(t("connectionError")); }
    setAlpacaSaving(false);
  }

  function changeLanguage(newLocale: string) {
    window.location.href = `/${newLocale}/settings`;
  }

  function goToStore() {
    router.push("/store");
  }

  function getLevelLabel(score: number) {
    if (score < 20) return t("beginner");
    if (score < 40) return t("learning");
    if (score < 60) return t("intermediate");
    if (score < 80) return t("advanced");
    return t("expert");
  }

  return (
    <div className="h-full overflow-y-auto overscroll-y-contain">
      <div className="px-4 py-5 max-w-lg mx-auto space-y-4">
        <h2 className="text-lg font-semibold">{t("title")}</h2>

        {/* Skills */}
        <button onClick={goToStore} className="w-full flex items-center justify-between p-3.5 rounded-xl bg-[var(--accent)]/10 border border-[var(--accent)]/30">
          <div className="flex items-center gap-3">
            <Sparkles size={18} className="text-[var(--accent)]" />
            <div className="text-left">
              <p className="text-sm font-medium text-[var(--accent)]">{t("mySkills")}</p>
              <p className="text-xs text-[var(--dim)]">{t("free")}</p>
            </div>
          </div>
          <ChevronRight size={16} className="text-[var(--dim)]" />
        </button>

        {/* Trading / Alpaca Connection */}
        <div className="rounded-xl bg-[var(--bg2)] border border-[var(--border)] overflow-hidden">
          <div className="px-3.5 py-2.5 flex items-center gap-3 border-b border-[var(--border)]">
            <TrendingUp size={16} className="text-[var(--dim)]" />
            <span className="text-sm flex-1">{t("tradingCopilot")}</span>
            {alpacaConnected && <span className="text-xs text-green-400 flex items-center gap-1"><Check size={12} /> {alpacaPaper ? "Paper" : "Live"}</span>}
          </div>
          <div className="px-3.5 py-3 space-y-2.5">
            {alpacaConnected && !alpacaSuccess ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-green-400">{t("brokerConnected")}</span>
                <button onClick={() => setAlpacaConnected(false)} className="text-xs text-[var(--dim)] underline">{t("changeKeys")}</button>
              </div>
            ) : (
              <>
                <p className="text-xs text-[var(--dim)]">{t("connectAlpacaDesc")}</p>
                <input value={alpacaKeyId} onChange={e => setAlpacaKeyId(e.target.value)} placeholder={t("apiKeyId")}
                  className="w-full bg-[var(--bg1)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder-[var(--dim)] focus:outline-none focus:border-white/30" />
                <input value={alpacaSecret} onChange={e => setAlpacaSecret(e.target.value)} placeholder={t("secretKey")} type="password"
                  className="w-full bg-[var(--bg1)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder-[var(--dim)] focus:outline-none focus:border-white/30" />
                {alpacaError && <p className="text-xs text-red-400">{alpacaError}</p>}
                {alpacaSuccess && <p className="text-xs text-green-400">{t("connectedOk")}</p>}
                <button onClick={saveAlpacaKeys} disabled={alpacaSaving}
                  className="w-full py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2">
                  {alpacaSaving ? <><Loader2 size={14} className="animate-spin" /> {t("verifying")}</> : t("connectBroker")}
                </button>
                <p className="text-[10px] text-[var(--dim)]">{t("alpacaHelp")} <a href="https://alpaca.markets" target="_blank" rel="noopener" className="underline">alpaca.markets</a> &rarr; Dashboard &rarr; API</p>
              </>
            )}
          </div>
        </div>

        {/* DILO Trading Intelligence */}
        {alpacaConnected && (
          <div className="rounded-xl bg-[var(--bg2)] border border-[var(--border)] overflow-hidden">
            <div className="px-3.5 py-2.5 flex items-center gap-3 border-b border-[var(--border)]">
              <span className="text-base">🧠</span>
              <span className="text-sm flex-1">{t("tradingIntelligence")}</span>
              <span className="text-xs text-[var(--accent)] font-medium">{learningScore}%</span>
            </div>
            <div className="px-3.5 py-3 space-y-3">
              <div>
                <div className="flex justify-between text-[10px] text-[var(--dim)] mb-1">
                  <span>{t("knowledgeLevel")}</span>
                  <span>{getLevelLabel(learningScore)}</span>
                </div>
                <div className="w-full h-2.5 bg-[var(--bg1)] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-1000"
                    style={{
                      width: `${learningScore}%`,
                      background: learningScore < 30 ? "#ef4444" : learningScore < 60 ? "#f59e0b" : learningScore < 80 ? "#3b82f6" : "#10b981",
                    }}
                  />
                </div>
              </div>

              {learningData && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-[var(--bg1)] rounded-lg px-2.5 py-2 text-center">
                    <p className="text-[18px] font-bold text-white">{learningData.total_knowledge}</p>
                    <p className="text-[9px] text-[var(--dim)]">{t("dataAnalyzed")}</p>
                  </div>
                  <div className="bg-[var(--bg1)] rounded-lg px-2.5 py-2 text-center">
                    <p className="text-[18px] font-bold text-white">{learningData.total_signals}</p>
                    <p className="text-[9px] text-[var(--dim)]">{t("signalsGenerated")}</p>
                  </div>
                  <div className="bg-[var(--bg1)] rounded-lg px-2.5 py-2 text-center">
                    <p className="text-[18px] font-bold" style={{ color: learningData.win_rate >= 55 ? "#10b981" : learningData.win_rate >= 40 ? "#f59e0b" : "#ef4444" }}>{learningData.win_rate}%</p>
                    <p className="text-[9px] text-[var(--dim)]">Win Rate</p>
                  </div>
                  <div className="bg-[var(--bg1)] rounded-lg px-2.5 py-2 text-center">
                    <p className="text-[18px] font-bold text-white">{learningData.days_learning}</p>
                    <p className="text-[9px] text-[var(--dim)]">{t("daysLearning")}</p>
                  </div>
                </div>
              )}

              <p className="text-[9px] text-[var(--dim)]">{t("learningDesc")}</p>
            </div>
          </div>
        )}

        {/* Language selector */}
        <div className="rounded-xl bg-[var(--bg2)] border border-[var(--border)] overflow-hidden">
          <div className="px-3.5 py-2.5 flex items-center gap-3 border-b border-[var(--border)]">
            <Globe size={16} className="text-[var(--dim)]" />
            <span className="text-sm flex-1">{t("language")}</span>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {locales.map((loc) => (
              <button
                key={loc}
                onClick={() => changeLanguage(loc)}
                className={`w-full px-3.5 py-2.5 text-left text-sm flex items-center justify-between hover:bg-[var(--bg3)] transition ${locale === loc ? "text-white" : "text-[var(--muted)]"}`}
              >
                <span>{localeFlags[loc]} {localeNames[loc]}</span>
                {locale === loc && <span className="text-[var(--accent)] text-xs">✓</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Theme & Currency */}
        <div className="rounded-xl bg-[var(--bg2)] border border-[var(--border)] divide-y divide-[var(--border)]">
          <button onClick={toggleTheme} className="w-full flex items-center justify-between px-3.5 py-2.5">
            <div className="flex items-center gap-3">
              {theme === "dark" ? <Moon size={16} className="text-[var(--dim)]" /> : <Sun size={16} className="text-yellow-400" />}
              <span className="text-sm">{t("theme")}</span>
            </div>
            <span className="text-sm text-[var(--dim)]">{theme === "dark" ? t("dark") : t("light")}</span>
          </button>
          <button onClick={() => setShowCurrencyPicker(!showCurrencyPicker)} className="w-full flex items-center justify-between px-3.5 py-2.5">
            <div className="flex items-center gap-3"><CreditCard size={16} className="text-[var(--dim)]" /><span className="text-sm">{t("currency")}</span></div>
            <span className="text-sm text-[var(--dim)]">{currency}</span>
          </button>
          <button onClick={toggleEasyMode} className="w-full flex items-center justify-between px-3.5 py-2.5 border-t border-[var(--border)]">
            <div className="flex items-center gap-3">
              <Eye size={16} className={easyMode ? "text-[var(--accent)]" : "text-[var(--dim)]"} />
              <span className="text-sm">Modo Fácil</span>
            </div>
            <span className="text-sm text-[var(--dim)]">{easyMode ? "ON" : "OFF"}</span>
          </button>
          {showCurrencyPicker && (
            <div className="px-2 py-2 grid grid-cols-2 gap-1.5">
              {CURRENCIES.map(c => (
                <button key={c.code} onClick={() => changeCurrency(c.code)}
                  className={`px-3 py-2 rounded-lg text-left text-sm flex items-center justify-between ${currency === c.code ? "bg-[var(--accent)]/15 text-[var(--accent)]" : "bg-[var(--bg3)] text-[var(--muted)]"}`}>
                  <span>{c.symbol} {c.code}</span>
                  {currency === c.code && <Check size={12} />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Emergency */}
        <Link href="/emergency" className="flex items-center justify-between p-3.5 rounded-xl bg-red-500/10 border border-red-500/20">
          <div className="flex items-center gap-3">
            <AlertTriangle size={18} className="text-red-400" />
            <div className="text-left">
              <p className="text-sm font-medium text-red-400">DILO Emergencia</p>
              <p className="text-[10px] text-[var(--dim)]">Contactos de emergencia, Modo Aventura, detección de caídas</p>
            </div>
          </div>
          <ChevronRight size={16} className="text-[var(--dim)]" />
        </Link>

        <div className="rounded-xl bg-[var(--bg2)] border border-[var(--border)] divide-y divide-[var(--border)]">
          <div className="flex items-center gap-3 px-3.5 py-2.5"><Shield size={16} className="text-[var(--dim)]" /><span className="text-sm">{t("privacy")}</span></div>
          <div className="flex items-center gap-3 px-3.5 py-2.5"><Info size={16} className="text-[var(--dim)]" /><span className="text-sm">{t("about")}</span></div>
        </div>

        <button onClick={async () => {
          const supabase = (await import("@/lib/supabase/client")).createBrowserSupabase();
          await supabase.auth.signOut();
          window.location.href = `/${locale}/login`;
        }} className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          <LogOut size={16} />{at("logout")}
        </button>
      </div>
    </div>
  );
}
