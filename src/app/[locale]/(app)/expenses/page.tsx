"use client";

import { useTranslations } from "next-intl";
import { Wallet } from "lucide-react";
import { Link } from "@/i18n/navigation";

export default function ExpensesPage() {
  const t = useTranslations("expenses");

  return (
    <div className="h-full overflow-y-auto overscroll-y-contain">
      <div className="px-4 py-5 max-w-lg mx-auto">
        <h2 className="text-lg font-semibold mb-4">{t("title")}</h2>

        <div className="p-5 rounded-xl bg-[var(--bg2)] border border-[var(--border)] text-center mb-6">
          <p className="text-xs text-[var(--dim)]">{t("thisMonth")}</p>
          <p className="text-3xl font-bold mt-1">€0</p>
          <p className="text-xs text-[var(--dim)] mt-1">{t("noBudget")}</p>
        </div>

        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-14 h-14 rounded-full bg-[var(--bg2)] flex items-center justify-center mb-4">
            <Wallet size={24} className="text-[var(--dim)]" />
          </div>
          <p className="text-sm text-[var(--dim)] mb-4">{t("addExpense")}</p>
          <Link href="/chat" className="text-sm text-[var(--accent)] hover:underline">
            {t("addExpense")} →
          </Link>
        </div>
      </div>
    </div>
  );
}
