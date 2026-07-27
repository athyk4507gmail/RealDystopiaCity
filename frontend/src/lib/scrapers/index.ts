import type { ScraperResult, ScraperSource } from "./types";
import { fetchWeather } from "./weather";
import { fetchAirQuality } from "./airQuality";
import { fetchTraffic } from "./traffic";
import { fetchWaterLevels } from "./waterLevels";
import { fetchEvents } from "./events";

export async function runScraper(source: ScraperSource): Promise<ScraperResult> {
  switch (source) {
    case "weather":
      return fetchWeather();
    case "airQuality":
      return fetchAirQuality();
    case "traffic":
      return fetchTraffic();
    case "waterLevels":
      return fetchWaterLevels();
    case "events":
      return fetchEvents();
    default:
      throw new Error(`Unknown scraper source: ${source satisfies never}`);
  }
}

export const VALID_SOURCES: ScraperSource[] = [
  "weather",
  "airQuality",
  "traffic",
  "waterLevels",
  "events",
];

export function isValidSource(value: string): value is ScraperSource {
  return (VALID_SOURCES as string[]).includes(value);
}
