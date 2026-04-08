"use client";

import { useTranslations } from "next-intl";
import { Smartphone, Send, CheckCircle2, Circle } from "lucide-react";

export default function ChannelsPage() {
  const t = useTranslations("channels");

  return (
    <div className="h-full overflow-y-auto overscroll-y-contain">
      <div className="px-4 py-5 max-w-lg mx-auto space-y-4">
        <h2 className="text-lg font-semibold">{t("title")}</h2>

        <div className="rounded-xl bg-[var(--bg2)] border border-[var(--border)] p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-green-500/10 flex items-center justify-center">
                <Smartphone size={18} className="text-green-400" />
              </div>
              <div>
                <p className="text-sm font-medium">{t("whatsapp")}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Circle size={8} className="text-[var(--dim)]" />
                  <p className="text-xs text-[var(--dim)]">{t("disconnected")}</p>
                </div>
              </div>
            </div>
            <button className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium">{t("connect")}</button>
          </div>
          <p className="text-xs text-[var(--dim)] leading-relaxed">{t("scanInstructions")}</p>
        </div>

        <div className="rounded-xl bg-[var(--bg2)] border border-[var(--border)] p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Send size={18} className="text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-medium">{t("telegram")}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Circle size={8} className="text-[var(--dim)]" />
                  <p className="text-xs text-[var(--dim)]">{t("disconnected")}</p>
                </div>
              </div>
            </div>
            <button className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium">{t("connect")}</button>
          </div>
          <p className="text-xs text-[var(--dim)] leading-relaxed">{t("telegramInstructions")}</p>
        </div>
      </div>
    </div>
  );
}
