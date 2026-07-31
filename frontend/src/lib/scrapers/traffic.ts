import type { TrafficReading } from "./types";
import { getCached, setCache } from "./cache";

const BENGALURU = { lat: 12.9716, lng: 77.5946 };
const CACHE_KEY = "traffic-bengaluru";
const TTL_MS = 5 * 60 * 1000;

const FALLBACK: TrafficReading = {
  lat: BENGALURU.lat,
  lng: BENGALURU.lng,
  currentSpeedKmh: 28,
  freeFlowSpeedKmh: 45,
  congestionPct: 38,
  roadName: "MG Road corridor (cached fallback)",
  source: "TomTom Traffic (fallback)",
  sourceType: "cached",
  fetchedAt: new Date(0).toISOString(),
  cached: true,
  stale: true,
};

export async function fetchTraffic(
  lat = BENGALURU.lat,
  lng = BENGALURU.lng,
): Promise<TrafficReading> {
  const key = `${CACHE_KEY}-${lat.toFixed(3)}-${lng.toFixed(3)}`;
  const apiKey = process.env.TOMTOM_API_KEY;

  if (!apiKey) {
    const cached = await getCached<TrafficReading>(key);
    if (cached) {
      return { ...cached, cached: true, stale: true, sourceType: "cached" };
    }
    return {
      ...FALLBACK,
      source: "Estimated baseline (set TOMTOM_API_KEY for live TomTom flow data)",
      sourceType: "estimated",
      fetchedAt: new Date().toISOString(),
    };
  }

  try {
    const url = new URL(
      "https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json",
    );
    url.searchParams.set("point", `${lat},${lng}`);
    url.searchParams.set("key", apiKey);

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(12_000),
      next: { revalidate: 300 },
    });

    if (!res.ok) throw new Error(`TomTom HTTP ${res.status}`);

    const data = (await res.json()) as {
      flowSegmentData?: {
        currentSpeed?: number;
        freeFlowSpeed?: number;
        coordinates?: { coordinate?: { latitude: number; longitude: number } }[];
      };
    };

    const segment = data.flowSegmentData;
    const current = segment?.currentSpeed ?? null;
    const freeFlow = segment?.freeFlowSpeed ?? 1;
    const congestion =
      current !== null ? Math.round(100 - Math.min(100, (current / freeFlow) * 100)) : null;

    const reading: TrafficReading = {
      lat,
      lng,
      currentSpeedKmh: current,
      freeFlowSpeedKmh: freeFlow,
      congestionPct: congestion,
      roadName: "Nearest TomTom flow segment",
      source: "TomTom Traffic Flow API",
      sourceType: "live",
      fetchedAt: new Date().toISOString(),
      cached: false,
    };

    await setCache(key, reading, TTL_MS);
    return reading;
  } catch {
    const cached = await getCached<TrafficReading>(key);
    if (cached) {
      return { ...cached, cached: true, stale: true, sourceType: "cached" };
    }
    return { ...FALLBACK, fetchedAt: new Date().toISOString() };
  }
}
