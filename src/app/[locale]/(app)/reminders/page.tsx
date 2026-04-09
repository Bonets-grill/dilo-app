"use client";

import { useTranslations } from "next-intl";
import { Bell } from "lucide-react";
import { Link } from "@/i18n/navigation";

export default function RemindersPage() {
  const t = useTranslations("reminders");

  return (
    <div className="h-full overflow-y-auto overscroll-y-contain">
      <div className="px-4 py-5 max-w-lg mx-auto">
        <h2 className="text-lg font-semibold mb-6">{t("title")}</h2>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-full bg-[var(--bg2)] flex items-center justify-center mb-4">
            <Bell size={24} className="text-[var(--dim)]" />
          </div>
          <p className="text-sm text-[var(--dim)] mb-4">{t("empty")}</p>
          <Link href="/chat" className="text-sm text-[var(--accent)] hover:underline">
            {t("create")} →
          </Link>
        </div>
      </div>
    </div>
  );
}
