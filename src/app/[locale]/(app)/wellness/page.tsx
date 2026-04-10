"use client";

import { useTranslations, useLocale } from "next-intl";
import { useState, useEffect, useCallback, useRef } from "react";
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
  X,
  ArrowRight,
  Check,
} from "lucide-react";
import { WELLNESS_MODULES, type Locale, type WellnessModule, type ModuleStep } from "@/lib/wellness/modules";

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
  const locale = useLocale() as Locale;
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Exercise state
  const [activeModule, setActiveModule] = useState<WellnessModule | null>(null);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [inputValue, setInputValue] = useState("");
  const [exerciseDone, setExerciseDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [startTime, setStartTime] = useState(0);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const supabase = createBrowserSupabase();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

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
  }, [locale]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  function startModule(moduleId: string) {
    const mod = WELLNESS_MODULES.find(m => m.id === moduleId);
    if (!mod) return;
    setActiveModule(mod);
    setCurrentStepIdx(0);
    setResponses({});
    setInputValue("");
    setExerciseDone(false);
    setStartTime(Date.now());
  }

  function handleStepSubmit() {
    if (!activeModule) return;
    const step = activeModule.steps[currentStepIdx];

    // For info steps, just continue (no required input)
    if (step.type !== "info" && !inputValue.trim()) return;

    // Save response
    const newResponses = { ...responses, [step.id]: inputValue.trim() };
    setResponses(newResponses);
    setInputValue("");

    // Move to next step or finish
    if (currentStepIdx < activeModule.steps.length - 1) {
      setCurrentStepIdx(currentStepIdx + 1);
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      finishExercise(newResponses);
    }
  }

  async function finishExercise(allResponses: Record<string, string>) {
    if (!activeModule) return;
    setSaving(true);

    const durationSeconds = Math.round((Date.now() - startTime) / 1000);

    // Extract mood_before/after if available
    let moodBefore: number | null = null;
    let moodAfter: number | null = null;
    for (const step of activeModule.steps) {
      if (step.id === "mood_before" || step.id === "rate_belief") {
        const val = parseInt(allResponses[step.id]);
        if (!isNaN(val)) moodBefore = Math.min(10, Math.max(1, val));
      }
      if (step.id === "mood_after" || step.id === "rate_again") {
        const val = parseInt(allResponses[step.id]);
        if (!isNaN(val)) moodAfter = Math.min(10, Math.max(1, val));
      }
    }

    try {
      const supabase = createBrowserSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("wellness_exercises") as any).insert({
        user_id: user.id,
        exercise_type: activeModule.type,
        module_name: activeModule.name[locale] || activeModule.name.es,
        duration_seconds: durationSeconds,
        data: allResponses,
        mood_before: moodBefore,
        mood_after: moodAfter,
      });
    } catch {
      // silent
    } finally {
      setSaving(false);
      setExerciseDone(true);
    }
  }

  function closeExercise() {
    setActiveModule(null);
    setExerciseDone(false);
    setResponses({});
    setCurrentStepIdx(0);
    fetchDashboard();
  }

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

  // Current step info for exercise overlay
  const currentStep: ModuleStep | null = activeModule ? activeModule.steps[currentStepIdx] : null;

  // Mood comparison for results
  const moodBefore = activeModule ? parseInt(responses[activeModule.steps.find(s => s.id === "mood_before" || s.id === "rate_belief")?.id || ""] || "0") : 0;
  const moodAfter = activeModule ? parseInt(responses[activeModule.steps.find(s => s.id === "mood_after" || s.id === "rate_again")?.id || ""] || "0") : 0;

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
        <Link href="/chat?q=como%20me%20siento%20hoy" className="block">
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
            {t("frequentEmotions")}
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
              <button
                key={mod.id}
                onClick={() => startModule(mod.id)}
                className="text-left bg-[var(--card)] rounded-xl p-3 border border-[var(--border)] flex items-center gap-3 active:scale-[0.98] transition-transform"
              >
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
              </button>
            );
          })}
        </div>
      </div>

      {/* Disclaimer */}
      <p className="text-[10px] text-[var(--dim)] text-center px-4 pb-4">
        {t("disclaimer")}
      </p>

      {/* ─── Exercise Overlay ─── */}
      {activeModule && (
        <div className="fixed inset-0 z-50 bg-[var(--bg)] flex flex-col">
          {/* Exercise header */}
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <div>
              <h2 className="text-sm font-semibold">{activeModule.name[locale] || activeModule.name.es}</h2>
              {!exerciseDone && (
                <span className="text-[10px] text-[var(--dim)]">
                  {t("step")} {currentStepIdx + 1} {t("of")} {activeModule.steps.length}
                </span>
              )}
            </div>
            <button onClick={closeExercise}>
              <X size={20} className="text-[var(--dim)]" />
            </button>
          </div>

          {/* Progress bar */}
          {!exerciseDone && (
            <div className="px-4 mb-4">
              <div className="h-1 bg-[var(--border)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-pink-400 rounded-full transition-all duration-300"
                  style={{ width: `${((currentStepIdx + 1) / activeModule.steps.length) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            {exerciseDone ? (
              /* ── Results ── */
              <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
                <div className="w-16 h-16 rounded-full bg-green-900/30 flex items-center justify-center">
                  <Check size={32} className="text-green-400" />
                </div>
                <h3 className="text-lg font-semibold">{t("exerciseComplete")}</h3>

                {moodBefore > 0 && moodAfter > 0 && (
                  <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)] w-full max-w-xs">
                    <div className="flex justify-between items-center mb-2">
                      <div className="text-center">
                        <div className="text-xs text-[var(--dim)]">{t("moodBefore")}</div>
                        <div className="text-2xl font-bold" style={{ color: MOOD_COLORS[moodBefore] || "#fff" }}>{moodBefore}</div>
                      </div>
                      <ArrowRight size={20} className="text-[var(--dim)]" />
                      <div className="text-center">
                        <div className="text-xs text-[var(--dim)]">{t("moodAfter")}</div>
                        <div className="text-2xl font-bold" style={{ color: MOOD_COLORS[moodAfter] || "#fff" }}>{moodAfter}</div>
                      </div>
                    </div>
                    <p className="text-xs text-[var(--dim)] text-center">
                      {moodAfter > moodBefore ? t("moodImproved") : moodAfter === moodBefore ? t("moodSame") : t("moodDeclined")}
                    </p>
                  </div>
                )}

                <button
                  onClick={closeExercise}
                  className="mt-4 px-8 py-3 rounded-xl bg-pink-600 text-sm font-medium text-white"
                >
                  {t("closeExercise")}
                </button>
              </div>
            ) : currentStep ? (
              /* ── Step content ── */
              <div className="flex flex-col h-full">
                {/* Prompt */}
                <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)] mb-4">
                  <p className="text-sm whitespace-pre-line">{currentStep.prompt[locale] || currentStep.prompt.es}</p>
                </div>

                <div className="flex-1" />

                {/* Input */}
                {currentStep.type === "text" && (
                  <textarea
                    ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                    value={inputValue}
                    onChange={e => setInputValue(e.target.value)}
                    placeholder={t("enterResponse")}
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl bg-[var(--bg2)] border border-[var(--border)] text-sm text-white placeholder-[var(--dim)] focus:outline-none resize-none mb-3"
                  />
                )}

                {currentStep.type === "number" && (
                  <input
                    ref={inputRef as React.RefObject<HTMLInputElement>}
                    type="number"
                    min={1}
                    max={10}
                    value={inputValue}
                    onChange={e => setInputValue(e.target.value)}
                    placeholder="1-10"
                    className="w-full px-4 py-3 rounded-xl bg-[var(--bg2)] border border-[var(--border)] text-sm text-white placeholder-[var(--dim)] focus:outline-none mb-3 text-center text-xl"
                  />
                )}

                {currentStep.type === "select" && currentStep.options && (
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {currentStep.options.map((opt, idx) => {
                      const label = opt[locale] || opt.es;
                      const isSelected = inputValue === label;
                      return (
                        <button
                          key={idx}
                          onClick={() => setInputValue(label)}
                          className={`px-3 py-2 rounded-xl text-sm border transition-all ${
                            isSelected
                              ? "border-pink-400 bg-pink-900/30 text-pink-300"
                              : "border-[var(--border)] bg-[var(--bg2)] text-[var(--dim)]"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Action button */}
                <button
                  onClick={handleStepSubmit}
                  disabled={currentStep.type !== "info" && !inputValue.trim()}
                  className="w-full py-3 rounded-xl bg-pink-600 text-sm font-medium text-white disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {saving ? (
                    t("saving")
                  ) : currentStepIdx < activeModule.steps.length - 1 ? (
                    <>
                      {currentStep.type === "info" ? t("continue") : t("next")}
                      <ArrowRight size={16} />
                    </>
                  ) : (
                    t("finish")
                  )}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
