"use client";

import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { localeNames, localeFlags, locales } from "@/i18n/config";
import type { Locale } from "@/i18n/config";
import { Globe, Moon, CreditCard, Shield, Info, LogOut, ChevronRight, Sparkles, TrendingUp, Check, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";

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

  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id;
      if (uid) {
        setUserId(uid);
        fetch(`/api/trading/keys?userId=${uid}`).then(r => r.json()).then(d => {
          setAlpacaConnected(d.connected);
          setAlpacaPaper(d.paperMode !== false);
        });
      }
    });
  }, []);

  async function saveAlpacaKeys() {
    if (!alpacaKeyId.trim() || !alpacaSecret.trim()) { setAlpacaError("Introduce ambas keys"); return; }
    // Get fresh userId
    let uid = userId;
    if (!uid) {
      const supabase = createBrowserSupabase();
      const { data } = await supabase.auth.getUser();
      uid = data.user?.id || null;
      if (uid) setUserId(uid);
    }
    if (!uid) { setAlpacaError("Necesitas iniciar sesión"); return; }
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
    } catch { setAlpacaError("Error de conexión"); }
    setAlpacaSaving(false);
  }

  function changeLanguage(newLocale: string) {
    // Navigate to the same page but in the new locale
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
            <span className="text-sm flex-1">Trading Copilot</span>
            {alpacaConnected && <span className="text-xs text-green-400 flex items-center gap-1"><Check size={12} /> {alpacaPaper ? "Paper" : "Live"}</span>}
          </div>
          <div className="px-3.5 py-3 space-y-2.5">
            {alpacaConnected && !alpacaSuccess ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-green-400">Broker conectado</span>
                <button onClick={() => setAlpacaConnected(false)} className="text-xs text-[var(--dim)] underline">Cambiar keys</button>
              </div>
            ) : (
              <>
                <p className="text-xs text-[var(--dim)]">Conecta tu cuenta de Alpaca para que DILO analice tu trading.</p>
                <input value={alpacaKeyId} onChange={e => setAlpacaKeyId(e.target.value)} placeholder="API Key ID"
                  className="w-full bg-[var(--bg1)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder-[var(--dim)] focus:outline-none focus:border-white/30" />
                <input value={alpacaSecret} onChange={e => setAlpacaSecret(e.target.value)} placeholder="Secret Key" type="password"
                  className="w-full bg-[var(--bg1)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder-[var(--dim)] focus:outline-none focus:border-white/30" />
                {alpacaError && <p className="text-xs text-red-400">{alpacaError}</p>}
                {alpacaSuccess && <p className="text-xs text-green-400">Conectado correctamente</p>}
                <button onClick={saveAlpacaKeys} disabled={alpacaSaving}
                  className="w-full py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2">
                  {alpacaSaving ? <><Loader2 size={14} className="animate-spin" /> Verificando...</> : "Conectar Broker"}
                </button>
                <p className="text-[10px] text-[var(--dim)]">Las keys se obtienen gratis en <a href="https://alpaca.markets" target="_blank" rel="noopener" className="underline">alpaca.markets</a> → Dashboard → API</p>
              </>
            )}
          </div>
        </div>

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

        {/* Other settings */}
        <div className="rounded-xl bg-[var(--bg2)] border border-[var(--border)] divide-y divide-[var(--border)]">
          <div className="flex items-center justify-between px-3.5 py-2.5">
            <div className="flex items-center gap-3"><Moon size={16} className="text-[var(--dim)]" /><span className="text-sm">{t("theme")}</span></div>
            <span className="text-sm text-[var(--dim)]">{t("dark")}</span>
          </div>
          <div className="flex items-center justify-between px-3.5 py-2.5">
            <div className="flex items-center gap-3"><CreditCard size={16} className="text-[var(--dim)]" /><span className="text-sm">{t("currency")}</span></div>
            <span className="text-sm text-[var(--dim)]">EUR</span>
          </div>
        </div>

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
