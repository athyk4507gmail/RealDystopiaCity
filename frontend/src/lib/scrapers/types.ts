export type DataSourceType = "live" | "reported" | "estimated" | "cached";

export interface ScraperMeta {
  source: string;
  sourceType: DataSourceType;
  fetchedAt: string;
  cached: boolean;
  stale?: boolean;
}

export interface WeatherReading extends ScraperMeta {
  lat: number;
  lng: number;
  temperatureC: number | null;
  humidityPct: number | null;
  rainProbabilityPct: number | null;
  windSpeedKmh: number | null;
  summary: string | null;
}

export interface AirQualityReading extends ScraperMeta {
  lat: number;
  lng: number;
  aqi: number | null;
  pm25: number | null;
  pm10: number | null;
  category: string | null;
}

export interface TrafficReading extends ScraperMeta {
  lat: number;
  lng: number;
  currentSpeedKmh: number | null;
  freeFlowSpeedKmh: number | null;
  congestionPct: number | null;
  roadName: string | null;
}

export interface WaterLevelReading extends ScraperMeta {
  reservoirName: string;
  region: string;
  levelM: number | null;
  capacityPct: number | null;
  inflowCusecs: number | null;
  outflowCusecs: number | null;
  lastUpdated: string | null;
}

export interface CityEvent extends ScraperMeta {
  id: string;
  title: string;
  eventType: string;
  location: string;
  lat: number;
  lng: number;
  eventTime: string;
  crowdSize: number;
  affectedRoads: string[];
  predictedSeverity: "low" | "medium" | "high";
  hoursBeforeSurge: number;
  reasoning: string;
}

export type ScraperSource =
  | "weather"
  | "airQuality"
  | "traffic"
  | "waterLevels"
  | "events";

export type ScraperResult =
  | WeatherReading
  | AirQualityReading
  | TrafficReading
  | WaterLevelReading
  | CityEvent[];
