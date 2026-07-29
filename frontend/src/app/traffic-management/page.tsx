"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Radio, TrafficCone } from "lucide-react";
import {
  api,
  LiveCameraState,
  TrafficManagementLiveState,
  DetectionBox,
} from "@/lib/api";
import ReasoningBox from "@/components/ReasoningBox";
import StatCard from "@/components/StatCard";
import LoadingSkeleton from "@/components/LoadingSkeleton";
import DataError from "@/components/DataError";
import ErrorBoundary from "@/components/ErrorBoundary";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const POLL_INTERVAL_MS = 30_000;

const VEHICLE_CLASSES = new Set(["car", "motorcycle", "bus", "truck"]);

function formatJunctionLabel(id: string) {
  return id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusBadgeClass(status: string) {
  if (status === "Heavy") return "bg-red-500/20 text-red-300 border-red-500/30";
  if (status === "Moderate") return "bg-amber-500/20 text-amber-300 border-amber-500/30";
  return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
}

function DetectionOverlay({
  detections,
  naturalWidth,
  naturalHeight,
}: {
  detections: DetectionBox[];
  naturalWidth: number;
  naturalHeight: number;
}) {
  if (!naturalWidth || !naturalHeight) return null;

  return (
    <svg
      className="absolute inset-0 h-full w-full pointer-events-none"
      viewBox={`0 0 ${naturalWidth} ${naturalHeight}`}
      preserveAspectRatio="xMidYMid meet"
    >
      {detections.map((det, i) => {
        const [x1, y1, x2, y2] = det.bbox;
        const isPerson = det.class === "person";
        const isLight = det.source === "light";
        const stroke = isPerson ? "#ec4899" : isLight ? "#22d3ee" : "#fbbf24";
        const fill = isPerson
          ? "rgba(236,72,153,0.15)"
          : isLight
            ? "rgba(34,211,238,0.18)"
            : "rgba(251,191,36,0.15)";
        const label = isLight ? `light ${(det.confidence * 100).toFixed(0)}%` : `${det.class} ${(det.confidence * 100).toFixed(0)}%`;
        return (
          <g key={`${det.class}-${det.source ?? "ai"}-${i}`}>
            <rect
              x={x1}
              y={y1}
              width={x2 - x1}
              height={y2 - y1}
              fill={fill}
              stroke={stroke}
              strokeWidth={Math.max(2, naturalWidth / 400)}
              strokeDasharray={isLight ? "4 3" : undefined}
            />
            <text
              x={x1}
              y={Math.max(y1 - 4, 12)}
              fill={stroke}
              fontSize={Math.max(10, naturalWidth / 80)}
              fontWeight="600"
            >
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function LiveCameraDemo() {
  const [data, setData] = useState<LiveCameraState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Client-side clock of last successful poll — used only for the live "Xs ago" counter.
  const [lastFetchAtMs, setLastFetchAtMs] = useState<number | null>(null);
  const [secondsSinceFetch, setSecondsSinceFetch] = useState(0);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastFetchAtMsRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api.trafficManagement.liveCamera();
      setData(result);
      setError(result.fetch_error ?? null);
      // Reset counter from the moment OUR frontend got a successful response,
      // not from backend UTC timestamps (which lack timezone and skew into hours).
      const now = Date.now();
      lastFetchAtMsRef.current = now;
      setLastFetchAtMs(now);
      setSecondsSinceFetch(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load live camera");
    } finally {
      setLoading(false);
    }
  }, []);

  // Data poll interval only — does not drive the seconds-ago text.
  useEffect(() => {
    load();
    pollRef.current = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [load]);

  // Lightweight 1s UI tick — recomputes "Xs ago" only; never sets loading/skeleton.
  useEffect(() => {
    tickRef.current = setInterval(() => {
      const last = lastFetchAtMsRef.current;
      if (last == null) return;
      setSecondsSinceFetch(Math.max(0, Math.floor((Date.now() - last) / 1000)));
    }, 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  const vehicleDetections = data?.detections.filter((d) => VEHICLE_CLASSES.has(d.class)) ?? [];
  const personDetections = data?.detections.filter((d) => d.class === "person") ?? [];
  const cacheBust = lastFetchAtMs ?? data?.image_last_updated ?? 0;

  return (
    <section className="rounded-xl border border-cyan-500/30 bg-gradient-to-br from-cyan-950/40 to-card p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-semibold">Live Public Camera Demo</h2>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-xs text-red-300">
              <span className="h-2 w-2 rounded-full bg-red-400 animate-pulse" />
              Live
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Live feed: {data?.camera_source ?? "Caltrans District 8, California"}
          </p>
        </div>
        {data?.status && (
          <span className={`rounded-full border px-3 py-1 text-sm font-medium ${statusBadgeClass(data.status)}`}>
            {data.status}
          </span>
        )}
      </div>

      {loading && !data ? (
        <LoadingSkeleton rows={4} />
      ) : error && !data ? (
        <DataError message={error} onRetry={load} />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="relative overflow-hidden rounded-lg border border-border bg-black/40 aspect-video">
              {data?.annotated_image_url && (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`${API_BASE}${data.annotated_image_url}?t=${encodeURIComponent(String(cacheBust))}`}
                    alt="Live Caltrans highway camera"
                    className="h-full w-full object-contain"
                    onLoad={(e) => {
                      const img = e.currentTarget;
                      setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
                    }}
                  />
                  <DetectionOverlay
                    detections={data.detections}
                    naturalWidth={imgSize.w}
                    naturalHeight={imgSize.h}
                  />
                </>
              )}
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <StatCard
                  label="Vehicles detected"
                  value={String(data?.vehicle_count ?? 0)}
                  sub={`${vehicleDetections.length} boxes · AI + lights`}
                />
                <StatCard
                  label="People detected"
                  value={String(data?.person_count ?? 0)}
                  sub={`${personDetections.length} boxes (magenta)`}
                />
                <StatCard
                  label="Green light"
                  value={`${data?.green_seconds ?? 0}s`}
                  sub="Vehicle-driven timing"
                />
                <StatCard
                  label="Red light"
                  value={`${data?.red_seconds ?? 0}s`}
                  sub="60s cycle total"
                />
              </div>

              <div className="flex flex-wrap gap-4 text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 rounded-sm border-2 border-amber-400 bg-amber-400/20" />
                  AI vehicles
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 rounded-sm border-2 border-dashed border-cyan-400 bg-cyan-400/20" />
                  Headlight/taillight blobs (night)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 rounded-sm border-2 border-pink-500 bg-pink-500/20" />
                  People (context only)
                </span>
              </div>

              <p className="text-xs text-slate-500">
                Last updated:{" "}
                {lastFetchAtMs != null ? (
                  <span className="text-cyan-400">{secondsSinceFetch}s ago</span>
                ) : (
                  "waiting for first fetch…"
                )}
                {" · "}Polling every {POLL_INTERVAL_MS / 1000}s
              </p>
            </div>
          </div>

          {data?.explanation && (
            <ReasoningBox reasoning={data.explanation} title="Signal Explanation" />
          )}

          {error && data && (
            <p className="text-xs text-amber-400">Latest fetch warning: {error}</p>
          )}
        </>
      )}
    </section>
  );
}

function JunctionGridSection() {
  const [state, setState] = useState<TrafficManagementLiveState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.trafficManagement
      .liveState()
      .then(setState)
      .catch(() => setState(null))
      .finally(() => setLoading(false));
  }, []);

  const junctions = state?.junctions ?? {};

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <TrafficCone className="w-5 h-5 text-yellow-400" />
        <div>
          <h2 className="text-lg font-semibold">9-Junction Grid (Bengaluru)</h2>
          <p className="text-sm text-slate-400">
            Static-image detection — neighbor red-light extension on congestion
          </p>
        </div>
      </div>

      {loading ? (
        <LoadingSkeleton rows={3} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(junctions).map(([id, j]) => (
              <div
                key={id}
                className={`rounded-lg border p-3 text-sm ${
                  j.is_congested ? "border-red-500/40 bg-red-500/5" : "border-border"
                }`}
              >
                <div className="font-medium">{formatJunctionLabel(id)}</div>
                <div className="mt-1 text-slate-400">
                  {j.vehicle_count} vehicles · red {j.red_light_duration}s
                </div>
                {j.is_congested && (
                  <span className="mt-1 inline-block text-xs text-red-300">Congested</span>
                )}
              </div>
            ))}
          </div>
          {state?.explanation && (
            <ReasoningBox reasoning={state.explanation} title="Grid Signal Reasoning" />
          )}
        </>
      )}
    </section>
  );
}

export default function TrafficManagementPage() {
  return (
    <ErrorBoundary>
      <div className="p-6 space-y-6 max-w-6xl">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="w-6 h-6 text-accent" />
            <h1 className="text-2xl font-bold">Command Signal</h1>
          </div>
          <p className="text-slate-400 mt-1">
            Vision-driven traffic signal intelligence — live public camera demo plus Bengaluru junction grid
          </p>
        </div>

        <LiveCameraDemo />
        <JunctionGridSection />
      </div>
    </ErrorBoundary>
  );
}
