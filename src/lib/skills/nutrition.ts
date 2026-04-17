import OpenAI from "openai";
import { getServiceRoleClient } from "@/lib/supabase/service";
import {
  calculateFullProfile,
  checkMedicalConditions,
  validateWeightChange,
  getMinCalories,
  NUTRITION_DISCLAIMER,
  NUTRITION_SAFETY_RULES,
  type NutritionProfile,
  type Sex,
  type ActivityLevel,
  type Goal,
  type DietType,
} from "@/lib/nutrition/engine";
import {
  generateWeeklyPlan,
  generateSingleMeal,
  generateShoppingList,
} from "@/lib/nutrition/meal-planner";

const supabase = getServiceRoleClient();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// ══════════════════════════════════════
// TOOLS DEFINITION
// ══════════════════════════════════════

export const NUTRITION_TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "nutrition_setup",
      description: "Set up or update the user's nutrition profile. Collect: age, weight_kg, height_cm, sex, activity_level, goal, diet_type, allergies. Use when user wants to start tracking nutrition or update their profile.",
      parameters: {
        type: "object",
        properties: {
          age: { type: "number", description: "User age (13-120)" },
          weight_kg: { type: "number", description: "Current weight in kg" },
          height_cm: { type: "number", description: "Height in cm" },
          sex: { type: "string", enum: ["male", "female"], description: "Biological sex for BMR calculation" },
          activity_level: { type: "string", enum: ["sedentary", "light", "moderate", "active", "very_active"], description: "Physical activity level" },
          goal: { type: "string", enum: ["lose", "maintain", "gain"], description: "Weight goal" },
          diet_type: { type: "string", enum: ["balanced", "keto", "vegetarian", "vegan", "mediterranean", "paleo", "pescatarian"], description: "Diet preference (default: balanced)" },
          allergies: { type: "array", items: { type: "string" }, description: "Food allergies (e.g. gluten, lactose, nuts, shellfish)" },
          medical_conditions: { type: "array", items: { type: "string" }, description: "Medical conditions (e.g. diabetes, kidney_disease)" },
          weekly_target_kg: { type: "number", description: "Weekly weight change target in kg (0.25-1.0, default 0.5)" },
        },
        required: ["age", "weight_kg", "height_cm", "sex", "activity_level", "goal"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "nutrition_plan",
      description: "Generate a personalized weekly meal plan based on the user's nutrition profile. Requires an active nutrition profile.",
      parameters: {
        type: "object",
        properties: {
          preferences: { type: "string", description: "Additional preferences like cuisine type, quick meals, etc." },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "nutrition_log",
      description: "Log food the user has eaten. Track calories and macros. Use when user tells you what they ate.",
      parameters: {
        type: "object",
        properties: {
          meal_type: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"], description: "Type of meal" },
          food_name: { type: "string", description: "Name/description of the food" },
          quantity_g: { type: "number", description: "Approximate quantity in grams" },
          calories: { type: "number", description: "Estimated calories" },
          protein_g: { type: "number", description: "Protein in grams" },
          carbs_g: { type: "number", description: "Carbs in grams" },
          fat_g: { type: "number", description: "Fat in grams" },
          fiber_g: { type: "number", description: "Fiber in grams" },
        },
        required: ["meal_type", "food_name", "calories"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "nutrition_log_photo",
      description: "Log food from a photo description. The AI estimates calories and macros from the described food. Use when user shares a photo of their meal.",
      parameters: {
        type: "object",
        properties: {
          photo_description: { type: "string", description: "Description of the food in the photo" },
          meal_type: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"], description: "Type of meal" },
        },
        required: ["photo_description", "meal_type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "nutrition_progress",
      description: "Show daily nutrition progress: calories consumed vs target, macros breakdown, water intake. Use when user asks about their nutrition today.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "Date to check (YYYY-MM-DD, default: today)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "nutrition_water",
      description: "Log water intake. Use when user says they drank water.",
      parameters: {
        type: "object",
        properties: {
          amount_ml: { type: "number", description: "Amount of water in ml (default: 250 = 1 glass)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "nutrition_weight",
      description: "Log current weight and show weight trend. Use when user reports their weight or asks about weight progress.",
      parameters: {
        type: "object",
        properties: {
          weight_kg: { type: "number", description: "Current weight in kg (required to log, omit to just see trend)" },
          body_fat_pct: { type: "number", description: "Body fat percentage if known" },
          notes: { type: "string", description: "Optional notes" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "nutrition_shopping",
      description: "Get the shopping list from the active meal plan. Use when user asks what to buy for their plan.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "nutrition_recipe",
      description: "Generate a single recipe matching the user's nutrition constraints. Use when user asks for a specific meal idea.",
      parameters: {
        type: "object",
        properties: {
          meal_type: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"], description: "Type of meal" },
          target_calories: { type: "number", description: "Target calories for this meal (optional, calculated from profile if omitted)" },
          preferences: { type: "string", description: "Specific preferences (e.g. quick, pasta, Asian, etc.)" },
        },
        required: ["meal_type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "nutrition_adjust",
      description: "Adjust the user's calorie target within safety limits. Use when user wants to change their daily calories.",
      parameters: {
        type: "object",
        properties: {
          new_target_calories: { type: "number", description: "New daily calorie target" },
          reason: { type: "string", description: "Reason for adjustment" },
        },
        required: ["new_target_calories"],
      },
    },
  },
];

// ══════════════════════════════════════
// EXECUTION
// ══════════════════════════════════════

export async function executeNutritionTool(
  toolName: string,
  input: Record<string, unknown>,
  userId: string,
): Promise<string> {
  try {
    switch (toolName) {
      case "nutrition_setup": return await doSetup(userId, input);
      case "nutrition_plan": return await doPlan(userId, input);
      case "nutrition_log": return await doLog(userId, input);
      case "nutrition_log_photo": return await doLogPhoto(userId, input);
      case "nutrition_progress": return await doProgress(userId, input);
      case "nutrition_water": return await doWater(userId, input);
      case "nutrition_weight": return await doWeight(userId, input);
      case "nutrition_shopping": return await doShopping(userId);
      case "nutrition_recipe": return await doRecipe(userId, input);
      case "nutrition_adjust": return await doAdjust(userId, input);
      default: return JSON.stringify({ error: `Unknown nutrition tool: ${toolName}` });
    }
  } catch (err) {
    console.error(`[Nutrition] ${toolName} error:`, err);
    return JSON.stringify({ error: `Error executing ${toolName}: ${(err as Error).message}` }) + NUTRITION_DISCLAIMER;
  }
}

// ── Helpers ──

async function getProfile(userId: string) {
  const { data } = await supabase
    .from("nutrition_profiles")
    .select("*")
    .eq("user_id", userId)
    .eq("active", true)
    .single();
  return data;
}

function buildMedicalCheck(conditions: string[]): string {
  if (!conditions || conditions.length === 0) return "";
  const check = checkMedicalConditions(conditions);
  return check.needsReferral ? `\n\n${check.message}` : "";
}

// ── Tool Implementations ──

async function doSetup(userId: string, input: Record<string, unknown>): Promise<string> {
  const conditions = (input.medical_conditions as string[]) || [];
  const medicalCheck = buildMedicalCheck(conditions);

  const profile: NutritionProfile = {
    age: input.age as number,
    weight_kg: input.weight_kg as number,
    height_cm: input.height_cm as number,
    sex: input.sex as Sex,
    activity_level: input.activity_level as ActivityLevel,
    goal: input.goal as Goal,
    diet_type: (input.diet_type as DietType) || "balanced",
    allergies: (input.allergies as string[]) || [],
    medical_conditions: conditions,
    weekly_target_kg: (input.weekly_target_kg as number) || 0.5,
  };

  const targets = calculateFullProfile(profile);

  const row = {
    user_id: userId,
    age: profile.age,
    weight_kg: profile.weight_kg,
    height_cm: profile.height_cm,
    sex: profile.sex,
    activity_level: profile.activity_level,
    goal: profile.goal,
    diet_type: profile.diet_type,
    allergies: profile.allergies,
    medical_conditions: profile.medical_conditions,
    weekly_target_kg: profile.weekly_target_kg,
    bmr: targets.bmr,
    tdee: targets.tdee,
    target_calories: targets.target_calories,
    target_protein_g: targets.macros.protein_g,
    target_carbs_g: targets.macros.carbs_g,
    target_fat_g: targets.macros.fat_g,
    target_fiber_g: targets.macros.fiber_g,
    target_water_ml: targets.target_water_ml,
    active: true,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("nutrition_profiles")
    .upsert(row, { onConflict: "user_id" });

  if (error) throw new Error(`Failed to save profile: ${error.message}`);

  // Also log initial weight
  await supabase.from("weight_log").upsert({
    user_id: userId,
    weight_kg: profile.weight_kg,
    logged_at: new Date().toISOString().split("T")[0],
  }, { onConflict: "user_id,logged_at" });

  return JSON.stringify({
    success: true,
    profile: {
      bmr: targets.bmr,
      tdee: targets.tdee,
      target_calories: targets.target_calories,
      min_calories: targets.min_calories,
      macros: targets.macros,
      target_water_ml: targets.target_water_ml,
      goal: profile.goal,
      diet_type: profile.diet_type,
      allergies: profile.allergies,
    },
    medicalWarning: medicalCheck || undefined,
  }) + NUTRITION_DISCLAIMER;
}

async function doPlan(userId: string, input: Record<string, unknown>): Promise<string> {
  const profile = await getProfile(userId);
  if (!profile) return JSON.stringify({ error: "No nutrition profile found. Use nutrition_setup first." }) + NUTRITION_DISCLAIMER;

  const medicalCheck = buildMedicalCheck(profile.medical_conditions || []);

  const plan = await generateWeeklyPlan({
    age: profile.age,
    weight_kg: profile.weight_kg,
    height_cm: profile.height_cm,
    sex: profile.sex,
    activity_level: profile.activity_level,
    goal: profile.goal,
    diet_type: profile.diet_type,
    allergies: profile.allergies || [],
    medical_conditions: profile.medical_conditions || [],
    weekly_target_kg: profile.weekly_target_kg || 0.5,
  });

  // Deactivate old plans
  await supabase
    .from("meal_plans")
    .update({ active: false })
    .eq("user_id", userId)
    .eq("active", true);

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay() + 1); // Monday
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

  return JSON.stringify({
    success: true,
    plan: plan.days,
    avg_daily_calories: plan.avg_daily_calories,
    shopping_list_count: plan.shopping_list.length,
    medicalWarning: medicalCheck || undefined,
  }) + NUTRITION_DISCLAIMER;
}

async function doLog(userId: string, input: Record<string, unknown>): Promise<string> {
  const profile = await getProfile(userId);
  const medicalCheck = profile ? buildMedicalCheck(profile.medical_conditions || []) : "";

  const { error } = await supabase.from("nutrition_log").insert({
    user_id: userId,
    meal_type: input.meal_type as string,
    food_name: input.food_name as string,
    quantity_g: (input.quantity_g as number) || null,
    calories: input.calories as number,
    protein_g: (input.protein_g as number) || 0,
    carbs_g: (input.carbs_g as number) || 0,
    fat_g: (input.fat_g as number) || 0,
    fiber_g: (input.fiber_g as number) || 0,
    source: "manual",
  });

  if (error) throw new Error(`Failed to log food: ${error.message}`);

  // Get today's totals
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const { data: todayLogs } = await supabase
    .from("nutrition_log")
    .select("calories, protein_g, carbs_g, fat_g")
    .eq("user_id", userId)
    .gte("logged_at", todayStart.toISOString());

  const totals = (todayLogs || []).reduce(
    (acc, l) => ({
      calories: acc.calories + (l.calories || 0),
      protein_g: acc.protein_g + (l.protein_g || 0),
      carbs_g: acc.carbs_g + (l.carbs_g || 0),
      fat_g: acc.fat_g + (l.fat_g || 0),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );

  return JSON.stringify({
    success: true,
    logged: {
      food: input.food_name,
      calories: input.calories,
      meal_type: input.meal_type,
    },
    today_totals: totals,
    target_calories: profile?.target_calories || null,
    remaining_calories: profile ? Math.max(0, profile.target_calories - totals.calories) : null,
    medicalWarning: medicalCheck || undefined,
  }) + NUTRITION_DISCLAIMER;
}

async function doLogPhoto(userId: string, input: Record<string, unknown>): Promise<string> {
  const profile = await getProfile(userId);
  const medicalCheck = profile ? buildMedicalCheck(profile.medical_conditions || []) : "";
  const description = input.photo_description as string;
  const mealType = input.meal_type as string;

  // Use AI to estimate nutritional values
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are a nutrition expert. Estimate the nutritional content of food described. Return ONLY valid JSON with: food_name, calories, protein_g, carbs_g, fat_g, fiber_g, quantity_g (estimated total weight).",
      },
      {
        role: "user",
        content: `Estimate the nutrition for this meal: ${description}`,
      },
    ],
    temperature: 0.3,
    max_tokens: 300,
    response_format: { type: "json_object" },
  });

  const estimated = JSON.parse(res.choices[0]?.message?.content || "{}");

  const { error } = await supabase.from("nutrition_log").insert({
    user_id: userId,
    meal_type: mealType,
    food_name: estimated.food_name || description,
    quantity_g: estimated.quantity_g || null,
    calories: estimated.calories || 0,
    protein_g: estimated.protein_g || 0,
    carbs_g: estimated.carbs_g || 0,
    fat_g: estimated.fat_g || 0,
    fiber_g: estimated.fiber_g || 0,
    source: "photo",
  });

  if (error) throw new Error(`Failed to log photo food: ${error.message}`);

  return JSON.stringify({
    success: true,
    estimated,
    note: "These are AI estimates based on the food description. Actual values may vary.",
    medicalWarning: medicalCheck || undefined,
  }) + NUTRITION_DISCLAIMER;
}

async function doProgress(userId: string, input: Record<string, unknown>): Promise<string> {
  const profile = await getProfile(userId);
  if (!profile) return JSON.stringify({ error: "No nutrition profile found. Use nutrition_setup first." }) + NUTRITION_DISCLAIMER;

  const medicalCheck = buildMedicalCheck(profile.medical_conditions || []);

  const dateStr = (input.date as string) || new Date().toISOString().split("T")[0];
  const dayStart = `${dateStr}T00:00:00.000Z`;
  const dayEnd = `${dateStr}T23:59:59.999Z`;

  const [foodLogs, waterLogs] = await Promise.all([
    supabase
      .from("nutrition_log")
      .select("*")
      .eq("user_id", userId)
      .gte("logged_at", dayStart)
      .lte("logged_at", dayEnd)
      .then((r) => r.data || []),
    supabase
      .from("water_log")
      .select("amount_ml")
      .eq("user_id", userId)
      .gte("logged_at", dayStart)
      .lte("logged_at", dayEnd)
      .then((r) => r.data || []),
  ]);

  const consumed = foodLogs.reduce(
    (acc, l) => ({
      calories: acc.calories + (l.calories || 0),
      protein_g: acc.protein_g + (l.protein_g || 0),
      carbs_g: acc.carbs_g + (l.carbs_g || 0),
      fat_g: acc.fat_g + (l.fat_g || 0),
      fiber_g: acc.fiber_g + (l.fiber_g || 0),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 },
  );

  const waterTotal = waterLogs.reduce((s, w) => s + (w.amount_ml || 0), 0);

  const meals = foodLogs.map((l) => ({
    meal_type: l.meal_type,
    food_name: l.food_name,
    calories: l.calories,
    time: l.logged_at,
  }));

  return JSON.stringify({
    date: dateStr,
    consumed,
    targets: {
      calories: profile.target_calories,
      protein_g: profile.target_protein_g,
      carbs_g: profile.target_carbs_g,
      fat_g: profile.target_fat_g,
      fiber_g: profile.target_fiber_g,
    },
    remaining_calories: Math.max(0, profile.target_calories - consumed.calories),
    water: {
      consumed_ml: waterTotal,
      target_ml: profile.target_water_ml,
      glasses: Math.floor(waterTotal / 250),
      target_glasses: Math.ceil(profile.target_water_ml / 250),
    },
    meals,
    meal_count: meals.length,
    medicalWarning: medicalCheck || undefined,
  }) + NUTRITION_DISCLAIMER;
}

async function doWater(userId: string, input: Record<string, unknown>): Promise<string> {
  const amount = (input.amount_ml as number) || 250;

  await supabase.from("water_log").insert({
    user_id: userId,
    amount_ml: amount,
  });

  // Today's total
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const { data: logs } = await supabase
    .from("water_log")
    .select("amount_ml")
    .eq("user_id", userId)
    .gte("logged_at", todayStart.toISOString());

  const total = (logs || []).reduce((s, l) => s + (l.amount_ml || 0), 0);
  const profile = await getProfile(userId);
  const target = profile?.target_water_ml || 2500;

  return JSON.stringify({
    success: true,
    logged_ml: amount,
    today_total_ml: total,
    target_ml: target,
    glasses: Math.floor(total / 250),
    target_glasses: Math.ceil(target / 250),
    progress_pct: Math.round((total / target) * 100),
  }) + NUTRITION_DISCLAIMER;
}

async function doWeight(userId: string, input: Record<string, unknown>): Promise<string> {
  const profile = await getProfile(userId);
  const medicalCheck = profile ? buildMedicalCheck(profile.medical_conditions || []) : "";
  const weightKg = input.weight_kg as number | undefined;

  // Log new weight if provided
  if (weightKg) {
    await supabase.from("weight_log").upsert({
      user_id: userId,
      weight_kg: weightKg,
      body_fat_pct: (input.body_fat_pct as number) || null,
      notes: (input.notes as string) || null,
      logged_at: new Date().toISOString().split("T")[0],
    }, { onConflict: "user_id,logged_at" });

    // Update profile weight
    if (profile) {
      await supabase
        .from("nutrition_profiles")
        .update({
          weight_kg: weightKg,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
    }
  }

  // Get weight history (last 30 entries)
  const { data: history } = await supabase
    .from("weight_log")
    .select("weight_kg, body_fat_pct, logged_at")
    .eq("user_id", userId)
    .order("logged_at", { ascending: false })
    .limit(30);

  const entries = history || [];
  let safetyCheck = null;

  if (entries.length >= 2) {
    const latest = entries[0];
    const previous = entries[1];
    const daysDiff = Math.max(1,
      (new Date(latest.logged_at).getTime() - new Date(previous.logged_at).getTime()) / (1000 * 60 * 60 * 24),
    );
    safetyCheck = validateWeightChange(latest.weight_kg, previous.weight_kg, daysDiff);
  }

  return JSON.stringify({
    success: weightKg ? true : undefined,
    logged_kg: weightKg || undefined,
    history: entries.slice(0, 10),
    total_entries: entries.length,
    safety_check: safetyCheck,
    starting_weight: entries.length > 0 ? entries[entries.length - 1].weight_kg : null,
    current_weight: entries.length > 0 ? entries[0].weight_kg : null,
    total_change_kg: entries.length > 1
      ? Math.round((entries[0].weight_kg - entries[entries.length - 1].weight_kg) * 10) / 10
      : null,
    medicalWarning: medicalCheck || undefined,
  }) + NUTRITION_DISCLAIMER;
}

async function doShopping(userId: string): Promise<string> {
  const profile = await getProfile(userId);
  if (!profile) return JSON.stringify({ error: "No nutrition profile found." }) + NUTRITION_DISCLAIMER;

  const { data: plan } = await supabase
    .from("meal_plans")
    .select("*")
    .eq("user_id", userId)
    .eq("active", true)
    .single();

  if (!plan) return JSON.stringify({ error: "No active meal plan. Use nutrition_plan to generate one." }) + NUTRITION_DISCLAIMER;

  return JSON.stringify({
    shopping_list: plan.shopping_list || [],
    week: `${plan.week_start} to ${plan.week_end}`,
  }) + NUTRITION_DISCLAIMER;
}

async function doRecipe(userId: string, input: Record<string, unknown>): Promise<string> {
  const profile = await getProfile(userId);
  const medicalCheck = profile ? buildMedicalCheck(profile.medical_conditions || []) : "";

  const mealType = input.meal_type as "breakfast" | "lunch" | "dinner" | "snack";
  let targetCal = input.target_calories as number | undefined;

  // Calculate from profile if not provided
  if (!targetCal && profile) {
    const calMap = { breakfast: 0.25, lunch: 0.35, dinner: 0.30, snack: 0.10 };
    targetCal = Math.round(profile.target_calories * calMap[mealType]);
  }

  const recipe = await generateSingleMeal(mealType, targetCal || 500, {
    diet_type: profile?.diet_type,
    allergies: profile?.allergies,
    preferences: input.preferences as string,
  });

  return JSON.stringify({
    recipe,
    medicalWarning: medicalCheck || undefined,
  }) + NUTRITION_DISCLAIMER;
}

async function doAdjust(userId: string, input: Record<string, unknown>): Promise<string> {
  const profile = await getProfile(userId);
  if (!profile) return JSON.stringify({ error: "No nutrition profile found. Use nutrition_setup first." }) + NUTRITION_DISCLAIMER;

  const medicalCheck = buildMedicalCheck(profile.medical_conditions || []);
  const newTarget = input.new_target_calories as number;
  const minCal = getMinCalories(profile.sex);

  if (newTarget < minCal) {
    return JSON.stringify({
      error: `Cannot set calories below ${minCal} kcal (safety minimum for ${profile.sex}). This is a hard safety limit.`,
      min_calories: minCal,
      requested: newTarget,
    }) + NUTRITION_DISCLAIMER;
  }

  // Recalculate macros for new target
  const { calculateMacros } = await import("@/lib/nutrition/engine");
  const macros = calculateMacros(newTarget, profile.weight_kg, profile.goal);

  const { error } = await supabase
    .from("nutrition_profiles")
    .update({
      target_calories: newTarget,
      target_protein_g: macros.protein_g,
      target_carbs_g: macros.carbs_g,
      target_fat_g: macros.fat_g,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (error) throw new Error(`Failed to adjust: ${error.message}`);

  return JSON.stringify({
    success: true,
    previous_calories: profile.target_calories,
    new_calories: newTarget,
    new_macros: macros,
    reason: (input.reason as string) || "User requested adjustment",
    medicalWarning: medicalCheck || undefined,
  }) + NUTRITION_DISCLAIMER;
}
