/**
 * Minimal city → {lat, lon} geocoder using Nominatim (OpenStreetMap).
 *
 * Free, no key required. Usage policy: 1 req/sec, must send User-Agent.
 * https://operations.osmfoundation.org/policies/nominatim/
 *
 * Result is cached in-memory per process (serverless cold start resets it).
 * Nothing is persisted to the database — the same city maps to the same
 * coords forever, so caching on a DB row makes sense later, not now.
 */

interface Coords { latitude: number; longitude: number; }

const cache = new Map<string, Coords | null>();

export async function geocodeCity(city: string): Promise<Coords | null> {
  const key = city.trim().toLowerCase();
  if (!key) return null;
  if (cache.has(key)) return cache.get(key) ?? null;

  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(key)}&format=json&limit=1`;
    const res = await fetch(url, {
      headers: { "User-Agent": "dilo-app/1.0 (horoscope geocoder; mtmbdeals@gmail.com)" },
      // 5s timeout via AbortSignal; Nominatim can be slow on cold hits
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) { cache.set(key, null); return null; }
    const rows = await res.json() as Array<{ lat: string; lon: string }>;
    if (!rows || rows.length === 0) { cache.set(key, null); return null; }
    const coords: Coords = { latitude: parseFloat(rows[0].lat), longitude: parseFloat(rows[0].lon) };
    if (!Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude)) {
      cache.set(key, null);
      return null;
    }
    cache.set(key, coords);
    return coords;
  } catch (err) {
    console.warn("[horoscope.geocode] failed for", key, err);
    cache.set(key, null);
    return null;
  }
}
