import type { WeatherReading } from "./types";
import { getCached, setCache } from "./cache";

const BENGALURU = { lat: 12.9716, lng: 77.5946 };
const CACHE_KEY = "weather-bengaluru";
const TTL_MS = 10 * 60 * 1000;

const FALLBACK: WeatherReading = {
  lat: BENGALURU.lat,
  lng: BENGALURU.lng,
  temperatureC: 28,
  humidityPct: 65,
  rainProbabilityPct: 20,
  windSpeedKmh: 12,
  summary: "Partly cloudy (cached fallback)",
  source: "Open-Meteo (fallback)",
  sourceType: "cached",
  fetchedAt: new Date(0).toISOString(),
  cached: true,
  stale: true,
};

export async function fetchWeather(
  lat = BENGALURU.lat,
  lng = BENGALURU.lng,
): Promise<WeatherReading> {
  const key = `${CACHE_KEY}-${lat.toFixed(2)}-${lng.toFixed(2)}`;

  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(lat));
    url.searchParams.set("longitude", String(lng));
    url.searchParams.set("current", "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code");
    url.searchParams.set("hourly", "precipitation_probability");
    url.searchParams.set("timezone", "Asia/Kolkata");
    url.searchParams.set("forecast_days", "1");

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(12_000),
      next: { revalidate: 600 },
    });

    if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);

    const data = (await res.json()) as {
      current?: {
        temperature_2m?: number;
        relative_humidity_2m?: number;
        wind_speed_10m?: number;
        weather_code?: number;
      };
      hourly?: { precipitation_probability?: number[] };
    };

    const rainProb = data.hourly?.precipitation_probability?.[0] ?? null;
    const code = data.current?.weather_code;

    const reading: WeatherReading = {
      lat,
      lng,
      temperatureC: data.current?.temperature_2m ?? null,
      humidityPct: data.current?.relative_humidity_2m ?? null,
      rainProbabilityPct: rainProb,
      windSpeedKmh: data.current?.wind_speed_10m ?? null,
      summary: weatherCodeLabel(code),
      source: "Open-Meteo Forecast API",
      sourceType: "live",
      fetchedAt: new Date().toISOString(),
      cached: false,
    };

    await setCache(key, reading, TTL_MS);
    return reading;
  } catch {
    const cached = await getCached<WeatherReading>(key);
    if (cached) {
      return { ...cached, cached: true, stale: true, sourceType: "cached" };
    }
    return { ...FALLBACK, fetchedAt: new Date().toISOString() };
  }
}

function weatherCodeLabel(code?: number): string | null {
  if (code === undefined) return null;
  const map: Record<number, string> = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    61: "Light rain",
    63: "Moderate rain",
    65: "Heavy rain",
    80: "Rain showers",
    95: "Thunderstorm",
  };
  return map[code] ?? `Weather code ${code}`;
}
