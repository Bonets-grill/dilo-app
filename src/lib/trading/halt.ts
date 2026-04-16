/**
 * Global trading kill switch.
 *
 * Set env var TRADING_HALT=1 in Vercel to stop ALL auto-execution
 * immediately — no deploy required, takes effect on next cron tick.
 *
 * Use when the system is bleeding and you need to stop it from your phone
 * in seconds. Signals will still be generated and logged, but no orders
 * will be placed on Alpaca.
 */

export function isTradingHalted(): { halted: boolean; reason: string } {
  const flag = (process.env.TRADING_HALT || "").trim();
  if (flag === "1" || flag.toLowerCase() === "true") {
    return { halted: true, reason: "TRADING_HALT env var is set" };
  }
  return { halted: false, reason: "" };
}
