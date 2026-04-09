/**
 * Trading Profile — manages user's trading mode, onboarding, and session state
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface TradingProfile {
  id: string;
  user_id: string;
  account_size: number;
  account_type: string;
  currency: string;
  monthly_goal: number;
  daily_goal: number;
  risk_per_trade_pct: number;
  risk_per_trade_amount: number;
  max_rr_ratio: number;
  max_trades_per_day: number;
  max_daily_loss_pct: number;
  max_total_drawdown_pct: number;
  markets: string[];
  preferred_pairs: string[];
  timezone: string;
  sessions: Array<{ name: string; start: string; end: string; markets: string[] }>;
  trading_style: string;
  experience_level: string;
  active: boolean;
  onboarding_complete: boolean;
  trades_today: number;
  pnl_today: number;
  session_closed: boolean;
  last_reset_date: string;
}

/** Get user's trading profile */
export async function getTradingProfile(userId: string): Promise<TradingProfile | null> {
  const { data } = await supabase
    .from("trading_profiles")
    .select("*")
    .eq("user_id", userId)
    .single();
  return data as TradingProfile | null;
}

/** Check if user has completed trading onboarding */
export async function hasCompletedOnboarding(userId: string): Promise<boolean> {
  const profile = await getTradingProfile(userId);
  return profile?.onboarding_complete === true;
}

/** Create or update trading profile from onboarding answers */
export async function saveTradingProfile(userId: string, input: {
  account_size: number;
  account_type: string;
  monthly_goal: number;
  risk_per_trade_pct: number;
  markets: string[];
  preferred_pairs: string[];
  timezone?: string;
  sessions?: Array<{ name: string; start: string; end: string; markets: string[] }>;
  trading_style?: string;
  experience_level?: string;
}): Promise<TradingProfile> {
  const riskAmount = input.account_size * (input.risk_per_trade_pct / 100);
  const tradingDays = 20;
  const dailyGoal = input.monthly_goal / tradingDays;

  // Auto-calculate max trades based on daily goal and risk
  const profitPerWin = riskAmount * 2; // assuming 1:2 RR
  const maxTrades = Math.max(2, Math.ceil(dailyGoal / profitPerWin) + 1);

  // Max daily loss = max trades × risk per trade (if ALL trades lose)
  const maxDailyLossAmount = maxTrades * riskAmount;
  const maxDailyLossPct = (maxDailyLossAmount / input.account_size) * 100;

  // For funded/prop firms, cap at 3% regardless
  const cappedDailyLossPct = input.account_type === "funded" || input.account_type === "prop_firm"
    ? Math.min(maxDailyLossPct, 3)
    : Math.min(maxDailyLossPct, 5);

  const profile = {
    user_id: userId,
    account_size: input.account_size,
    account_type: input.account_type,
    currency: "EUR",
    monthly_goal: input.monthly_goal,
    daily_goal: dailyGoal,
    risk_per_trade_pct: input.risk_per_trade_pct,
    risk_per_trade_amount: riskAmount,
    max_rr_ratio: 2,
    max_trades_per_day: maxTrades,
    max_daily_loss_pct: cappedDailyLossPct,
    max_total_drawdown_pct: input.account_type === "funded" || input.account_type === "prop_firm" ? 8 : 10,
    markets: input.markets,
    preferred_pairs: input.preferred_pairs,
    timezone: input.timezone || "Atlantic/Canary",
    sessions: input.sessions || getDefaultSessions(input.markets, input.preferred_pairs),
    trading_style: input.trading_style || "scalping",
    experience_level: input.experience_level || "intermediate",
    active: true,
    onboarding_complete: true,
    trades_today: 0,
    pnl_today: 0,
    session_closed: false,
    last_reset_date: new Date().toISOString().slice(0, 10),
    updated_at: new Date().toISOString(),
  };

  const { data: existing } = await supabase
    .from("trading_profiles")
    .select("id")
    .eq("user_id", userId)
    .limit(1);

  if (existing && existing.length > 0) {
    await supabase.from("trading_profiles").update(profile).eq("user_id", userId);
  } else {
    await supabase.from("trading_profiles").insert(profile);
  }

  return profile as unknown as TradingProfile;
}

/** Reset daily counters (called at start of trading day) */
export async function resetDailyCounters(userId: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  await supabase.from("trading_profiles").update({
    trades_today: 0,
    pnl_today: 0,
    session_closed: false,
    last_reset_date: today,
  }).eq("user_id", userId);
}

/** Record a trade and check limits */
export async function recordTrade(userId: string, pnl: number): Promise<{ allowed: boolean; message: string }> {
  const profile = await getTradingProfile(userId);
  if (!profile) return { allowed: true, message: "" };

  // Reset if new day
  const today = new Date().toISOString().slice(0, 10);
  if (profile.last_reset_date !== today) {
    await resetDailyCounters(userId);
    profile.trades_today = 0;
    profile.pnl_today = 0;
    profile.session_closed = false;
  }

  const newTradesCount = profile.trades_today + 1;
  const newPnl = profile.pnl_today + pnl;

  await supabase.from("trading_profiles").update({
    trades_today: newTradesCount,
    pnl_today: newPnl,
  }).eq("user_id", userId);

  // Check if daily goal reached
  if (newPnl >= profile.daily_goal) {
    await supabase.from("trading_profiles").update({ session_closed: true }).eq("user_id", userId);
    return {
      allowed: false,
      message: `Objetivo diario alcanzado (+€${newPnl.toFixed(0)}). Sesión cerrada. Buen trabajo.`,
    };
  }

  // Check max daily loss
  const maxLoss = profile.account_size * (profile.max_daily_loss_pct / 100);
  if (newPnl < 0 && Math.abs(newPnl) >= maxLoss) {
    await supabase.from("trading_profiles").update({ session_closed: true }).eq("user_id", userId);
    return {
      allowed: false,
      message: `Límite de pérdida diaria alcanzado (-€${Math.abs(newPnl).toFixed(0)}). Sesión cerrada. Protege tu cuenta.`,
    };
  }

  // Check max trades
  if (newTradesCount >= profile.max_trades_per_day) {
    await supabase.from("trading_profiles").update({ session_closed: true }).eq("user_id", userId);
    return {
      allowed: false,
      message: `Máximo de ${profile.max_trades_per_day} trades diarios alcanzado. Sesión cerrada.`,
    };
  }

  return { allowed: true, message: "" };
}

