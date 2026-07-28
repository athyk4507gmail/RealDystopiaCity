"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { Zap } from "lucide-react";
import { api, TrafficEvent, TrafficPrediction, TriggerResult } from "@/lib/api";
import type { CityEvent } from "@/lib/scrapers/types";
import { useLiveData } from "@/hooks/useLiveData";
import MapboxMap, { MapMarker } from "@/components/MapboxMap";
import ReasoningBox from "@/components/ReasoningBox";
import StatCard from "@/components/StatCard";
import DataSourceBadge from "@/components/DataSourceBadge";
import LiveSourceBanner from "@/components/LiveSourceBanner";
import LoadingSkeleton, { StatCardSkeleton, MapSkeleton } from "@/components/LoadingSkeleton";
import DataError from "@/components/DataError";
import ErrorBoundary from "@/components/ErrorBoundary";
import { TiltCard } from "@/components/TiltCard";

function mergeEvents(backend: TrafficEvent[], live: CityEvent[] | null): TrafficEvent[] {
  if (!live?.length) return backend;

  const liveAsTraffic: TrafficEvent[] = live.map((e, i) => ({
    id: 10_000 + i,
    title: e.title,
    event_type: e.eventType,
    location: e.location,
    lat: e.lat,
    lng: e.lng,
    event_time: e.eventTime,
    crowd_size: e.crowdSize,
    affected_roads: e.affectedRoads,
    predicted_severity: e.predictedSeverity,
    hours_before_surge: e.hoursBeforeSurge,
    reasoning: e.reasoning,
  }));

  const seen = new Set(backend.map((e) => e.title.toLowerCase()));
  const merged = [...backend];
  for (const event of liveAsTraffic) {
    if (!seen.has(event.title.toLowerCase())) {
      merged.push(event);
      seen.add(event.title.toLowerCase());
    }
  }
  return merged;
}

