/**
 * Open-Meteo Weather API client — Free, no API key needed
 * Uses Open-Meteo geocoding + weather forecast APIs
 */

interface GeoLocation {
  name: string;
  latitude: number;
  longitude: number;
  country: string;
  admin1?: string;
}

export interface WeatherData {
  location: string;
  country: string;
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  windSpeed: number;
  weatherCode: number;
  weatherDescription: string;
  isDay: boolean;
  precipitation: number;
  forecast: DayForecast[];
}

interface DayForecast {
  date: string;
  tempMax: number;
  tempMin: number;
  weatherCode: number;
  weatherDescription: string;
  precipitationSum: number;
}

const WEATHER_CODES: Record<number, string> = {
  0: "Cielo despejado",
  1: "Principalmente despejado",
  2: "Parcialmente nublado",
  3: "Nublado",
  45: "Niebla",
  48: "Niebla con escarcha",
  51: "Llovizna ligera",
  53: "Llovizna moderada",
  55: "Llovizna intensa",
  61: "Lluvia ligera",
  63: "Lluvia moderada",
  65: "Lluvia intensa",
  71: "Nieve ligera",
  73: "Nieve moderada",
  75: "Nieve intensa",
  80: "Chubascos ligeros",
  81: "Chubascos moderados",
  82: "Chubascos intensos",
  95: "Tormenta eléctrica",
  96: "Tormenta con granizo ligero",
  99: "Tormenta con granizo intenso",
};

/**
 * Geocode a city name to coordinates
 */
async function geocode(city: string): Promise<GeoLocation | null> {
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=es`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const result = data.results?.[0];
    if (!result) return null;
    return {
      name: result.name,
      latitude: result.latitude,
      longitude: result.longitude,
      country: result.country || "",
      admin1: result.admin1,
    };
  } catch {
    return null;
  }
}

/**
 * Get current weather and 5-day forecast for a city
 */
export async function getWeather(city: string): Promise<WeatherData | null> {
  try {
    const location = await geocode(city);
    if (!location) return null;

    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,is_day&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum&timezone=auto&forecast_days=5`,
      { signal: AbortSignal.timeout(10000) }
    );

    if (!res.ok) return null;
    const data = await res.json();

    const forecast: DayForecast[] = [];
    if (data.daily) {
      for (let i = 0; i < (data.daily.time?.length || 0); i++) {
        forecast.push({
          date: data.daily.time[i],
          tempMax: data.daily.temperature_2m_max[i],
          tempMin: data.daily.temperature_2m_min[i],
          weatherCode: data.daily.weather_code[i],
          weatherDescription: WEATHER_CODES[data.daily.weather_code[i]] || "Desconocido",
          precipitationSum: data.daily.precipitation_sum[i],
        });
      }
    }

    return {
      location: location.name,
      country: location.country,
      temperature: data.current?.temperature_2m,
      apparentTemperature: data.current?.apparent_temperature,
      humidity: data.current?.relative_humidity_2m,
      windSpeed: data.current?.wind_speed_10m,
      weatherCode: data.current?.weather_code,
      weatherDescription: WEATHER_CODES[data.current?.weather_code] || "Desconocido",
      isDay: data.current?.is_day === 1,
      precipitation: data.current?.precipitation,
      forecast,
    };
  } catch {
    return null;
  }
}
