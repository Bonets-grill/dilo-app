"use client";

import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { localeNames, localeFlags, locales } from "@/i18n/config";
import type { Locale } from "@/i18n/config";
import { Globe, Moon, CreditCard, Shield, Info, LogOut, ChevronRight, Sparkles } from "lucide-react";

export default function SettingsPage() {
  const t = useTranslations("settings");
  const at = useTranslations("auth");
  const locale = useLocale() as Locale;
  const router = useRouter();

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

        <button className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          <LogOut size={16} />{at("logout")}
        </button>
      </div>
    </div>
  );
}
