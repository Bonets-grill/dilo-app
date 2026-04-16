"use client";

import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { localeNames, localeFlags, locales } from "@/i18n/config";
import type { Locale } from "@/i18n/config";
import { Globe, Moon, Sun, CreditCard, Shield, Info, LogOut, ChevronRight, Sparkles, AlertTriangle, Eye, Check, Mic } from "lucide-react";
import { useState, useEffect } from "react";
import { Link } from "@/i18n/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import MemorySettings from "@/components/MemorySettings";
import GoogleConnectCard from "@/components/GoogleConnectCard";

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

  const [userId, setUserId] = useState<string | null>(null);

  // Theme & Currency & Easy Mode
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [currency, setCurrency] = useState("EUR");
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [easyMode, setEasyMode] = useState(false);
  const [wakeWord, setWakeWord] = useState(false);

  useEffect(() => {
    // Load theme + easy mode from localStorage
    const saved = localStorage.getItem("dilo-theme") as "dark" | "light" | null;
    if (saved) setTheme(saved);
    setEasyMode(localStorage.getItem("dilo-easy") === "true");
    setWakeWord(localStorage.getItem("dilo_wake_word") === "1");

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
      }
    });
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("dilo-theme", next);
    document.documentElement.setAttribute("data-theme", next);
  }

  function toggleWakeWord() {
    const next = !wakeWord;
    setWakeWord(next);
    localStorage.setItem("dilo_wake_word", next ? "1" : "0");
    // Trigger storage event for other tabs/components
    window.dispatchEvent(new StorageEvent("storage", { key: "dilo_wake_word", newValue: next ? "1" : "0" }));
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

  function changeLanguage(newLocale: string) {
    window.location.href = `/${newLocale}/settings`;
  }

  function goToStore() {
    router.push("/store");
  }

  return (
    <div className="h-full overflow-y-auto overscroll-y-contain">
      <div className="px-4 py-5 max-w-lg mx-auto space-y-4">
        <h2 className="text-lg font-semibold">{t("title")}</h2>

        {/* Skills */}
        <button type="button" onClick={goToStore} className="w-full flex items-center justify-between p-3.5 rounded-xl bg-[var(--accent)]/10 border border-[var(--accent)]/30">
          <div className="flex items-center gap-3">
            <Sparkles size={18} className="text-[var(--accent)]" />
            <div className="text-left">
              <p className="text-sm font-medium text-[var(--accent)]">{t("mySkills")}</p>
              <p className="text-xs text-[var(--dim)]">{t("free")}</p>
            </div>
          </div>
          <ChevronRight size={16} className="text-[var(--dim)]" />
        </button>

        {/* Google (Gmail + Calendar) */}
        <GoogleConnectCard userId={userId} />

        {/* Memory (Mem0) */}
        <MemorySettings userId={userId} />

        {/* Language selector */}
        <div className="rounded-xl bg-[var(--bg2)] border border-[var(--border)] overflow-hidden">
          <div className="px-3.5 py-2.5 flex items-center gap-3 border-b border-[var(--border)]">
            <Globe size={16} className="text-[var(--dim)]" />
            <span className="text-sm flex-1">{t("language")}</span>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {locales.map((loc) => (
              <button type="button"
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
          <button type="button" onClick={toggleTheme} className="w-full flex items-center justify-between px-3.5 py-2.5">
            <div className="flex items-center gap-3">
              {theme === "dark" ? <Moon size={16} className="text-[var(--dim)]" /> : <Sun size={16} className="text-yellow-400" />}
              <span className="text-sm">{t("theme")}</span>
            </div>
            <span className="text-sm text-[var(--dim)]">{theme === "dark" ? t("dark") : t("light")}</span>
          </button>
          <button type="button" onClick={() => setShowCurrencyPicker(!showCurrencyPicker)} className="w-full flex items-center justify-between px-3.5 py-2.5">
            <div className="flex items-center gap-3"><CreditCard size={16} className="text-[var(--dim)]" /><span className="text-sm">{t("currency")}</span></div>
            <span className="text-sm text-[var(--dim)]">{currency}</span>
          </button>
          <button type="button" onClick={toggleEasyMode} className="w-full flex items-center justify-between px-3.5 py-2.5 border-t border-[var(--border)]">
            <div className="flex items-center gap-3">
              <Eye size={16} className={easyMode ? "text-[var(--accent)]" : "text-[var(--dim)]"} />
              <span className="text-sm">{t("easyMode")}</span>
            </div>
            <span className="text-sm text-[var(--dim)]">{easyMode ? "ON" : "OFF"}</span>
          </button>
          <button type="button" onClick={toggleWakeWord} className="w-full flex items-center justify-between px-3.5 py-2.5 border-t border-[var(--border)]">
            <div className="flex items-center gap-3">
              <Mic size={16} className={wakeWord ? "text-green-400" : "text-[var(--dim)]"} />
              <div className="text-left">
                <p className="text-sm">Wake word &ldquo;Hola DILO&rdquo;</p>
                <p className="text-[10px] text-[var(--dim)]">Activa voz sin tocar botón. Requiere app abierta.</p>
              </div>
            </div>
            <span className="text-sm text-[var(--dim)]">{wakeWord ? "ON" : "OFF"}</span>
          </button>
          {showCurrencyPicker && (
            <div className="px-2 py-2 grid grid-cols-2 gap-1.5">
              {CURRENCIES.map(c => (
                <button type="button" key={c.code} onClick={() => changeCurrency(c.code)}
                  className={`px-3 py-2 rounded-lg text-left text-sm flex items-center justify-between ${currency === c.code ? "bg-[var(--accent)]/15 text-[var(--accent)]" : "bg-[var(--bg3)] text-[var(--muted)]"}`}>
                  <span>{c.symbol} {c.code}</span>
                  {currency === c.code && <Check size={12} />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* PIN */}
        <Link href="/change-pin" className="flex items-center justify-between p-3.5 rounded-xl bg-[var(--bg2)] border border-[var(--border)]">
          <div className="flex items-center gap-3">
            <Shield size={18} className="text-[var(--dim)]" />
            <div className="text-left">
              <p className="text-sm font-medium">{t("configurePin")}</p>
              <p className="text-[10px] text-[var(--dim)]">{t("configurePinDesc")}</p>
            </div>
          </div>
          <ChevronRight size={16} className="text-[var(--dim)]" />
        </Link>

        {/* Referrals */}
        <Link href="/referrals" className="flex items-center justify-between p-3.5 rounded-xl bg-[var(--accent)]/10 border border-[var(--accent)]/30">
          <div className="flex items-center gap-3">
            <Sparkles size={18} className="text-[var(--accent)]" />
            <div className="text-left">
              <p className="text-sm font-medium text-[var(--accent)]">{t("inviteFriends")}</p>
              <p className="text-[10px] text-[var(--dim)]">{t("inviteDesc")}</p>
            </div>
          </div>
          <ChevronRight size={16} className="text-[var(--dim)]" />
        </Link>

        {/* Emergency */}
        <Link href="/emergency" className="flex items-center justify-between p-3.5 rounded-xl bg-red-500/10 border border-red-500/20">
          <div className="flex items-center gap-3">
            <AlertTriangle size={18} className="text-red-400" />
            <div className="text-left">
              <p className="text-sm font-medium text-red-400">{t("emergency")}</p>
              <p className="text-[10px] text-[var(--dim)]">{t("emergencyDesc")}</p>
            </div>
          </div>
          <ChevronRight size={16} className="text-[var(--dim)]" />
        </Link>

        <div className="rounded-xl bg-[var(--bg2)] border border-[var(--border)] divide-y divide-[var(--border)]">
          <Link href="/legal" className="flex items-center gap-3 px-3.5 py-2.5">
            <Shield size={16} className="text-[var(--dim)]" /><span className="text-sm">{t("privacy")}</span>
          </Link>
          <button type="button" onClick={async () => {
            if (!userId) return;
            window.open(`/api/user/export?userId=${userId}`, "_blank");
          }} className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left">
            <Info size={16} className="text-[var(--dim)]" /><span className="text-sm">{t("exportData")}</span>
          </button>
          <button type="button" onClick={async () => {
            if (!userId) return;
            if (!confirm(t("deleteConfirm"))) return;
            if (!confirm(t("deleteConfirmFinal"))) return;
            await fetch("/api/user/delete", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userId, confirm: true }),
            });
            const supabase = (await import("@/lib/supabase/client")).createBrowserSupabase();
            await supabase.auth.signOut();
            window.location.href = `/${locale}/login`;
          }} className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left text-red-400">
            <Shield size={16} /><span className="text-sm">{t("deleteAccount")}</span>
          </button>
        </div>

        <button type="button" onClick={async () => {
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
