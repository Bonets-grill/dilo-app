// ══════════════════════════════════════
// DILO Nutrition Engine — Scientific Formulas
// ══════════════════════════════════════

export type Sex = "male" | "female";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";
export type Goal = "lose" | "maintain" | "gain";
export type DietType = "balanced" | "keto" | "vegetarian" | "vegan" | "mediterranean" | "paleo" | "pescatarian";

export interface NutritionProfile {
  age: number;
  weight_kg: number;
  height_cm: number;
  sex: Sex;
  activity_level: ActivityLevel;
  goal: Goal;
  diet_type: DietType;
  allergies: string[];
  medical_conditions: string[];
  weekly_target_kg: number;
}

export interface MacroTargets {
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
}

export interface FullProfileTargets {
  bmr: number;
  tdee: number;
  target_calories: number;
  macros: MacroTargets;
  target_water_ml: number;
  min_calories: number;
}

// ── Safety Constants ──

export const NUTRITION_SAFETY_RULES = {
  MIN_CALORIES_FEMALE: 1200,
  MIN_CALORIES_MALE: 1500,
  MAX_WEIGHT_LOSS_PCT_PER_WEEK: 1.0,
  MAX_DEFICIT_KCAL: 1000,
  MAX_SURPLUS_KCAL: 500,
  MIN_PROTEIN_G_PER_KG: 1.6,
  MAX_PROTEIN_G_PER_KG: 2.2,
  MIN_FAT_PCT: 0.25,
  MAX_FAT_PCT: 0.35,
  MIN_FIBER_G: 25,
  MAX_FIBER_G: 40,
  DEFAULT_WATER_ML: 2500,
  WATER_ML_PER_KG: 33,
  CALORIE_TOLERANCE_PCT: 0.10,
} as const;

export const NUTRITION_DISCLAIMER =
  "\n\n_Disclaimer: This information is for general guidance only and is NOT a substitute for professional medical or nutritional advice. Consult a registered dietitian or doctor before making significant dietary changes. DILO does not provide medical diagnoses or treatment._";

export const MEDICAL_CONDITIONS_REQUIRING_REFERRAL = [
  "diabetes",
  "kidney_disease",
  "eating_disorder",
  "anorexia",
  "bulimia",
  "celiac",
  "crohn",
  "ibs",
  "heart_disease",
  "liver_disease",
  "cancer",
  "pregnant",
  "breastfeeding",
];

// ── Activity Multipliers ──

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

// ── Core Formulas ──

/**
 * Mifflin-St Jeor equation for BMR
 * Male: 10 x weight(kg) + 6.25 x height(cm) - 5 x age - 5
 * Female: 10 x weight(kg) + 6.25 x height(cm) - 5 x age - 161
 */
export function calculateBMR(weight_kg: number, height_cm: number, age: number, sex: Sex): number {
  const base = 10 * weight_kg + 6.25 * height_cm - 5 * age;
  return sex === "male" ? base - 5 : base - 161;
}

/**
 * Total Daily Energy Expenditure = BMR x activity multiplier
 */
export function calculateTDEE(bmr: number, activity_level: ActivityLevel): number {
  return bmr * ACTIVITY_MULTIPLIERS[activity_level];
}

/**
 * Get minimum safe calories by sex
 */
export function getMinCalories(sex: Sex): number {
  return sex === "female"
    ? NUTRITION_SAFETY_RULES.MIN_CALORIES_FEMALE
    : NUTRITION_SAFETY_RULES.MIN_CALORIES_MALE;
}

/**
 * Target calories based on goal, NEVER below minimum
 */
export function calculateTargetCalories(
  tdee: number,
  goal: Goal,
  sex: Sex,
  weekly_target_kg: number = 0.5,
): number {
  const minCal = getMinCalories(sex);
  let target: number;

  switch (goal) {
    case "lose": {
      // 1 kg fat ~ 7700 kcal, so weekly_target_kg * 7700 / 7 = daily deficit
      const deficit = Math.min((weekly_target_kg * 7700) / 7, NUTRITION_SAFETY_RULES.MAX_DEFICIT_KCAL);
      target = tdee - deficit;
      break;
    }
    case "gain": {
      const surplus = Math.min((weekly_target_kg * 7700) / 7, NUTRITION_SAFETY_RULES.MAX_SURPLUS_KCAL);
      target = tdee + surplus;
      break;
    }
    case "maintain":
    default:
      target = tdee;
  }

  // NEVER go below minimum
  return Math.max(Math.round(target), minCal);
}

