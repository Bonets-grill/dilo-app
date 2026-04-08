"use client";

import { useTranslations } from "next-intl";
import { useState, useEffect } from "react";
import { Link } from "@/i18n/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";

interface Expense { amount: number; category: string; description: string; date: string; }

const categoryEmojis: Record<string, string> = {
  food: "🍽️", transport: "🚗", entertainment: "🎬", home: "🏠",
  health: "💊", shopping: "🛍️", bills: "📄", other: "📌",
};

export default function ExpensesPage() {
  const t = useTranslations("expenses");
  const ct = useTranslations("expenses.categories");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadExpenses();
  }, []);

  async function loadExpenses() {
    const supabase = createBrowserSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const today = new Date();
    const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase.from("expenses") as any)
      .select("amount, category, description, date")
      .eq("user_id", user.id)
      .gte("date", monthStart)
      .order("date", { ascending: false });

    if (data) {
      setExpenses(data);
      setTotal(data.reduce((sum: number, e: Expense) => sum + Number(e.amount), 0));
    }
    setLoading(false);
  }

  // Group by date
  const byDate: Record<string, Expense[]> = {};
  expenses.forEach(e => {
    if (!byDate[e.date]) byDate[e.date] = [];
    byDate[e.date].push(e);
  });

  return (
    <div className="h-full overflow-y-auto overscroll-y-contain">
      <div className="px-4 py-5 max-w-lg mx-auto">
        <h2 className="text-lg font-semibold mb-4">{t("title")}</h2>

        {/* Total */}
        <div className="p-5 rounded-xl bg-[var(--bg2)] border border-[var(--border)] text-center mb-4">
          <p className="text-xs text-[var(--dim)]">{t("thisMonth")}</p>
          <p className="text-3xl font-bold mt-1">€{total.toFixed(2)}</p>
        </div>

        {loading ? (
          <p className="text-center text-[var(--dim)] text-sm py-8">...</p>
        ) : expenses.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-[var(--dim)] mb-3">{t("addExpense")}</p>
            <Link href="/chat" className="text-sm text-[var(--accent)]">Ir al chat →</Link>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(byDate).map(([date, items]) => {
              const dayTotal = items.reduce((s, e) => s + Number(e.amount), 0);
              const d = new Date(date + "T00:00:00");
              const label = d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
              return (
                <div key={date}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-[var(--muted)] uppercase">{label}</span>
                    <span className="text-xs text-[var(--muted)]">€{dayTotal.toFixed(2)}</span>
                  </div>
                  <div className="rounded-xl bg-[var(--bg2)] border border-[var(--border)] divide-y divide-[var(--border)]">
                    {items.map((e, i) => (
                      <div key={i} className="flex items-center justify-between px-3.5 py-2.5">
                        <div className="flex items-center gap-3">
                          <span className="text-lg">{categoryEmojis[e.category] || "📌"}</span>
                          <div>
                            <p className="text-sm">{e.description}</p>
                            <p className="text-xs text-[var(--dim)]">{ct(e.category as "food")}</p>
                          </div>
                        </div>
                        <span className="text-sm font-medium">€{Number(e.amount).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
