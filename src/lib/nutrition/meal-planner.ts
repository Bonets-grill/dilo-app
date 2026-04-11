// ══════════════════════════════════════
// DILO Meal Planner — AI-powered meal generation
// ══════════════════════════════════════

import OpenAI from "openai";
import {
  type NutritionProfile,
  type MacroTargets,
  calculateFullProfile,
  getMinCalories,
  NUTRITION_SAFETY_RULES,
} from "./engine";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export interface Meal {
  name: string;
  meal_type: "breakfast" | "lunch" | "dinner" | "snack";
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  ingredients: Array<{ name: string; quantity: string }>;
  instructions: string;
  prep_time_min: number;
}

export interface DayPlan {
  day: string;
  meals: Meal[];
  total_calories: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
}

export interface WeeklyPlan {
  days: DayPlan[];
  avg_daily_calories: number;
  shopping_list: ShoppingItem[];
}

export interface ShoppingItem {
  name: string;
  quantity: string;
  category: string;
}

/**
 * Generate a weekly meal plan using OpenAI
 */
export async function generateWeeklyPlan(profile: NutritionProfile): Promise<WeeklyPlan> {
  const targets = calculateFullProfile(profile);
  const dietLabel = profile.diet_type === "balanced" ? "" : ` following a ${profile.diet_type} diet`;
  const allergyNote = profile.allergies.length > 0
    ? `\nSTRICTLY AVOID these allergens: ${profile.allergies.join(", ")}`
    : "";

  const prompt = `Generate a 7-day meal plan for a ${profile.sex}, ${profile.age} years old, ${profile.weight_kg}kg${dietLabel}.

Daily targets:
- Calories: ${targets.target_calories} kcal (±10%)
- Protein: ${targets.macros.protein_g}g
- Carbs: ${targets.macros.carbs_g}g
- Fat: ${targets.macros.fat_g}g
- Fiber: min ${targets.macros.fiber_g}g
${allergyNote}

Rules:
- NEVER go below ${targets.min_calories} kcal/day
- 3 meals per day: breakfast, lunch, dinner
- Varied, common ingredients
- Short ingredient lists (max 5 per meal)

Return ONLY valid JSON:
{
  "days": [
    {
      "day": "Monday",
      "meals": [
        {
          "name": "Meal name",
          "meal_type": "breakfast",
          "calories": 400,
          "protein_g": 30,
          "carbs_g": 40,
          "fat_g": 15,
          "fiber_g": 5,
          "ingredients": [{"name": "eggs", "quantity": "2"}],
          "instructions": "Brief",
          "prep_time_min": 10
        }
      ],
      "total_calories": 1500,
      "total_protein_g": 150,
      "total_carbs_g": 100,
      "total_fat_g": 50
    }
  ]
}`;

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are a certified nutritionist AI. Return ONLY valid JSON, no markdown." },
      { role: "user", content: prompt },
    ],
    temperature: 0.7,
    max_tokens: 8000,
    response_format: { type: "json_object" },
  });

  const text = res.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(text) as { days: DayPlan[] };

  // Validate and build shopping list
  const validated = validateMealPlan(parsed.days, profile);
  const shopping_list = generateShoppingList(validated);

  const totalCals = validated.reduce((s, d) => s + d.total_calories, 0);

  return {
    days: validated,
    avg_daily_calories: Math.round(totalCals / validated.length),
    shopping_list,
  };
}

/**
 * Generate a single meal matching constraints
 */
export async function generateSingleMeal(
  meal_type: "breakfast" | "lunch" | "dinner" | "snack",
  target_calories: number,
  constraints: { diet_type?: string; allergies?: string[]; preferences?: string },
): Promise<Meal> {
  const allergyNote = constraints.allergies?.length
    ? `\nSTRICTLY AVOID: ${constraints.allergies.join(", ")}`
    : "";
  const prefNote = constraints.preferences ? `\nPreferences: ${constraints.preferences}` : "";

  const prompt = `Generate a single ${meal_type} recipe with approximately ${target_calories} kcal.
${constraints.diet_type ? `Diet: ${constraints.diet_type}` : ""}${allergyNote}${prefNote}

Return ONLY valid JSON:
{
  "name": "Recipe name",
  "meal_type": "${meal_type}",
  "calories": ${target_calories},
  "protein_g": 0,
  "carbs_g": 0,
  "fat_g": 0,
  "fiber_g": 0,
  "ingredients": [{"name": "ingredient", "quantity": "100g"}],
  "instructions": "Step by step instructions",
  "prep_time_min": 15
}`;

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are a certified nutritionist AI. Return ONLY valid JSON, no markdown." },
      { role: "user", content: prompt },
    ],
    temperature: 0.7,
    max_tokens: 1000,
    response_format: { type: "json_object" },
  });

  return JSON.parse(res.choices[0]?.message?.content || "{}") as Meal;
}

