"use client";

import { useTranslations } from "next-intl";
import { Bell, Plus } from "lucide-react";
import { Link } from "@/i18n/navigation";

export default function RemindersPage() {
  const t = useTranslations("reminders");

  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">{t("title")}</h2>
        <Link
          href="/chat"
          className="p-2 rounded-xl bg-purple-600 text-white hover:bg-purple-500 transition"
        >
          <Plus size={20} />
        </Link>
      </div>

      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Bell size={48} className="text-gray-600 mb-4" />
        <p className="text-gray-500">{t("empty")}</p>
        <p className="text-gray-600 text-sm mt-2">
          {t("create")}
        </p>
      </div>
    </div>
  );
}
