"use client";

import { useTranslations } from "next-intl";
import { useState, useEffect, useCallback } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { Link } from "@/i18n/navigation";
import {
  Apple,
  Droplets,
  UtensilsCrossed,
  ShoppingCart,
  ChefHat,
  RefreshCw,
  Plus,
  TrendingDown,
  TrendingUp,
  Minus,
} from "lucide-react";

interface DashboardData {
  profile: {
    target_calories: number;
    target_protein_g: number;
    target_carbs_g: number;
    target_fat_g: number;
    target_fiber_g: number;
    target_water_ml: number;
    goal: string;
    diet_type: string;
  };
  today: {
    intake: { calories: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number };
    remaining_calories: number;
    water_ml: number;
    water_glasses: number;
    water_target_glasses: number;
    meals: Array<{ id: string; meal_type: string; food_name: string; calories: number; time: string }>;
  };
  weekly: {
    avg_calories: number;
    days_logged: number;
    adherence_pct: number;
  };
  active_plan: { id: string; week_start: string; week_end: string; avg_calories: number } | null;
  weight_trend: Array<{ weight_kg: number; date: string }>;
}

export default function NutritionPage() {
  const t = useTranslations("nutrition");
  const tNav = useTranslations("nav");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const supabase = createBrowserSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); setError("not_logged_in"); return; }

    try {
      const res = await fetch(`/api/nutrition/dashboard?userId=${user.id}`);
      if (res.status === 404) { setError("no_profile"); setLoading(false); return; }
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setData(json);
      setError(null);
    } catch {
      setError("fetch_error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <RefreshCw className="animate-spin text-[var(--dim)]" size={24} />
      </div>
    );
  }

  if (error === "no_profile") {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 px-6 text-center">
        <Apple size={48} className="text-[var(--dim)]" />
        <h2 className="text-lg font-semibold">{t("onboardingTitle")}</h2>
        <p className="text-sm text-[var(--dim)]">{t("onboardingDesc")}</p>
        <Link href="/chat?q=quiero%20configurar%20mi%20perfil%20nutricional" className="mt-2 px-4 py-2 bg-green-600 rounded-lg text-sm font-medium">
          {t("setup")}
        </Link>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3">
        <p className="text-[var(--dim)]">{t("title")}</p>
        <button onClick={fetchData} className="text-sm text-blue-400">{t("title")}</button>
      </div>
    );
  }

  const { profile, today, weekly, weight_trend } = data;
  const calPct = Math.min(100, Math.round((today.intake.calories / profile.target_calories) * 100));

  // SVG circle params
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (calPct / 100) * circumference;

  return (
    <div className="h-full overflow-y-auto pb-4">
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <h1 className="text-lg font-bold">{t("title")}</h1>
      </div>

      {/* Calorie Circle */}
      <div className="flex justify-center py-4">
        <div className="relative w-36 h-36">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r={radius} fill="none" stroke="var(--border)" strokeWidth="8" />
            <circle
              cx="60" cy="60" r={radius} fill="none"
              stroke={calPct > 100 ? "#ef4444" : "#22c55e"}
              strokeWidth="8" strokeLinecap="round"
              strokeDasharray={circumference} strokeDashoffset={offset}
              className="transition-all duration-700"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold">{today.intake.calories}</span>
            <span className="text-[10px] text-[var(--dim)]">/ {profile.target_calories} kcal</span>
          </div>
        </div>
      </div>

      {/* Remaining */}
      <div className="text-center text-sm text-[var(--dim)] -mt-2 mb-3">
        {t("remaining")}: <span className="text-white font-medium">{today.remaining_calories} kcal</span>
      </div>

      {/* Macro Bars */}
      <div className="px-4 space-y-2 mb-4">
        <MacroBar label={t("protein")} current={today.intake.protein_g} target={profile.target_protein_g} color="#3b82f6" unit="g" />
        <MacroBar label={t("carbs")} current={today.intake.carbs_g} target={profile.target_carbs_g} color="#f59e0b" unit="g" />
        <MacroBar label={t("fat")} current={today.intake.fat_g} target={profile.target_fat_g} color="#ef4444" unit="g" />
      </div>

      {/* Water Tracker */}
      <div className="mx-4 p-3 rounded-xl bg-[var(--card)] border border-[var(--border)] mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Droplets size={16} className="text-blue-400" />
            <span className="text-sm font-medium">{t("waterTracker")}</span>
          </div>
          <span className="text-xs text-[var(--dim)]">
            {today.water_glasses} / {today.water_target_glasses} {t("glasses")}
          </span>
        </div>
        <div className="flex gap-1">
          {Array.from({ length: today.water_target_glasses }, (_, i) => (
            <div
              key={i}
              className={`flex-1 h-2 rounded-full ${i < today.water_glasses ? "bg-blue-400" : "bg-[var(--border)]"}`}
            />
          ))}
        </div>
      </div>

      {/* Today's Meals */}
      {today.meals.length > 0 && (
        <div className="mx-4 mb-4">
          <h3 className="text-sm font-medium mb-2">{t("meals")}</h3>
          <div className="space-y-1">
            {today.meals.map((meal) => (
              <div key={meal.id} className="flex items-center justify-between p-2 rounded-lg bg-[var(--card)] border border-[var(--border)]">
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-[var(--dim)] uppercase">{meal.meal_type}</span>
                  <p className="text-sm truncate">{meal.food_name}</p>
                </div>
                <span className="text-sm font-medium ml-2">{meal.calories} kcal</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Weight Trend */}
      {weight_trend.length > 1 && (
        <div className="mx-4 p-3 rounded-xl bg-[var(--card)] border border-[var(--border)] mb-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{t("weight")}</span>
            <div className="flex items-center gap-1">
              {weight_trend[0].weight_kg < weight_trend[weight_trend.length - 1].weight_kg
                ? <TrendingDown size={14} className="text-green-400" />
                : weight_trend[0].weight_kg > weight_trend[weight_trend.length - 1].weight_kg
                  ? <TrendingUp size={14} className="text-red-400" />
                  : <Minus size={14} className="text-[var(--dim)]" />}
              <span className="text-sm font-bold">{weight_trend[0].weight_kg} kg</span>
            </div>
          </div>
          <div className="flex items-end gap-[2px] mt-2 h-8">
            {weight_trend.slice(0, 14).reverse().map((w, i) => {
              const min = Math.min(...weight_trend.map((x) => x.weight_kg));
              const max = Math.max(...weight_trend.map((x) => x.weight_kg));
              const range = max - min || 1;
              const height = Math.max(4, ((w.weight_kg - min) / range) * 28);
              return <div key={i} className="flex-1 bg-green-500/60 rounded-sm" style={{ height: `${height}px` }} />;
            })}
          </div>
        </div>
      )}

      {/* Weekly Stats */}
      <div className="mx-4 p-3 rounded-xl bg-[var(--card)] border border-[var(--border)] mb-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{t("weeklyPlan")}</span>
          <span className="text-xs text-[var(--dim)]">{weekly.days_logged} days</span>
        </div>
        <div className="flex items-center gap-4 mt-1">
          <div className="text-xs text-[var(--dim)]">{t("calories")}: <span className="text-white">{weekly.avg_calories}/day</span></div>
          <div className="text-xs text-[var(--dim)]">{t("adherence")}: <span className="text-white">{weekly.adherence_pct}%</span></div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="px-4 grid grid-cols-3 gap-2 mb-4">
        <Link href="/chat?q=registrar%20comida" className="flex flex-col items-center gap-1 p-3 rounded-xl bg-[var(--card)] border border-[var(--border)]">
          <Plus size={20} className="text-green-400" />
          <span className="text-[10px] text-[var(--dim)]">{t("addFood")}</span>
        </Link>
        <Link href="/chat?q=mi%20plan%20de%20comidas" className="flex flex-col items-center gap-1 p-3 rounded-xl bg-[var(--card)] border border-[var(--border)]">
          <UtensilsCrossed size={20} className="text-amber-400" />
          <span className="text-[10px] text-[var(--dim)]">{t("myPlan")}</span>
        </Link>
        <Link href="/chat?q=dame%20una%20receta%20saludable" className="flex flex-col items-center gap-1 p-3 rounded-xl bg-[var(--card)] border border-[var(--border)]">
          <ChefHat size={20} className="text-purple-400" />
          <span className="text-[10px] text-[var(--dim)]">{t("recipe")}</span>
        </Link>
      </div>

      {/* Disclaimer */}
      <p className="px-4 text-[9px] text-[var(--dim)] text-center italic">
        {t("disclaimer")}
      </p>
    </div>
  );
}

function MacroBar({ label, current, target, color, unit }: {
  label: string; current: number; target: number; color: string; unit: string;
}) {
  const pct = Math.min(100, target > 0 ? Math.round((current / target) * 100) : 0);
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-0.5">
        <span className="text-[var(--dim)]">{label}</span>
        <span>{current}{unit} / {target}{unit}</span>
      </div>
      <div className="h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}
