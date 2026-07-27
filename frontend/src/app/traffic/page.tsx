"use client";

import { useEffect, useState, useRef } from "react";
import { Ambulance, Route } from "lucide-react";
import { api, TrafficFeedItem, SignalRecommendation, AmbulanceCorridor, AltRoute } from "@/lib/api";
import MapboxMap, { MapMarker, MapLine } from "@/components/MapboxMap";
import ReasoningBox from "@/components/ReasoningBox";
import StatCard from "@/components/StatCard";
import DataSourceBadge from "@/components/DataSourceBadge";

export default function TrafficPage() {
  const [feed, setFeed] = useState<TrafficFeedItem[]>([]);
  const [recommendations, setRecommendations] = useState<SignalRecommendation[]>([]);
  const [corridor, setCorridor] = useState<AmbulanceCorridor | null>(null);
  const [altRoutes, setAltRoutes] = useState<AltRoute[]>([]);
  const [carMarkers, setCarMarkers] = useState<MapMarker[]>([]);
  const animRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    Promise.all([api.traffic.feed(), api.traffic.recommendations()]).then(([f, r]) => {
      setFeed(f);
      setRecommendations(r);
    });

    const cars: MapMarker[] = [];
    for (let i = 0; i < 20; i++) {
      cars.push({
        id: `traffic-car-${i}`,
        lat: 12.97 + Math.random() * 0.03,
        lng: 77.59 + Math.random() * 0.03,
        className: "car-marker",
      });
    }
    setCarMarkers(cars);

    animRef.current = setInterval(() => {
      setCarMarkers((prev) =>
        prev.map((c) => ({
          ...c,
          lat: (c.lat as number) + (Math.random() - 0.5) * 0.0005,
          lng: (c.lng as number) + (Math.random() - 0.5) * 0.0005,
        }))
      );
    }, 500);

    return () => { if (animRef.current) clearInterval(animRef.current); };
  }, []);

  const triggerAmbulance = async () => {
    const result = await api.traffic.ambulance({
      start_lat: 12.978,
      start_lng: 77.599,
      end_lat: 12.917,
      end_lng: 77.623,
    });
    setCorridor(result);
  };

  const getAltRoutes = async () => {
    const routes = await api.traffic.altRoutes("MG Road", "Silk Board");
    setAltRoutes(routes);
  };

  const avgCongestion = feed.length
    ? (feed.reduce((a, f) => a + f.congestion_pct, 0) / feed.length).toFixed(0)
    : "—";

  const signalMarkers: MapMarker[] = feed.map((s) => ({
    id: s.signal_id,
    lat: s.lat,
    lng: s.lng,
    popup: `<strong>${s.name}</strong><br/>Congestion: ${s.congestion_pct.toFixed(0)}%<br/>Queue: ${s.queue_length}`,
    color: s.congestion_pct > 60 ? "#ef4444" : s.congestion_pct > 35 ? "#f59e0b" : "#10b981",
    className: corridor?.corridor.some((c) => c.signal_id === s.signal_id)
      ? "ambulance-marker"
      : "car-marker",
  }));

  const corridorLine: MapLine[] = corridor
    ? [{
        id: "corridor",
        coordinates: corridor.corridor.map((c) => [c.lng, c.lat]),
        color: "#ef4444",
        width: 5,
      }]
    : [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">AI Smart Traffic Management</h1>
          <p className="text-slate-400 text-sm mt-1">Live monitoring, signal optimization, and emergency corridors</p>
          <div className="mt-2 flex gap-2">
            <DataSourceBadge type="live" detail="Current congestion baseline" />
            <DataSourceBadge type="estimated" detail="Signal recommendations and corridor logic" />
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={triggerAmbulance}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 text-sm hover:bg-red-500/30"
          >
            <Ambulance className="w-4 h-4" /> Ambulance Green Corridor
          </button>
          <button
            onClick={getAltRoutes}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 text-sm hover:bg-white/10"
          >
            <Route className="w-4 h-4" /> Alt Routes
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Signals" value={feed.length} color="cyan" sourceType="live" />
        <StatCard label="Avg Congestion" value={`${avgCongestion}%`} color="yellow" sourceType="live" />
        <StatCard label="Heavy Traffic" value={feed.filter((f) => f.status === "heavy").length} color="red" sourceType="live" />
        <StatCard label="Corridor" value={corridor ? "Active" : "Standby"} color="purple" sourceType="estimated" />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="rounded-xl border border-border overflow-hidden h-[450px]">
          <MapboxMap markers={[...signalMarkers, ...carMarkers]} lines={corridorLine} zoom={11.5} />
        </div>

        <div className="space-y-3 max-h-[450px] overflow-y-auto">
          {recommendations.map((rec) => (
            <div key={rec.signal_id} className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-medium text-sm">{rec.signal_name}</span>
                <span className="text-xs text-accent">
                  {rec.current_green_sec}s → {rec.recommended_green_sec}s
                </span>
              </div>
              <ReasoningBox reasoning={rec.reasoning} />
            </div>
          ))}
        </div>
      </div>

      {corridor && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 space-y-2">
          <h3 className="font-medium text-red-400">Emergency Green Corridor Active</h3>
          <ReasoningBox reasoning={corridor.reasoning} title="Corridor Strategy" />
          <div className="flex gap-2 flex-wrap">
            {corridor.corridor.map((c) => (
              <span key={c.signal_id} className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded">
                {c.order}. {c.name} — GREEN
              </span>
            ))}
          </div>
        </div>
      )}

      {altRoutes.length > 0 && (
        <div className="rounded-xl border border-border p-4 space-y-3">
          <h3 className="font-medium">Alternative Routes</h3>
          {altRoutes.map((r, i) => (
            <div key={i} className="rounded-lg bg-white/5 p-3">
              <div className="flex justify-between text-sm">
                <span className="font-medium">{r.route}</span>
                <span className="text-accent">{r.eta_minutes} min · {r.congestion}</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">{r.reasoning}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
