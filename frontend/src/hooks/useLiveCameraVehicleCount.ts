"use client";

/**
 * Read-only access to all six live Caltrans camera feeds.
 *
 * Single poll to GET /api/traffic-management/live-cameras — same backend cache
 * Command Signal reads. Does NOT hit Caltrans directly.
 *
 * Camera → junction mapping:
 *   Junction A: camera_1 (I-10 Archibald), camera_2 (I-10 Haven), camera_3 (I-10 Milliken W)
 *   Junction B: camera_4 (I-10 Benson),    camera_5 (I-10 Vineyard E), camera_6 (I-10 Mountain E)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { api, LiveCameraState } from "@/lib/api";

/** Must stay in sync with Command Signal's POLL_INTERVAL_MS. */
export const LIVE_CAMERA_POLL_MS = 30_000;

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type CameraId = "camera_1" | "camera_2" | "camera_3" | "camera_4" | "camera_5" | "camera_6";
/** RoadName equals CameraId — same lowercase identifiers used as record keys. */
export type RoadName = CameraId;

export const CAMERA_IDS: CameraId[] = ["camera_1", "camera_2", "camera_3", "camera_4", "camera_5", "camera_6"];

export const ROAD_TO_CAMERA: Record<RoadName, CameraId> = {
  camera_1: "camera_1",
  camera_2: "camera_2",
  camera_3: "camera_3",
  camera_4: "camera_4",
  camera_5: "camera_5",
  camera_6: "camera_6",
};

export interface RoadCameraFeed {
  cameraId: CameraId;
  road: RoadName;
  label: string;
  vehicleCount: number | null;
  available: boolean;
  error: string | null;
  updatedAtMs: number | null;
  imageUrl: string | null;
  raw: LiveCameraState | null;
}

export interface LiveCamerasState {
  feeds: Record<CameraId, RoadCameraFeed>;
  feedsByRoad: Record<RoadName, RoadCameraFeed>;
  loading: boolean;
  pollIntervalMs: number;
  refresh: () => void;
}

function emptyFeed(cameraId: CameraId): RoadCameraFeed {
  return {
    cameraId,
    road: cameraId,
    label: cameraId.replace("_", " "),
    vehicleCount: null,
    available: false,
    error: null,
    updatedAtMs: null,
    imageUrl: null,
    raw: null,
  };
}

function parseFeed(cameraId: CameraId, data: LiveCameraState, now: number): RoadCameraFeed {
  const road = (data.road ?? cameraId) as RoadName;
  const available = !data.fetch_error;
  // Prefer backend's annotated_image_url (always set); fallback uses numeric suffix
  const fileNum = cameraId.replace("camera_", "");
  const path = data.annotated_image_url || `/static/live_camera_${fileNum}.jpg`;
  return {
    cameraId,
    road,
    label: data.label ?? cameraId.replace("_", " "),
    vehicleCount: available ? data.vehicle_count : null,
    available,
    error: data.fetch_error ?? null,
    updatedAtMs: available ? now : null,
    imageUrl: available ? `${API_BASE}${path}?t=${now}` : null,
    raw: data,
  };
}

export function useLiveCameras(options?: { enabled?: boolean }): LiveCamerasState {
  const enabled = options?.enabled !== false;
  const [feeds, setFeeds] = useState<Record<CameraId, RoadCameraFeed>>({
    camera_1: emptyFeed("camera_1"),
    camera_2: emptyFeed("camera_2"),
    camera_3: emptyFeed("camera_3"),
    camera_4: emptyFeed("camera_4"),
    camera_5: emptyFeed("camera_5"),
    camera_6: emptyFeed("camera_6"),
  });
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api.trafficManagement.liveCameras();
      const now = Date.now();
      setFeeds(() => {
        const next = {} as Record<CameraId, RoadCameraFeed>;
        for (const id of CAMERA_IDS) {
          const cam = result.cameras[id];
          if (cam) {
            next[id] = parseFeed(id, cam, now);
          } else {
            next[id] = { ...emptyFeed(id), error: "No data" };
          }
        }
        return next;
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load live cameras";
      const errFeeds = {} as Record<CameraId, RoadCameraFeed>;
      for (const id of CAMERA_IDS) {
        errFeeds[id] = { ...emptyFeed(id), error: msg };
      }
      setFeeds(errFeeds);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
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

  const feedsByRoad = Object.fromEntries(
    CAMERA_IDS.map((id) => [id, feeds[id]])
  ) as Record<RoadName, RoadCameraFeed>;

  return { feeds, feedsByRoad, loading, pollIntervalMs: LIVE_CAMERA_POLL_MS, refresh: load };
}

/** Legacy single-camera hook — wraps camera_1 feed only (Command Signal compat). */
export function useLiveCameraVehicleCount(options?: { enabled?: boolean }) {
  const all = useLiveCameras(options);
  const cam1 = all.feeds.camera_1;
  return {
    vehicleCount: cam1.vehicleCount,
    available: cam1.available,
    error: cam1.error,
    updatedAtMs: cam1.updatedAtMs,
    imageUrl: cam1.imageUrl,
    loading: all.loading,
    pollIntervalMs: all.pollIntervalMs,
    refresh: all.refresh,
  };
}
