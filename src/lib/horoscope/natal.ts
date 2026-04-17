/**
 * Lightweight natal chart: Sun sign, Moon sign, Rising (Ascendant) sign.
 *
 * The astrology "big three". Full Meeus-grade precision needs ~10K lines of
 * planetary theory; for a daily horoscope flavour line, we only need to know
 * which 30° slice of the ecliptic each body was in at birth — that's sign
 * accuracy, roughly ±1–2° depending on body. Good enough for motivation; not
 * good enough for financial forecasting, but that's not what this is for.
 *
 * Algorithms:
 *   - Julian Day from civil date (Meeus ch 7).
 *   - Sun longitude: simplified VSOP truncated series (Meeus ch 25, ±0.01°).
 *   - Moon longitude: main elongation term only (Meeus ch 47, ±2°).
 *   - Obliquity of ecliptic: IAU 1980 approximation.
 *   - Ascendant: classic ecliptic-horizon intersection formula.
 *
 * All inputs assumed UTC. Callers are responsible for timezone conversion.
 */

const ZODIAC = [
  "aries", "taurus", "gemini", "cancer", "leo", "virgo",
  "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces",
] as const;

export type ZodiacKey = typeof ZODIAC[number];

const deg = (x: number) => (x * Math.PI) / 180;
const norm360 = (x: number) => ((x % 360) + 360) % 360;

function signFromLongitude(lon: number): ZodiacKey {
  return ZODIAC[Math.floor(norm360(lon) / 30)];
}

/** Julian Day Number at 0h UTC of given Gregorian Y-M-D (Meeus 7.1). */
function julianDay(Y: number, M: number, D: number, hours = 0, minutes = 0): number {
  if (M <= 2) { Y -= 1; M += 12; }
  const A = Math.floor(Y / 100);
  const B = 2 - A + Math.floor(A / 4);
  const dayFraction = (hours + minutes / 60) / 24;
  return Math.floor(365.25 * (Y + 4716)) +
         Math.floor(30.6001 * (M + 1)) +
         D + dayFraction + B - 1524.5;
}

function sunLongitude(T: number): number {
  // T = Julian centuries since J2000
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
  const Mrad = deg(M);
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(Mrad)
          + (0.019993 - 0.000101 * T) * Math.sin(2 * Mrad)
          + 0.000289 * Math.sin(3 * Mrad);
  return norm360(L0 + C);
}

function moonLongitude(T: number): number {
  const Lp = 218.3164477 + 481267.88123421 * T
           - 0.0015786 * T * T
           + (T * T * T) / 538841;
  const D = 297.8501921 + 445267.1114034 * T;
  const M = 357.5291092 + 35999.0502909 * T;
  const Mp = 134.9633964 + 477198.8675055 * T;
  const F = 93.2720950 + 483202.0175233 * T;

  // Top ~8 periodic terms of Meeus table 47.A (covers ±0.1° typical)
  const A1 = deg(Mp);
  const A2 = deg(2 * D - Mp);
  const A3 = deg(2 * D);
  const A4 = deg(2 * Mp);
  const A5 = deg(M);
  const A6 = deg(2 * D - M - Mp);
  const A7 = deg(2 * D + Mp);
  const A8 = deg(2 * F);

  const sum =
      6.288774 * Math.sin(A1)
    + 1.274027 * Math.sin(A2)
    + 0.658314 * Math.sin(A3)
    + 0.213618 * Math.sin(A4)
    - 0.185116 * Math.sin(A5)
    - 0.114332 * Math.sin(A8)
    + 0.058793 * Math.sin(A6)
    + 0.057066 * Math.sin(A7);

  return norm360(Lp + sum);
}

function meanObliquity(T: number): number {
  // IAU 1980, ~±0.01°
  return 23.4392911 - 0.0130042 * T - 1.64e-7 * T * T + 5.04e-7 * T * T * T;
}

/** Greenwich Mean Sidereal Time in degrees. */
function gmstDegrees(jd: number): number {
  const T = (jd - 2451545.0) / 36525;
  const gmst = 280.46061837
             + 360.98564736629 * (jd - 2451545.0)
             + 0.000387933 * T * T
             - (T * T * T) / 38710000;
  return norm360(gmst);
}

/** Ascendant ecliptic longitude. latDeg north+, lonDeg east+. */
function ascendantLongitude(jd: number, latDeg: number, lonDeg: number): number {
  const T = (jd - 2451545.0) / 36525;
  const eps = deg(meanObliquity(T));
  const lst = deg(norm360(gmstDegrees(jd) + lonDeg));
  const phi = deg(latDeg);
  // Meeus 14.6 — x is numerator, y denominator
  const y = -Math.cos(lst);
  const x = Math.sin(lst) * Math.cos(eps) + Math.tan(phi) * Math.sin(eps);
  const asc = Math.atan2(y, x) * 180 / Math.PI;
  return norm360(asc);
}

export interface NatalChart {
  sun: ZodiacKey;
  moon: ZodiacKey;
  ascendant: ZodiacKey | null; // null if we lack birth time/place
  longitudes: { sun: number; moon: number; ascendant: number | null };
}

/**
 * Compute the big-three signs. Birthdate is required; time and coords are
 * optional — without them the ascendant is null and Moon is computed at
 * noon UTC of the birthdate (sign accuracy only).
 */
export function computeNatalChart(input: {
  birthdateIso: string;      // YYYY-MM-DD
  birthTime?: string | null; // HH:MM (UTC — caller converts if local)
  latitude?: number | null;
  longitude?: number | null;
}): NatalChart {
  const [y, m, d] = input.birthdateIso.split("-").map(Number);
  let h = 12;
  let min = 0;
  if (input.birthTime) {
    const parts = input.birthTime.split(":");
    h = parseInt(parts[0] || "12", 10);
    min = parseInt(parts[1] || "0", 10);
  }
  const jd = julianDay(y, m, d, h, min);
  const T = (jd - 2451545.0) / 36525;

  const sunLon = sunLongitude(T);
  const moonLon = moonLongitude(T);
  const ascLon = (input.latitude != null && input.longitude != null && input.birthTime)
    ? ascendantLongitude(jd, input.latitude, input.longitude)
    : null;

  return {
    sun: signFromLongitude(sunLon),
    moon: signFromLongitude(moonLon),
    ascendant: ascLon != null ? signFromLongitude(ascLon) : null,
    longitudes: { sun: sunLon, moon: moonLon, ascendant: ascLon },
  };
}
