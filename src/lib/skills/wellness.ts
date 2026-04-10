import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { detectCrisis } from "@/lib/wellness/crisis";
import { getModule, getModuleSummaries, WELLNESS_MODULES, type Locale } from "@/lib/wellness/modules";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const WELLNESS_DISCLAIMER =
  "\n\n_DILO ofrece tecnicas de bienestar basadas en evidencia. No es terapia ni diagnostico. Si necesitas ayuda profesional: 717 003 717 (24h, gratuito)._";

// ══════════════════════════════════════
// TOOLS DEFINITION
// ══════════════════════════════════════

export const WELLNESS_TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "wellness_mood",
      description:
        "Log a mood check-in. Use when the user tells you how they feel, or wants to rate their mood.",
      parameters: {
        type: "object",
        properties: {
          mood_score: { type: "number", description: "Mood score 1 (very bad) to 10 (excellent)" },
          emotions: { type: "array", items: { type: "string" }, description: "Emotions the user feels (e.g. happy, anxious, sad)" },
          note: { type: "string", description: "Optional freeform note from the user about their state" },
          activities: { type: "array", items: { type: "string" }, description: "Activities done today (exercise, work, socialize, etc.)" },
          time_of_day: { type: "string", enum: ["morning", "afternoon", "evening", "night"], description: "Time of day for this check-in" },
        },
        required: ["mood_score"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "wellness_exercise",
      description:
        "Suggest an appropriate wellness exercise based on how the user feels. Use when user wants help feeling better, managing stress, anxiety, or emotions.",
      parameters: {
        type: "object",
        properties: {
          feeling: { type: "string", description: "How the user describes feeling (e.g. anxious, sad, stressed, overwhelmed)" },
          locale: { type: "string", enum: ["es", "en", "fr", "it", "de"], description: "User locale for prompts" },
        },
        required: ["feeling"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "wellness_breathe",
      description: "Start a guided 4-7-8 breathing exercise. Use when user wants to breathe, relax, or calm down.",
      parameters: {
        type: "object",
        properties: {
          mood_before: { type: "number", description: "Mood score before exercise (1-10)" },
          locale: { type: "string", enum: ["es", "en", "fr", "it", "de"], description: "User locale" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "wellness_gratitude",
      description: "Start a gratitude exercise. Use when user wants to practice gratitude or focus on positive things.",
      parameters: {
        type: "object",
        properties: {
          locale: { type: "string", enum: ["es", "en", "fr", "it", "de"], description: "User locale" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "wellness_journal",
      description: "Start a guided emotional journaling session. Use when user wants to process emotions or write about how they feel.",
      parameters: {
        type: "object",
        properties: {
          emotion: { type: "string", description: "The primary emotion the user is feeling" },
          locale: { type: "string", enum: ["es", "en", "fr", "it", "de"], description: "User locale" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "wellness_grounding",
      description: "Start a 5-4-3-2-1 grounding exercise. Use when user feels disconnected, dissociated, or having a panic/anxiety episode.",
      parameters: {
        type: "object",
        properties: {
          locale: { type: "string", enum: ["es", "en", "fr", "it", "de"], description: "User locale" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "wellness_thought",
      description: "Start a CBT thought challenge exercise. Use when user has negative thoughts, rumination, or cognitive distortions.",
      parameters: {
        type: "object",
        properties: {
          thought: { type: "string", description: "The negative thought to challenge" },
          locale: { type: "string", enum: ["es", "en", "fr", "it", "de"], description: "User locale" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "wellness_stats",
      description: "Show the user's wellness stats: mood trends, exercise counts, streaks. Use when user asks about their wellness progress.",
      parameters: {
        type: "object",
        properties: {
          period: { type: "string", enum: ["7d", "30d"], description: "Period for stats (default: 7d)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "wellness_streak",
      description: "Show the user's current wellness streak (consecutive days with at least one wellness activity).",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
];

// ══════════════════════════════════════
// EXECUTION
// ══════════════════════════════════════

export async function executeWellnessTool(
  toolName: string,
  input: Record<string, unknown>,
  userId: string,
): Promise<string> {
  try {
    // CRISIS CHECK on any text input
    const textFields = ["note", "feeling", "thought", "emotion"];
    for (const field of textFields) {
      if (input[field] && typeof input[field] === "string") {
        const locale = (input.locale as string) || "es";
        const crisis = detectCrisis(input[field] as string, locale);
        if (crisis) return crisis; // Return ONLY crisis response
      }
    }

    switch (toolName) {
      case "wellness_mood":
        return await doMood(userId, input);
      case "wellness_exercise":
        return await doSuggestExercise(input);
      case "wellness_breathe":
        return await doStartModule(userId, "breathing_478", input);
      case "wellness_gratitude":
        return await doStartModule(userId, "gratitude", input);
      case "wellness_journal":
        return await doStartModule(userId, "emotional_journal", input);
      case "wellness_grounding":
        return await doStartModule(userId, "grounding_54321", input);
      case "wellness_thought":
        return await doStartModule(userId, "thought_challenge", input);
      case "wellness_stats":
        return await doStats(userId, input);
      case "wellness_streak":
        return await doStreak(userId);
      default:
        return JSON.stringify({ error: `Unknown wellness tool: ${toolName}` }) + WELLNESS_DISCLAIMER;
    }
  } catch (err) {
    console.error(`[Wellness] ${toolName} error:`, err);
    return JSON.stringify({ error: `Error executing ${toolName}: ${(err as Error).message}` }) + WELLNESS_DISCLAIMER;
  }
}

// ── Mood Check-in ──

async function doMood(userId: string, input: Record<string, unknown>): Promise<string> {
  const score = input.mood_score as number;
  const emotions = (input.emotions as string[]) || [];
  const note = (input.note as string) || null;
  const activities = (input.activities as string[]) || [];
  const timeOfDay = (input.time_of_day as string) || getTimeOfDay();

  const { error } = await supabase.from("mood_log").insert({
    user_id: userId,
    mood_score: score,
    emotions,
    note,
    activities,
    time_of_day: timeOfDay,
  });

  if (error) throw new Error(`Failed to log mood: ${error.message}`);

  // Update stats
  await updateStats(userId);

  // Get recent average
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const { data: recentMoods } = await supabase
    .from("mood_log")
    .select("mood_score")
    .eq("user_id", userId)
    .gte("created_at", sevenDaysAgo.toISOString());

  const avg = recentMoods?.length
    ? Math.round((recentMoods.reduce((s, m) => s + m.mood_score, 0) / recentMoods.length) * 10) / 10
    : score;

  // Suggest exercise if mood is low
  let suggestion = null;
  if (score <= 4) {
    suggestion = {
      message: "Tu estado de animo es bajo. Te recomiendo un ejercicio de bienestar.",
      recommended: score <= 2 ? "breathing_478" : "gratitude",
    };
  }

  return JSON.stringify({
    success: true,
    logged: { mood_score: score, emotions, time_of_day: timeOfDay },
    avg_7d: avg,
    total_checkins_7d: recentMoods?.length || 1,
    suggestion,
  }) + WELLNESS_DISCLAIMER;
}

// ── Suggest Exercise ──

async function doSuggestExercise(input: Record<string, unknown>): Promise<string> {
  const feeling = ((input.feeling as string) || "").toLowerCase();
  const locale = ((input.locale as string) || "es") as Locale;

  // Map feelings to best module
  const anxietyWords = ["anxious", "anxiety", "panic", "nervous", "ansiedad", "ansioso", "panico", "nervioso", "angst", "anxiete"];
  const sadWords = ["sad", "down", "depressed", "triste", "deprimido", "bajo", "traurig"];
  const stressWords = ["stressed", "overwhelmed", "burnt", "agotado", "estres", "abrumado", "stress"];
  const ruminateWords = ["thinking", "can't stop", "no puedo dejar", "pensamientos", "rumination", "thoughts", "gedanken"];
  const disconnectWords = ["disconnected", "numb", "unreal", "dissociat", "desconectado", "irreal"];

  let moduleId: string;
  if (anxietyWords.some((w) => feeling.includes(w))) {
    moduleId = "breathing_478";
  } else if (disconnectWords.some((w) => feeling.includes(w))) {
    moduleId = "grounding_54321";
  } else if (ruminateWords.some((w) => feeling.includes(w))) {
    moduleId = "thought_challenge";
  } else if (sadWords.some((w) => feeling.includes(w))) {
    moduleId = "gratitude";
  } else if (stressWords.some((w) => feeling.includes(w))) {
    moduleId = "breathing_478";
  } else {
    moduleId = "emotional_journal";
  }

  const mod = getModule(moduleId)!;
  const allModules = getModuleSummaries(locale);

  return JSON.stringify({
    recommended: {
      id: mod.id,
      name: mod.name[locale] || mod.name.es,
      description: mod.description[locale] || mod.description.es,
      estimated_minutes: mod.estimated_minutes,
      steps_count: mod.steps.length,
    },
    all_available: allModules,
    instruction: `Recommended "${mod.name[locale] || mod.name.es}" based on how the user feels. Ask if they want to start it. Present the first step prompt when they say yes.`,
  }) + WELLNESS_DISCLAIMER;
}

// ── Start Module ──

async function doStartModule(
  userId: string,
  moduleId: string,
  input: Record<string, unknown>,
): Promise<string> {
  const mod = getModule(moduleId);
  if (!mod) return JSON.stringify({ error: `Module ${moduleId} not found` }) + WELLNESS_DISCLAIMER;

  const locale = ((input.locale as string) || "es") as Locale;

  // Log the exercise start
  await supabase.from("wellness_exercises").insert({
    user_id: userId,
    exercise_type: mod.type,
    module_name: mod.id,
    mood_before: (input.mood_before as number) || null,
    data: { started: true, input },
  });

  // Update stats
  await updateStats(userId);

  // Build step prompts for the LLM to guide
  const steps = mod.steps.map((step, i) => ({
    step_number: i + 1,
    id: step.id,
    type: step.type,
    prompt: step.prompt[locale] || step.prompt.es,
    options: step.options?.map((o) => o[locale] || o.es),
  }));

  return JSON.stringify({
    module: {
      id: mod.id,
      name: mod.name[locale] || mod.name.es,
      description: mod.description[locale] || mod.description.es,
      estimated_minutes: mod.estimated_minutes,
    },
    steps,
    instruction:
      "Guide the user through each step one at a time. Present step 1 first, wait for their response, then present step 2, etc. Be warm and supportive. After the last step, give a brief encouraging summary.",
  }) + WELLNESS_DISCLAIMER;
}

// ── Stats ──

async function doStats(userId: string, input: Record<string, unknown>): Promise<string> {
  const period = (input.period as string) === "30d" ? 30 : 7;
  const since = new Date();
  since.setDate(since.getDate() - period);

  const [moodData, exerciseData, statsData] = await Promise.all([
    supabase
      .from("mood_log")
      .select("mood_score, emotions, date, time_of_day")
      .eq("user_id", userId)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: true }),
    supabase
      .from("wellness_exercises")
      .select("exercise_type, module_name, mood_before, mood_after, completed_at")
      .eq("user_id", userId)
      .gte("completed_at", since.toISOString()),
    supabase
      .from("wellness_stats")
      .select("*")
      .eq("user_id", userId)
      .single(),
  ]);

  const moods = moodData.data || [];
  const exercises = exerciseData.data || [];
  const stats = statsData.data;

  // Compute mood trend
  const avgMood = moods.length
    ? Math.round((moods.reduce((s, m) => s + m.mood_score, 0) / moods.length) * 10) / 10
    : null;

  // Emotion frequency
  const emotionCount: Record<string, number> = {};
  for (const m of moods) {
    for (const e of m.emotions || []) {
      emotionCount[e] = (emotionCount[e] || 0) + 1;
    }
  }
  const topEmotions = Object.entries(emotionCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([emotion, count]) => ({ emotion, count }));

  // Exercise type counts
  const exTypeCounts: Record<string, number> = {};
  for (const ex of exercises) {
    exTypeCounts[ex.exercise_type] = (exTypeCounts[ex.exercise_type] || 0) + 1;
  }

  return JSON.stringify({
    period: `${period}d`,
    mood: {
      average: avgMood,
      total_checkins: moods.length,
      history: moods.map((m) => ({ date: m.date, score: m.mood_score, time: m.time_of_day })),
      top_emotions: topEmotions,
      trend: stats?.mood_trend || "stable",
    },
    exercises: {
      total: exercises.length,
      by_type: exTypeCounts,
    },
    streak: {
      current: stats?.current_streak_days || 0,
      longest: stats?.longest_streak_days || 0,
    },
    most_helpful: stats?.most_helpful_exercise || null,
  }) + WELLNESS_DISCLAIMER;
}

// ── Streak ──

async function doStreak(userId: string): Promise<string> {
  const { data: stats } = await supabase
    .from("wellness_stats")
    .select("current_streak_days, longest_streak_days, last_activity_date, total_exercises, total_journal_entries")
    .eq("user_id", userId)
    .single();

  return JSON.stringify({
    current_streak_days: stats?.current_streak_days || 0,
    longest_streak_days: stats?.longest_streak_days || 0,
    last_activity_date: stats?.last_activity_date || null,
    total_exercises: stats?.total_exercises || 0,
    total_journal_entries: stats?.total_journal_entries || 0,
  }) + WELLNESS_DISCLAIMER;
}

// ── Helpers ──

function getTimeOfDay(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 21) return "evening";
  return "night";
}

async function updateStats(userId: string): Promise<void> {
  try {
    const now = new Date();
    const today = now.toISOString().split("T")[0];

    // Count exercises
    const { count: totalEx } = await supabase
      .from("wellness_exercises")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);

    // Count journal entries
    const { count: totalJournal } = await supabase
      .from("wellness_exercises")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("exercise_type", "journal");

    // Compute streak: count consecutive days backward from today
    const { data: activityDates } = await supabase
      .from("mood_log")
      .select("date")
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .limit(90);

    const uniqueDates = [...new Set((activityDates || []).map((d) => d.date))].sort().reverse();
    let streak = 0;
    const checkDate = new Date(today);
    for (const dateStr of uniqueDates) {
      const expected = checkDate.toISOString().split("T")[0];
      if (dateStr === expected) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else if (dateStr < expected) {
        break;
      }
    }

    // 7d and 30d mood averages
    const d7 = new Date();
    d7.setDate(d7.getDate() - 7);
    const d30 = new Date();
    d30.setDate(d30.getDate() - 30);

    const [moods7, moods30] = await Promise.all([
      supabase.from("mood_log").select("mood_score").eq("user_id", userId).gte("created_at", d7.toISOString()),
      supabase.from("mood_log").select("mood_score").eq("user_id", userId).gte("created_at", d30.toISOString()),
    ]);

    const avg7 = moods7.data?.length
      ? Math.round((moods7.data.reduce((s, m) => s + m.mood_score, 0) / moods7.data.length) * 10) / 10
      : null;
    const avg30 = moods30.data?.length
      ? Math.round((moods30.data.reduce((s, m) => s + m.mood_score, 0) / moods30.data.length) * 10) / 10
      : null;

    let trend: string = "stable";
    if (avg7 !== null && avg30 !== null) {
      if (avg7 > avg30 + 0.5) trend = "improving";
      else if (avg7 < avg30 - 0.5) trend = "declining";
    }

    // Get current longest streak
    const { data: currentStats } = await supabase
      .from("wellness_stats")
      .select("longest_streak_days")
      .eq("user_id", userId)
      .single();

    const longestStreak = Math.max(streak, currentStats?.longest_streak_days || 0);

    await supabase.from("wellness_stats").upsert({
      user_id: userId,
      total_exercises: totalEx || 0,
      total_journal_entries: totalJournal || 0,
      current_streak_days: streak,
      longest_streak_days: longestStreak,
      last_activity_date: today,
      avg_mood_7d: avg7,
      avg_mood_30d: avg30,
      mood_trend: trend,
      updated_at: now.toISOString(),
    }, { onConflict: "user_id" });
  } catch (err) {
    console.error("[Wellness] updateStats error:", err);
  }
}
