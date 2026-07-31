"use client";

/**
 * Read-only access to all four live Caltrans camera feeds.
 *
 * Single poll to GET /api/traffic-management/live-cameras — same backend cache
 * Command Signal reads. Does NOT hit Caltrans directly.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { api, LiveCameraState } from "@/lib/api";

/** Must stay in sync with Command Signal's POLL_INTERVAL_MS. */
export const LIVE_CAMERA_POLL_MS = 30_000;

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type CameraId = "north" | "east" | "south" | "west";
export type RoadName = "North" | "East" | "South" | "West";

export const CAMERA_IDS: CameraId[] = ["north", "east", "south", "west"];

export const ROAD_TO_CAMERA: Record<RoadName, CameraId> = {
  North: "north",
  East: "east",
  South: "south",
  West: "west",
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

function emptyFeed(cameraId: CameraId, road: RoadName): RoadCameraFeed {
  return {
    cameraId,
    road,
    label: cameraId,
    vehicleCount: null,
    available: false,
    error: null,
    updatedAtMs: null,
    imageUrl: null,
    raw: null,
  };
}

function parseFeed(cameraId: CameraId, data: LiveCameraState, now: number): RoadCameraFeed {
  const road = (data.road ?? cameraId.charAt(0).toUpperCase() + cameraId.slice(1)) as RoadName;
  const available = !data.fetch_error;
  const path = data.annotated_image_url || `/static/live_camera_${cameraId}.jpg`;
  return {
    cameraId,
    road,
    label: data.label ?? cameraId,
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
    north: emptyFeed("north", "North"),
    east: emptyFeed("east", "East"),
    south: emptyFeed("south", "South"),
    west: emptyFeed("west", "West"),
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
            const road = (id.charAt(0).toUpperCase() + id.slice(1)) as RoadName;
            next[id] = { ...emptyFeed(id, road), error: "No data" };
          }
        }
        return next;
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load live cameras";
      setFeeds({
        north: { ...emptyFeed("north", "North"), error: msg },
        east: { ...emptyFeed("east", "East"), error: msg },
        south: { ...emptyFeed("south", "South"), error: msg },
        west: { ...emptyFeed("west", "West"), error: msg },
      });
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

  const feedsByRoad = {
    North: feeds.north,
    East: feeds.east,
    South: feeds.south,
    West: feeds.west,
  };

  return { feeds, feedsByRoad, loading, pollIntervalMs: LIVE_CAMERA_POLL_MS, refresh: load };
}

/** Legacy single-camera hook — wraps north feed only (Command Signal compat). */
export function useLiveCameraVehicleCount(options?: { enabled?: boolean }) {
  const all = useLiveCameras(options);
  const north = all.feeds.north;
  return {
    vehicleCount: north.vehicleCount,
    available: north.available,
    error: north.error,
    updatedAtMs: north.updatedAtMs,
    imageUrl: north.imageUrl,
    loading: all.loading,
    pollIntervalMs: all.pollIntervalMs,
    refresh: all.refresh,
  };
}
