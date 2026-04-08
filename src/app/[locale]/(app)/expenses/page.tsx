"use client";

import { useTranslations } from "next-intl";
import { Wallet, Plus } from "lucide-react";
import { Link } from "@/i18n/navigation";

export default function ExpensesPage() {
  const t = useTranslations("expenses");

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

      <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/[0.06] text-center mb-6">
        <p className="text-sm text-gray-500">{t("thisMonth")}</p>
        <p className="text-3xl font-bold mt-1">€0.00</p>
        <p className="text-xs text-gray-600 mt-1">{t("noBudget")}</p>
      </div>

      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Wallet size={48} className="text-gray-600 mb-4" />
        <p className="text-gray-500">{t("addExpense")}</p>
      </div>
    </div>
  );
}
