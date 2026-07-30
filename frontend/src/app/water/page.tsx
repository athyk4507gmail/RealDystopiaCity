"use client";

import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid,
} from "recharts";
import { RefreshCw, Upload, ChevronDown, ChevronRight, Droplets, Thermometer, ArrowUp, ArrowDown } from "lucide-react";
import { api, Ward, WaterSchedule, DemandPrediction } from "@/lib/api";
import type { WaterLevelReading, WeatherReading } from "@/lib/scrapers/types";
import { useLiveData } from "@/hooks/useLiveData";
import MapboxMap from "@/components/MapboxMap";
import StatCard from "@/components/StatCard";
import PriorityBadge from "@/components/PriorityBadge";
import ReasoningBox from "@/components/ReasoningBox";
import DataSourceBadge from "@/components/DataSourceBadge";
import LiveSourceBanner from "@/components/LiveSourceBanner";
import LoadingSkeleton, { StatCardSkeleton, MapSkeleton } from "@/components/LoadingSkeleton";
import DataError from "@/components/DataError";
import ErrorBoundary from "@/components/ErrorBoundary";
import { TiltCard } from "@/components/TiltCard";
import { sanitizeComplaintDescription } from "@/lib/validation";

function WardScheduleCard({ schedule }: { schedule: WaterSchedule }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="glass-panel space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-medium">{schedule.ward_name}</span>
        <div className="flex items-center gap-2">
          <PriorityBadge priority={schedule.priority} />
          <span className={`text-xs ${schedule.supply_today ? "text-emerald-400" : "text-slate-500"}`}>
            {schedule.supply_today ? "Supply Today" : "No Supply"}
          </span>
        </div>
      </div>
      {schedule.supply_today && (
        <div className="text-sm text-slate-400">
          {schedule.supply_start_time} – {schedule.supply_end_time}
        </div>
      )}
      <div className="text-xs text-slate-400">
        {schedule.allocation_litres?.toLocaleString("en-IN")}L · {schedule.duration_hours}h
      </div>
      <ReasoningBox reasoning={schedule.reasoning} />
      <div className="border-t border-border pt-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex w-full items-center justify-between text-sm text-slate-300 hover:text-foreground"
        >
          <span>Supply Locations</span>
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        {open && (
          <div className="mt-2 space-y-2">
            {(schedule.sub_localities || []).map((loc) => (
              <div key={loc.name} className="flex items-center justify-between rounded bg-white/5 px-2 py-1.5 text-xs">
                <span>
                  #{loc.priority_rank} {loc.name}
                </span>
                <span className="text-slate-400">{loc.allocation_litres.toLocaleString("en-IN")} L</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function WaterPage() {
  const [wards, setWards] = useState<Ward[]>([]);
  const [schedule, setSchedule] = useState<WaterSchedule[]>([]);
  const [demand, setDemand] = useState<DemandPrediction[]>([]);
  const [selectedWard, setSelectedWard] = useState<number>(1);
  const [tab, setTab] = useState<"municipality" | "citizen">("municipality");
  const [loading, setLoading] = useState(true);
  const [leakResult, setLeakResult] = useState<{ reasoning?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const {
    data: weather,
    loading: weatherLoading,
    error: weatherError,
    refresh: refreshWeather,
  } = useLiveData<WeatherReading>("weather");

  const {
    data: waterLevels,
    loading: waterLoading,
    error: waterError,
    refresh: refreshWater,
  } = useLiveData<WaterLevelReading>("waterLevels");

  useEffect(() => {
    const interval = setInterval(() => {
      setLastUpdated(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [w, s] = await Promise.all([api.water.wards(), api.water.schedule()]);
      setWards(w);
      setSchedule(s);
      if (w.length) {
        setSelectedWard(w[0].id);
        const d = await api.water.demand(w[0].id);
        setDemand(d);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load water data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const [flashValues, setFlashValues] = useState<Set<string>>(new Set());

  const triggerFlash = (key: string) => {
    setFlashValues(prev => new Set([...prev, key]));
    setTimeout(() => {
      setFlashValues(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }, 1000);
  };

  const regenerate = async () => {
    setLoading(true);
    try {
      const s = await api.water.generateSchedule();
      setSchedule(s);
      triggerFlash("supplyToday");
      triggerFlash("highPriority");
      triggerFlash("totalComplaints");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to regenerate schedule");
    } finally {
      setLoading(false);
    }
  };

  const wardDemand = async (id: number) => {
    setSelectedWard(id);
    try {
      const d = await api.water.demand(id);
      setDemand(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load demand forecast");
    }
  };

  const handleLeakUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await api.water.detectLeakage(file);
      setLeakResult(result as { reasoning?: string });
      const description = sanitizeComplaintDescription(String(result.reasoning || "Auto-detected leakage"));
      await api.water.createComplaint({
        ward_id: selectedWard,
        type: "leakage",
        description,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Leak detection failed");
    }
  };

  const supplyToday = schedule.filter((s) => s.supply_today).length;
  const highPriority = schedule.filter((s) => s.priority === "High").length;
  const totalComplaints = wards.reduce((a, w) => a + w.complaints, 0);

  const wardPolygons = wards.map((w) => {
    const sched = schedule.find((s) => s.ward_id === w.id);
    const priority = sched?.priority || "Low";
    const color = priority === "High" ? "#ef4444" : priority === "Medium" ? "#f59e0b" : "#10b981";
    const popupContent = `
      <div style="background: #111827; color: #e2e8f0; padding: 12px; border-radius: 8px; border: 1px solid #1e293b; min-width: 200px;">
        <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600;">${w.name}</h3>
        <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
          <span style="font-size: 11px; padding: 2px 6px; border-radius: 4px; background: ${priority === "High" ? "#ef4444" : priority === "Medium" ? "#f59e0b" : "#10b981"}20; color: ${priority === "High" ? "#ef4444" : priority === "Medium" ? "#f59e0b" : "#10b981"};">${priority} Priority</span>
          <span style="font-size: 11px; color: ${sched?.supply_today ? "#10b981" : "#64748b"};">${sched?.supply_today ? "✓ Supply Today" : "✗ No Supply"}</span>
        </div>
        ${sched?.supply_today ? `
        <div style="font-size: 12px; color: #94a3b8; margin-bottom: 4px;">
          <span style="color: #64748b;">Time:</span> ${sched.supply_start_time} – ${sched.supply_end_time}
        </div>
        ` : ''}
        <div style="font-size: 12px; color: #94a3b8; margin-bottom: 4px;">
          <span style="color: #64748b;">Allocation:</span> ${sched?.allocation_litres?.toLocaleString("en-IN") || "—"} L
        </div>
        <div style="font-size: 12px; color: #94a3b8; margin-bottom: 4px;">
          <span style="color: #64748b;">Population:</span> ${w.population?.toLocaleString("en-IN") || "—"}
        </div>
        <div style="font-size: 12px; color: #94a3b8;">
          <span style="color: #64748b;">Complaints:</span> ${w.complaints}
        </div>
      </div>
    `;
    return {
      id: w.id,
      coordinates: [w.polygon || [[w.lng - 0.004, w.lat - 0.004], [w.lng + 0.004, w.lat - 0.004], [w.lng + 0.004, w.lat + 0.004], [w.lng - 0.004, w.lat + 0.004], [w.lng - 0.004, w.lat - 0.004]]],
      fillColor: color,
      fillOpacity: 0.35,
      lineColor: color,
      popup: popupContent,
    };
  });

  const wardSchedule = schedule.find((s) => s.ward_id === selectedWard);

  return (
    <ErrorBoundary fallbackTitle="Water module failed to render">
      <div className="page-panel page-fade-in relative">
        {/* Decorative water globe illustration */}
        <img
          src="/images/water-globe-illustration.png"
          alt=""
          className="absolute bottom-[-40px] right-[-60px] w-[420px] opacity-[0.06] pointer-events-none z-0"
          style={{
            mixBlendMode: 'luminosity',
            filter: 'grayscale(0.3) brightness(1.4)'
          }}
          aria-hidden="true"
        />
        {error && <DataError message={error} onRetry={load} />}

        <TiltCard className="relative z-10">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="page-title">AI Smart Water Distribution</h1>
              <p className="text-slate-400 text-sm mt-2">Fair, demand-aware scheduling powered by Gemma 4</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <DataSourceBadge type="reported" detail="Ward identities and population anchors" />
                <DataSourceBadge type="estimated" detail="Schedule, complaints, and demand forecasts are simulated/derived" />
                {weather && (
                  <LiveSourceBanner
                    source={weather.source}
                    sourceType={weather.sourceType}
                    stale={weather.stale}
                    cached={weather.cached}
                  />
                )}
                {waterLevels && (
                  <LiveSourceBanner
                    source={waterLevels.source}
                    sourceType={waterLevels.sourceType}
                    stale={waterLevels.stale}
                    cached={waterLevels.cached}
                  />
                )}
              </div>
            </div>
            <div className="toggle-group">
              <button
                onClick={() => setTab("municipality")}
                className={`toggle-button ${tab === "municipality" ? "toggle-button-active" : "toggle-button-inactive"}`}
              >
                Municipality
              </button>
              <button
                onClick={() => setTab("citizen")}
                className={`toggle-button ${tab === "citizen" ? "toggle-button-active" : "toggle-button-inactive"}`}
              >
                Citizen
              </button>
              <button
                onClick={regenerate}
                disabled={loading}
                className="toggle-button toggle-button-inactive flex items-center"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                <span className="ml-2">{loading ? "Regenerating..." : "Regenerate Schedule"}</span>
              </button>
            </div>
          </div>
        </TiltCard>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 relative z-10 mb-2">
          {loading ? (
            <>
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
            </>
          ) : (
            <>
              <StatCard 
                label="Wards" 
                value={wards.length} 
                color="cyan" 
                sourceType="reported" 
                icon="droplet" 
                trend={2} 
                className={flashValues.has("wards") ? "value-flash" : ""}
              />
              <StatCard 
                label="Supply Today" 
                value={supplyToday} 
                sub={`of ${wards.length} wards`} 
                color="green" 
                sourceType="estimated" 
                icon="check" 
                trend={1}
                className={flashValues.has("supplyToday") ? "value-flash" : ""}
              />
              <StatCard 
                label="High Priority" 
                value={highPriority} 
                color="red" 
                sourceType="estimated" 
                icon="alert" 
                trend={-1}
                className={flashValues.has("highPriority") ? "value-flash" : ""}
              />
              <StatCard 
                label="Open Complaints" 
                value={totalComplaints} 
                color="yellow" 
                sourceType="estimated" 
                icon="message" 
                trend={3}
                className={flashValues.has("totalComplaints") ? "value-flash" : ""}
              />
            </>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative z-10 mt-0">
          <div className="stat-subcard hover:shadow-[0_0_20px_rgba(6,182,212,0.1)] transition-shadow duration-300">
            <div className="flex items-center gap-2 mb-3">
              <div className="live-dot" />
              <Thermometer className="w-4 h-4 text-accent" />
              <h3 className="font-medium text-sm">Live Weather (demand driver)</h3>
            </div>
            {weatherLoading && <LoadingSkeleton rows={2} />}
            {weatherError && <DataError message={weatherError} onRetry={refreshWeather} />}
            {weather && !weatherLoading && (
              <>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-slate-400">Temperature</p>
                    <p className="text-xl font-semibold">{weather.temperatureC ?? "—"}°C</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Humidity</p>
                    <p className="text-xl font-semibold">{weather.humidityPct ?? "—"}%</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Rain probability</p>
                    <p className="text-lg">{weather.rainProbabilityPct ?? "—"}%</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Conditions</p>
                    <p className="text-lg">{weather.summary ?? "—"}</p>
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-3">Updated {Math.floor((Date.now() - lastUpdated.getTime()) / 1000)}s ago</p>
              </>
            )}
          </div>

          <div className="stat-subcard hover:shadow-[0_0_20px_rgba(6,182,212,0.1)] transition-shadow duration-300">
            <div className="flex items-center gap-2 mb-3">
              <div className="live-dot" />
              <Droplets className="w-4 h-4 text-accent" />
              <h3 className="font-medium text-sm">Reservoir Levels ({waterLevels?.reservoirName ?? "KRS"})</h3>
            </div>
            {waterLoading && <LoadingSkeleton rows={2} />}
            {waterError && <DataError message={waterError} onRetry={refreshWater} />}
            {waterLevels && !waterLoading && (
              <>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-slate-400">Level</p>
                    <p className="text-xl font-semibold">{waterLevels.levelM ?? "—"} m</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Storage</p>
                    <div className="flex items-center gap-2">
                      <p className="text-xl font-semibold">{waterLevels.capacityPct ?? "—"}%</p>
                      <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-cyan-500 transition-all duration-500" 
                          style={{ width: `${waterLevels.capacityPct ?? 0}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <p className="text-slate-400">Inflow</p>
                    <div className="flex items-center gap-1">
                      <ArrowUp className="w-3 h-3 text-emerald-400" />
                      <p className="text-lg">{waterLevels.inflowCusecs ?? "—"} cusecs</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-slate-400">Outflow</p>
                    <div className="flex items-center gap-1">
                      <ArrowDown className="w-3 h-3 text-red-400" />
                      <p className="text-lg">{waterLevels.outflowCusecs ?? "—"} cusecs</p>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-3">Updated {Math.floor((Date.now() - lastUpdated.getTime()) / 1000)}s ago</p>
              </>
            )}
          </div>
        </div>

        {tab === "municipality" ? (
          <div className="grid grid-cols-2 gap-6 relative z-10">
            <div className="glass-panel overflow-hidden h-[500px] relative">
              {loading ? (
                <MapSkeleton className="h-full w-full" />
              ) : (
                <>
                  <MapboxMap polygons={wardPolygons} zoom={10.5} />
                  <div className="absolute bottom-4 left-4 glass-panel text-xs">
                    <p className="font-medium mb-2">Legend</p>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-red-500" />
                        <span className="text-slate-300">High Priority / No Supply</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-yellow-500" />
                        <span className="text-slate-300">Medium Priority</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-emerald-500" />
                        <span className="text-slate-300">Low Priority / Supplied</span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {loading ? (
                <LoadingSkeleton rows={5} />
              ) : (
                schedule.map((s) => (
                  <WardScheduleCard key={s.ward_id} schedule={s} />
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-6 relative z-10">
            <div className="space-y-4">
              <div className="glass-panel">
              <h3 className="font-medium mb-3">Your Ward Supply Status</h3>
                <select
                  value={selectedWard}
                  onChange={(e) => wardDemand(Number(e.target.value))}
                  className="w-full glass-select px-3 py-2 text-sm mb-4"
                >
                  {wards.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
                {wardSchedule && (
                  <div className="space-y-3">
                    {wardSchedule.supply_today && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Supply Window</span>
                        <span>{wardSchedule.supply_start_time} – {wardSchedule.supply_end_time}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Next Supply</span>
                      <span className={wardSchedule.supply_today ? "text-emerald-400" : "text-yellow-400"}>
                        {wardSchedule.supply_today ? "Today" : "Not scheduled today"}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Allocation</span>
                      <span>{wardSchedule.allocation_litres?.toLocaleString("en-IN")} litres</span>
                    </div>
                    <ReasoningBox reasoning={wardSchedule.reasoning} />
                  </div>
                )}
              </div>

              <div className="glass-panel">
                <h3 className="font-medium mb-3">Water Conservation Tips</h3>
                <div className="space-y-2 text-sm text-slate-300">
                  <p>• Fix dripping taps — saves up to 20L/day per tap</p>
                  <p>• Water plants early morning or evening to reduce evaporation</p>
                  <p>• Use a bucket instead of a hose for washing vehicles</p>
                  <p>• Report leaks immediately via the form below</p>
                </div>
                <p className="text-xs text-accent mt-3">Ask CityPulse AI: &quot;How can I save water this summer?&quot;</p>
              </div>

              <div className="glass-panel">
                <label className="glass-dropzone flex items-center gap-2 px-4 py-3 cursor-pointer hover:border-accent/50 transition-colors duration-200">
                  <Upload className="w-4 h-4 text-accent" />
                  <span className="text-sm">Upload photo for AI detection</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleLeakUpload} />
                </label>
                {leakResult && (
                  <div className="mt-3">
                    <ReasoningBox reasoning={String(leakResult.reasoning ?? "")} title="Leakage Detection" />
                  </div>
                )}
              </div>
            </div>

            <div className="glass-panel">
              <h3 className="font-medium mb-3">Demand Forecast (14 days)</h3>
              {demand.length === 0 ? (
                <LoadingSkeleton rows={4} className="h-[300px]" />
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={demand}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="#64748b" />
                    <YAxis tick={{ fontSize: 10 }} stroke="#64748b" />
                    <Tooltip contentStyle={{ background: "#111827", border: "1px solid #1e293b" }} />
                    <Line type="monotone" dataKey="predicted_litres" stroke="#06b6d4" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        )}

        <div className="glass-panel relative z-10">
          <h3 className="font-medium mb-3">Ward Analytics</h3>
          {loading ? (
            <LoadingSkeleton rows={4} className="h-[200px]" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={wards.slice(0, 10)}>
                <XAxis dataKey="name" tick={{ fontSize: 9 }} stroke="#64748b" angle={-30} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 10 }} stroke="#64748b" />
                <Tooltip contentStyle={{ background: "#111827", border: "1px solid #1e293b" }} />
                <Bar dataKey="complaints" fill="#f59e0b" name="Complaints" />
                <Bar dataKey="leakage_reports" fill="#ef4444" name="Leakages" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}