/**
 * Calculate macro targets based on calories, weight and goal
 */
export function calculateMacros(target_calories: number, weight_kg: number, goal: Goal): MacroTargets {
  // Protein: 1.6-2.2 g/kg (higher for lose/gain, lower for maintain)
  const proteinPerKg = goal === "maintain"
    ? NUTRITION_SAFETY_RULES.MIN_PROTEIN_G_PER_KG
    : NUTRITION_SAFETY_RULES.MAX_PROTEIN_G_PER_KG;
  const protein_g = Math.round(weight_kg * proteinPerKg);

  // Fat: 25-35% of calories (4 cal/g protein, 9 cal/g fat, 4 cal/g carbs)
  const fatPct = goal === "lose" ? NUTRITION_SAFETY_RULES.MIN_FAT_PCT : 0.30;
  const fat_g = Math.round((target_calories * fatPct) / 9);

  // Carbs: remainder
  const proteinCals = protein_g * 4;
  const fatCals = fat_g * 9;
  const carbs_g = Math.round(Math.max(0, (target_calories - proteinCals - fatCals) / 4));

  // Fiber
  const fiber_g = NUTRITION_SAFETY_RULES.MIN_FIBER_G;

  return { protein_g, carbs_g, fat_g, fiber_g };
}

/**
 * Validate weight change is safe (max 1% body weight per week)
 */
export function validateWeightChange(
  current_kg: number,
  previous_kg: number,
  days: number,
): { safe: boolean; weekly_rate_kg: number; max_weekly_kg: number; message: string } {
  const change = Math.abs(current_kg - previous_kg);
  const weekly_rate_kg = days > 0 ? (change / days) * 7 : 0;
  const max_weekly_kg = current_kg * (NUTRITION_SAFETY_RULES.MAX_WEIGHT_LOSS_PCT_PER_WEEK / 100);

  const safe = weekly_rate_kg <= max_weekly_kg;
  const direction = current_kg < previous_kg ? "loss" : "gain";

  return {
    safe,
    weekly_rate_kg: Math.round(weekly_rate_kg * 100) / 100,
    max_weekly_kg: Math.round(max_weekly_kg * 100) / 100,
    message: safe
      ? `Weight ${direction} rate is within safe limits (${weekly_rate_kg.toFixed(2)} kg/week)`
      : `WARNING: Weight ${direction} rate (${weekly_rate_kg.toFixed(2)} kg/week) exceeds safe limit of ${max_weekly_kg.toFixed(2)} kg/week (1% body weight). Consider adjusting your plan.`,
  };
}

/**
 * Check for medical conditions requiring professional referral
 */
export function checkMedicalConditions(conditions: string[]): {
  needsReferral: boolean;
  matchedConditions: string[];
  message: string;
} {
  const matched = conditions.filter((c) =>
    MEDICAL_CONDITIONS_REQUIRING_REFERRAL.some((ref) =>
      c.toLowerCase().includes(ref),
    ),
  );

  return {
    needsReferral: matched.length > 0,
    matchedConditions: matched,
    message:
      matched.length > 0
        ? `IMPORTANT: You have reported medical conditions (${matched.join(", ")}) that require supervision by a healthcare professional. The nutrition guidance provided by DILO is general and NOT tailored for these conditions. Please consult a registered dietitian or doctor before following any plan.`
        : "",
  };
}

/**
 * Calculate the full profile targets from raw profile data
 */
export function calculateFullProfile(profile: NutritionProfile): FullProfileTargets {
  const bmr = calculateBMR(profile.weight_kg, profile.height_cm, profile.age, profile.sex);
  const tdee = calculateTDEE(bmr, profile.activity_level);
  const target_calories = calculateTargetCalories(tdee, profile.goal, profile.sex, profile.weekly_target_kg);
  const macros = calculateMacros(target_calories, profile.weight_kg, profile.goal);
  const target_water_ml = Math.round(profile.weight_kg * NUTRITION_SAFETY_RULES.WATER_ML_PER_KG);
  const min_calories = getMinCalories(profile.sex);

  return { bmr: Math.round(bmr), tdee: Math.round(tdee), target_calories, macros, target_water_ml, min_calories };
}
