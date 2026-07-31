import type {
  AirQualityReading,
  CityEvent,
  ScraperSource,
  TrafficReading,
  WaterLevelReading,
  WeatherReading,
} from "@/lib/scrapers/types";

type LiveDataMap = {
  weather: WeatherReading;
  airQuality: AirQualityReading;
  traffic: TrafficReading;
  waterLevels: WaterLevelReading;
  events: CityEvent[];
};

export interface LiveDataResponse<S extends ScraperSource = ScraperSource> {
  ok: boolean;
  source: S;
  data?: LiveDataMap[S];
  error?: string;
}

export async function fetchLiveData<S extends ScraperSource>(
  source: S,
): Promise<LiveDataMap[S]> {
  const res = await fetch(`/api/data/${source}`, { cache: "no-store" });
  const body = (await res.json()) as LiveDataResponse<S>;

  if (!res.ok || !body.ok || !body.data) {
    throw new Error(body.error ?? `Failed to fetch live ${source} data`);
  }

  return body.data;
}

export async function fetchLiveDataSafe<S extends ScraperSource>(
  source: S,
): Promise<{ data: LiveDataMap[S] | null; error: string | null }> {
  try {
    const data = await fetchLiveData(source);
    return { data, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
