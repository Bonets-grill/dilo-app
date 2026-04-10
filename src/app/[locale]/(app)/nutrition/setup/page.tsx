"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { ArrowLeft, ArrowRight, Check, AlertTriangle } from "lucide-react";
import {
  calculateBMR,
  calculateTDEE,
  calculateTargetCalories,
  calculateMacros,
  getMinCalories,
  MEDICAL_CONDITIONS_REQUIRING_REFERRAL,
  type Sex,
  type ActivityLevel,
  type Goal,
  type DietType,
} from "@/lib/nutrition/engine";

const STEPS = ["body", "activity", "goal", "diet", "allergies", "medical", "summary"] as const;

const ALLERGY_OPTIONS = ["gluten", "dairy", "eggs", "peanuts", "tree_nuts", "soy", "shellfish", "fish", "sesame", "lactose"];
const MEDICAL_OPTIONS = ["diabetes", "kidney_disease", "eating_disorder", "pregnant", "breastfeeding", "heart_disease", "celiac", "none"];

export default function NutritionSetupPage() {
  const t = useTranslations("nutrition");
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Form data
  const [age, setAge] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [sex, setSex] = useState<Sex | "">("");
  const [activityLevel, setActivityLevel] = useState<ActivityLevel | "">("");
  const [goal, setGoal] = useState<Goal | "">("");
  const [weeklyTarget, setWeeklyTarget] = useState("0.5");
  const [dietType, setDietType] = useState<DietType>("balanced");
  const [allergies, setAllergies] = useState<string[]>([]);
  const [medicalConditions, setMedicalConditions] = useState<string[]>([]);
  const [dislikedFoods, setDislikedFoods] = useState("");

  const currentStep = STEPS[step];

  function canNext(): boolean {
    switch (currentStep) {
      case "body": return !!age && !!weightKg && !!heightCm && !!sex;
      case "activity": return !!activityLevel;
      case "goal": return !!goal;
      case "diet": return true;
      case "allergies": return true;
      case "medical": return true;
      case "summary": return true;
      default: return false;
    }
  }

  function next() { if (canNext() && step < STEPS.length - 1) setStep(step + 1); }
  function back() { if (step > 0) setStep(step - 1); }

  // Calculate targets for summary
  const numAge = parseInt(age) || 25;
  const numWeight = parseFloat(weightKg) || 70;
  const numHeight = parseFloat(heightCm) || 170;
  const safeSex = (sex || "male") as Sex;
  const safeActivity = (activityLevel || "moderate") as ActivityLevel;
  const safeGoal = (goal || "maintain") as Goal;
  const bmr = calculateBMR(numWeight, numHeight, numAge, safeSex);
  const tdee = calculateTDEE(bmr, safeActivity);
  const targetCal = calculateTargetCalories(tdee, safeGoal, safeSex, parseFloat(weeklyTarget) || 0.5);
  const macros = calculateMacros(targetCal, numWeight, safeGoal);
  const minCal = getMinCalories(safeSex);

  const hasMedicalRisk = medicalConditions.some(c => MEDICAL_CONDITIONS_REQUIRING_REFERRAL.includes(c));

  async function save() {
    setSaving(true);
    setError("");
    const supabase = createBrowserSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Not logged in"); setSaving(false); return; }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // Align with actual DB columns from migration 018
    const { error: dbErr } = await (supabase.from("nutrition_profiles") as any).upsert({
      user_id: user.id,
      age: numAge,
      weight_kg: numWeight,
      height_cm: numHeight,
      sex: safeSex,
      activity_level: safeActivity,
      goal: safeGoal,
      weekly_target_kg: parseFloat(weeklyTarget) || 0.5,
      diet_type: dietType,
      allergies,
      medical_conditions: medicalConditions.filter(c => c !== "none"),
      disliked_foods: dislikedFoods.split(",").map(s => s.trim()).filter(Boolean),
      bmr: Math.round(bmr),
      tdee: Math.round(tdee),
      target_calories: Math.max(Math.round(targetCal), minCal),
      target_protein_g: macros.protein_g,
      target_carbs_g: macros.carbs_g,
      target_fat_g: macros.fat_g,
      target_fiber_g: macros.fiber_g,
      target_water_ml: Math.round(numWeight * 33),
      active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    if (dbErr) { setError(dbErr.message); setSaving(false); return; }

    // Auto-generate first meal plan in background
    try {
      await fetch("/api/nutrition/generate-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
    } catch {
      // Plan generation is not blocking — user can request later
    }

    router.push("/nutrition");
  }

  function toggleArray(arr: string[], val: string, setter: (v: string[]) => void) {
    setter(arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val]);
  }

  return (
    <div className="h-full overflow-y-auto overscroll-y-contain">
      <div className="px-4 py-5 max-w-lg mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          {step > 0 && (
            <button onClick={back} className="p-2 rounded-xl bg-[var(--bg2)] border border-[var(--border)]">
              <ArrowLeft size={16} />
            </button>
          )}
          <div className="flex-1">
            <h2 className="text-lg font-semibold">{t("onboardingTitle")}</h2>
            <p className="text-xs text-[var(--dim)]">{step + 1} / {STEPS.length}</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 rounded-full bg-[var(--border)] mb-6">
          <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>

        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

        {/* Step: Body metrics */}
        {currentStep === "body" && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold mb-2">Datos corporales</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[var(--dim)] mb-1 block">Edad</label>
                <input type="number" value={age} onChange={e => setAge(e.target.value)} placeholder="30" min={14} max={100}
                  className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg2)] border border-[var(--border)] text-sm focus:outline-none focus:border-green-500" />
              </div>
              <div>
                <label className="text-xs text-[var(--dim)] mb-1 block">Sexo</label>
                <div className="flex gap-2">
                  <button onClick={() => setSex("male")} className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition ${sex === "male" ? "bg-blue-500/20 border-blue-500 text-blue-400" : "bg-[var(--bg2)] border-[var(--border)] text-[var(--dim)]"}`}>
                    Hombre
                  </button>
                  <button onClick={() => setSex("female")} className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition ${sex === "female" ? "bg-pink-500/20 border-pink-500 text-pink-400" : "bg-[var(--bg2)] border-[var(--border)] text-[var(--dim)]"}`}>
                    Mujer
                  </button>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[var(--dim)] mb-1 block">Peso (kg)</label>
                <input type="number" value={weightKg} onChange={e => setWeightKg(e.target.value)} placeholder="75" step="0.1" min={30} max={300}
                  className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg2)] border border-[var(--border)] text-sm focus:outline-none focus:border-green-500" />
              </div>
              <div>
                <label className="text-xs text-[var(--dim)] mb-1 block">Altura (cm)</label>
                <input type="number" value={heightCm} onChange={e => setHeightCm(e.target.value)} placeholder="175" min={100} max={250}
                  className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg2)] border border-[var(--border)] text-sm focus:outline-none focus:border-green-500" />
              </div>
            </div>
          </div>
        )}

        {/* Step: Activity level */}
        {currentStep === "activity" && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold mb-2">Nivel de actividad</h3>
            {([
              { val: "sedentary", label: "Sedentario", desc: "Oficina, poco movimiento" },
              { val: "light", label: "Ligero", desc: "Caminar 1-3 veces/semana" },
              { val: "moderate", label: "Moderado", desc: "Ejercicio 3-5 veces/semana" },
              { val: "active", label: "Activo", desc: "Ejercicio intenso 6-7 veces/semana" },
              { val: "very_active", label: "Muy activo", desc: "Atleta, trabajo físico intenso" },
            ] as const).map(opt => (
              <button key={opt.val} onClick={() => setActivityLevel(opt.val)}
                className={`w-full text-left px-4 py-3 rounded-xl border transition ${activityLevel === opt.val ? "bg-green-500/15 border-green-500" : "bg-[var(--bg2)] border-[var(--border)]"}`}>
                <p className="text-sm font-medium">{opt.label}</p>
                <p className="text-xs text-[var(--dim)]">{opt.desc}</p>
              </button>
            ))}
          </div>
        )}

        {/* Step: Goal */}
        {currentStep === "goal" && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold mb-2">Objetivo</h3>
            {([
              { val: "lose", label: "Perder grasa", icon: "🔥" },
              { val: "maintain", label: "Mantener peso", icon: "⚖️" },
              { val: "gain", label: "Ganar masa muscular", icon: "💪" },
            ] as const).map(opt => (
              <button key={opt.val} onClick={() => setGoal(opt.val)}
                className={`w-full text-left px-4 py-3.5 rounded-xl border transition flex items-center gap-3 ${goal === opt.val ? "bg-green-500/15 border-green-500" : "bg-[var(--bg2)] border-[var(--border)]"}`}>
                <span className="text-xl">{opt.icon}</span>
                <span className="text-sm font-medium">{opt.label}</span>
              </button>
            ))}
            {goal === "lose" && (
              <div className="mt-3">
                <label className="text-xs text-[var(--dim)] mb-1 block">Ritmo de pérdida (kg/semana)</label>
                <div className="flex gap-2">
                  {["0.25", "0.5", "0.75", "1.0"].map(v => (
                    <button key={v} onClick={() => setWeeklyTarget(v)}
                      className={`flex-1 py-2 rounded-xl text-xs font-medium border transition ${weeklyTarget === v ? "bg-green-500/15 border-green-500" : "bg-[var(--bg2)] border-[var(--border)] text-[var(--dim)]"}`}>
                      {v} kg
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step: Diet type */}
        {currentStep === "diet" && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold mb-2">Tipo de dieta</h3>
            {([
              { val: "balanced", label: "Equilibrada", desc: "Sin restricciones" },
              { val: "mediterranean", label: "Mediterránea", desc: "Aceite oliva, pescado, verduras" },
              { val: "vegetarian", label: "Vegetariana", desc: "Sin carne ni pescado" },
              { val: "vegan", label: "Vegana", desc: "Sin productos animales" },
              { val: "keto", label: "Keto", desc: "Baja en carbos, alta en grasas" },
              { val: "paleo", label: "Paleo", desc: "Sin procesados, sin granos" },
              { val: "pescatarian", label: "Pescetariana", desc: "Vegetariana + pescado" },
            ] as const).map(opt => (
              <button key={opt.val} onClick={() => setDietType(opt.val)}
                className={`w-full text-left px-4 py-3 rounded-xl border transition ${dietType === opt.val ? "bg-green-500/15 border-green-500" : "bg-[var(--bg2)] border-[var(--border)]"}`}>
                <p className="text-sm font-medium">{opt.label}</p>
                <p className="text-xs text-[var(--dim)]">{opt.desc}</p>
              </button>
            ))}
          </div>
        )}

        {/* Step: Allergies */}
        {currentStep === "allergies" && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Alergias e intolerancias</h3>
            <p className="text-xs text-[var(--dim)]">Selecciona todas las que apliquen. Si ninguna, continúa.</p>
            <div className="flex flex-wrap gap-2">
              {ALLERGY_OPTIONS.map(a => (
                <button key={a} onClick={() => toggleArray(allergies, a, setAllergies)}
                  className={`px-3 py-2 rounded-full text-xs font-medium border transition ${allergies.includes(a) ? "bg-red-500/20 border-red-500 text-red-400" : "bg-[var(--bg2)] border-[var(--border)] text-[var(--dim)]"}`}>
                  {a}
                </button>
              ))}
            </div>
            <div>
              <label className="text-xs text-[var(--dim)] mb-1 block">Alimentos que no te gustan (separados por coma)</label>
              <input type="text" value={dislikedFoods} onChange={e => setDislikedFoods(e.target.value)} placeholder="brócoli, hígado, atún..."
                className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg2)] border border-[var(--border)] text-sm focus:outline-none focus:border-green-500" />
            </div>
          </div>
        )}

        {/* Step: Medical conditions */}
        {currentStep === "medical" && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Condiciones médicas</h3>
            <p className="text-xs text-[var(--dim)]">Para tu seguridad. Algunas condiciones requieren supervisión profesional.</p>
            <div className="flex flex-wrap gap-2">
              {MEDICAL_OPTIONS.map(c => (
                <button key={c} onClick={() => {
                  if (c === "none") { setMedicalConditions(["none"]); }
                  else { setMedicalConditions(prev => prev.filter(x => x !== "none")); toggleArray(medicalConditions.filter(x => x !== "none"), c, setMedicalConditions); }
                }}
                  className={`px-3 py-2 rounded-full text-xs font-medium border transition ${medicalConditions.includes(c) ? c === "none" ? "bg-green-500/20 border-green-500 text-green-400" : "bg-yellow-500/20 border-yellow-500 text-yellow-400" : "bg-[var(--bg2)] border-[var(--border)] text-[var(--dim)]"}`}>
                  {c === "none" ? "Ninguna" : c.replace(/_/g, " ")}
                </button>
              ))}
            </div>
            {hasMedicalRisk && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30">
                <AlertTriangle size={16} className="text-yellow-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-yellow-400">{t("referralMessage")}</p>
              </div>
            )}
          </div>
        )}

        {/* Step: Summary */}
        {currentStep === "summary" && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Tu plan personalizado</h3>

            <div className="p-4 rounded-xl bg-[var(--bg2)] border border-[var(--border)] space-y-3">
              <div className="text-center">
                <p className="text-xs text-[var(--dim)]">Calorías diarias objetivo</p>
                <p className="text-3xl font-bold text-green-400">{Math.round(targetCal)}</p>
                <p className="text-[10px] text-[var(--dim)]">kcal/día (mínimo seguro: {minCal})</p>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[var(--border)]">
                <div className="text-center">
                  <p className="text-sm font-semibold text-blue-400">{macros.protein_g}g</p>
                  <p className="text-[10px] text-[var(--dim)]">{t("protein")}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-amber-400">{macros.carbs_g}g</p>
                  <p className="text-[10px] text-[var(--dim)]">{t("carbs")}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-purple-400">{macros.fat_g}g</p>
                  <p className="text-[10px] text-[var(--dim)]">{t("fat")}</p>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[var(--bg2)] border border-[var(--border)] text-xs text-[var(--dim)] space-y-1">
              <p>BMR: {Math.round(bmr)} kcal &bull; TDEE: {Math.round(tdee)} kcal</p>
              <p>Agua: {Math.round(numWeight * 33)} ml/día &bull; Fibra: {macros.fiber_g}g/día</p>
              <p>Dieta: {dietType} &bull; Objetivo: {goal === "lose" ? `Perder ${weeklyTarget} kg/sem` : goal === "gain" ? "Ganar masa" : "Mantener"}</p>
              {allergies.length > 0 && <p>Alergias: {allergies.join(", ")}</p>}
            </div>

            <p className="text-[9px] text-[var(--dim)] italic">{t("disclaimer")}</p>
          </div>
        )}

        {/* Navigation buttons */}
        <div className="mt-6">
          {currentStep === "summary" ? (
            <button onClick={save} disabled={saving}
              className="w-full py-3 rounded-xl bg-green-600 text-white font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-50">
              <Check size={16} />
              {saving ? "Guardando..." : "Guardar y empezar"}
            </button>
          ) : (
            <button onClick={next} disabled={!canNext()}
              className="w-full py-3 rounded-xl bg-white text-black font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-30">
              Siguiente <ArrowRight size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
