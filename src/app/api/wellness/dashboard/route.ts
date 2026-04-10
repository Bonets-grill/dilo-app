import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { getModuleSummaries, type Locale } from "@/lib/wellness/modules";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerSupabase();
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = user.id;
    const url = new URL(request.url);
    const locale = (url.searchParams.get("locale") || "es") as Locale;

    const today = new Date().toISOString().split("T")[0];
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);

    const [todayMood, mood7d, exercisesWeek, stats, moodsWithEmotions] = await Promise.all([
      // Today's mood
      supabaseAdmin
        .from("mood_log")
        .select("mood_score, emotions, time_of_day, created_at")
        .eq("user_id", userId)
        .eq("date", today)
        .order("created_at", { ascending: false })
        .limit(1)
        .then((r) => r.data?.[0] || null),

      // Mood history 7d
      supabaseAdmin
        .from("mood_log")
        .select("mood_score, date, time_of_day")
        .eq("user_id", userId)
        .gte("created_at", sevenDaysAgo.toISOString())
        .order("created_at", { ascending: true })
        .then((r) => r.data || []),

      // Exercises this week
      supabaseAdmin
        .from("wellness_exercises")
        .select("exercise_type, module_name, completed_at")
        .eq("user_id", userId)
        .gte("completed_at", weekStart.toISOString())
        .then((r) => r.data || []),

      // Stats
      supabaseAdmin
        .from("wellness_stats")
        .select("*")
        .eq("user_id", userId)
        .single()
        .then((r) => r.data),

      // Emotions for frequency
      supabaseAdmin
        .from("mood_log")
        .select("emotions")
        .eq("user_id", userId)
        .gte("created_at", thirtyDaysAgo.toISOString())
        .then((r) => r.data || []),
    ]);

    // Emotion frequency
    const emotionCount: Record<string, number> = {};
    for (const m of moodsWithEmotions) {
      for (const e of m.emotions || []) {
        emotionCount[e] = (emotionCount[e] || 0) + 1;
      }
    }
    const topEmotions = Object.entries(emotionCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([emotion, count]) => ({ emotion, count }));

    const modules = getModuleSummaries(locale);

    return NextResponse.json({
      today_mood: todayMood,
      mood_history_7d: mood7d,
      exercises_this_week: exercisesWeek,
      exercises_count_week: exercisesWeek.length,
      streak: {
        current: stats?.current_streak_days || 0,
        longest: stats?.longest_streak_days || 0,
      },
      emotion_frequency: topEmotions,
      avg_mood_7d: stats?.avg_mood_7d || null,
      mood_trend: stats?.mood_trend || "stable",
      available_modules: modules,
    });
  } catch (err) {
    console.error("[Wellness Dashboard] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
