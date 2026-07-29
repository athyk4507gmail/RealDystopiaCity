"use client";

/**
 * Read-only access to the live Caltrans vehicle count.
 *
 * Polls GET /api/traffic-management/live-camera — the same backend cache
 * Command Signal reads. Does NOT hit Caltrans; the backend background loop
 * owns camera fetching. Interval matches Command Signal (30s).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

/** Must stay in sync with Command Signal's POLL_INTERVAL_MS. */
export const LIVE_CAMERA_POLL_MS = 30_000;

export interface LiveCameraVehicleCountState {
  /** Latest detected vehicle count, or null if never successfully loaded. */
  vehicleCount: number | null;
  /** True when the last poll returned usable live data (no fetch_error). */
  available: boolean;
  error: string | null;
  /** Client clock of last successful live read. */
  updatedAtMs: number | null;
  loading: boolean;
  pollIntervalMs: number;
  refresh: () => void;
}

export function useLiveCameraVehicleCount(
  options?: { enabled?: boolean }
): LiveCameraVehicleCountState {
  const enabled = options?.enabled !== false;
  const [vehicleCount, setVehicleCount] = useState<number | null>(null);
  const [available, setAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAtMs, setUpdatedAtMs] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api.trafficManagement.liveCamera();
      if (result.fetch_error) {
        setAvailable(false);
        setError(result.fetch_error);
      } else {
        setVehicleCount(result.vehicle_count);
        setAvailable(true);
        setError(null);
        setUpdatedAtMs(Date.now());
      }
    } catch (e) {
      setAvailable(false);
      setError(e instanceof Error ? e.message : "Failed to load live camera count");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setAvailable(false);
      setError("Simulated offline");
      setLoading(false);
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    load();
    pollRef.current = setInterval(load, LIVE_CAMERA_POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [enabled, load]);

  return {
    vehicleCount,
    available,
    error,
    updatedAtMs,
    loading,
    pollIntervalMs: LIVE_CAMERA_POLL_MS,
    refresh: load,
  };
}
