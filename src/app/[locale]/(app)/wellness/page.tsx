"use client";

import { useTranslations } from "next-intl";
import { useState, useEffect, useCallback } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { Link } from "@/i18n/navigation";
import {
  Heart,
  Wind,
  Sparkles,
  BookHeart,
  Brain,
  Hand,
  Flame,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
} from "lucide-react";

interface DashboardData {
  today_mood: { mood_score: number; emotions: string[]; time_of_day: string } | null;
  mood_history_7d: Array<{ mood_score: number; date: string; time_of_day: string }>;
  exercises_count_week: number;
  streak: { current: number; longest: number };
  emotion_frequency: Array<{ emotion: string; count: number }>;
  avg_mood_7d: number | null;
  mood_trend: string;
  available_modules: Array<{
    id: string;
    name: string;
    type: string;
    description: string;
    estimated_minutes: number;
  }>;
}

const MODULE_ICONS: Record<string, typeof Heart> = {
  breathing: Wind,
  gratitude: Sparkles,
  journal: BookHeart,
  cbt: Brain,
  grounding: Hand,
};

const MOOD_COLORS = [
  "", // 0
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#a3e635",
  "#84cc16", "#22c55e", "#10b981", "#14b8a6", "#06b6d4",
];

export default function WellnessPage() {
  const t = useTranslations("wellness");
  const tNav = useTranslations("nav");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const supabase = createBrowserSupabase();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const locale = document.documentElement.lang || "es";
      const res = await fetch(`/api/wellness/dashboard?locale=${locale}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setData(json);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <RefreshCw className="animate-spin text-[var(--dim)]" size={24} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 gap-3">
        <p className="text-[var(--dim)]">{t("title")}</p>
        <button onClick={fetchDashboard} className="text-sm text-blue-400 underline">
          {t("startExercise")}
        </button>
      </div>
    );
  }

  const trendIcon =
    data.mood_trend === "improving" ? TrendingUp :
    data.mood_trend === "declining" ? TrendingDown : Minus;
  const TrendIcon = trendIcon;

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Heart size={20} className="text-pink-400" />
        <h1 className="text-lg font-semibold">{t("title")}</h1>
      </div>

      {/* Today's mood or prompt */}
      {data.today_mood ? (
        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--dim)]">{t("mood")}</span>
            <span
              className="text-2xl font-bold"
              style={{ color: MOOD_COLORS[data.today_mood.mood_score] || "#fff" }}
            >
              {data.today_mood.mood_score}/10
            </span>
          </div>
          {data.today_mood.emotions?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {data.today_mood.emotions.map((e) => (
                <span
                  key={e}
                  className="text-xs px-2 py-0.5 rounded-full bg-pink-900/30 text-pink-300"
                >
                  {e}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <Link href="/chat" className="block">
          <div className="bg-gradient-to-r from-pink-900/40 to-purple-900/40 rounded-xl p-4 border border-pink-800/30">
            <p className="text-sm font-medium">{t("howFeelToday")}</p>
            <p className="text-xs text-[var(--dim)] mt-1">
              {t("startExercise")}
            </p>
          </div>
        </Link>
      )}

      {/* Mood graph (7 days) */}
      {data.mood_history_7d.length > 0 && (
        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">{t("moodHistory")}</span>
            <div className="flex items-center gap-1">
              <TrendIcon size={14} className={
                data.mood_trend === "improving" ? "text-green-400" :
                data.mood_trend === "declining" ? "text-red-400" : "text-[var(--dim)]"
              } />
              {data.avg_mood_7d && (
                <span className="text-xs text-[var(--dim)]">{data.avg_mood_7d}/10</span>
              )}
            </div>
          </div>
          <div className="flex items-end gap-1 h-20">
            {data.mood_history_7d.map((m, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full rounded-t"
                  style={{
                    height: `${(m.mood_score / 10) * 100}%`,
                    backgroundColor: MOOD_COLORS[m.mood_score] || "#666",
                    minHeight: "4px",
                  }}
                />
                <span className="text-[8px] text-[var(--dim)]">
                  {new Date(m.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "narrow" })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3">
        {/* Streak */}
        <div className="bg-[var(--card)] rounded-xl p-3 border border-[var(--border)]">
          <div className="flex items-center gap-1.5 mb-1">
            <Flame size={14} className="text-orange-400" />
            <span className="text-xs text-[var(--dim)]">{t("currentStreak")}</span>
          </div>
          <span className="text-xl font-bold">
            {data.streak.current}
            <span className="text-xs text-[var(--dim)] ml-1">{t("days")}</span>
          </span>
        </div>

        {/* Exercises this week */}
        <div className="bg-[var(--card)] rounded-xl p-3 border border-[var(--border)]">
          <div className="flex items-center gap-1.5 mb-1">
            <Heart size={14} className="text-pink-400" />
            <span className="text-xs text-[var(--dim)]">{t("exercisesWeek")}</span>
          </div>
          <span className="text-xl font-bold">
            {data.exercises_count_week}
            <span className="text-xs text-[var(--dim)] ml-1">{t("completed")}</span>
          </span>
        </div>
      </div>

      {/* Top emotions */}
      {data.emotion_frequency.length > 0 && (
        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <span className="text-sm font-medium block mb-2">
            Emociones frecuentes
          </span>
          <div className="flex flex-wrap gap-2">
            {data.emotion_frequency.map(({ emotion, count }) => (
              <span
                key={emotion}
                className="text-xs px-2 py-1 rounded-full bg-purple-900/30 text-purple-300"
              >
                {emotion} ({count})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Quick module buttons */}
      <div className="space-y-2">
        <span className="text-sm font-medium">{t("startExercise")}</span>
        <div className="grid grid-cols-1 gap-2">
          {data.available_modules.map((mod) => {
            const IconComp = MODULE_ICONS[mod.type] || Heart;
            return (
              <Link href="/chat" key={mod.id}>
                <div className="bg-[var(--card)] rounded-xl p-3 border border-[var(--border)] flex items-center gap-3 active:scale-[0.98] transition-transform">
                  <div className="w-9 h-9 rounded-lg bg-pink-900/30 flex items-center justify-center">
                    <IconComp size={18} className="text-pink-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{mod.name}</p>
                    <p className="text-xs text-[var(--dim)] truncate">{mod.description}</p>
                  </div>
                  <span className="text-xs text-[var(--dim)] whitespace-nowrap">
                    {mod.estimated_minutes} min
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Disclaimer */}
      <p className="text-[10px] text-[var(--dim)] text-center px-4 pb-4">
        {t("disclaimer")}
      </p>
    </div>
  );
}
