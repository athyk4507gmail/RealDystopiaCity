"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Droplets, Zap, Wind, Car } from "lucide-react";
import { api, CityVitals, StressTestResult } from "@/lib/api";
import type { AirQualityReading, TrafficReading } from "@/lib/scrapers/types";
import { useLiveData } from "@/hooks/useLiveData";
import MapboxMap from "@/components/MapboxMap";
import ReasoningBox from "@/components/ReasoningBox";
import DataSourceBadge from "@/components/DataSourceBadge";
import LiveSourceBanner from "@/components/LiveSourceBanner";
import LoadingSkeleton, { StatCardSkeleton } from "@/components/LoadingSkeleton";
import DataError from "@/components/DataError";
import ErrorBoundary from "@/components/ErrorBoundary";
import clsx from "clsx";

const STRESS_EVENTS = [
  { id: "heatwave", label: "Heatwave", icon: "🌡️" },
  { id: "festival", label: "Festival", icon: "🎉" },
  { id: "pipe_burst", label: "Pipe Burst", icon: "💧" },
  { id: "protest", label: "Protest", icon: "📢" },
];

function VitalGauge({
  label,
  value,
  icon: Icon,
  unit,
  before,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  unit?: string;
  before?: number;
}) {
  const color = value > 70 ? "text-emerald-400" : value > 40 ? "text-yellow-400" : "text-red-400";
  const changed = before !== undefined && before !== value;

  return (
    <div className="rounded-xl border border-border p-4 text-center">
      <Icon className="w-6 h-6 mx-auto mb-2 text-accent" />
      <p className="text-xs text-slate-400 uppercase">{label}</p>
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
  };
}

export default function MetabolismPage() {
  const [vitals, setVitals] = useState<CityVitals | null>(null);
  const [baseVitals, setBaseVitals] = useState<CityVitals | null>(null);
  const [stressResult, setStressResult] = useState<StressTestResult | null>(null);
  const [running, setRunning] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  const { data: liveTraffic, loading: trafficLoading, error: trafficError, refresh: refreshTraffic } =
    useLiveData<TrafficReading>("traffic");
  const { data: liveAqi, loading: aqiLoading, error: aqiError, refresh: refreshAqi } =
    useLiveData<AirQualityReading>("airQuality");

  useEffect(() => {
    api.metabolism.vitals()
      .then((v) => {
        setBaseVitals(v);
        setVitals(v);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Failed to load vitals"));
  }, []);

  const displayVitals = useMemo(
    () => mergeVitalsWithLive(stressResult ? vitals : baseVitals, liveTraffic, liveAqi),
    [baseVitals, vitals, liveTraffic, liveAqi, stressResult],
  );

  const runStressTest = async (eventType: string) => {
    setRunning(true);
    setActiveStep(0);
    setStressResult(null);

    const stepInterval = setInterval(() => {
      setActiveStep((s) => s + 1);
    }, 800);

    try {
      const result = await api.metabolism.stressTest(eventType);
      setTimeout(() => {
        clearInterval(stepInterval);
        setStressResult(result);
        setVitals(result.vitals_after);
        setRunning(false);
        setActiveStep(4);
      }, 3200);
    } catch (e) {
      clearInterval(stepInterval);
      setRunning(false);
      setLoadError(e instanceof Error ? e.message : "Stress test failed");
    }
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
        <div>
          <h1 className="text-2xl font-bold">City Metabolism</h1>
          <p className="text-slate-400 text-sm mt-1">Cross-system cascade intelligence — the city as one organism</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <DataSourceBadge type="estimated" detail="Cross-module synthesis and stress simulation" />
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
            <VitalGauge label="Water Pressure" value={displayVitals.water_pressure} icon={Droplets} unit="%" before={stressResult?.vitals_before.water_pressure} />
            <VitalGauge label="Traffic Flow" value={displayVitals.traffic_flow} icon={Car} unit="%" before={stressResult?.vitals_before.traffic_flow} />
            <VitalGauge label="Energy Load" value={displayVitals.energy_load} icon={Zap} unit="%" before={stressResult?.vitals_before.energy_load} />
            <VitalGauge label="Air Quality" value={displayVitals.air_quality_index} icon={Wind} before={stressResult?.vitals_before.air_quality_index} />
          </div>
        )}

        <div className="rounded-xl border border-border p-4">
          <h3 className="font-medium mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-accent" />
            Stress Test — Trigger Cascade Event
          </h3>
          <div className="grid grid-cols-4 gap-3">
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
          <div className="rounded-xl border border-accent/30 p-4">
            <p className="text-sm text-accent animate-pulse mb-4">Cascade propagating across city systems...</p>
            <div className="flex gap-4">
              {["water", "traffic", "energy", "air_quality"].map((node, i) => (
                <div
                  key={node}
                  className={clsx(
                    "cascade-node flex-1 rounded-lg border border-border p-3 text-center text-sm",
                    activeStep > i && "cascade-active"
                  )}
                >
                  {node.replace("_", " ").toUpperCase()}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-6">
          <div className="rounded-xl border border-border overflow-hidden h-[350px]">
            <MapboxMap markers={cascadeMarkers} zoom={11} />
          </div>

          {stressResult ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-border p-4 text-center">
                <p className="text-xs text-slate-400 uppercase">City Resilience Index</p>
                <p className={clsx(
                  "text-5xl font-bold mt-2",
                  stressResult.resilience_index > 70 ? "text-emerald-400" :
                  stressResult.resilience_index > 45 ? "text-yellow-400" : "text-red-400"
                )}>
                  {stressResult.resilience_index}
                </p>
                <p className="text-xs text-slate-500 mt-1">out of 100</p>
              </div>

              <ReasoningBox reasoning={stressResult.narrative} title="Cascade Narrative" />

              <div className="space-y-2">
                {stressResult.cascade_steps.map((step) => (
                  <div key={step.step} className="flex gap-3 text-sm">
                    <span className="text-accent font-mono">{step.step}</span>
                    <span className="text-slate-400 capitalize">{step.node}:</span>
                    <span>{step.action}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <LoadingSkeleton rows={6} className="p-4" />
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}
