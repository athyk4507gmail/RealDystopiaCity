"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { Ambulance, Route, AlertTriangle } from "lucide-react";
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

interface CarData {
  id: string;
  lat: number;
  lng: number;
  velocityLat: number;
  velocityLng: number;
  crashed: boolean;
  crashTime?: number;
}

interface AccidentEvent {
  id: string;
  lat: number;
  lng: number;
  time: number;
  cars: string[];
}

export default function TrafficPage() {
  const [feed, setFeed] = useState<TrafficFeedItem[]>([]);
  const [recommendations, setRecommendations] = useState<SignalRecommendation[]>([]);
  const [corridor, setCorridor] = useState<AmbulanceCorridor | null>(null);
  const [altRoutes, setAltRoutes] = useState<AltRoute[]>([]);
  const [cars, setCars] = useState<CarData[]>([]);
  const [accidents, setAccidents] = useState<AccidentEvent[]>([]);
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

    // Initialize 40 cars with random positions and velocities
    const initialCars: CarData[] = [];
    for (let i = 0; i < 40; i++) {
      initialCars.push({
        id: `car-${i}`,
        lat: 12.97 + Math.random() * 0.03,
        lng: 77.59 + Math.random() * 0.03,
        velocityLat: (Math.random() - 0.5) * 0.002,
        velocityLng: (Math.random() - 0.5) * 0.002,
        crashed: false,
      });
    }
    setCars(initialCars);

    // Animation loop - check for collisions and update positions
    animRef.current = setInterval(() => {
      setCars((prev) => {
        const updated = prev.map((car) => {
          if (car.crashed) {
            // Crashed cars fade out after 3 seconds
            if (car.crashTime && Date.now() - car.crashTime > 3000) {
              return {
                ...car,
                lat: 12.97 + Math.random() * 0.03,
                lng: 77.59 + Math.random() * 0.03,
                velocityLat: (Math.random() - 0.5) * 0.002,
                velocityLng: (Math.random() - 0.5) * 0.002,
                crashed: false,
                crashTime: undefined,
              };
            }
            return car;
          }

          // Update position with velocity
          let newLat = car.lat + car.velocityLat;
          let newLng = car.lng + car.velocityLng;

          // Bounce off boundaries
          if (newLat < 12.97 || newLat > 13.0) {
            car.velocityLat *= -1;
            newLat = car.lat + car.velocityLat;
          }
          if (newLng < 77.59 || newLng > 77.62) {
            car.velocityLng *= -1;
            newLng = car.lng + car.velocityLng;
          }

          return { ...car, lat: newLat, lng: newLng };
        });

        // Check for collisions (distance < threshold)
        const collisionThreshold = 0.0008; // ~90 meters
        const newAccidents: AccidentEvent[] = [];

        for (let i = 0; i < updated.length; i++) {
          if (updated[i].crashed) continue;
          for (let j = i + 1; j < updated.length; j++) {
            if (updated[j].crashed) continue;

            const dist = Math.sqrt(
              Math.pow(updated[i].lat - updated[j].lat, 2) +
              Math.pow(updated[i].lng - updated[j].lng, 2)
            );

            if (dist < collisionThreshold) {
              // Collision detected!
              updated[i].crashed = true;
              updated[i].crashTime = Date.now();
              updated[j].crashed = true;
              updated[j].crashTime = Date.now();

              newAccidents.push({
                id: `accident-${Date.now()}-${i}-${j}`,
                lat: (updated[i].lat + updated[j].lat) / 2,
                lng: (updated[i].lng + updated[j].lng) / 2,
                time: Date.now(),
                cars: [updated[i].id, updated[j].id],
              });
            }
          }
        }

        if (newAccidents.length > 0) {
          setAccidents((prev) => {
            const all = [...prev, ...newAccidents];
            // Keep only last 20 accidents
            return all.slice(-20);
          });
        }

        return updated;
      });
    }, 100); // Update every 100ms for smoother collisions

    return () => {
      if (animRef.current) clearInterval(animRef.current);
    };
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

  // Convert cars to markers
  const carMarkers: MapMarker[] = cars.map((car) => ({
    id: car.id,
    lat: car.lat,
    lng: car.lng,
    color: car.crashed ? "#ef4444" : "#3b82f6",
    className: car.crashed ? "crash-marker pulse-accident" : "car-marker",
  }));

  // Convert accidents to markers
  const accidentMarkers: MapMarker[] = accidents
    .filter((acc) => Date.now() - acc.time < 10000) // Show for 10 seconds
    .map((acc) => ({
      id: acc.id,
      lat: acc.lat,
      lng: acc.lng,
      color: "#dc2626",
      popup: `<strong>⚠️ ACCIDENT</strong><br/>Cars: ${acc.cars.join(", ")}<br/>${Math.floor((Date.now() - acc.time) / 1000)}s ago`,
      className: "accident-marker pulse-accident",
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
      <section className="live-traffic-section">
        {/* Rainwater Widget - Fixed Top Right */}
        <div style={{ position: 'fixed', top: 0, right: 0, zIndex: 10000, pointerEvents: 'none' }}>
          <div id="rw-widget">
            <div className="rw-stage">
              <div className="rw-panel"></div>
              <div className="rw-cloud rw-cloud--a">
                <svg viewBox="0 0 100 60"><path d="M20 45 Q5 45 5 32 Q5 20 18 20 Q20 8 35 8 Q50 8 52 20 Q65 20 65 32 Q65 45 50 45 Z" fill="#bfe0f5" stroke="#7fb8de" strokeWidth="2"/></svg>
              </div>
              <div className="rw-cloud rw-cloud--b">
                <svg viewBox="0 0 100 60"><path d="M20 45 Q5 45 5 32 Q5 20 18 20 Q20 8 35 8 Q50 8 52 20 Q65 20 65 32 Q65 45 50 45 Z" fill="#cfe9f8" stroke="#8fc4e6" strokeWidth="2"/></svg>
              </div>
              <div className="rw-rain">
                <div className="rw-drop"></div>
                <div className="rw-drop"></div>
                <div className="rw-drop"></div>
                <div className="rw-drop"></div>
                <div className="rw-drop"></div>
              </div>
              <div className="rw-funnel">
                <svg viewBox="0 0 52 40">
                  <path d="M2 4 L50 4 L32 30 L20 30 Z" fill="#e8eef2" stroke="#9fb0ba" strokeWidth="2"/>
                  <path d="M8 4 L44 4 L26 12 Z" fill="#4fa8dd" opacity="0.85"/>
                </svg>
              </div>
              <div className="rw-pipe"></div>
              <div className="rw-pipe-water"><span></span></div>
              <div className="rw-tank">
                <div className="rw-tank-water"></div>
              </div>
              <div className="rw-uses">
                <div className="rw-use" title="Garden">
                  <svg viewBox="0 0 24 24"><path d="M12 22c0-6 0-10 0-14" stroke="#3f8f52" strokeWidth="2" fill="none" strokeLinecap="round"/><path d="M12 14c-4 0-6-3-6-6 3 0 6 2 6 6z" fill="#5cb86e"/><path d="M12 12c4 0 6-3 6-6-3 0-6 2-6 6z" fill="#3f8f52"/></svg>
                </div>
                <div className="rw-use" title="Household use">
                  <svg viewBox="0 0 24 24"><path d="M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11z" fill="#4fa8dd"/></svg>
                </div>
                <div className="rw-use" title="Pool / outdoor">
                  <svg viewBox="0 0 24 24"><rect x="3" y="14" width="18" height="7" rx="1.5" fill="#7cc4ea"/><path d="M3 14q2-2 4 0t4 0 4 0 4 0" stroke="#2f8fc7" strokeWidth="1.5" fill="none"/></svg>
                </div>
              </div>
            </div>
          </div>
        </div>

        <video
          className="traffic-bg-video"
          autoPlay
          loop
          muted
          playsInline
          poster="/assets/traffic-poster.jpg"
          src="/assets/traffic-loop.mp4"
          aria-hidden="true"
        />
        <div className="traffic-bg-overlay"></div>

        <div className="live-traffic-content">
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

        <div className="grid grid-cols-4 gap-4 mb-2">
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
              <StatCard label="Active Cars" value={cars.length} color="cyan" sourceType="live" />
              <StatCard 
                label="Accidents" 
                value={accidents.filter(a => Date.now() - a.time < 10000).length} 
                color="red" 
                sourceType="live" 
              />
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="glass-panel overflow-hidden h-[450px]">
            {loading ? (
              <MapSkeleton className="h-full w-full" />
            ) : (
              <MapboxMap 
                markers={[...signalMarkers, ...carMarkers, ...accidentMarkers]} 
                lines={corridorLine} 
                zoom={11.5} 
              />
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
        </div>
      </section>
    </ErrorBoundary>
  );
}
