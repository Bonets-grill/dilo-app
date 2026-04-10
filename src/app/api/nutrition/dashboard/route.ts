import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * Nutrition Dashboard API — returns all data needed for the nutrition tab.
 */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  try {
    const todayStr = new Date().toISOString().split("T")[0];
    const dayStart = `${todayStr}T00:00:00.000Z`;
    const dayEnd = `${todayStr}T23:59:59.999Z`;

    // 7 days ago for weekly stats
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = weekAgo.toISOString();

    const [profileRes, todayFoodRes, todayWaterRes, weekFoodRes, activePlanRes, weightRes] = await Promise.all([
      supabase
        .from("nutrition_profiles")
        .select("*")
        .eq("user_id", userId)
        .eq("active", true)
        .single(),
      supabase
        .from("nutrition_log")
        .select("*")
        .eq("user_id", userId)
        .gte("logged_at", dayStart)
        .lte("logged_at", dayEnd)
        .order("logged_at", { ascending: true }),
      supabase
        .from("water_log")
        .select("amount_ml")
        .eq("user_id", userId)
        .gte("logged_at", dayStart)
        .lte("logged_at", dayEnd),
      supabase
        .from("nutrition_log")
        .select("calories, protein_g, carbs_g, fat_g, logged_at")
        .eq("user_id", userId)
        .gte("logged_at", weekAgoStr),
      supabase
        .from("meal_plans")
        .select("id, week_start, week_end, total_calories_avg, adherence_pct")
        .eq("user_id", userId)
        .eq("active", true)
        .single(),
      supabase
        .from("weight_log")
        .select("weight_kg, logged_at")
        .eq("user_id", userId)
        .order("logged_at", { ascending: false })
        .limit(14),
    ]);

    const profile = profileRes.data;
    if (!profile) {
      return NextResponse.json({ error: "no_profile" }, { status: 404 });
    }

    // Today's intake
    const todayFood = todayFoodRes.data || [];
    const todayWater = todayWaterRes.data || [];

    const todayIntake = todayFood.reduce(
      (acc, l) => ({
        calories: acc.calories + (l.calories || 0),
        protein_g: acc.protein_g + (l.protein_g || 0),
        carbs_g: acc.carbs_g + (l.carbs_g || 0),
        fat_g: acc.fat_g + (l.fat_g || 0),
        fiber_g: acc.fiber_g + (l.fiber_g || 0),
      }),
      { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 },
    );

    const waterTotal = todayWater.reduce((s, w) => s + (w.amount_ml || 0), 0);

    // Weekly stats
    const weekFood = weekFoodRes.data || [];
    const dailyCalories = new Map<string, number>();
    for (const log of weekFood) {
      const day = (log.logged_at as string).split("T")[0];
      dailyCalories.set(day, (dailyCalories.get(day) || 0) + (log.calories || 0));
    }
    const daysLogged = dailyCalories.size;
    const weekAvgCalories = daysLogged > 0
      ? Math.round(Array.from(dailyCalories.values()).reduce((a, b) => a + b, 0) / daysLogged)
      : 0;

    // Weight trend
    const weightHistory = (weightRes.data || []).map((w) => ({
      weight_kg: w.weight_kg,
      date: w.logged_at,
    }));

    return NextResponse.json({
      profile: {
        target_calories: profile.target_calories,
        target_protein_g: profile.target_protein_g,
        target_carbs_g: profile.target_carbs_g,
        target_fat_g: profile.target_fat_g,
        target_fiber_g: profile.target_fiber_g,
        target_water_ml: profile.target_water_ml,
        goal: profile.goal,
        diet_type: profile.diet_type,
      },
      today: {
        intake: todayIntake,
        remaining_calories: Math.max(0, profile.target_calories - todayIntake.calories),
        water_ml: waterTotal,
        water_glasses: Math.floor(waterTotal / 250),
        water_target_glasses: Math.ceil((profile.target_water_ml || 2500) / 250),
        meals: todayFood.map((l) => ({
          id: l.id,
          meal_type: l.meal_type,
          food_name: l.food_name,
          calories: l.calories,
          time: l.logged_at,
        })),
      },
      weekly: {
        avg_calories: weekAvgCalories,
        days_logged: daysLogged,
        adherence_pct: daysLogged > 0
          ? Math.round((weekAvgCalories / profile.target_calories) * 100)
          : 0,
      },
      active_plan: activePlanRes.data
        ? {
            id: activePlanRes.data.id,
            week_start: activePlanRes.data.week_start,
            week_end: activePlanRes.data.week_end,
            avg_calories: activePlanRes.data.total_calories_avg,
          }
        : null,
      weight_trend: weightHistory,
    });
  } catch (err) {
    console.error("[Nutrition Dashboard] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
