"use client";

import { useEffect, useState } from "react";
import { Play, Pause } from "lucide-react";
import { api, BlackSpot, RoadSegment, TimelineWeek, ZoneExplanation } from "@/lib/api";
import MapboxMap from "@/components/MapboxMap";
import ReasoningBox from "@/components/ReasoningBox";
import StatCard from "@/components/StatCard";
import DataSourceBadge from "@/components/DataSourceBadge";
import { TiltCard } from "@/components/TiltCard";

export default function RiskZonesPage() {
  const [timeline, setTimeline] = useState<TimelineWeek[]>([]);
  const [week, setWeek] = useState(4);
  const [playing, setPlaying] = useState(false);
  const [explanation, setExplanation] = useState<ZoneExplanation | null>(null);
  const [segments, setSegments] = useState<RoadSegment[]>([]);
  const [blackSpots, setBlackSpots] = useState<BlackSpot[]>([]);

  useEffect(() => {
    api.riskZones.timeline().then((t) => {
      setTimeline(t);
      if (t.length) {
        setWeek(t[t.length - 1].week);
        setSegments(t[t.length - 1].segments);
      }
    });
    api.riskZones.blackSpots().then(setBlackSpots);
  }, []);

  useEffect(() => {
    const current = timeline.find((t) => t.week === week);
    if (current) setSegments(current.segments);
  }, [week, timeline]);

  useEffect(() => {
    if (!playing) return;
    const interval = setInterval(() => {
      setWeek((w) => {
        const next = w + 1;
        if (next > 4) {
          setPlaying(false);
          return 4;
        }
        return next;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [playing]);

  const explain = async (id: number) => {
    const exp = await api.riskZones.explain(id);
    setExplanation(exp);
  };

  const highRisk = segments.filter((s) => s.risk_score > 60);
  const confirmed = segments.filter((s) => s.accident_count > 0);

  const lines = segments.map((s) => ({
    id: s.id,
    coordinates: s.coordinates,
    color: s.risk_score > 70 ? "#ef4444" : s.risk_score > 45 ? "#f59e0b" : "#10b981",
    width: Math.max(3, s.risk_score / 15),
  }));

  const heatmapPoints = segments.map((s) => ({
    lat: s.coordinates[0][1],
    lng: s.coordinates[0][0],
    weight: s.risk_score / 100,
  }));

  const currentWeek = timeline.find((t) => t.week === week);
  const blackSpotMarkers = blackSpots.map((spot) => ({
    id: `black-spot-${spot.name}`,
    lat: spot.lat,
    lng: spot.lng,
    color: "#facc15",
    className: "reported-marker",
    popup: `<strong>${spot.name}</strong><br/>Reported Black Spot`,
  }));

  return (
    <div className="page-panel">
      <TiltCard>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="page-title">Driver Behavior Risk Zones</h1>
            <p className="text-slate-400 text-sm mt-2">Predict accident-prone segments before crashes occur</p>
            <div className="mt-2 flex gap-2">
              <DataSourceBadge type="reported" detail="Publicly reported traffic black spots" />
              <DataSourceBadge type="estimated" detail="AI-predicted risk zones from behavior signals" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setPlaying(!playing)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-black text-sm font-medium"
            >
              {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {playing ? "Pause" : "Play Timeline"}
            </button>
            <input
              type="range"
              min={0}
              max={4}
              value={week}
              onChange={(e) => setWeek(Number(e.target.value))}
              className="w-32"
            />
            <span className="text-sm text-slate-400">Week {week + 1}</span>
          </div>
        </div>
      </TiltCard>

      <div className="grid grid-cols-4 gap-4 mb-2">
        <StatCard label="Avg Risk" value={currentWeek?.avg_risk ?? "—"} color="yellow" sourceType="estimated" />
        <StatCard label="High Risk Segments" value={highRisk.length} color="red" sourceType="estimated" />
        <StatCard label="Reported Black Spots" value={blackSpots.length} color="purple" sourceType="reported" />
        <StatCard label="Week" value={`${week + 1} / 5`} color="cyan" sourceType="estimated" />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="glass-panel overflow-hidden h-[450px]">
          <MapboxMap lines={lines} heatmapPoints={heatmapPoints} markers={blackSpotMarkers} zoom={11.5} />
        </div>

        <div className="space-y-3 max-h-[450px] overflow-y-auto">
          {segments
            .sort((a, b) => b.risk_score - a.risk_score)
            .slice(0, 8)
            .map((s) => (
              <button
                key={s.id}
                onClick={() => explain(s.id)}
                className="w-full text-left glass-panel hover:border-accent/30 transition-colors"
              >
                <div className="flex justify-between items-center">
                  <span className="font-medium text-sm">{s.name}</span>
                  <span
                    className="text-xs font-bold px-2 py-0.5 rounded"
                    style={{
                      background: s.risk_score > 70 ? "rgba(239,68,68,0.2)" : "rgba(245,158,11,0.2)",
                      color: s.risk_score > 70 ? "#ef4444" : "#f59e0b",
                    }}
                  >
                    {s.risk_score}
                  </span>
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {s.hard_braking_events} hard brakes · {s.swerving_events} swerves
                  {s.accident_count > 0 && <span className="text-red-400 ml-2">Accident confirmed</span>}
                </div>
              </button>
            ))}
        </div>
      </div>

      <div className="glass-panel text-xs text-slate-300 flex items-center gap-4">
        <span className="inline-flex items-center gap-1"><span className="reported-marker" /> Reported Black Spot</span>
        <span className="inline-flex items-center gap-1"><span className="car-marker" /> AI-Predicted Emerging Risk</span>
      </div>

      {explanation && (
        <div className="glass-panel space-y-3">
          <h3 className="font-medium">{explanation.segment.name} — Risk Analysis</h3>
          <ReasoningBox reasoning={explanation.explanation} />
          <p className="text-sm text-slate-400">Recommendation: {explanation.recommendation}</p>
        </div>
      )}
    </div>
  );
}
