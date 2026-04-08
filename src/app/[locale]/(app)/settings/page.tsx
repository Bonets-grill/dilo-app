"use client";

import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { localeNames, localeFlags } from "@/i18n/config";
import type { Locale } from "@/i18n/config";
import { Globe, Moon, CreditCard, Shield, Info, LogOut, ChevronRight, Sparkles } from "lucide-react";

export default function SettingsPage() {
  const t = useTranslations("settings");
  const at = useTranslations("auth");
  const locale = useLocale() as Locale;

  return (
    <div className="px-4 py-6 max-w-lg mx-auto space-y-6">
      <h2 className="text-xl font-bold">{t("title")}</h2>

      {/* Profile */}
      <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center text-xl">
          👤
        </div>
        <div>
          <p className="font-semibold">Usuario</p>
          <p className="text-sm text-gray-500">user@email.com</p>
        </div>
      </div>

      {/* My Skills */}
      <Link
        href="/store"
        className="flex items-center justify-between p-4 rounded-2xl bg-purple-500/5 border border-purple-500/20"
      >
        <div className="flex items-center gap-3">
          <Sparkles size={20} className="text-purple-400" />
          <div>
            <p className="font-semibold text-purple-300">{t("mySkills")}</p>
            <p className="text-xs text-gray-500">{t("free")}</p>
          </div>
        </div>
        <ChevronRight size={18} className="text-gray-500" />
      </Link>

      {/* Settings list */}
      <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] divide-y divide-white/[0.06]">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <Globe size={18} className="text-gray-400" />
            <span className="text-sm">{t("language")}</span>
          </div>
          <span className="text-sm text-gray-500">
            {localeFlags[locale]} {localeNames[locale]}
          </span>
        </div>
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <Moon size={18} className="text-gray-400" />
            <span className="text-sm">{t("theme")}</span>
          </div>
          <span className="text-sm text-gray-500">{t("dark")}</span>
        </div>
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <CreditCard size={18} className="text-gray-400" />
            <span className="text-sm">{t("currency")}</span>
          </div>
          <span className="text-sm text-gray-500">EUR</span>
        </div>
      </div>

      <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] divide-y divide-white/[0.06]">
        <div className="flex items-center gap-3 p-4">
          <Shield size={18} className="text-gray-400" />
          <span className="text-sm">{t("privacy")}</span>
        </div>
        <div className="flex items-center gap-3 p-4">
          <Info size={18} className="text-gray-400" />
          <span className="text-sm">{t("about")}</span>
        </div>
      </div>

      <button className="flex items-center gap-3 p-4 w-full rounded-2xl bg-red-500/5 border border-red-500/20 text-red-400">
        <LogOut size={18} />
        <span className="text-sm font-medium">{at("logout")}</span>
      </button>
    </div>
  );
}