/** Generate the personalized system prompt for this trader */
export function generateTradingPrompt(profile: TradingProfile): string {
  const sessionsText = profile.sessions.map(s =>
    `- ${s.name}: ${s.start}–${s.end} (${profile.timezone}) → ${s.markets.join(", ")}`
  ).join("\n");

  const statusText = profile.session_closed
    ? "⛔ SESIÓN CERRADA HOY — No generar nuevas señales."
    : `Trades hoy: ${profile.trades_today}/${profile.max_trades_per_day} | P&L hoy: ${profile.pnl_today >= 0 ? "+" : ""}€${profile.pnl_today.toFixed(0)} | Objetivo: €${profile.daily_goal.toFixed(0)}`;

  return `
MODO TRADING ACTIVO — Perfil personalizado del trader:

CUENTA: €${profile.account_size.toLocaleString()} (${profile.account_type === "funded" ? "FONDEADA" : profile.account_type === "prop_firm" ? "PROP FIRM" : "PERSONAL"})
OBJETIVO: €${profile.daily_goal.toFixed(0)}/día → €${profile.monthly_goal.toFixed(0)}/mes
RIESGO: ${profile.risk_per_trade_pct}% por trade (€${profile.risk_per_trade_amount.toFixed(0)})
RATIO MÍNIMO: 1:${profile.max_rr_ratio} (beneficio mínimo €${(profile.risk_per_trade_amount * profile.max_rr_ratio).toFixed(0)} por trade)
MÁXIMO TRADES: ${profile.max_trades_per_day}/día
ESTILO: ${profile.trading_style}
MERCADOS: ${profile.preferred_pairs.join(", ")}
SESIONES:
${sessionsText}

ESTADO ACTUAL: ${statusText}

REGLAS DE OPERACIÓN:
1. USA market_analyze_stock y market_scan_opportunities para obtener datos REALES antes de cualquier señal.
2. Solo genera señal si hay CONFLUENCIA de 3+ factores técnicos.
3. SIEMPRE calcula tamaño de posición: Lote = €${profile.risk_per_trade_amount.toFixed(0)} / (SL en pips × valor del pip)
4. FORMATO OBLIGATORIO para cada señal:
   - Activo | Dirección (LONG/SHORT) | Entrada | SL | TP | Riesgo €${profile.risk_per_trade_amount.toFixed(0)} | Beneficio esperado | Confianza | 3 razones | Ventana horaria
5. Si no hay setup claro → "Hoy no hay oportunidad clara. No operar es también ganar."
6. Si el trader alcanzó el objetivo → "Sesión cerrada. Buen trabajo."
7. Si el trader perdió y pide más trades → "Protege tu cuenta. La consistencia gana a largo plazo."
8. NUNCA perseguir un trade que ya se movió.
9. ${profile.account_type === "funded" || profile.account_type === "prop_firm" ? `CUENTA FONDEADA: Max drawdown diario ${profile.max_daily_loss_pct}%, Max drawdown total ${profile.max_total_drawdown_pct}%. PROTEGER LA CUENTA ES PRIORIDAD #1.` : "Gestión de riesgo estricta."}

GESTIÓN EMOCIONAL:
- Si pide "recuperar" una pérdida → advertir sobre revenge trading con datos
- Si pide aumentar el riesgo → recordar las reglas
- Si quiere operar fuera de horario → explicar por qué es arriesgado
- Ser directo, profesional y protector. Como un mentor que cuida al trader.`;
}

function getDefaultSessions(markets: string[], pairs: string[]) {
  const sessions = [];

  const hasForex = markets.includes("forex") || pairs.some(p => /GBP|EUR|JPY|USD/.test(p));
  const hasIndices = markets.includes("indices") || pairs.some(p => /US500|S&P|SPX|NAS|DAX/.test(p));
  const hasGold = pairs.some(p => /XAU|GOLD/i.test(p));

  if (hasForex) {
    sessions.push({
      name: "London",
      start: "08:00",
      end: "10:00",
      markets: pairs.filter(p => /GBP|EUR|JPY/.test(p)).slice(0, 3),
    });
  }

  if (hasIndices || hasGold) {
    sessions.push({
      name: "New York",
      start: "14:30",
      end: "16:00",
      markets: pairs.filter(p => /US500|S&P|XAU|GOLD|NAS/i.test(p)).slice(0, 3),
    });
  }

  if (sessions.length === 0) {
    sessions.push({ name: "Default", start: "09:00", end: "17:00", markets: pairs.slice(0, 3) });
  }

  return sessions;
}
