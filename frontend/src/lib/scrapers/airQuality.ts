import type { AirQualityReading } from "./types";
import { getCached, setCache } from "./cache";

const BENGALURU = { lat: 12.9716, lng: 77.5946 };
const CACHE_KEY = "airquality-bengaluru";
const TTL_MS = 15 * 60 * 1000;

const FALLBACK: AirQualityReading = {
  lat: BENGALURU.lat,
  lng: BENGALURU.lng,
  aqi: 85,
  pm25: 42,
  pm10: 68,
  category: "Moderate (cached fallback)",
  source: "Open-Meteo Air Quality (fallback)",
  sourceType: "cached",
  fetchedAt: new Date(0).toISOString(),
  cached: true,
  stale: true,
};

export async function fetchAirQuality(
  lat = BENGALURU.lat,
  lng = BENGALURU.lng,
): Promise<AirQualityReading> {
  const key = `${CACHE_KEY}-${lat.toFixed(2)}-${lng.toFixed(2)}`;

  try {
    const url = new URL("https://air-quality-api.open-meteo.com/v1/air-quality");
    url.searchParams.set("latitude", String(lat));
    url.searchParams.set("longitude", String(lng));
    url.searchParams.set("current", "pm10,pm2_5,european_aqi");
    url.searchParams.set("timezone", "Asia/Kolkata");

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(12_000),
      next: { revalidate: 900 },
    });

    if (!res.ok) throw new Error(`Open-Meteo AQI HTTP ${res.status}`);

    const data = (await res.json()) as {
      current?: { pm10?: number; pm2_5?: number; european_aqi?: number };
    };

    const aqi = data.current?.european_aqi ?? null;
    const reading: AirQualityReading = {
      lat,
      lng,
      aqi,
      pm25: data.current?.pm2_5 ?? null,
      pm10: data.current?.pm10 ?? null,
      category: aqiCategory(aqi),
      source: "Open-Meteo Air Quality API",
      sourceType: "live",
      fetchedAt: new Date().toISOString(),
      cached: false,
    };

    await setCache(key, reading, TTL_MS);
    return reading;
  } catch {
    const cached = await getCached<AirQualityReading>(key);
    if (cached) {
      return { ...cached, cached: true, stale: true, sourceType: "cached" };
    }
    return { ...FALLBACK, fetchedAt: new Date().toISOString() };
  }
}

function aqiCategory(aqi: number | null): string | null {
  if (aqi === null) return null;
  if (aqi <= 20) return "Good";
  if (aqi <= 40) return "Fair";
  if (aqi <= 60) return "Moderate";
  if (aqi <= 80) return "Poor";
  if (aqi <= 100) return "Very Poor";
  return "Extremely Poor";
}
