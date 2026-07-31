"use client";

/**
 * Dystopia page — thin view into the app-level DystopiaProvider simulation.
 * Navigating away does not stop the sim; only Stop does.
 */

import { useEffect, useState, useRef } from "react";
import { Camera, Play, Skull, Square, AlertTriangle, Activity, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import {
  BASE_GREEN,
  CAMERA_DRIVEN_ROADS,
  CANVAS_W,
  CANVAS_H,
  DYSTOPIA_ROADS,
  MAX_GREEN,
  MIN_GREEN,
  PER_VEHICLE_SECONDS,
  type Road,
  useDystopia,
} from "@/dystopia/DystopiaProvider";

export default function DystopiaPage() {
  const {
    running,
    simulateOfflineRoad,
    setSimulateOfflineRoad,
    log,
    snapshot,
    cameras,
    start,
    stop,
    registerCanvas,
    pollIntervalMs,
  } = useDystopia();

  // FIX 2: Gemma 4 reasoning feed state (now with history)
  const [aiAnalysisHistory, setAiAnalysisHistory] = useState<Array<{ id: string; timestamp: Date; text: string }>>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [anomalyLevel, setAnomalyLevel] = useState<"none" | "warning" | "critical">("none");
  const feedEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to newest message within feed container only (not page)
  useEffect(() => {
    if (feedEndRef.current && feedEndRef.current.parentElement) {
      // Scroll the feed container to bottom, not the whole page
      const container = feedEndRef.current.parentElement.closest('.overflow-y-auto');
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }
  }, [aiAnalysisHistory]);

  // FIX 2: Periodic AI reasoning update
  useEffect(() => {
    if (!running) {
      setAiAnalysisHistory([]);
      setAiError(null);
      return;
    }

    let isMounted = true;
    let updateTimeout: NodeJS.Timeout;

    const updateAiReasoning = async () => {
      setAiLoading(true);
      setAiError(null);
      try {
        // Build traffic state summary for Gemma
        const roadStates = DYSTOPIA_ROADS.map(r => ({
          road: r,
          queue: snapshot.queues[r],
          light: snapshot.lights[r],
          available: cameras.feedsByRoad[r]?.available ?? false,
        }));

        const prompt = `Analyze this two-junction traffic state and provide a concise 2-3 sentence monitoring summary.
Junction A (camera_1-3): ${JSON.stringify(roadStates.slice(0, 3))}
Junction B (camera_4-6): ${JSON.stringify(roadStates.slice(3))}

Focus on: queue buildup, signal efficiency, and any anomalies (queues > 15, offline cameras).
Flag issues clearly if detected. Keep it operational and actionable for a traffic operator.`;

        const response = await api.gemma.chat(prompt, "You are a traffic monitoring assistant for a two-junction city grid. Provide concise, operational summaries for traffic operators.");
        
        if (!isMounted) return;

        if (response.reply) {
          const newEntry = {
            id: `analysis-${Date.now()}`,
            timestamp: new Date(),
            text: response.reply,
          };
          setAiAnalysisHistory(prev => {
            const updated = [newEntry, ...prev].slice(0, 30); // Keep last 30 entries
            return updated;
          });
          setAiError(null);
        } else {
          setAiError("No response from AI");
        }

        // Detect anomalies
        const highQueues = roadStates.filter(r => r.queue > 15);
        const offlineCameras = roadStates.filter(r => !r.available);

        if (highQueues.length >= 3) {
          setAnomalyLevel("critical");
        } else if (highQueues.length > 0 || offlineCameras.length > 0) {
          setAnomalyLevel("warning");
        } else {
          setAnomalyLevel("none");
        }
      } catch (err) {
        if (!isMounted) return;
        const errorMsg = err instanceof Error ? err.message : "Analysis failed";
        console.error("AI reasoning failed:", err);
        setAiError(`Retrying... (${errorMsg})`);
        setAnomalyLevel("warning");
      } finally {
        if (isMounted) {
          setAiLoading(false);
        }
      }
    };

    // Initial call immediately
    updateAiReasoning();

    // Then schedule periodic updates
    updateTimeout = setInterval(() => {
      if (isMounted) {
        updateAiReasoning();
      }
    }, 15000); // Update every 15s

    return () => {
      isMounted = false;
      clearInterval(updateTimeout);
    };
  }, [running, snapshot, cameras]);

  useEffect(() => {
    return () => registerCanvas(null);
  }, [registerCanvas]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Skull className="w-6 h-6 text-rose-400" />
            <h1 className="text-2xl font-bold">Dystopia</h1>
            {running && (
              <span className="text-[10px] uppercase tracking-wide text-rose-300 border border-rose-500/40 rounded px-1.5 py-0.5">
                Running in background
              </span>
            )}
          </div>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl">
            Two-junction camera-driven simulation — six real Caltrans D8 I-10 feeds
            (camera&nbsp;1–6). Junction A uses camera&nbsp;1–3; Junction B uses
            camera&nbsp;4–6, connected by a live road link. Each approach spawns traffic
            when its camera count rises; simulated fallback kicks in when a feed goes
            offline. Simulation keeps running if you leave this page; only Stop halts it.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!running ? (
            <button
              type="button"
              onClick={start}
              className="inline-flex items-center gap-2 rounded-lg bg-rose-600/90 hover:bg-rose-500 px-4 py-2 text-sm font-medium"
            >
              <Play className="w-4 h-4" />
              Start
            </button>
          ) : (
            <button
              type="button"
              onClick={stop}
              className="inline-flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-950/40 hover:bg-rose-900/50 px-4 py-2 text-sm"
            >
              <Square className="w-4 h-4" />
              Stop
            </button>
          )}
          <label className="inline-flex items-center gap-2 text-xs text-slate-400 border border-border rounded-lg px-3 py-2">
            <span>Simulate offline:</span>
            <select
              value={simulateOfflineRoad ?? ""}
              onChange={(e) =>
                setSimulateOfflineRoad((e.target.value || null) as Road | null)
              }
              className="bg-transparent text-slate-200 outline-none"
            >
              <option value="">None</option>
              {DYSTOPIA_ROADS.map((r) => (
                <option key={r} value={r}>
                  {r.replace("_", " ").toUpperCase()}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* Wide canvas + side panel */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <div className="rounded-xl border border-rose-500/20 bg-card p-3 overflow-x-auto">
            <canvas
              ref={registerCanvas}
              width={CANVAS_W}
              height={CANVAS_H}
              className="w-full h-auto rounded-lg bg-[#1a2332]"
            />
          </div>

          {/* FIX 2: Gemma 4 reasoning/status feed panel (now scrolling) */}
          <div className="rounded-xl border border-border bg-card p-4 flex flex-col h-[400px]">
            <div className="flex items-center justify-between mb-3 pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-400" />
                <span className="text-sm font-semibold text-slate-300">Gemma 4 Traffic Monitor</span>
              </div>
              {aiLoading && (
                <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
              )}
            </div>

            {/* Anomaly banner */}
            {anomalyLevel === "critical" && (
              <div className="mb-2 rounded bg-red-500/20 border border-red-500/40 px-2 py-1 flex items-start gap-2">
                <AlertTriangle className="w-3 h-3 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-semibold text-red-300">Critical Anomaly</div>
                  <div className="text-[10px] text-red-200/70">Multiple high-queue roads detected</div>
                </div>
              </div>
            )}
            {anomalyLevel === "warning" && (
              <div className="mb-2 rounded bg-amber-500/20 border border-amber-500/40 px-2 py-1 flex items-start gap-2">
                <AlertTriangle className="w-3 h-3 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-semibold text-amber-300">Warning</div>
                  <div className="text-[10px] text-amber-200/70">Elevated queues or offline camera detected</div>
                </div>
              </div>
            )}

            {/* Scrolling analysis feed */}
            <div className="flex-1 overflow-y-auto space-y-2 mb-2">
              {aiAnalysisHistory.length === 0 ? (
                <div className="flex items-center justify-center h-full text-xs text-slate-500">
                  {running ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Waiting for first analysis...</span>
                    </div>
                  ) : (
                    <span>Start simulation to enable AI monitoring</span>
                  )}
                </div>
              ) : (
                aiAnalysisHistory.map((entry) => (
                  <div key={entry.id} className="rounded border border-slate-700/50 bg-slate-900/30 p-2">
                    <div className="text-[10px] text-slate-500 mb-1">
                      {entry.timestamp.toLocaleTimeString()}
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">{entry.text}</p>
                  </div>
                ))
              )}
              <div ref={feedEndRef} />
            </div>

            {/* Error message */}
            {aiError && (
              <div className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1">
                ⚠️ {aiError}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {/* Camera feeds — 3 columns for 6 cameras */}
          <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-4 space-y-3">
            <div className="flex items-center gap-2 text-cyan-300">
              <Camera className="w-4 h-4" />
              <span className="text-sm font-semibold">Live cameras → all roads</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-sm">
              {DYSTOPIA_ROADS.map((road) => {
                const feed = cameras.feedsByRoad[road];
                const offline = simulateOfflineRoad === road;
                return (
                  <div
                    key={road}
                    className="rounded-lg border border-cyan-500/20 bg-cyan-950/30 px-2 py-2"
                  >
                    <div className="text-[10px] text-slate-500 truncate">
                      {road.replace("_", " ").toUpperCase()}
                    </div>
                    <div className="text-lg font-bold tabular-nums text-cyan-200">
                      {feed.available && !offline ? (feed.vehicleCount ?? "—") : "—"}
                    </div>
                    <div className="text-[9px] text-slate-500">
                      q {snapshot.queues[road]}
                      {offline ? " · sim" : feed.available ? " · live" : " · fallback"}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="text-xs text-slate-400">
              Polling every {pollIntervalMs / 1000}s (shared cache with Command Signal)
            </div>
          </div>

          {/* Signal states */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs text-slate-500 mb-2">Queues · lights</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {DYSTOPIA_ROADS.map((r) => (
                <div
                  key={r}
                  className={`rounded-lg border px-3 py-2 ${
                    CAMERA_DRIVEN_ROADS.includes(r)
                      ? "border-cyan-500/40 bg-cyan-950/30"
                      : "border-border"
                  }`}
                >
                  <div className="flex justify-between gap-2">
                    <span className="text-cyan-300 text-xs truncate">
                      {r.replace("_", " ")} 🎥
                    </span>
                    <span
                      className={
                        snapshot.lights[r] === "green"
                          ? "text-emerald-400"
                          : snapshot.lights[r] === "yellow"
                            ? "text-amber-400"
                            : "text-red-400"
                      }
                    >
                      {snapshot.lights[r]}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    queue {snapshot.queues[r]}
                    {snapshot.countdown[r] > 0
                      ? ` · ${Math.ceil(snapshot.countdown[r])}s`
                      : ""}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 mt-3">
              Green = {BASE_GREEN}s + queue×{PER_VEHICLE_SECONDS}s (clamped {MIN_GREEN}–
              {MAX_GREEN}s). Clockwise rotation. No hardcoded priority.
            </p>
          </div>

          {/* Event log */}
          <div className="rounded-xl border border-border bg-card p-4 flex flex-col min-h-[240px]">
            <div className="text-xs text-slate-500 mb-2">Live feed</div>
            <div className="flex-1 overflow-y-auto space-y-1.5 max-h-[280px] font-mono text-xs">
              {log.length === 0 ? (
                <div className="text-slate-600">Press Start to begin…</div>
              ) : (
                log.map((entry) => (
                  <div key={entry.id} className="text-slate-300 leading-relaxed">
                    <span className="text-slate-500">{entry.time}</span> {entry.text}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
