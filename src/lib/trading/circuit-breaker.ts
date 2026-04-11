/**
 * Circuit Breaker — Blocks trading when emotional state is dangerous
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Check if circuit breaker is active for a user
 */
export async function checkCircuitBreaker(userId: string): Promise<{ active: boolean; reason: string; expiresAt: Date | null }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase.from("trading_emotional_state") as any)
      .select("circuit_breaker_active, cooldown_until, triggers")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data || !data.circuit_breaker_active) {
      return { active: false, reason: "", expiresAt: null };
    }

    // Check if cooldown has expired
    if (data.cooldown_until && new Date(data.cooldown_until) < new Date()) {
      return { active: false, reason: "", expiresAt: null };
    }

    return {
      active: true,
      reason: (data.triggers || []).join(". "),
      expiresAt: data.cooldown_until ? new Date(data.cooldown_until) : null,
    };
  } catch {
    return { active: false, reason: "", expiresAt: null };
  }
}

/**
 * Activate circuit breaker
 */
export async function activateCircuitBreaker(userId: string, durationMinutes: number, reason: string): Promise<void> {
  try {
    const cooldownUntil = new Date(Date.now() + durationMinutes * 60000).toISOString();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("trading_emotional_state") as any).insert({
      user_id: userId,
      circuit_breaker_active: true,
      cooldown_until: cooldownUntil,
      triggers: [reason],
      actions_taken: [`Circuit breaker activado: ${durationMinutes}min`],
      emotional_level: "STOP",
      composite_score: 100,
    });
  } catch (err) {
    console.error("[Circuit Breaker] Activation error:", err);
  }
}

/**
 * Pre-trade check — Should this trade be allowed?
 */
export async function shouldBlockTrade(userId: string): Promise<{ blocked: boolean; reason: string; warnings: string[] }> {
  const warnings: string[] = [];

  try {
    // Check circuit breaker
    const cb = await checkCircuitBreaker(userId);
    if (cb.active) {
      return { blocked: true, reason: `Circuit breaker activo: ${cb.reason}`, warnings: [] };
    }

    // Check emotional state
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: state } = await (supabase.from("trading_emotional_state") as any)
      .select("emotional_level, composite_score, tilt_score, fomo_score, revenge_score, triggers")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (state) {
      if (state.emotional_level === "STOP") {
        return { blocked: true, reason: "Estado emocional STOP. Tómate un descanso.", warnings: state.triggers || [] };
      }
      if (state.emotional_level === "ALERT") {
        warnings.push(`Estado emocional ALERT (${state.composite_score}/100). Reduce tamaño de posición.`);
      }
      if (state.emotional_level === "CAUTION") {
        warnings.push(`Estado emocional CAUTION (${state.composite_score}/100). Sé selectivo.`);
      }
    }

    // Check kill zone
    const { isInKillZone } = await import("./kill-zones");
    const kz = isInKillZone();
    if (!kz.inZone) {
      warnings.push(`Fuera de kill zone (${kz.zone}). Win rate históricamente menor fuera de sesión.`);
    }

    return { blocked: false, reason: "", warnings };
  } catch {
    return { blocked: false, reason: "", warnings };
  }
}
