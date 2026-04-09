/**
 * Gasolineras España — Precios en tiempo real
 * API del Ministerio de Industria (gratis, sin key, 12.000+ estaciones)
 * https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/
 */

const API_URL = "https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/";

interface Gasolinera {
  nombre: string;
  direccion: string;
  localidad: string;
  municipio: string;
  provincia: string;
  horario: string;
  lat: number;
  lon: number;
  gasolina95: number | null;
  gasoleoA: number | null;
  distanciaKm: number;
}

// Cache: the API returns ALL 12K stations, so we cache for 30 min
let cache: { data: Record<string, unknown>[]; ts: number } | null = null;

async function fetchEstaciones(): Promise<Record<string, unknown>[]> {
  if (cache && Date.now() - cache.ts < 30 * 60 * 1000) return cache.data;

  const res = await fetch(API_URL);
  if (!res.ok) return [];
  const data = await res.json();
  const list = data.ListaEESSPrecio || [];
  cache = { data: list, ts: Date.now() };
  return list;
}

function parsePrice(val: unknown): number | null {
  if (!val || val === "") return null;
  return parseFloat(String(val).replace(",", ".")) || null;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Find cheapest gas stations near a location */
export async function findCheapestGas(
  userLat: number,
  userLon: number,
  radiusKm: number = 10,
  fuelType: "gasolina95" | "gasoleoA" = "gasolina95",
): Promise<string> {
  const estaciones = await fetchEstaciones();
  if (!estaciones.length) return "No se pudo acceder a los datos de gasolineras. Inténtalo de nuevo.";

  // Filter by radius and parse
  const nearby: Gasolinera[] = [];
  for (const e of estaciones) {
    const lat = parseFloat(String(e["Latitud"] || "0").replace(",", "."));
    const lon = parseFloat(String(e["Longitud (WGS84)"] || e["Longitud"] || "0").replace(",", "."));
    if (!lat || !lon) continue;

    const dist = haversineKm(userLat, userLon, lat, lon);
    if (dist > radiusKm) continue;

    const g95 = parsePrice(e["Precio Gasolina 95 E5"]);
    const diesel = parsePrice(e["Precio Gasoleo A"]);

    nearby.push({
      nombre: String(e["Rótulo"] || e["Dirección"] || "Gasolinera"),
      direccion: String(e["Dirección"] || ""),
      localidad: String(e["Localidad"] || ""),
      municipio: String(e["Municipio"] || ""),
      provincia: String(e["Provincia"] || ""),
      horario: String(e["Horario"] || ""),
      lat, lon,
      gasolina95: g95,
      gasoleoA: diesel,
      distanciaKm: Math.round(dist * 10) / 10,
    });
  }

  if (nearby.length === 0) {
    return `No encontré gasolineras en un radio de ${radiusKm}km. Prueba con una ubicación diferente.`;
  }

  // Sort by selected fuel price
  const withPrice = nearby.filter(g => fuelType === "gasolina95" ? g.gasolina95 : g.gasoleoA);
  withPrice.sort((a, b) => {
    const pa = fuelType === "gasolina95" ? a.gasolina95! : a.gasoleoA!;
    const pb = fuelType === "gasolina95" ? b.gasolina95! : b.gasoleoA!;
    return pa - pb;
  });

  const fuelLabel = fuelType === "gasolina95" ? "Gasolina 95" : "Diésel";
  const cheapest = withPrice[0];
  const mostExpensive = withPrice[withPrice.length - 1];
  const cheapPrice = fuelType === "gasolina95" ? cheapest.gasolina95! : cheapest.gasoleoA!;
  const expPrice = fuelType === "gasolina95" ? mostExpensive.gasolina95! : mostExpensive.gasoleoA!;
  const savingPer50L = ((expPrice - cheapPrice) * 50).toFixed(2);

  let response = `**⛽ ${fuelLabel} más barata cerca de ti** *(datos en tiempo real del Ministerio)*\n\n`;

  for (const g of withPrice.slice(0, 5)) {
    const price = fuelType === "gasolina95" ? g.gasolina95! : g.gasoleoA!;
    const isCheapest = g === cheapest;
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${g.lat},${g.lon}`;
    response += `${isCheapest ? "🟢" : "⚪"} **${g.nombre}** — ${price.toFixed(3)} €/L\n`;
    response += `   📍 ${g.direccion}, ${g.localidad} (${g.distanciaKm} km)\n`;
    response += `   🕐 ${g.horario}\n`;
    response += `   🗺️ [Ver en Google Maps](${mapsUrl})\n\n`;
  }

  response += `---\n`;
  response += `**Ahorro con depósito de 50L:** ${savingPer50L} € vs la más cara de tu zona\n`;
  response += `**Si repostas 4x/mes:** ~${(parseFloat(savingPer50L) * 4).toFixed(0)} €/mes de ahorro\n`;

  return response;
}

/** Find cheapest gas by city name (geocode first) */
export async function findCheapestGasByCity(city: string, fuelType: "gasolina95" | "gasoleoA" = "gasolina95"): Promise<string> {
  // Geocode city to lat/lon using Nominatim
  try {
    const geoRes = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city + ", España")}&format=json&limit=1`,
      { headers: { "User-Agent": "DILO-App" } }
    );
    if (geoRes.ok) {
      const geoData = await geoRes.json();
      if (geoData[0]) {
        const lat = parseFloat(geoData[0].lat);
        const lon = parseFloat(geoData[0].lon);
        return findCheapestGas(lat, lon, 15, fuelType);
      }
    }
  } catch { /* */ }

  return "No pude localizar tu ciudad. Dime tu ubicación y busco las gasolineras más baratas.";
}
