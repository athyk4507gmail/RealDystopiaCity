"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { Ambulance, Route } from "lucide-react";
import { api, TrafficFeedItem, SignalRecommendation, AmbulanceCorridor, AltRoute } from "@/lib/api";
import type { TrafficReading } from "@/lib/scrapers/types";
import { useLiveData } from "@/hooks/useLiveData";
import MapboxMap, { MapMarker, MapLine } from "@/components/MapboxMap";
import ReasoningBox from "@/components/ReasoningBox";
import StatCard from "@/components/StatCard";
import DataSourceBadge from "@/components/DataSourceBadge";
import LiveSourceBanner from "@/components/LiveSourceBanner";
import LoadingSkeleton, { StatCardSkeleton, MapSkeleton } from "@/components/LoadingSkeleton";
import DataError from "@/components/DataError";
import ErrorBoundary from "@/components/ErrorBoundary";
import { TiltCard } from "@/components/TiltCard";

export default function TrafficPage() {
  const [feed, setFeed] = useState<TrafficFeedItem[]>([]);
  const [recommendations, setRecommendations] = useState<SignalRecommendation[]>([]);
  const [corridor, setCorridor] = useState<AmbulanceCorridor | null>(null);
  const [altRoutes, setAltRoutes] = useState<AltRoute[]>([]);
  const [carMarkers, setCarMarkers] = useState<MapMarker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const animRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: liveTraffic, loading: liveLoading, error: liveError, refresh: refreshLive } =
    useLiveData<TrafficReading>("traffic");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [f, r] = await Promise.all([api.traffic.feed(), api.traffic.recommendations()]);
      setFeed(f);
      setRecommendations(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load traffic data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();

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
          lat: c.lat + (Math.random() - 0.5) * 0.0005,
          lng: c.lng + (Math.random() - 0.5) * 0.0005,
        }))
      );
    }, 500);

    return () => { if (animRef.current) clearInterval(animRef.current); };
  }, []);

  const triggerAmbulance = async () => {
    try {
      const result = await api.traffic.ambulance({
        start_lat: 12.978,
        start_lng: 77.599,
        end_lat: 12.917,
        end_lng: 77.623,
      });
      setCorridor(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ambulance corridor failed");
    }
  };

  const getAltRoutes = async () => {
    try {
      const routes = await api.traffic.altRoutes("MG Road", "Silk Board");
      setAltRoutes(routes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch alternative routes");
    }
  };

  const avgCongestion = useMemo(() => {
    if (liveTraffic?.congestionPct != null) {
      return liveTraffic.congestionPct.toFixed(0);
    }
    if (!feed.length) return "—";
    return (feed.reduce((a, f) => a + f.congestion_pct, 0) / feed.length).toFixed(0);
  }, [feed, liveTraffic]);

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
    <ErrorBoundary fallbackTitle="Traffic module failed to render">
      <div className="page-panel">
        {error && <DataError message={error} onRetry={load} />}
        {liveError && <DataError message={liveError} onRetry={refreshLive} />}

        <TiltCard>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="page-title">AI Smart Traffic Management</h1>
              <p className="text-slate-400 text-sm mt-2">Live monitoring, signal optimization, and emergency corridors</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <DataSourceBadge type="live" detail="Current congestion baseline" />
                <DataSourceBadge type="estimated" detail="Signal recommendations and corridor logic" />
                {liveTraffic && (
                  <LiveSourceBanner
                    source={liveTraffic.source}
                    sourceType={liveTraffic.sourceType}
                    stale={liveTraffic.stale}
                    cached={liveTraffic.cached}
                  />
                )}
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
              <StatCard label="Signals" value={feed.length} color="cyan" sourceType="live" />
              <StatCard
                label="Avg Congestion"
                value={`${avgCongestion}%`}
                sub={liveTraffic?.roadName ?? undefined}
                color="yellow"
                sourceType={liveTraffic?.sourceType === "live" ? "live" : "estimated"}
              />
              <StatCard label="Heavy Traffic" value={feed.filter((f) => f.status === "heavy").length} color="red" sourceType="live" />
              <StatCard label="Corridor" value={corridor ? "Active" : "Standby"} color="purple" sourceType="estimated" />
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="glass-panel overflow-hidden h-[450px]">
            {loading ? (
              <MapSkeleton className="h-full w-full" />
            ) : (
              <MapboxMap markers={[...signalMarkers, ...carMarkers]} lines={corridorLine} zoom={11.5} />
            )}
          </div>

          <div className="space-y-3 max-h-[450px] overflow-y-auto">
            {loading ? (
              <LoadingSkeleton rows={5} />
            ) : recommendations.length === 0 ? (
              <p className="text-sm text-slate-400">No signal recommendations available.</p>
            ) : (
              recommendations.map((rec) => (
                <div key={rec.signal_id} className="glass-panel space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-sm">{rec.signal_name}</span>
                    <span className="text-xs text-accent">
                      {rec.current_green_sec}s → {rec.recommended_green_sec}s
                    </span>
                  </div>
                  <ReasoningBox reasoning={rec.reasoning} />
                </div>
              ))
            )}
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
          <div className="glass-panel space-y-3">
            <h3 className="font-medium">Alternative Routes</h3>
            {altRoutes.map((r) => (
              <div key={r.route} className="rounded-lg bg-white/5 p-3">
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
    </ErrorBoundary>
  );
}
