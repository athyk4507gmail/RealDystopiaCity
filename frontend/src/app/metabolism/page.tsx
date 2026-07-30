"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Droplets, Zap, Wind, Car } from "lucide-react";
import {
  api,
  CityVitals,
  StressTestResult,
  ResilienceScoreResult,
  StressTestCompareResult,
} from "@/lib/api";
import type { AirQualityReading, TrafficReading } from "@/lib/scrapers/types";
import { useLiveData } from "@/hooks/useLiveData";
import MapboxMap from "@/components/MapboxMap";
import ReasoningBox from "@/components/ReasoningBox";
import DataSourceBadge from "@/components/DataSourceBadge";
import LiveSourceBanner from "@/components/LiveSourceBanner";
import LoadingSkeleton, { StatCardSkeleton } from "@/components/LoadingSkeleton";
import DataError from "@/components/DataError";
import ErrorBoundary from "@/components/ErrorBoundary";
import CausalChainGraph from "@/components/CausalChainGraph";
import clsx from "clsx";

const STRESS_EVENTS = [
  { id: "heatwave", label: "Heatwave", icon: "🌡️" },
  { id: "festival", label: "Festival", icon: "🎉" },
  { id: "pipe_burst", label: "Pipe Burst", icon: "💧" },
  { id: "protest", label: "Protest", icon: "📢" },
  { id: "bengaluru_flood_aug2022", label: "2022 Flood", icon: "⛈️" },
];

function VitalGauge({
  label,
  value,
  icon: Icon,
  unit,
  before,
  source,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  unit?: string;
  before?: number;
  source?: string;
}) {
  const color = value > 70 ? "text-emerald-400" : value > 40 ? "text-yellow-400" : "text-red-400";
  const changed = before !== undefined && before !== value;

  return (
    <div className="rounded-xl border border-border p-4 text-center relative overflow-hidden bg-slate-900/40 backdrop-blur-sm shadow-md">
      <div className="absolute top-2 right-2">
        {source === "live" ? (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 select-none">
            LIVE
          </span>
        ) : (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 select-none">
            {source === "estimated" ? "EST" : "SIM"}
          </span>
        )}
      </div>
      <Icon className="w-6 h-6 mx-auto mb-2 text-accent" />
      <p className="text-xs text-slate-400 uppercase font-medium">{label}</p>
      <p className={clsx("text-3xl font-bold mt-1 gauge-pulse", color)}>
        {value}{unit}
      </p>
      {changed && (
        <p className="text-xs mt-1 text-slate-500">
          was {before}{unit}
        </p>
      )}
    </div>
  );
}

function mergeVitalsWithLive(
  base: CityVitals | null,
  traffic: TrafficReading | null,
  airQuality: AirQualityReading | null,
): CityVitals | null {
  if (!base) return null;

  const trafficFlow =
    traffic?.congestionPct != null
      ? Math.round(Math.max(0, 100 - traffic.congestionPct))
      : base.traffic_flow;

  const aqi =
    airQuality?.aqi != null
      ? Math.round(Math.max(0, Math.min(100, 100 - airQuality.aqi * 0.8)))
      : base.air_quality_index;

  return {
    ...base,
    traffic_flow: trafficFlow,
    air_quality_index: aqi,
    timestamp: new Date().toISOString(),
    sources: {
      ...base.sources,
      traffic_flow: traffic ? "live" : base.sources?.traffic_flow ?? "live",
      air_quality_index: airQuality ? "live" : base.sources?.air_quality_index ?? "estimated",
    },
  };
}

