import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateWeightChange, calculateFullProfile } from "@/lib/nutrition/engine";
import { generateWeeklyPlan } from "@/lib/nutrition/meal-planner";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET() {
  try {
    // Get all users with active nutrition profiles
    const { data: profiles } = await supabase
      .from("nutrition_profiles")
      .select("*")
      .eq("active", true);

    if (!profiles?.length) {
      return NextResponse.json({ status: "ok", processed: 0 });
    }

    let processed = 0;
    const errors: string[] = [];

    for (const profile of profiles) {
      try {
        await processUserNutrition(profile);
        processed++;
      } catch (err) {
        console.error(`[Nutrition Weekly] Failed for ${profile.user_id}:`, err);
        errors.push(`${profile.user_id}: ${(err as Error).message}`);
      }
    }

    const { logCronResult } = await import("@/lib/cron/logger");
    await logCronResult("nutrition-weekly", { processed, total: profiles.length, errors: errors.length });

    return NextResponse.json({ status: "ok", processed, total: profiles.length, errors: errors.length });
  } catch (err) {
    console.error("[Nutrition Weekly Cron] Error:", err);
    const { logCronError } = await import("@/lib/cron/logger");
    await logCronError("nutrition-weekly", (err as Error).message);
    return NextResponse.json({ status: "error" }, { status: 200 });
  }
}

async function processUserNutrition(profile: Record<string, unknown>) {
  const userId = profile.user_id as string;

  // 1. Check if current meal plan has expired
  const { data: activePlan } = await supabase
    .from("meal_plans")
    .select("*")
    .eq("user_id", userId)
    .eq("active", true)
    .single();

  const today = new Date();
  const needsNewPlan = !activePlan || new Date(activePlan.week_end as string) < today;

  // 2. Generate new plan if needed
  if (needsNewPlan) {
    try {
      // Deactivate old plan
      if (activePlan) {
        await supabase
          .from("meal_plans")
          .update({ active: false })
          .eq("id", activePlan.id);
      }

      const plan = await generateWeeklyPlan({
        age: profile.age as number,
        weight_kg: profile.weight_kg as number,
        height_cm: profile.height_cm as number,
        sex: profile.sex as "male" | "female",
        activity_level: profile.activity_level as "sedentary" | "light" | "moderate" | "active" | "very_active",
        goal: profile.goal as "lose" | "maintain" | "gain",
        diet_type: profile.diet_type as "balanced" | "keto" | "vegetarian" | "vegan" | "mediterranean" | "paleo" | "pescatarian",
        allergies: (profile.allergies as string[]) || [],
        medical_conditions: (profile.medical_conditions as string[]) || [],
        weekly_target_kg: (profile.weekly_target_kg as number) || 0.5,
      });

      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay() + 1);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);

      await supabase.from("meal_plans").insert({
        user_id: userId,
        week_start: weekStart.toISOString().split("T")[0],
        week_end: weekEnd.toISOString().split("T")[0],
        plan: plan.days,
        shopping_list: plan.shopping_list,
        total_calories_avg: plan.avg_daily_calories,
        active: true,
      });

      console.log(`[Nutrition Weekly] Generated new plan for ${userId}`);
    } catch (err) {
      console.error(`[Nutrition Weekly] Failed to generate plan for ${userId}:`, err);
    }
  }

  // 3. Calculate weekly adherence
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const { data: weekLogs } = await supabase
    .from("nutrition_log")
    .select("calories, logged_at")
    .eq("user_id", userId)
    .gte("logged_at", weekAgo.toISOString());

  if (weekLogs && weekLogs.length > 0) {
    const dailyCalories = new Map<string, number>();
    for (const log of weekLogs) {
      const day = (log.logged_at as string).split("T")[0];
      dailyCalories.set(day, (dailyCalories.get(day) || 0) + (log.calories || 0));
    }

    const targetCal = profile.target_calories as number;
    let daysOnTarget = 0;
    for (const dayCals of dailyCalories.values()) {
      const deviation = Math.abs(dayCals - targetCal) / targetCal;
      if (deviation <= 0.15) daysOnTarget++; // Within 15%
    }

    const adherencePct = Math.round((daysOnTarget / 7) * 100);

    if (activePlan) {
      await supabase
        .from("meal_plans")
        .update({ adherence_pct: adherencePct })
        .eq("id", activePlan.id);
    }
  }

  // 4. Check weight loss rate safety
  const { data: weights } = await supabase
    .from("weight_log")
    .select("weight_kg, logged_at")
    .eq("user_id", userId)
    .order("logged_at", { ascending: false })
    .limit(2);

  if (weights && weights.length >= 2) {
    const daysDiff = Math.max(1,
      (new Date(weights[0].logged_at).getTime() - new Date(weights[1].logged_at).getTime()) / (1000 * 60 * 60 * 24),
    );
    const check = validateWeightChange(weights[0].weight_kg, weights[1].weight_kg, daysDiff);

    if (!check.safe) {
      console.warn(`[Nutrition Weekly] UNSAFE weight change for ${userId}: ${check.message}`);
      // TODO: Send notification to user about unsafe weight change rate
    }
  }
}
