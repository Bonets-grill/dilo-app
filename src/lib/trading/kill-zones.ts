/**
 * Kill Zone Detection — Professional trading session windows
 *
 * Kill zones are the high-liquidity periods where institutional traders
 * are most active. Trading outside kill zones has lower win rates.
 */

interface KillZone {
  name: string;
  startUtc: number;
  endUtc: number;
}

const KILL_ZONES: KillZone[] = [
  { name: "London Open", startUtc: 7, endUtc: 10 },
  { name: "London-NY Overlap", startUtc: 12, endUtc: 15 },
  { name: "NY Open", startUtc: 14, endUtc: 17 },
];

/**
 * Check if a given time is within a kill zone
 */
export function isInKillZone(tradeTime?: Date): { inZone: boolean; zone: string } {
  const now = tradeTime || new Date();
  const hour = now.getUTCHours();

  for (const kz of KILL_ZONES) {
    if (hour >= kz.startUtc && hour < kz.endUtc) {
      return { inZone: true, zone: kz.name };
    }
  }

  return { inZone: false, zone: "Off-hours" };
}

/**
 * Get the next upcoming kill zone
 */
export function getNextKillZone(currentTime?: Date): { name: string; startsInMinutes: number } | null {
  const now = currentTime || new Date();
  const hour = now.getUTCHours();
  const minute = now.getUTCMinutes();
  const currentMinutes = hour * 60 + minute;

  for (const kz of KILL_ZONES) {
    const kzStartMinutes = kz.startUtc * 60;
    if (kzStartMinutes > currentMinutes) {
      return {
        name: kz.name,
        startsInMinutes: kzStartMinutes - currentMinutes,
      };
    }
  }

  // Next day's London Open
  const londonStart = KILL_ZONES[0].startUtc * 60;
  return {
    name: KILL_ZONES[0].name,
    startsInMinutes: (24 * 60 - currentMinutes) + londonStart,
  };
}