export default function MetabolismPage() {
  const [baseVitals, setBaseVitals] = useState<CityVitals | null>(null);
  const [vitals, setVitals] = useState<CityVitals | null>(null);
  const [resilienceData, setResilienceData] = useState<ResilienceScoreResult | null>(null);
  const [localWeights, setLocalWeights] = useState<Record<string, number>>({});
  const [weightsSaving, setWeightsSaving] = useState(false);
  const [stressCompareResult, setStressCompareResult] = useState<StressTestCompareResult | null>(null);
  const [stressResult, setStressResult] = useState<StressTestResult | null>(null);
  const [activeScenario, setActiveScenario] = useState<"do_nothing" | "with_intervention">("do_nothing");
  const [showHistorical, setShowHistorical] = useState(false);
  const [running, setRunning] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [graphScenario, setGraphScenario] = useState<string>("heatwave");
  const [graphResilienceDelta, setGraphResilienceDelta] = useState<number | null>(null);

  const { data: liveTraffic, loading: trafficLoading, error: trafficError, refresh: refreshTraffic } =
    useLiveData<TrafficReading>("traffic");
  const { data: liveAqi, loading: aqiLoading, error: aqiError, refresh: refreshAqi } =
    useLiveData<AirQualityReading>("airQuality");

  const displayVitals = useMemo(
    () => mergeVitalsWithLive(stressResult ? vitals : baseVitals, liveTraffic, liveAqi),
    [baseVitals, vitals, liveTraffic, liveAqi, stressResult],
  );

  useEffect(() => {
    api.metabolism.vitals()
      .then((v) => {
        setBaseVitals(v);
        setVitals(v);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Failed to load vitals"));
  }, []);

  useEffect(() => {
    if (!displayVitals) return;
    api.metabolism.resilienceScore(undefined, displayVitals)
      .then((data) => {
        setResilienceData(data);
        setLocalWeights({
          water_buffer: Math.round((data.weights_used.water_buffer || 0.3) * 100),
          traffic_slack: Math.round((data.weights_used.traffic_slack || 0.25) * 100),
          grid_headroom: Math.round((data.weights_used.grid_headroom || 0.25) * 100),
          complaint_backlog: Math.round((data.weights_used.complaint_backlog || 0.2) * 100),
        });
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Failed to load resilience score"));
  }, [displayVitals?.water_pressure, displayVitals?.traffic_flow, displayVitals?.energy_load, displayVitals?.air_quality_index]);

  const handleWeightChange = (key: string, value: number) => {
    setLocalWeights((prev) => {
      const updated = { ...prev, [key]: value };
      if (resilienceData) {
        const subScores = resilienceData.sub_scores;
        const totalWeight = Object.values(updated).reduce((sum, w) => sum + w, 0);
        const weightedSum =
          subScores.water_buffer * updated.water_buffer +
          subScores.traffic_slack * updated.traffic_slack +
          subScores.grid_headroom * updated.grid_headroom +
          subScores.complaint_backlog * updated.complaint_backlog;
        const previewScore = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 10) / 10 : 0;
        setResilienceData((prevData) =>
          prevData ? { ...prevData, total_score: previewScore } : null,
        );
      }
      return updated;
    });
  };

  const saveWeights = async () => {
    if (!displayVitals) return;
    setWeightsSaving(true);
    try {
      const totalLocal = Object.values(localWeights).reduce((sum, w) => sum + w, 0) || 1;
      const normalizedWeights = {
        water_buffer: localWeights.water_buffer / totalLocal,
        traffic_slack: localWeights.traffic_slack / totalLocal,
        grid_headroom: localWeights.grid_headroom / totalLocal,
        complaint_backlog: localWeights.complaint_backlog / totalLocal,
      };
      const updatedData = await api.metabolism.resilienceScore(normalizedWeights, displayVitals);
      setResilienceData(updatedData);
    } catch (e) {
      console.error("Failed to save weights:", e);
    } finally {
      setWeightsSaving(false);
    }
  };

  const resetWeights = async () => {
    if (!displayVitals) return;
    setWeightsSaving(true);
    try {
      const defaultWeights = {
        water_buffer: 0.30,
        traffic_slack: 0.25,
        grid_headroom: 0.25,
        complaint_backlog: 0.20,
      };
      const updatedData = await api.metabolism.resilienceScore(defaultWeights, displayVitals);
      setResilienceData(updatedData);
      setLocalWeights({ water_buffer: 30, traffic_slack: 25, grid_headroom: 25, complaint_backlog: 20 });
    } catch (e) {
      console.error("Failed to reset weights:", e);
    } finally {
      setWeightsSaving(false);
    }
  };

  const runStressTest = async (eventType: string) => {
    setRunning(true);
    setActiveStep(0);
    setStressResult(null);
    setStressCompareResult(null);
    setShowHistorical(false);

    const stepInterval = setInterval(() => {
      setActiveStep((s) => s + 1);
    }, 800);

    try {
      const result = await api.metabolism.stressTest(eventType, true) as StressTestCompareResult;
      setTimeout(() => {
        clearInterval(stepInterval);
        setStressCompareResult(result);
        const activeRes = result.do_nothing;
        setStressResult(activeRes);
        setVitals(activeRes.vitals_after);
        setActiveScenario("do_nothing");
        setRunning(false);
        setActiveStep(4);
      }, 3200);
    } catch (e) {
      clearInterval(stepInterval);
      setRunning(false);
      setLoadError(e instanceof Error ? e.message : "Stress test failed");
    }
  };

  const handleToggleScenario = (scenario: "do_nothing" | "with_intervention") => {
    if (!stressCompareResult) return;
    setActiveScenario(scenario);
    const activeRes = stressCompareResult[scenario];
    setStressResult(activeRes);
    setVitals(activeRes.vitals_after);
  };

  const cascadeMarkers = stressResult?.nodes.map((n, i) => ({
    id: n.id,
    lat: 12.97 + i * 0.015,
    lng: 77.59 + i * 0.01,
    popup: `<strong>${n.label}</strong><br/>${n.description}`,
    color: n.status === "stressed" ? "#ef4444" : "#10b981",
  })) || [];

  const vitalsLoading = !displayVitals && !loadError;

  return (
    <ErrorBoundary fallbackTitle="Metabolism module failed to render">
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold">City Metabolism</h1>
            <p className="text-slate-400 text-sm mt-1">Cross-system cascade intelligence — the city as one organism</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <DataSourceBadge
                type={displayVitals?.source_type || "estimated"}
                detail={displayVitals?.source_detail || "Cross-module synthesis and stress simulation"}
              />
              {liveTraffic && (
                <LiveSourceBanner
                  source={liveTraffic.source}
                  sourceType={liveTraffic.sourceType}
                  stale={liveTraffic.stale}
                  cached={liveTraffic.cached}
                />
              )}
              {liveAqi && (
                <LiveSourceBanner
                  source={liveAqi.source}
                  sourceType={liveAqi.sourceType}
                  stale={liveAqi.stale}
                  cached={liveAqi.cached}
                />
              )}
            </div>
          </div>
        </div>

        {loadError && <DataError message={loadError} onRetry={() => window.location.reload()} />}
        {(trafficError || aqiError) && (
          <DataError
            message={[trafficError, aqiError].filter(Boolean).join(" · ")}
            onRetry={() => { refreshTraffic(); refreshAqi(); }}
          />
        )}

        {vitalsLoading || trafficLoading || aqiLoading ? (
          <div className="grid grid-cols-4 gap-4">
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </div>
        ) : displayVitals && (
          <div className="grid grid-cols-4 gap-4">
            <VitalGauge label="Water Pressure" value={displayVitals.water_pressure} icon={Droplets} unit="%" before={stressResult?.vitals_before.water_pressure} source={displayVitals.sources?.water_pressure} />
            <VitalGauge label="Traffic Flow" value={displayVitals.traffic_flow} icon={Car} unit="%" before={stressResult?.vitals_before.traffic_flow} source={displayVitals.sources?.traffic_flow} />
            <VitalGauge label="Energy Load" value={displayVitals.energy_load} icon={Zap} unit="%" before={stressResult?.vitals_before.energy_load} source={displayVitals.sources?.energy_load} />
            <VitalGauge label="Air Quality" value={displayVitals.air_quality_index} icon={Wind} before={stressResult?.vitals_before.air_quality_index} source={displayVitals.sources?.air_quality_index} />
          </div>
        )}

        <div className="rounded-xl border border-border p-5 bg-slate-900/20 shadow-lg space-y-4">
          <div className="flex justify-between items-center pb-2 border-b border-border/40">
            <div>
              <h3 className="font-semibold text-slate-200 flex items-center gap-2">
                🌐 Interactive Causal Chain Graph
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Select a scenario and node to trace cross-system propagation effects.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-medium">Scenario:</span>
              <select
                value={graphScenario}
                onChange={(e) => setGraphScenario(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-xs text-slate-200 rounded px-2.5 py-1 focus:outline-none focus:border-accent cursor-pointer"
              >
                {STRESS_EVENTS.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.icon} {event.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            <div className="lg:col-span-8">
              <CausalChainGraph
                scenario={graphScenario}
                onResilienceDelta={setGraphResilienceDelta}
              />
            </div>
            <div className="lg:col-span-4 flex flex-col justify-center p-5 bg-slate-950/40 rounded-xl border border-slate-800/80 text-center min-h-[300px]">
              <div className="space-y-4">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Causal Simulation Impact
                </h4>
                {graphResilienceDelta !== null ? (
                  <div className="py-6 px-4 bg-slate-900/40 rounded-lg border border-slate-800 animate-scale-up">
                    <span className="text-[10px] uppercase text-slate-400 tracking-wider font-semibold">Resilience Score Delta</span>
                    <div className={clsx(
                      "text-4xl font-black mt-2 transition-all duration-300",
                      graphResilienceDelta > 0 ? "text-emerald-400" :
                      graphResilienceDelta < 0 ? "text-red-400" : "text-slate-300"
                    )}>
                      {graphResilienceDelta > 0 ? "+" : ""}{graphResilienceDelta.toFixed(1)}
                    </div>
                  </div>
                ) : (
                  <div className="py-12 px-6 text-slate-500 text-xs border border-dashed border-slate-800 rounded-lg">
                    Click a node on the graph to open its simulation panel.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-xl border border-border p-5 bg-slate-900/20 shadow-lg space-y-4">
            <div className="text-center pb-2 border-b border-border/40">
              <h3 className="text-xs text-slate-400 uppercase tracking-wider font-semibold">City Resilience Index</h3>
              {resilienceData ? (
                <>
                  <p className={clsx(
                    "text-5xl font-black mt-2 transition-all duration-300",
                    resilienceData.total_score > 70 ? "text-emerald-400" :
                    resilienceData.total_score > 45 ? "text-yellow-400" : "text-red-400"
                  )}>
                    {resilienceData.total_score}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">out of 100 — {resilienceData.formula}</p>
                </>
              ) : (
                <p className="text-slate-500 text-sm animate-pulse my-4">Calculating Index...</p>
              )}
            </div>
            {resilienceData && (
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Subsystem Scores</h4>
                {Object.entries(resilienceData.sub_scores).map(([key, score]) => {
                  const source = resilienceData.sub_score_sources?.[key];
                  const label = key.replace("_", " ").toUpperCase();
                  const scoreColor = score > 70 ? "bg-emerald-500" : score > 40 ? "bg-yellow-500" : "bg-red-500";
                  return (
                    <div key={key} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-300 font-medium flex items-center gap-1.5">
                          {label}
                          <span className={clsx(
                            "text-[9px] font-bold px-1.5 py-0.5 rounded border",
                            source === "live"
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                              : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                          )}>
                            {source === "live" ? "LIVE" : "SIM"}
                          </span>
                        </span>
                        <span className="font-semibold text-slate-200">{score.toFixed(1)}/100</span>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-700/50">
                        <div className={clsx("h-full rounded-full transition-all duration-300", scoreColor)} style={{ width: `${score}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border p-5 bg-slate-900/20 shadow-lg space-y-4">
            <div>
              <h3 className="font-semibold text-slate-200">⚖️ Resilience Score Weights Calibrator</h3>
              <p className="text-xs text-slate-400 mt-1">Adjust sliders to test stress assumptions. Uses live-merged vitals. Click Apply to save.</p>
            </div>
            {resilienceData && (
              <div className="space-y-3">
                {Object.keys(localWeights).map((key) => {
                  const val = localWeights[key];
                  const label = key.replace("_", " ").toUpperCase();
                  const source = resilienceData.sub_score_sources?.[key];
                  return (
                    <div key={key} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-300 font-medium flex items-center gap-1">
                          {label}
                          <span className="text-[8px] font-bold px-1 py-0.1 rounded border bg-slate-800 text-slate-400">
                            {source === "live" ? "Live" : "Simulated"}
                          </span>
                        </span>
                        <span className="font-mono text-accent font-bold">{val}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={val}
                        onChange={(e) => handleWeightChange(key, parseInt(e.target.value))}
                        className="w-full accent-accent bg-slate-800 rounded-lg appearance-none cursor-pointer h-2"
                      />
                    </div>
                  );
                })}
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={saveWeights}
                    disabled={weightsSaving}
                    className="flex-1 rounded-lg bg-accent text-slate-950 font-bold text-xs py-2 hover:bg-accent/80 transition-colors disabled:opacity-50"
                  >
                    {weightsSaving ? "Saving..." : "Apply & Save Weights"}
                  </button>
                  <button
                    onClick={resetWeights}
                    disabled={weightsSaving}
                    className="rounded-lg bg-slate-800 border border-slate-700 text-slate-200 font-semibold text-xs px-3 py-2 hover:bg-slate-700 transition-colors disabled:opacity-50"
                  >
                    Reset Defaults
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border p-4 bg-slate-900/10">
          <h3 className="font-medium mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-accent" />
            Stress Test — Trigger Cascade Event
          </h3>
          <div className="grid grid-cols-5 gap-3">
            {STRESS_EVENTS.map((event) => (
              <button
                key={event.id}
                onClick={() => runStressTest(event.id)}
                disabled={running}
                className="rounded-lg border border-border p-4 hover:border-accent/30 hover:bg-accent/5 transition-colors disabled:opacity-50 text-center"
              >
                <span className="text-2xl">{event.icon}</span>
                <p className="text-sm font-medium mt-2">{event.label}</p>
              </button>
            ))}
          </div>
        </div>

        {running && (
          <div className="rounded-xl border border-accent/30 p-4 bg-accent/5 animate-pulse">
            <p className="text-sm text-accent font-semibold mb-4">Cascade propagating across city systems...</p>
            <div className="flex gap-4">
              {["water", "traffic", "energy", "air_quality"].map((node, i) => (
                <div
                  key={node}
                  className={clsx(
                    "cascade-node flex-1 rounded-lg border border-border p-3 text-center text-sm font-medium uppercase",
                    activeStep > i && "cascade-active border-accent/60 text-accent bg-accent/10"
                  )}
                >
                  {node.replace("_", " ")}
                </div>
              ))}
            </div>
          </div>
        )}

        {stressCompareResult && (
          <div className="rounded-xl border border-accent/20 bg-accent/5 p-4 flex flex-col md:flex-row justify-between items-center gap-4 shadow-md">
            <div>
              <h4 className="font-semibold text-lg text-slate-100">🛡️ Emergency Intervention Modeling</h4>
              <p className="text-sm text-slate-400 mt-1">
                Active Strategy: <span className="text-accent font-semibold">{stressCompareResult.interventions_applied.join(", ") || "None"}</span>
              </p>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <span className="text-xs uppercase text-slate-400 tracking-wider">Mitigation Reward</span>
                <div className="text-2xl font-black text-emerald-400">
                  +{stressCompareResult.resilience_score_delta} Resilience Points
                </div>
              </div>
              <div className="flex bg-slate-950/80 p-1.5 rounded-lg border border-border">
                <button
                  onClick={() => handleToggleScenario("do_nothing")}
                  className={clsx(
                    "px-3 py-1.5 rounded-md text-xs font-semibold transition-all",
                    activeScenario === "do_nothing"
                      ? "bg-red-500/20 text-red-400 border border-red-500/30 shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  🚨 Do Nothing ({stressCompareResult.do_nothing.resilience_index})
                </button>
                <button
                  onClick={() => handleToggleScenario("with_intervention")}
                  className={clsx(
                    "px-3 py-1.5 rounded-md text-xs font-semibold transition-all ml-1",
                    activeScenario === "with_intervention"
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  🛡️ Mitigate ({stressCompareResult.with_intervention.resilience_index})
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 rounded-xl border border-border overflow-hidden h-[450px] shadow-lg bg-slate-900/10">
            <MapboxMap markers={cascadeMarkers} zoom={11} />
          </div>

          {stressResult ? (
            <div className="lg:col-span-7 space-y-4">
              {stressResult.historical_validation && (
                <div className="rounded-xl border border-border p-4 bg-slate-900/30 shadow-md">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">📜</span>
                      <h4 className="font-semibold text-slate-200 text-sm">Grounding: Bengaluru Historical Event</h4>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={showHistorical}
                        onChange={(e) => setShowHistorical(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-8 h-4 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-accent peer-checked:after:bg-slate-950" />
                      <span className="ml-2 text-xs text-slate-400 font-medium">Validate model</span>
                    </label>
                  </div>
                  {showHistorical && (
                    <div className="mt-3 p-3 rounded-lg bg-slate-950/60 border border-slate-800 text-xs space-y-2">
                      <p className="font-bold text-accent">{stressResult.historical_validation.title} ({stressResult.historical_validation.date})</p>
                      <p className="text-slate-300 leading-relaxed">{stressResult.historical_validation.description}</p>
                      <div className="border-t border-slate-800/80 pt-2 mt-1 space-y-1.5">
                        <p className="font-bold text-emerald-400 uppercase tracking-wide">Model Comparison</p>
                        <p className="text-slate-300 leading-relaxed italic">&quot;{stressResult.historical_validation.model_comparison}&quot;</p>
                        <a
                          href={stressResult.historical_validation.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-accent hover:underline inline-flex items-center gap-1 font-semibold"
                        >
                          Official Report Source Link ↗
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-xl border border-border p-4 text-center bg-slate-950/40">
                <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Playbook Resilience Index</p>
                <p className={clsx(
                  "text-5xl font-black mt-2",
                  stressResult.resilience_index > 70 ? "text-emerald-400" :
                  stressResult.resilience_index > 45 ? "text-yellow-400" : "text-red-400"
                )}>
                  {stressResult.resilience_index}
                </p>
              </div>

              <ReasoningBox reasoning={stressResult.narrative} title="Cascade Narrative Explanation" />

              <div className="space-y-3">
                <h4 className="font-semibold text-xs text-slate-400 uppercase tracking-wider pl-1">Propagation Steps</h4>
                {stressResult.cascade_steps.map((step) => {
                  const hasCoeff = step.coeff_used && step.coeff_used !== "none";
                  return (
                    <div key={step.step} className="rounded-lg border border-border/60 bg-slate-950/40 p-3 space-y-1.5 text-sm">
                      <div className="flex gap-3">
                        <span className="text-accent font-mono font-bold">{step.step}</span>
                        <span className="text-slate-400 font-semibold capitalize w-24">{step.node.replace("_", " ")}:</span>
                        <span className="text-slate-200 flex-1">{step.action}</span>
                      </div>
                      {hasCoeff && (
                        <div className="pl-[7.25rem] text-xs text-slate-500 border-l border-accent/20 ml-2 py-0.5 space-y-1">
                          <div>
                            <span className="font-semibold text-slate-400">Formula Coeff:</span>{" "}
                            <code className="bg-slate-900 px-1 py-0.5 rounded text-accent font-mono">{step.coeff_used}</code> ={" "}
                            <code className="text-emerald-400 font-mono">{step.coeff_value}</code>
                          </div>
                          {step.source_note && (
                            <div className="text-[11px] text-slate-400/80 italic">Source context: {step.source_note}</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="lg:col-span-7">
              <LoadingSkeleton rows={6} className="p-4" />
            </div>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}
