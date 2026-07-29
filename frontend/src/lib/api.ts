const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }
  return res.json();
}

export const api = {
  water: {
    wards: () => fetchApi<Ward[]>("/api/water/wards"),
    schedule: () => fetchApi<WaterSchedule[]>("/api/water/schedule"),
    generateSchedule: () => fetchApi<WaterSchedule[]>("/api/water/schedule/generate", { method: "POST" }),
    demand: (wardId: number) => fetchApi<DemandPrediction[]>(`/api/water/demand/${wardId}`),
    complaints: (wardId?: number, status?: string) => {
      const params = new URLSearchParams();
      if (wardId) params.set("ward_id", String(wardId));
      if (status) params.set("status", status);
      const query = params.toString();
      return fetchApi<Complaint[]>(`/api/water/complaints${query ? `?${query}` : ""}`);
    },
    createComplaint: (data: { ward_id: number; type: string; description: string }) =>
      fetchApi<Complaint>("/api/water/complaints", { method: "POST", body: JSON.stringify(data) }),
    detectLeakage: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API_BASE}/api/water/leakage/detect`, { method: "POST", body: form });
      return res.json();
    },
  },
  complaints: {
    all: (wardId?: number, status?: string) => {
      const params = new URLSearchParams();
      if (wardId) params.set("ward_id", String(wardId));
      if (status) params.set("status", status);
      const query = params.toString();
      return fetchApi<Complaint[]>(`/api/complaints${query ? `?${query}` : ""}`);
    },
  },
  trustScore: {
    routes: (slot?: string) =>
      fetchApi<BusRoute[]>(`/api/trust-score/routes${slot ? `?time_slot=${slot}` : ""}`),
    recommend: (data: { origin: string; destination: string; time_slot?: string }) =>
      fetchApi<RouteRecommendation>("/api/trust-score/recommend", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    report: (routeId: number, onTime: boolean) =>
      fetchApi<BusRoute>("/api/trust-score/report", {
        method: "POST",
        body: JSON.stringify({ route_id: routeId, on_time: onTime }),
      }),
  },
  riskZones: {
    segments: (week?: number) =>
      fetchApi<RoadSegment[]>(`/api/risk-zones/segments${week !== undefined ? `?week=${week}` : ""}`),
    timeline: () => fetchApi<TimelineWeek[]>("/api/risk-zones/timeline"),
    blackSpots: () => fetchApi<BlackSpot[]>("/api/risk-zones/black-spots"),
    explain: (id: number) => fetchApi<ZoneExplanation>(`/api/risk-zones/explain/${id}`),
  },
  trafficMood: {
    events: () => fetchApi<TrafficEvent[]>("/api/traffic-mood/events"),
    predict: () => fetchApi<TrafficPrediction[]>("/api/traffic-mood/predict"),
    trigger: (id: number) =>
      fetchApi<TriggerResult>(`/api/traffic-mood/trigger/${id}`, { method: "POST" }),
  },
  traffic: {
    signals: () => fetchApi<TrafficSignal[]>("/api/traffic/signals"),
    feed: () => fetchApi<TrafficFeedItem[]>("/api/traffic/feed"),
    recommendations: () => fetchApi<SignalRecommendation[]>("/api/traffic/signals/recommend"),
    ambulance: (data: CorridorRequest) =>
      fetchApi<AmbulanceCorridor>("/api/traffic/ambulance-corridor", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    altRoutes: (from: string, to: string) =>
      fetchApi<AltRoute[]>("/api/traffic/alternative-routes", {
        method: "POST",
        body: JSON.stringify({ from_road: from, to_road: to }),
      }),
  },
  trafficManagement: {
    liveState: () => fetchApi<TrafficManagementLiveState>("/api/traffic-management/live-state"),
    liveCamera: () => fetchApi<LiveCameraState>("/api/traffic-management/live-camera"),
    liveCameras: () =>
      fetchApi<{ cameras: Record<string, LiveCameraState>; last_updated: string }>(
        "/api/traffic-management/live-cameras"
      ),
    captureJunction: async (junctionId: string, file: File) => {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch(`${API_BASE}/api/traffic-management/junction/${junctionId}/capture`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      return res.json() as Promise<JunctionCaptureResult>;
    },
  },
  metabolism: {
    vitals: () => fetchApi<CityVitals>("/api/metabolism/vitals"),
    stressTest: (event: string) =>
      fetchApi<StressTestResult>(`/api/metabolism/stress-test/${event}`, { method: "POST" }),
  },
  integrations: {
    weather: (lat: number, lng: number) => fetchApi<WeatherPayload>(`/api/integrations/weather?lat=${lat}&lng=${lng}`),
    locations: (city?: string) =>
      fetchApi<LocationPayload>(`/api/integrations/locations${city ? `?city=${encodeURIComponent(city)}` : ""}`),
    traffic: (lat: number, lng: number) => fetchApi<LiveTrafficPayload>(`/api/integrations/traffic?lat=${lat}&lng=${lng}`),
  },
  chat: (message: string, module: string) =>
    fetchApi<ChatResponse>("/api/chat/", {
      method: "POST",
      body: JSON.stringify({ message, module }),
    }),
  health: () => fetchApi<{ status: string; ai_mode: string }>("/api/health"),
};

export interface SourceTagged {
  source_type?: "live" | "reported" | "estimated";
  source_label?: "Live" | "Reported" | "Estimated";
  source_detail?: string;
}

export interface Ward extends SourceTagged {
  id: number;
  name: string;
  population: number;
  houses: number;
  tank_capacity_litres: number;
  available_water_litres: number;
  last_supply_date: string;
  days_since_supply: number;
  avg_daily_consumption: number;
  complaints: number;
  leakage_reports: number;
  temperature_c: number;
  growth_rate_pct: number;
  lat: number;
  lng: number;
  polygon?: number[][];
}

export interface WaterSchedule extends SourceTagged {
  ward_id: number;
  ward_name: string;
  supply_today: boolean;
  allocation_litres: number;
  duration_hours: number;
  supply_start_time: string;
  supply_end_time: string;
  priority: string;
  reasoning: string;
  sub_localities: SubLocality[];
}

export interface SubLocality {
  name: string;
  priority_rank: number;
  allocation_litres: number;
}

export interface DemandPrediction extends SourceTagged {
  day: string;
  predicted_litres: number;
  confidence: number;
}

export interface Complaint extends SourceTagged {
  id: number;
  ward_id: number;
  ward_name: string;
  type: string;
  description: string;
  status: string;
  created_at: string;
}

export interface BusRoute extends SourceTagged {
  id: number;
  route_number: string;
  name: string;
  stops: number;
  avg_delay_minutes: number;
  trust_score: number;
  time_slot: string;
  citizen_reports_on_time: number;
  citizen_reports_late: number;
}

export interface RouteRecommendation {
  recommended_route: string;
  trust_score: number;
  reasoning: string;
  alternatives: string[];
}

export interface RoadSegment extends SourceTagged {
  id: number;
  name: string;
  coordinates: number[][];
  hard_braking_events: number;
  swerving_events: number;
  speed_variance: number;
  risk_score: number;
  accident_count: number;
  week_index: number;
  zone_type?: "reported_black_spot" | "ai_predicted";
}

export interface TimelineWeek {
  week: number;
  label: string;
  avg_risk: number;
  high_risk_count: number;
  accidents: number;
  segments: RoadSegment[];
}

export interface ZoneExplanation {
  explanation: string;
  risk_level: string;
  recommendation: string;
  segment: RoadSegment;
}

export interface TrafficEvent {
  id: number;
  title: string;
  event_type: string;
  location: string;
  lat: number;
  lng: number;
  event_time: string;
  crowd_size: number;
  affected_roads: string[];
  predicted_severity: string;
  hours_before_surge: number;
  reasoning?: string;
}

export interface TrafficPrediction {
  road: string;
  severity: string;
  hours_before_surge: number;
  reasoning: string;
  event_id?: number;
  lat?: number;
  lng?: number;
}

export interface TriggerResult {
  event: TrafficEvent;
  predictions: TrafficPrediction[];
  simulation: { status: string; cars_building: boolean; affected_roads: string[]; severity: string };
}

export interface TrafficSignal {
  id: number;
  name: string;
  lat: number;
  lng: number;
  green_time_sec: number;
  queue_length: number;
  congestion_pct: number;
}

export interface TrafficFeedItem {
  signal_id: number;
  name: string;
  lat: number;
  lng: number;
  congestion_pct: number;
  queue_length: number;
  status: string;
  source_type?: "live" | "reported" | "estimated";
  source_label?: "Live" | "Reported" | "Estimated";
  source_detail?: string;
}

export interface SignalRecommendation {
  signal_id: number;
  signal_name: string;
  current_green_sec: number;
  recommended_green_sec: number;
  reasoning: string;
  congestion_change_pct: number;
  lat: number;
  lng: number;
  source_type?: "live" | "reported" | "estimated";
  source_label?: "Live" | "Reported" | "Estimated";
  source_detail?: string;
}

export interface CorridorRequest {
  start_lat: number;
  start_lng: number;
  end_lat: number;
  end_lng: number;
}

export interface AmbulanceCorridor {
  route: { start: { lat: number; lng: number }; end: { lat: number; lng: number } };
  corridor: { signal_id: number; name: string; lat: number; lng: number; status: string; order: number }[];
  reasoning: string;
}

export interface AltRoute {
  route: string;
  eta_minutes: number;
  congestion: string;
  reasoning: string;
}

export interface CityVitals {
  water_pressure: number;
  traffic_flow: number;
  energy_load: number;
  air_quality_index: number;
  timestamp: string;
  source_type?: "live" | "reported" | "estimated";
  source_label?: "Live" | "Reported" | "Estimated";
  source_detail?: string;
}

export interface StressTestResult {
  event_type: string;
  nodes: { id: string; label: string; effect: number; description: string; status: string }[];
  edges: { from: string; to: string; weight: number }[];
  vitals_before: CityVitals;
  vitals_after: CityVitals;
  resilience_index: number;
  narrative: string;
  cascade_steps: { step: number; node: string; action: string }[];
  source_type?: "live" | "reported" | "estimated";
  source_label?: "Live" | "Reported" | "Estimated";
  source_detail?: string;
}

export interface ChatResponse {
  role: string;
  content: string;
  module: string;
}

export interface BlackSpot extends SourceTagged {
  name: string;
  lat: number;
  lng: number;
  zone_type: "reported_black_spot";
}

export interface WeatherPayload extends SourceTagged {
  lat: number;
  lng: number;
  cached: boolean;
  current: {
    temperature_c: number | null;
    humidity_pct: number | null;
    rain_probability: number | null;
    summary: string | null;
    timestamp: string | null;
  } | null;
  forecast_48h: Array<{
    timestamp: string;
    temperature_c: number | null;
    humidity_pct: number | null;
    rain_probability: number | null;
  }>;
}

export interface LocationPayload extends SourceTagged {
  city: string;
  wards: Array<{ name: string; coordinates: number[][] }>;
  roads: Array<{ name: string; coordinates: number[][] }>;
}

export interface LiveTrafficPayload extends SourceTagged {
  lat: number;
  lng: number;
  current_speed_kmh: number | null;
  free_flow_speed_kmh: number | null;
  congestion_pct: number | null;
}

export interface DetectionBox {
  class: string;
  confidence: number;
  bbox: [number, number, number, number];
  /** Present on night headlight/taillight blob detections only. */
  source?: string;
}

export interface LiveCameraState {
  camera_id?: string;
  road?: string;
  label?: string;
  camera_source: string;
  vehicle_count: number;
  person_count: number;
  detections: DetectionBox[];
  green_seconds: number;
  red_seconds: number;
  status: "Light" | "Moderate" | "Heavy";
  explanation?: string;
  image_last_updated: string | null;
  annotated_image_url: string;
  fetch_error?: string | null;
  night_mode?: boolean;
  frame_brightness?: number | null;
  light_blob_added?: number;
}

export interface JunctionState {
  vehicle_count: number;
  detections: DetectionBox[];
  red_light_duration: number;
  is_congested: boolean;
  timestamp: string | null;
  image_path: string | null;
}

export interface TrafficManagementLiveState {
  junctions: Record<string, JunctionState>;
  signal_durations: Record<string, number>;
  explanation: string;
  last_updated: string;
}

export interface JunctionCaptureResult {
  junction_id: string;
  vehicle_count: number;
  detections: DetectionBox[];
  timestamp: string;
}