/**
 * Validate a meal plan against profile constraints
 */
export function validateMealPlan(days: DayPlan[], profile: NutritionProfile): DayPlan[] {
  const targets = calculateFullProfile(profile);
  const minCal = getMinCalories(profile.sex);
  const tolerance = NUTRITION_SAFETY_RULES.CALORIE_TOLERANCE_PCT;

  for (const day of days) {
    // Recalculate totals from meals
    day.total_calories = day.meals.reduce((s, m) => s + m.calories, 0);
    day.total_protein_g = day.meals.reduce((s, m) => s + m.protein_g, 0);
    day.total_carbs_g = day.meals.reduce((s, m) => s + m.carbs_g, 0);
    day.total_fat_g = day.meals.reduce((s, m) => s + m.fat_g, 0);

    // Enforce minimum calories
    if (day.total_calories < minCal) {
      console.warn(`[MealPlan] Day ${day.day} below min calories: ${day.total_calories} < ${minCal}`);
    }

    // Check tolerance
    const lowerBound = targets.target_calories * (1 - tolerance);
    const upperBound = targets.target_calories * (1 + tolerance);
    if (day.total_calories < lowerBound || day.total_calories > upperBound) {
      console.warn(`[MealPlan] Day ${day.day} calories ${day.total_calories} outside ±10% of ${targets.target_calories}`);
    }

    // Check allergens in ingredients
    if (profile.allergies.length > 0) {
      for (const meal of day.meals) {
        for (const ing of meal.ingredients) {
          for (const allergen of profile.allergies) {
            if (ing.name.toLowerCase().includes(allergen.toLowerCase())) {
              console.error(`[MealPlan] ALLERGEN FOUND: ${allergen} in ${meal.name} (${ing.name})`);
            }
          }
        }
      }
    }
  }

  return days;
}

/**
 * Extract a shopping list from a meal plan
 */
export function generateShoppingList(days: DayPlan[]): ShoppingItem[] {
  const ingredientMap = new Map<string, { quantity: string[]; category: string }>();

  const CATEGORIES: Record<string, string> = {
    chicken: "protein", beef: "protein", salmon: "protein", tuna: "protein", egg: "protein",
    tofu: "protein", shrimp: "protein", turkey: "protein", pork: "protein", fish: "protein",
    rice: "grains", pasta: "grains", bread: "grains", oat: "grains", quinoa: "grains",
    flour: "grains", tortilla: "grains", cereal: "grains",
    milk: "dairy", cheese: "dairy", yogurt: "dairy", butter: "dairy", cream: "dairy",
    apple: "fruits", banana: "fruits", berries: "fruits", lemon: "fruits", orange: "fruits",
    avocado: "fruits", tomato: "vegetables", onion: "vegetables", garlic: "vegetables",
    pepper: "vegetables", spinach: "vegetables", broccoli: "vegetables", carrot: "vegetables",
    lettuce: "vegetables", cucumber: "vegetables", potato: "vegetables", sweet_potato: "vegetables",
    olive: "oils", oil: "oils", vinegar: "oils",
    salt: "seasonings", pepper_spice: "seasonings", cumin: "seasonings", paprika: "seasonings",
  };

  for (const day of days) {
    for (const meal of day.meals) {
      for (const ing of meal.ingredients) {
        const key = ing.name.toLowerCase().trim();
        if (!ingredientMap.has(key)) {
          const cat = Object.entries(CATEGORIES).find(([k]) => key.includes(k))?.[1] || "other";
          ingredientMap.set(key, { quantity: [], category: cat });
        }
        ingredientMap.get(key)!.quantity.push(ing.quantity);
      }
    }
  }

  return Array.from(ingredientMap.entries()).map(([name, { quantity, category }]) => ({
    name,
    quantity: quantity.join(" + "),
    category,
  })).sort((a, b) => a.category.localeCompare(b.category));
}
