"use client";

import { useTranslations } from "next-intl";
import { Smartphone, Send } from "lucide-react";

export default function ChannelsPage() {
  const t = useTranslations("channels");

  return (
    <div className="px-4 py-6 max-w-lg mx-auto space-y-4">
      <h2 className="text-xl font-bold">{t("title")}</h2>

      {/* WhatsApp */}
      <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
              <Smartphone size={20} className="text-green-400" />
            </div>
            <div>
              <p className="font-semibold">{t("whatsapp")}</p>
              <p className="text-xs text-gray-500">{t("disconnected")}</p>
            </div>
          </div>
          <button className="px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-500 transition">
            {t("connect")}
          </button>
        </div>
        <p className="text-xs text-gray-500">{t("scanInstructions")}</p>
      </div>

      {/* Telegram */}
      <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Send size={20} className="text-blue-400" />
            </div>
            <div>
              <p className="font-semibold">{t("telegram")}</p>
              <p className="text-xs text-gray-500">{t("disconnected")}</p>
            </div>
          </div>
          <button className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 transition">
            {t("connect")}
          </button>
        </div>
        <p className="text-xs text-gray-500">{t("telegramInstructions")}</p>
      </div>
    </div>
  );
}
