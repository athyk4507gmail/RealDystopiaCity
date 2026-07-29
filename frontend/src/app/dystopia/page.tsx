"use client";

/**
 * Dystopia page — thin view into the app-level DystopiaProvider simulation.
 * Navigating away does not stop the sim; only Stop does.
 */

import { useEffect } from "react";
import { Camera, Play, Skull, Square } from "lucide-react";
import {
  BASE_GREEN,
  CAMERA_DRIVEN_ROAD,
  CANVAS,
  DYSTOPIA_ROADS,
  MAX_GREEN,
  MIN_GREEN,
  PER_VEHICLE_SECONDS,
  useDystopia,
} from "@/dystopia/DystopiaProvider";

export default function DystopiaPage() {
  const {
    running,
    simulateOffline,
    setSimulateOffline,
    log,
    snapshot,
    camera,
    start,
    stop,
    registerCanvas,
    pollIntervalMs,
  } = useDystopia();

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
            Camera-driven junction — North tracks the live Caltrans vehicle count;
            East, South, and West run continuous simulated traffic. Simulation keeps
            running if you leave this page; only Stop halts it.
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
          <label className="inline-flex items-center gap-2 text-xs text-slate-400 border border-border rounded-lg px-3 py-2 cursor-pointer hover:bg-white/5">
            <input
              type="checkbox"
              checked={simulateOffline}
              onChange={(e) => setSimulateOffline(e.target.checked)}
              className="accent-rose-500"
            />
            Simulate camera offline
          </label>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,640px)_1fr]">
        <div className="rounded-xl border border-rose-500/20 bg-card p-3">
          <canvas
            ref={registerCanvas}
            width={CANVAS}
            height={CANVAS}
            className="w-full max-w-[640px] h-auto rounded-lg bg-[#1a2332]"
          />
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-4 space-y-3">
            <div className="flex items-center gap-2 text-cyan-300">
              <Camera className="w-4 h-4" />
              <span className="text-sm font-semibold">Live camera → North</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-slate-500">VEHICLES DETECTED</div>
                <div className="text-2xl font-bold tabular-nums text-cyan-200">
                  {camera.available ? (camera.vehicleCount ?? "—") : "—"}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">NORTH QUEUE</div>
                <div className="text-2xl font-bold tabular-nums">{snapshot.queues.North}</div>
              </div>
              <div className="col-span-2 text-xs text-slate-400">
                {camera.available
                  ? `Live · polling every ${pollIntervalMs / 1000}s (same cache as Command Signal)`
                  : `Fallback mode${camera.error ? ` — ${camera.error}` : ""}`}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs text-slate-500 mb-2">Queues · lights</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {DYSTOPIA_ROADS.map((r) => (
                <div
                  key={r}
                  className={`rounded-lg border px-3 py-2 ${
                    r === CAMERA_DRIVEN_ROAD
                      ? "border-cyan-500/40 bg-cyan-950/30"
                      : "border-border"
                  }`}
                >
                  <div className="flex justify-between gap-2">
                    <span className={r === CAMERA_DRIVEN_ROAD ? "text-cyan-300" : ""}>
                      {r}
                      {r === CAMERA_DRIVEN_ROAD ? " 🎥" : ""}
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
              {MAX_GREEN}s). Clockwise rotation. No hardcoded North priority.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 flex flex-col min-h-[280px]">
            <div className="text-xs text-slate-500 mb-2">Live feed</div>
            <div className="flex-1 overflow-y-auto space-y-1.5 max-h-[320px] font-mono text-xs">
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
