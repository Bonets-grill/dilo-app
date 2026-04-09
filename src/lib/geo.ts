/**
 * Geolocation utilities for DILO
 * Gets user's city via browser Geolocation API + reverse geocoding
 */

const GEO_CACHE_KEY = "dilo_user_city";

/** Get cached city or request fresh geolocation */
export function getCachedCity(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(GEO_CACHE_KEY);
}

/** Request geolocation and reverse geocode to city name */
export async function detectAndCacheCity(): Promise<string | null> {
  if (typeof window === "undefined") return null;

  // Return cached if fresh (less than 7 days)
  const cached = localStorage.getItem(GEO_CACHE_KEY);
  const cachedAt = localStorage.getItem(GEO_CACHE_KEY + "_at");
  if (cached && cachedAt && Date.now() - parseInt(cachedAt) < 7 * 86400000) {
    return cached;
  }

  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(cached); return; }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          // Reverse geocode with free Nominatim (OpenStreetMap)
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json&zoom=10`,
            { headers: { "User-Agent": "DILO-App" } }
          );
          if (res.ok) {
            const data = await res.json();
            const city = data.address?.city || data.address?.town || data.address?.village || data.address?.municipality || "";
            const province = data.address?.province || data.address?.state || "";
            const location = city || province;
            if (location) {
              localStorage.setItem(GEO_CACHE_KEY, location);
              localStorage.setItem(GEO_CACHE_KEY + "_at", String(Date.now()));
              resolve(location);
              return;
            }
          }
        } catch { /* silent */ }
        resolve(cached);
      },
      () => resolve(cached), // denied or error
      { timeout: 5000, maximumAge: 86400000 }
    );
  });
}
