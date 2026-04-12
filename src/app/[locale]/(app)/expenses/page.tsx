"use client";

import { useTranslations } from "next-intl";
import { useState, useEffect } from "react";
import { Link } from "@/i18n/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { Trash2, Pencil, X, Check } from "lucide-react";

interface Expense { id: string; amount: number; category: string; description: string; date: string; }

const categoryEmojis: Record<string, string> = {
  food: "🍽️", transport: "🚗", entertainment: "🎬", home: "🏠",
  health: "💊", shopping: "🛍️", bills: "📄", auto: "🔧",
  subscriptions: "🔄", education: "📚", other: "📌",
};

const CATEGORIES = ["food", "transport", "entertainment", "home", "health", "shopping", "bills", "auto", "subscriptions", "education", "other"];

export default function ExpensesPage() {
  const t = useTranslations("expenses");
  const ct = useTranslations("expenses.categories");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [editData, setEditData] = useState<{ description: string; amount: string; category: string }>({ description: "", amount: "", category: "" });

  const loadExpenses = async () => {
    const supabase = createBrowserSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const today = new Date();
    const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase.from("expenses") as any)
      .select("id, amount, category, description, date")
      .eq("user_id", user.id)
      .gte("date", monthStart)
      .order("date", { ascending: false });

    if (data) {
      setExpenses(data);
      setTotal(data.reduce((sum: number, e: Expense) => sum + Number(e.amount), 0));
    }
    setLoading(false);
  };

  useEffect(() => { setTimeout(loadExpenses, 0); }, []);

  async function deleteExpense(id: string) {
    const supabase = createBrowserSupabase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("expenses") as any).delete().eq("id", id);
    setExpenses(prev => prev.filter(e => e.id !== id));
    setTotal(prev => prev - Number(expenses.find(e => e.id === id)?.amount || 0));
  }

  function startEdit(e: Expense) {
    setEditing(e.id);
    setEditData({ description: e.description, amount: String(e.amount), category: e.category });
  }

  async function saveEdit(id: string) {
    const supabase = createBrowserSupabase();
    const amount = parseFloat(editData.amount);
    if (isNaN(amount) || amount <= 0) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("expenses") as any).update({
      description: editData.description,
      amount,
      category: editData.category,
    }).eq("id", id);

    setExpenses(prev => prev.map(e => e.id === id ? { ...e, description: editData.description, amount, category: editData.category } : e));
    setTotal(expenses.reduce((sum, e) => sum + (e.id === id ? amount : Number(e.amount)), 0));
    setEditing(null);
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
          <p className="text-3xl font-bold mt-1">&euro;{total.toFixed(2)}</p>
        </div>

        {loading ? (
          <p className="text-center text-[var(--dim)] text-sm py-8">...</p>
        ) : expenses.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-[var(--dim)] mb-3">{t("addExpense")}</p>
            <Link href="/chat" className="text-sm text-[var(--accent)]">{t("goToChat")} &rarr;</Link>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(byDate).map(([date, items]) => {
              const dayTotal = items.reduce((s, e) => s + Number(e.amount), 0);
              const d = new Date(date + "T00:00:00");
              const label = d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
              return (
                <div key={date}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-[var(--muted)] uppercase">{label}</span>
                    <span className="text-xs text-[var(--muted)]">&euro;{dayTotal.toFixed(2)}</span>
                  </div>
                  <div className="rounded-xl bg-[var(--bg2)] border border-[var(--border)] divide-y divide-[var(--border)]">
                    {items.map((e) => editing === e.id ? (
                      /* Edit mode */
                      <div key={e.id} className="px-3.5 py-3 space-y-2">
                        <input value={editData.description} onChange={ev => setEditData(p => ({ ...p, description: ev.target.value }))}
                          aria-label={t("description") ?? "Description"}
                          className="w-full bg-[var(--bg3)] rounded-lg px-3 py-1.5 text-sm border border-[var(--border)] focus:outline-none" />
                        <div className="flex gap-2">
                          <input value={editData.amount} onChange={ev => setEditData(p => ({ ...p, amount: ev.target.value }))} type="number" step="0.01"
                            aria-label={t("amount") ?? "Amount"}
                            className="w-24 bg-[var(--bg3)] rounded-lg px-3 py-1.5 text-sm border border-[var(--border)] focus:outline-none" />
                          <select value={editData.category} onChange={ev => setEditData(p => ({ ...p, category: ev.target.value }))}
                            aria-label={t("category") ?? "Category"}
                            className="flex-1 bg-[var(--bg3)] rounded-lg px-2 py-1.5 text-sm border border-[var(--border)] focus:outline-none">
                            {CATEGORIES.map(c => <option key={c} value={c}>{categoryEmojis[c]} {ct(c as "food")}</option>)}
                          </select>
                        </div>
                        <div className="flex gap-2 justify-end">
                          <button type="button" onClick={() => setEditing(null)} aria-label={t("cancel") ?? "Cancel"} className="p-1.5 rounded-lg bg-[var(--bg3)] text-[var(--dim)]"><X size={14} aria-hidden="true" /></button>
                          <button type="button" onClick={() => saveEdit(e.id)} aria-label={t("save") ?? "Save"} className="p-1.5 rounded-lg bg-green-600 text-white"><Check size={14} aria-hidden="true" /></button>
                        </div>
                      </div>
                    ) : (
                      /* View mode */
                      <div key={e.id} className="flex items-center justify-between px-3.5 py-2.5 group">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <span className="text-lg flex-shrink-0">{categoryEmojis[e.category] || "📌"}</span>
                          <div className="min-w-0">
                            <p className="text-sm truncate">{e.description}</p>
                            <p className="text-xs text-[var(--dim)]">{ct(e.category as "food")}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">&euro;{Number(e.amount).toFixed(2)}</span>
                          <button type="button" onClick={() => startEdit(e)} aria-label={`${t("edit") ?? "Edit"} ${e.description}`} className="p-1.5 rounded-lg opacity-40 hover:opacity-100 active:opacity-100 transition">
                            <Pencil size={13} className="text-[var(--dim)]" aria-hidden="true" />
                          </button>
                          <button type="button" onClick={() => deleteExpense(e.id)} aria-label={`${t("delete") ?? "Delete"} ${e.description}`} className="p-1.5 rounded-lg opacity-40 hover:opacity-100 active:opacity-100 transition">
                            <Trash2 size={13} className="text-red-400" aria-hidden="true" />
                          </button>
                        </div>
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
