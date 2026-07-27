"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Zap } from "lucide-react";
import { api, TrafficEvent, TrafficPrediction, TriggerResult } from "@/lib/api";
import MapboxMap, { MapMarker } from "@/components/MapboxMap";
import ReasoningBox from "@/components/ReasoningBox";
import StatCard from "@/components/StatCard";
import DataSourceBadge from "@/components/DataSourceBadge";

export default function TrafficMoodPage() {
  const [events, setEvents] = useState<TrafficEvent[]>([]);
  const [predictions, setPredictions] = useState<TrafficPrediction[]>([]);
  const [activeSim, setActiveSim] = useState<TriggerResult | null>(null);
  const [carMarkers, setCarMarkers] = useState<MapMarker[]>([]);
  const animRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    Promise.all([api.trafficMood.events(), api.trafficMood.predict()]).then(([e, p]) => {
      setEvents(e);
      setPredictions(p);
    });
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
          lat: (c.lat as number) + 0.0003 * (Math.random() - 0.3),
          lng: (c.lng as number) + 0.0002 * (Math.random() - 0.2),
        }))
      );
      if (tick > 60) {
        if (animRef.current) clearInterval(animRef.current);
      }
    }, 200);
  }, []);

  const triggerEvent = async (id: number) => {
    const result = await api.trafficMood.trigger(id);
    setActiveSim(result);
    startCarSimulation(result.event);
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
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">AI Traffic Mood Predictor</h1>
        <p className="text-slate-400 text-sm mt-1">Predict congestion from events sensors can&apos;t see</p>
        <div className="mt-2 flex gap-2">
          <DataSourceBadge type="reported" detail="Real event signals and listings" />
          <DataSourceBadge type="estimated" detail="Surge severity and timing predictions" />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Active Events" value={events.length} color="purple" sourceType="reported" />
        <StatCard label="Predictions" value={predictions.length} color="cyan" sourceType="estimated" />
        <StatCard label="High Severity" value={predictions.filter((p) => p.severity === "high").length} color="red" sourceType="estimated" />
        <StatCard label="Simulation" value={activeSim ? "Active" : "Idle"} color="yellow" sourceType="estimated" />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="rounded-xl border border-border overflow-hidden h-[450px] relative">
          <MapboxMap markers={[...eventMarkers, ...carMarkers]} zoom={11.5} />
          {activeSim && (
            <div className="absolute top-3 left-3 bg-card/90 border border-border rounded-lg px-3 py-2 text-xs">
              <span className="text-red-400 font-medium">LIVE SIM</span> — Cars building on {activeSim.simulation.affected_roads.join(", ")}
            </div>
          )}
        </div>

        <div className="space-y-3 max-h-[450px] overflow-y-auto">
          {events.map((event) => (
            <div key={event.id} className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium text-sm">{event.title}</p>
                  <p className="text-xs text-slate-400">{event.location} · {event.event_type}</p>
                </div>
                <button
                  onClick={() => triggerEvent(event.id)}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-accent/20 text-accent text-xs hover:bg-accent/30"
                >
                  <Zap className="w-3 h-3" /> Trigger
                </button>
              </div>
              <div className="flex gap-3 text-xs">
                <span className={severityColor(event.predicted_severity)}>
                  {event.predicted_severity} severity
                </span>
                <span className="text-slate-400">{event.hours_before_surge}h before surge</span>
                <span className="text-slate-400">{event.crowd_size.toLocaleString()} people</span>
              </div>
              {event.reasoning && <ReasoningBox reasoning={event.reasoning} />}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border p-4">
        <h3 className="font-medium mb-3">Surge Predictions</h3>
        <div className="grid grid-cols-3 gap-3">
          {predictions.map((p, i) => (
            <div key={i} className="rounded-lg bg-white/5 p-3 space-y-1">
              <div className="flex justify-between">
                <span className="font-medium text-sm">{p.road}</span>
                <span className={`text-xs ${severityColor(p.severity)}`}>{p.severity}</span>
              </div>
              <p className="text-xs text-slate-400">{p.hours_before_surge}h advance warning</p>
              <p className="text-xs text-slate-300">{p.reasoning}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
