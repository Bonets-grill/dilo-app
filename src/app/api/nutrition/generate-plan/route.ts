import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateWeeklyPlan } from "@/lib/nutrition/meal-planner";
import type { NutritionProfile } from "@/lib/nutrition/engine";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  const { userId } = await req.json();
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  try {
    // Get user's nutrition profile
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (supabase.from("nutrition_profiles") as any)
      .select("*")
      .eq("user_id", userId)
      .eq("active", true)
      .single();

    if (!profile) return NextResponse.json({ error: "No nutrition profile" }, { status: 404 });

    // Build NutritionProfile for the engine
    const engineProfile: NutritionProfile = {
      age: profile.age,
      weight_kg: Number(profile.weight_kg),
      height_cm: Number(profile.height_cm),
      sex: profile.sex,
      activity_level: profile.activity_level,
      goal: profile.goal,
      diet_type: profile.diet_type,
      allergies: profile.allergies || [],
      medical_conditions: profile.medical_conditions || [],
      weekly_target_kg: Number(profile.weekly_target_kg) || 0.5,
    };

    // Generate the plan
    const plan = await generateWeeklyPlan(engineProfile);

    // Calculate week start (next Monday)
    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysUntilMonday = dayOfWeek === 0 ? 1 : dayOfWeek === 1 ? 0 : 8 - dayOfWeek;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() + daysUntilMonday);
    const weekStartStr = weekStart.toISOString().slice(0, 10);

    // Deactivate old plans
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("meal_plans") as any)
      .update({ active: false })
      .eq("user_id", userId);

    // Calculate week end (Sunday)
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekEndStr = weekEnd.toISOString().slice(0, 10);

    // Save new plan
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("meal_plans") as any).insert({
      user_id: userId,
      week_start: weekStartStr,
      week_end: weekEndStr,
      plan: { days: plan.days },
      total_calories_avg: plan.avg_daily_calories,
      shopping_list: plan.shopping_list,
      active: true,
    });

    return NextResponse.json({
      ok: true,
      avg_daily_calories: plan.avg_daily_calories,
      days_count: plan.days.length,
      shopping_items: plan.shopping_list.length,
    });
  } catch (err) {
    console.error("[generate-plan] Error:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