export default function TrafficMoodPage() {
  const [backendEvents, setBackendEvents] = useState<TrafficEvent[]>([]);
  const [predictions, setPredictions] = useState<TrafficPrediction[]>([]);
  const [activeSim, setActiveSim] = useState<TriggerResult | null>(null);
  const [carMarkers, setCarMarkers] = useState<MapMarker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const animRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: liveEvents, loading: liveLoading, error: liveError, refresh: refreshLive } =
    useLiveData<CityEvent[]>("events");

  const events = useMemo(
    () => mergeEvents(backendEvents, liveEvents),
    [backendEvents, liveEvents],
  );

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [e, p] = await Promise.all([api.trafficMood.events(), api.trafficMood.predict()]);
      setBackendEvents(e);
      setPredictions(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load traffic mood data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    return () => { if (animRef.current) clearInterval(animRef.current); };
  }, []);

  const startCarSimulation = useCallback((event: TrafficEvent) => {
    if (animRef.current) clearInterval(animRef.current);
    const cars: MapMarker[] = [];
    for (let i = 0; i < 30; i++) {
      cars.push({
        id: `car-${i}`,
        lat: event.lat + (Math.random() - 0.5) * 0.02,
        lng: event.lng + (Math.random() - 0.5) * 0.02,
        className: "car-marker",
      });
    }
    setCarMarkers(cars);

    let tick = 0;
    animRef.current = setInterval(() => {
      tick++;
      setCarMarkers((prev) =>
        prev.map((c) => ({
          ...c,
          lat: c.lat + 0.0003 * (Math.random() - 0.3),
          lng: c.lng + 0.0002 * (Math.random() - 0.2),
        }))
      );
      if (tick > 60 && animRef.current) clearInterval(animRef.current);
    }, 200);
  }, []);

  const triggerEvent = async (id: number) => {
    try {
      const result = await api.trafficMood.trigger(id);
      setActiveSim(result);
      startCarSimulation(result.event);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Simulation trigger failed");
    }
  };

  const severityColor = (s: string) =>
    s === "high" ? "text-red-400" : s === "medium" ? "text-yellow-400" : "text-emerald-400";

  const eventMarkers: MapMarker[] = events.map((e) => ({
    id: e.id,
    lat: e.lat,
    lng: e.lng,
    popup: `<strong>${e.title}</strong><br/>${e.predicted_severity} severity`,
    color: e.predicted_severity === "high" ? "#ef4444" : "#f59e0b",
  }));

  return (
    <ErrorBoundary fallbackTitle="Traffic mood module failed to render">
      <div className="page-panel">
        {error && <DataError message={error} onRetry={load} />}
        {liveError && <DataError message={liveError} onRetry={refreshLive} />}

        <TiltCard>
          <div className="mb-6">
            <h1 className="page-title">AI Traffic Mood Predictor</h1>
            <p className="text-slate-400 text-sm mt-2">Predict congestion from events sensors can&apos;t see</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <DataSourceBadge type="reported" detail="Real event signals and listings" />
              <DataSourceBadge type="estimated" detail="Surge severity and timing predictions" />
              {liveEvents?.[0] && (
                <LiveSourceBanner
                  source={liveEvents[0].source}
                  sourceType={liveEvents[0].sourceType}
                  stale={liveEvents[0].stale}
                  cached={liveEvents[0].cached}
                />
              )}
            </div>
          </div>
        </TiltCard>

        <div className="grid grid-cols-4 gap-4">
          {loading || liveLoading ? (
            <>
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
            </>
          ) : (
            <>
              <StatCard label="Active Events" value={events.length} color="purple" sourceType="reported" />
              <StatCard label="Predictions" value={predictions.length} color="cyan" sourceType="estimated" />
              <StatCard label="High Severity" value={predictions.filter((p) => p.severity === "high").length} color="red" sourceType="estimated" />
              <StatCard label="Simulation" value={activeSim ? "Active" : "Idle"} color="yellow" sourceType="estimated" />
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="glass-panel overflow-hidden h-[450px] relative">
            {loading ? (
              <MapSkeleton className="h-full w-full" />
            ) : (
              <>
                <MapboxMap markers={[...eventMarkers, ...carMarkers]} zoom={11.5} />
                {activeSim && (
                  <div className="absolute top-3 left-3 bg-card/90 border border-border rounded-lg px-3 py-2 text-xs">
                    <span className="text-red-400 font-medium">LIVE SIM</span> — Cars building on {activeSim.simulation.affected_roads.join(", ")}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="space-y-3 max-h-[450px] overflow-y-auto">
            {loading ? (
              <LoadingSkeleton rows={5} />
            ) : events.length === 0 ? (
              <p className="text-sm text-slate-400">No events available.</p>
            ) : (
              events.map((event) => (
                <div key={event.id} className="glass-panel space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-sm">{event.title}</p>
                      <p className="text-xs text-slate-400">{event.location} · {event.event_type}</p>
                    </div>
                    {event.id < 10_000 && (
                      <button
                        onClick={() => triggerEvent(event.id)}
                        className="flex items-center gap-1 px-2 py-1 rounded bg-accent/20 text-accent text-xs hover:bg-accent/30"
                      >
                        <Zap className="w-3 h-3" /> Trigger
                      </button>
                    )}
                  </div>
                  <div className="flex gap-3 text-xs">
                    <span className={severityColor(event.predicted_severity)}>
                      {event.predicted_severity} severity
                    </span>
                    <span className="text-slate-400">{event.hours_before_surge}h before surge</span>
                    <span className="text-slate-400">{event.crowd_size.toLocaleString("en-IN")} people</span>
                  </div>
                  {event.reasoning && <ReasoningBox reasoning={event.reasoning} />}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="glass-panel">
          <h3 className="font-medium mb-3">Surge Predictions</h3>
          {predictions.length === 0 ? (
            <LoadingSkeleton rows={3} />
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {predictions.map((p) => (
                <div key={`${p.road}-${p.event_id ?? p.hours_before_surge}`} className="rounded-lg bg-white/5 p-3 space-y-1">
                  <div className="flex justify-between">
                    <span className="font-medium text-sm">{p.road}</span>
                    <span className={`text-xs ${severityColor(p.severity)}`}>{p.severity}</span>
                  </div>
                  <p className="text-xs text-slate-400">{p.hours_before_surge}h advance warning</p>
                  <p className="text-xs text-slate-300">{p.reasoning}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}
