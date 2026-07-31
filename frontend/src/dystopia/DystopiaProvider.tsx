"use client";

/**
 * App-level Dystopia simulation engine.
 * Mounted once in DashboardShell so traffic/signals/camera sync keep running
 * while the user navigates other pages. The /dystopia page is only a view.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { LIVE_CAMERA_POLL_MS } from "@/hooks/useLiveCameraVehicleCount";
import { useLiveCamerasContext } from "@/providers/LiveCamerasProvider";

const ROADS = ["North", "East", "South", "West"] as const;
export type Road = (typeof ROADS)[number];
export type LightColor = "red" | "yellow" | "green";
type VehicleType = "car" | "truck";
type Maneuver = "straight" | "left" | "right";

/** All four approaches are camera-driven; simulated traffic is per-road fallback only. */
export const CAMERA_DRIVEN_ROADS: Road[] = ["North", "East", "South", "West"];
export const CAMERA_DRIVEN_ROAD: Road = "North"; // legacy highlight for North-first UI

export const BASE_GREEN = 4;
export const PER_VEHICLE_SECONDS = 2;
export const MIN_GREEN = 4;
export const MAX_GREEN = 30;
const TRUCK_WEIGHT = 1.5;
const YELLOW_SECONDS = 1.5;
const RELEASE_INTERVAL_S = 1.7;

const MANEUVER_STRAIGHT_PCT = 0.6;
const MANEUVER_LEFT_PCT = 0.2;

export const CANVAS = 640;
const CX = CANVAS / 2;
const CY = CANVAS / 2;
const ROAD_W = 88;
const LANE_W = ROAD_W / 2;
const HALF = LANE_W / 2;
const INTER = 100;
const STOP_GAP = INTER / 2 + 8;
const CAR_GAP = 48;
const TRUCK_GAP = 62;
const CAR_LEN = 34;
const CAR_W = 18;
const TRUCK_LEN = 52;
const TRUCK_W = 20;
const OFFSCREEN_OFFSET = CANVAS / 2 + 120;
const ENTRY_SPEED = 140;

const SPAWN_CAP_PER_UPDATE = 12;
const FALLBACK_SPAWN_MIN_S = 5;
const FALLBACK_SPAWN_MAX_S = 9;
const LOG_CAP = 18;

const CAR_COLORS = [
  "#ef4444",
  "#3b82f6",
  "#22c55e",
  "#eab308",
  "#f8fafc",
  "#94a3b8",
  "#f97316",
  "#64748b",
  "#a855f7",
];

interface Vehicle {
  id: string;
  road: Road;
  type: VehicleType;
  maneuver: Maneuver;
  queueOffset: number;
  targetQueueOffset: number;
  mode: "entering" | "queued" | "crossing" | "exiting" | "done";
  pathT: number;
  color: string;
}

export interface SimSnapshot {
  lights: Record<Road, LightColor>;
  countdown: Record<Road, number>;
  queues: Record<Road, number>;
  currentGreen: Road | null;
}

export interface LogEntry {
  id: string;
  time: string;
  text: string;
}

export const DYSTOPIA_ROADS = ROADS;

type Travel = "north" | "east" | "south" | "west";

function travelFromApproach(road: Road): Travel {
  switch (road) {
    case "North":
      return "south";
    case "East":
      return "west";
    case "South":
      return "north";
    case "West":
      return "east";
  }
}

function turnTravel(from: Travel, maneuver: Maneuver): Travel {
  const order: Travel[] = ["north", "east", "south", "west"];
  const i = order.indexOf(from);
  if (maneuver === "straight") return from;
  if (maneuver === "left") return order[(i + 3) % 4];
  return order[(i + 1) % 4];
}

function laneCenter(travel: Travel): { axis: "x" | "y"; value: number; rot: number } {
  switch (travel) {
    case "south":
      return { axis: "x", value: CX + HALF, rot: Math.PI };
    case "north":
      return { axis: "x", value: CX - HALF, rot: 0 };
    case "west":
      return { axis: "y", value: CY + HALF, rot: -Math.PI / 2 };
    case "east":
      return { axis: "y", value: CY - HALF, rot: Math.PI / 2 };
  }
}

function stopLinePoint(travel: Travel, atOutbound = false): { x: number; y: number; rot: number } {
  const lane = laneCenter(travel);
  switch (travel) {
    case "south":
      return { x: lane.value, y: atOutbound ? CY + STOP_GAP : CY - STOP_GAP, rot: lane.rot };
    case "north":
      return { x: lane.value, y: atOutbound ? CY - STOP_GAP : CY + STOP_GAP, rot: lane.rot };
    case "west":
      return { x: atOutbound ? CX - STOP_GAP : CX + STOP_GAP, y: lane.value, rot: lane.rot };
    case "east":
      return { x: atOutbound ? CX + STOP_GAP : CX - STOP_GAP, y: lane.value, rot: lane.rot };
  }
}

function queuePoint(road: Road, queueOffset: number): { x: number; y: number; rot: number } {
  const travel = travelFromApproach(road);
  const stop = stopLinePoint(travel, false);
  switch (travel) {
    case "south":
      return { ...stop, y: stop.y - queueOffset };
    case "north":
      return { ...stop, y: stop.y + queueOffset };
    case "west":
      return { ...stop, x: stop.x + queueOffset };
    case "east":
      return { ...stop, x: stop.x - queueOffset };
  }
}

function exitPoint(travel: Travel, exitDist: number): { x: number; y: number; rot: number } {
  const start = stopLinePoint(travel, true);
  switch (travel) {
    case "south":
      return { ...start, y: start.y + exitDist };
    case "north":
      return { ...start, y: start.y - exitDist };
    case "west":
      return { ...start, x: start.x - exitDist };
    case "east":
      return { ...start, x: start.x + exitDist };
  }
}

function turnControl(from: Travel, maneuver: "left" | "right"): { x: number; y: number } {
  if (maneuver === "left") {
    switch (from) {
      case "south":
        return { x: CX + HALF, y: CY - HALF };
      case "west":
        return { x: CX + HALF, y: CY + HALF };
      case "north":
        return { x: CX - HALF, y: CY + HALF };
      case "east":
        return { x: CX - HALF, y: CY - HALF };
    }
  }
  switch (from) {
    case "south":
      return { x: CX + HALF, y: CY + HALF };
    case "west":
      return { x: CX - HALF, y: CY + HALF };
    case "north":
      return { x: CX - HALF, y: CY - HALF };
    case "east":
      return { x: CX + HALF, y: CY - HALF };
  }
}

function poseOnBezier(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  t: number
): { x: number; y: number; rot: number } {
  const u = 1 - t;
  const x = u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x;
  const y = u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y;
  const dx = 2 * u * (p1.x - p0.x) + 2 * t * (p2.x - p1.x);
  const dy = 2 * u * (p1.y - p0.y) + 2 * t * (p2.y - p1.y);
  return { x, y, rot: Math.atan2(dy, dx) + Math.PI / 2 };
}

function pickManeuver(): Maneuver {
  const r = Math.random();
  if (r < MANEUVER_STRAIGHT_PCT) return "straight";
  if (r < MANEUVER_STRAIGHT_PCT + MANEUVER_LEFT_PCT) return "left";
  return "right";
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function nextRoad(road: Road): Road {
  return ROADS[(ROADS.indexOf(road) + 1) % ROADS.length];
}

function weightedQueueCount(vehicles: Vehicle[], road: Road): number {
  return vehicles
    .filter(
      (v) =>
        v.road === road &&
        (v.mode === "queued" || v.mode === "entering" || v.mode === "crossing")
    )
    .reduce((sum, v) => sum + (v.type === "truck" ? TRUCK_WEIGHT : 1), 0);
}

function computeGreenSeconds(vehicles: Vehicle[], road: Road): number {
  const w = weightedQueueCount(vehicles, road);
  const raw = BASE_GREEN + Math.round(w) * PER_VEHICLE_SECONDS;
  return clamp(raw, MIN_GREEN, MAX_GREEN);
}

function gapFor(type: VehicleType) {
  return type === "truck" ? TRUCK_GAP : CAR_GAP;
}

function vehicleSize(type: VehicleType) {
  return type === "truck" ? { len: TRUCK_LEN, w: TRUCK_W } : { len: CAR_LEN, w: CAR_W };
}

function backOfQueueOffset(vehicles: Vehicle[], road: Road): number {
  const waiting = vehicles
    .filter((v) => v.road === road && (v.mode === "queued" || v.mode === "entering"))
    .sort((a, b) => a.targetQueueOffset - b.targetQueueOffset);
  if (waiting.length === 0) return 0;
  const last = waiting[waiting.length - 1];
  return last.targetQueueOffset + gapFor(last.type);
}

function vehiclePose(v: Vehicle): { x: number; y: number; rot: number } {
  const approachTravel = travelFromApproach(v.road);
  const exitTravel = turnTravel(approachTravel, v.maneuver);

  if (v.mode === "queued" || v.mode === "entering") {
    return queuePoint(v.road, v.queueOffset);
  }

  const t = Math.min(Math.max(v.pathT, 0), 1);
  if (v.mode === "crossing") {
    const enter = stopLinePoint(approachTravel, false);
    const leave = stopLinePoint(exitTravel, true);
    if (v.maneuver === "straight") {
      return {
        x: enter.x + (leave.x - enter.x) * t,
        y: enter.y + (leave.y - enter.y) * t,
        rot: enter.rot,
      };
    }
    return poseOnBezier(enter, turnControl(approachTravel, v.maneuver), leave, t);
  }

  const exitT = Math.max(0, v.pathT - 1);
  return exitPoint(exitTravel, 280 * Math.min(exitT, 1.2));
}

let idCounter = 0;
function uid(prefix: string) {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

function makeVehicle(opts: {
  road: Road;
  type: VehicleType;
  color: string;
  targetQueueOffset: number;
}): Vehicle {
  return {
    id: uid(opts.type),
    road: opts.road,
    type: opts.type,
    maneuver: pickManeuver(),
    queueOffset: OFFSCREEN_OFFSET + opts.targetQueueOffset,
    targetQueueOffset: opts.targetQueueOffset,
    mode: "entering",
    pathT: 0,
    color: opts.color,
  };
}

function appendToRoad(vehicles: Vehicle[], road: Road, count: number): Vehicle[] {
  if (count <= 0) return [];
  let offset = backOfQueueOffset(vehicles, road);
  const list: Vehicle[] = [];
  for (let i = 0; i < count; i++) {
    const type: VehicleType = Math.random() < 0.22 ? "truck" : "car";
    const v = makeVehicle({
      road,
      type,
      color:
        type === "truck"
          ? "#475569"
          : CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)],
      targetQueueOffset: offset,
    });
    v.queueOffset = OFFSCREEN_OFFSET + i * gapFor(type);
    list.push(v);
    offset += gapFor(type);
  }
  return list;
}

function randInterval(minS: number, maxS: number) {
  return minS + Math.random() * (maxS - minS);
}

function formatClock(d = new Date()) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/* ── Drawing ──────────────────────────────────────────────────────────── */

function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1) {
  ctx.fillStyle = "#3f2a1a";
  ctx.fillRect(x - 2 * scale, y, 4 * scale, 10 * scale);
  ctx.fillStyle = "#166534";
  ctx.beginPath();
  ctx.arc(x, y - 2 * scale, 9 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#15803d";
  ctx.beginPath();
  ctx.arc(x - 4 * scale, y + 2 * scale, 6 * scale, 0, Math.PI * 2);
  ctx.arc(x + 4 * scale, y + 2 * scale, 6 * scale, 0, Math.PI * 2);
  ctx.fill();
}

function drawBuilding(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string
) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "rgba(226,232,240,0.18)";
  const cols = Math.max(1, Math.floor(w / 14));
  const rows = Math.max(1, Math.floor(h / 16));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillRect(x + 4 + c * 12, y + 5 + r * 14, 6, 7);
    }
  }
  ctx.strokeStyle = "rgba(15,23,42,0.5)";
  ctx.strokeRect(x, y, w, h);
}

function drawScenery(ctx: CanvasRenderingContext2D) {
  const margin = ROAD_W / 2 + 8;
  // Monitor geometry (updated): w=160, h=120.
  // Keep larger corner “pockets” clear so bezel/label don’t overlap scenery.
  // NW (North): x 12..172, y 28..148
  drawBuilding(ctx, 198, 156, 52, 52, "#1e293b");
  drawTree(ctx, 252, 174, 0.85);

  // NE (East): x 468..628, y 28..148
  drawBuilding(ctx, CX + margin + 24, 154, 60, 48, "#1e3a4a"); // ends at < 468
  drawTree(ctx, CANVAS - 64, 176, 1);

  // SW (West): x 12..172, y 512..632
  drawBuilding(ctx, 194, 454, 54, 54, "#243447"); // above SW monitor
  drawTree(ctx, 250, CANVAS - 72, 0.9);

  // SE (South): x 468..628, y 512..632
  drawBuilding(ctx, CX + margin + 10, 454, 56, 56, "#1e3a4a"); // ends at < 468
  drawTree(ctx, 430, CANVAS - 72, 0.85);
}

/** Corner CCTV monitors — ~1.75× previous size for legibility. */
const ROAD_MONITORS: { road: Road; x: number; y: number; w: number; h: number }[] = [
  // w/h are the live image rectangle sizes; bezel and typography scale inside drawRoadMonitors().
  { road: "North", x: 12, y: 28, w: 160, h: 120 }, // NW
  { road: "East", x: CANVAS - 172, y: 28, w: 160, h: 120 }, // NE (keeps ~12px right margin)
  { road: "West", x: 12, y: CANVAS - 128, w: 160, h: 120 }, // SW
  { road: "South", x: CANVAS - 172, y: CANVAS - 128, w: 160, h: 120 }, // SE
];

function drawSignalLostScreen(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  tMs: number
) {
  ctx.fillStyle = "#0b1220";
  ctx.fillRect(x, y, w, h);
  // Static noise bands
  for (let i = 0; i < 10; i++) {
    const gy = y + ((i * 7 + Math.floor(tMs / 40)) % h);
    ctx.fillStyle = `rgba(148,163,184,${0.04 + (i % 3) * 0.03})`;
    ctx.fillRect(x, gy, w, 2);
  }
  ctx.fillStyle = "#f87171";
  ctx.font = `600 ${Math.max(10, Math.round(h / 7))}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("SIGNAL LOST", x + w / 2, y + h / 2 + 2);
}

function drawRoadMonitors(
  ctx: CanvasRenderingContext2D,
  liveImages: Record<Road, HTMLImageElement | null>,
  liveAvailable: Record<Road, boolean>,
  tMs: number
) {
  const pulse = (Math.sin(tMs / 400) + 1) / 2;
  for (const m of ROAD_MONITORS) {
    const { x, y, w, h, road } = m;
    const scale = w / 118; // previous baseline
    const available = liveAvailable[road];
    const liveImage = liveImages[road];
    ctx.save();
    ctx.globalAlpha = 0.92;

    const bezelPad = Math.max(3, Math.round(4 * scale));
    const bezelExtraH = Math.max(12, Math.round(18 * scale));
    const liveDotR = Math.max(3, 3.5 * scale);
    const liveDotX = x + 9 * scale;
    const liveDotY = y + 11 * scale;
    const liveTextX = x + 16 * scale;
    const liveTextY = y + 14 * scale;
    const smallFont = Math.max(9, Math.round(9 * scale));
    const labelY = y + h + Math.round(11 * scale);

    ctx.fillStyle = "#020617";
    ctx.fillRect(x - bezelPad, y - bezelPad, w + bezelPad * 2, h + bezelExtraH);
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 1.5 * scale;
    ctx.strokeRect(x - bezelPad, y - bezelPad, w + bezelPad * 2, h + bezelExtraH);

    if (available && liveImage && liveImage.complete && liveImage.naturalWidth > 0) {
      ctx.drawImage(liveImage, x, y, w, h);
      ctx.fillStyle = "rgba(2,6,23,0.22)";
      ctx.fillRect(x, y, w, h);
    } else {
      drawSignalLostScreen(ctx, x, y, w, h, tMs);
    }

    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = Math.max(1, 1 * scale);
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    if (available && liveImage) {
      ctx.fillStyle = `rgba(239,68,68,${0.75 + pulse * 0.25})`;
      ctx.beginPath();
      ctx.arc(liveDotX, liveDotY, liveDotR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fecaca";
      ctx.font = `700 ${smallFont}px ui-monospace, monospace`;
      ctx.textAlign = "left";
      ctx.fillText("LIVE", liveTextX, liveTextY);
    } else {
      ctx.fillStyle = "#64748b";
      ctx.beginPath();
      ctx.arc(liveDotX, liveDotY, liveDotR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#94a3b8";
      ctx.font = `700 ${smallFont}px ui-monospace, monospace`;
      ctx.textAlign = "left";
      ctx.fillText("OFF", liveTextX, liveTextY);
    }

    ctx.fillStyle = "#67e8f9";
    ctx.font = `700 ${smallFont}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(road.toUpperCase(), x + w / 2, labelY);
    ctx.restore();
  }
}

function drawCameraBadge(ctx: CanvasRenderingContext2D, x: number, y: number, pulse: number) {
  const glow = 0.45 + 0.35 * pulse;
  ctx.save();
  ctx.shadowColor = `rgba(34,211,238,${glow})`;
  ctx.shadowBlur = 12;
  ctx.fillStyle = "#0f172a";
  ctx.strokeStyle = "#22d3ee";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x - 12, y - 9, 24, 16, 3);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y - 1, 4.5, 0, Math.PI * 2);
  ctx.strokeStyle = "#67e8f9";
  ctx.stroke();
  ctx.fillStyle = "#22d3ee";
  ctx.beginPath();
  ctx.arc(x, y - 1, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawRoads(
  ctx: CanvasRenderingContext2D,
  tMs: number,
  liveImages: Record<Road, HTMLImageElement | null>,
  liveAvailable: Record<Road, boolean>
) {
  ctx.fillStyle = "#1a2332";
  ctx.fillRect(0, 0, CANVAS, CANVAS);

  ctx.fillStyle = "#0f172a";
  const blocks = [
    [0, 0, CX - ROAD_W / 2, CY - ROAD_W / 2],
    [CX + ROAD_W / 2, 0, CANVAS, CY - ROAD_W / 2],
    [0, CY + ROAD_W / 2, CX - ROAD_W / 2, CANVAS],
    [CX + ROAD_W / 2, CY + ROAD_W / 2, CANVAS, CANVAS],
  ];
  for (const [x1, y1, x2, y2] of blocks) {
    ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
  }

  drawScenery(ctx);
  drawRoadMonitors(ctx, liveImages, liveAvailable, tMs);

  // Normal asphalt
  ctx.fillStyle = "#334155";
  ctx.fillRect(CX - ROAD_W / 2, 0, ROAD_W, CANVAS);
  ctx.fillRect(0, CY - ROAD_W / 2, CANVAS, ROAD_W);

  // Camera-driven arms — subtle cyan tint on all four live approaches
  const pulse = (Math.sin(tMs / 450) + 1) / 2;
  const camTint = `rgba(8, 145, 178, ${0.2 + pulse * 0.08})`;
  ctx.fillStyle = camTint;
  ctx.fillRect(CX - ROAD_W / 2, 0, ROAD_W, CY - INTER / 2); // North
  ctx.fillRect(CX + INTER / 2, CY - ROAD_W / 2, CANVAS - (CX + INTER / 2), ROAD_W); // East
  ctx.fillRect(CX - ROAD_W / 2, CY + INTER / 2, ROAD_W, CANVAS - (CY + INTER / 2)); // South
  ctx.fillRect(0, CY - ROAD_W / 2, CX - INTER / 2, ROAD_W); // West

  ctx.save();
  ctx.strokeStyle = `rgba(34, 211, 238, ${0.25 + pulse * 0.4})`;
  ctx.lineWidth = 2;
  ctx.shadowColor = "#22d3ee";
  ctx.shadowBlur = 6 + pulse * 10;
  ctx.beginPath();
  ctx.moveTo(CX - ROAD_W / 2, 0);
  ctx.lineTo(CX - ROAD_W / 2, CY - INTER / 2);
  ctx.moveTo(CX + ROAD_W / 2, 0);
  ctx.lineTo(CX + ROAD_W / 2, CY - INTER / 2);
  ctx.moveTo(CANVAS, CY - ROAD_W / 2);
  ctx.lineTo(CX + INTER / 2, CY - ROAD_W / 2);
  ctx.moveTo(CANVAS, CY + ROAD_W / 2);
  ctx.lineTo(CX + INTER / 2, CY + ROAD_W / 2);
  ctx.moveTo(CX - ROAD_W / 2, CANVAS);
  ctx.lineTo(CX - ROAD_W / 2, CY + INTER / 2);
  ctx.moveTo(CX + ROAD_W / 2, CANVAS);
  ctx.lineTo(CX + ROAD_W / 2, CY + INTER / 2);
  ctx.moveTo(0, CY - ROAD_W / 2);
  ctx.lineTo(CX - INTER / 2, CY - ROAD_W / 2);
  ctx.moveTo(0, CY + ROAD_W / 2);
  ctx.lineTo(CX - INTER / 2, CY + ROAD_W / 2);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "#3f4b5c";
  ctx.fillRect(CX - INTER / 2, CY - INTER / 2, INTER, INTER);
  ctx.strokeStyle = "#64748b";
  ctx.lineWidth = 2;
  ctx.strokeRect(CX - INTER / 2, CY - INTER / 2, INTER, INTER);

  ctx.strokeStyle = "#eab308";
  ctx.setLineDash([10, 10]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(CX, 0);
  ctx.lineTo(CX, CY - INTER / 2);
  ctx.moveTo(CX, CY + INTER / 2);
  ctx.lineTo(CX, CANVAS);
  ctx.moveTo(0, CY);
  ctx.lineTo(CX - INTER / 2, CY);
  ctx.moveTo(CX + INTER / 2, CY);
  ctx.lineTo(CANVAS, CY);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = "#f8fafc";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(CX, CY - INTER / 2);
  ctx.lineTo(CX + ROAD_W / 2, CY - INTER / 2);
  ctx.moveTo(CX + INTER / 2, CY);
  ctx.lineTo(CX + INTER / 2, CY + ROAD_W / 2);
  ctx.moveTo(CX - ROAD_W / 2, CY + INTER / 2);
  ctx.lineTo(CX, CY + INTER / 2);
  ctx.moveTo(CX - INTER / 2, CY - ROAD_W / 2);
  ctx.lineTo(CX - INTER / 2, CY);
  ctx.stroke();

  ctx.font = "600 13px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "#67e8f9";
  ctx.fillText("NORTH · LIVE", CX, 18);
  ctx.fillText("SOUTH · LIVE", CX, CANVAS - 8);
  ctx.save();
  ctx.translate(14, CY);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("WEST · LIVE", 0, 0);
  ctx.restore();
  ctx.save();
  ctx.translate(CANVAS - 14, CY);
  ctx.rotate(Math.PI / 2);
  ctx.fillText("EAST · LIVE", 0, 0);
  ctx.restore();
}

function lightAnchor(road: Road): { x: number; y: number } {
  switch (road) {
    case "North":
      return { x: CX + ROAD_W / 2 + 18, y: CY - INTER / 2 - 36 };
    case "East":
      return { x: CX + INTER / 2 + 36, y: CY + ROAD_W / 2 + 18 };
    case "South":
      return { x: CX - ROAD_W / 2 - 18, y: CY + INTER / 2 + 36 };
    case "West":
      return { x: CX - INTER / 2 - 36, y: CY - ROAD_W / 2 - 18 };
  }
}

function drawTrafficLight(
  ctx: CanvasRenderingContext2D,
  road: Road,
  color: LightColor,
  countdown: number,
  tMs: number
) {
  const { x, y } = lightAnchor(road);
  const boxH = 42;
  const boxW = 14;
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(x - boxW / 2, y - boxH / 2, boxW, boxH);
  const colors: LightColor[] = ["red", "yellow", "green"];
  const palette = { red: "#ef4444", yellow: "#eab308", green: "#22c55e" };
  colors.forEach((c, i) => {
    const cy = y - 14 + i * 14;
    ctx.beginPath();
    ctx.arc(x, cy, 5, 0, Math.PI * 2);
    ctx.fillStyle = color === c ? palette[c] : "#1e293b";
    ctx.fill();
    if (color === c) {
      ctx.shadowColor = palette[c];
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  });
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "700 11px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillText(String(Math.ceil(Math.max(0, countdown))), x, y + boxH / 2 + 14);

  if (CAMERA_DRIVEN_ROADS.includes(road)) {
    const pulse = (Math.sin(tMs / 450) + 1) / 2;
    drawCameraBadge(ctx, x + 22, y - 18, pulse);
  }
}

function drawVehicle(ctx: CanvasRenderingContext2D, v: Vehicle) {
  if (v.mode === "done") return;
  const { x, y, rot } = vehiclePose(v);
  const { len, w } = vehicleSize(v.type);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = v.color;
  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 1;
  const hw = w / 2;
  const hl = len / 2;
  ctx.beginPath();
  ctx.moveTo(-hw + 3, -hl);
  ctx.lineTo(hw - 3, -hl);
  ctx.quadraticCurveTo(hw, -hl, hw, -hl + 3);
  ctx.lineTo(hw, hl - 3);
  ctx.quadraticCurveTo(hw, hl, hw - 3, hl);
  ctx.lineTo(-hw + 3, hl);
  ctx.quadraticCurveTo(-hw, hl, -hw, hl - 3);
  ctx.lineTo(-hw, -hl + 3);
  ctx.quadraticCurveTo(-hw, -hl, -hw + 3, -hl);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(15,23,42,0.35)";
  ctx.fillRect(-w / 2 + 2, -len / 2 + 4, w - 4, 8);
  ctx.restore();
}

/* ── Provider ─────────────────────────────────────────────────────────── */

interface DystopiaContextValue {
  running: boolean;
  simulateOfflineRoad: Road | null;
  setSimulateOfflineRoad: (road: Road | null) => void;
  log: LogEntry[];
  snapshot: SimSnapshot;
  cameras: ReturnType<typeof useLiveCamerasContext>;
  start: () => void;
  stop: () => void;
  registerCanvas: (canvas: HTMLCanvasElement | null) => void;
  pollIntervalMs: number;
}

const DystopiaContext = createContext<DystopiaContextValue | null>(null);

export function useDystopia(): DystopiaContextValue {
  const ctx = useContext(DystopiaContext);
  if (!ctx) {
    throw new Error("useDystopia must be used within DystopiaProvider");
  }
  return ctx;
}

export function DystopiaProvider({ children }: { children: ReactNode }) {
  const [running, setRunning] = useState(false);
  const [simulateOfflineRoad, setSimulateOfflineRoad] = useState<Road | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [snapshot, setSnapshot] = useState<SimSnapshot>({
    lights: { North: "red", East: "red", South: "red", West: "red" },
    countdown: { North: 0, East: 0, South: 0, West: 0 },
    queues: { North: 0, East: 0, South: 0, West: 0 },
    currentGreen: null,
  });

  const cameras = useLiveCamerasContext();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const vehiclesRef = useRef<Vehicle[]>([]);
  const lightsRef = useRef<Record<Road, LightColor>>({
    North: "red",
    East: "red",
    South: "red",
    West: "red",
  });
  const countdownRef = useRef<Record<Road, number>>({
    North: 0,
    East: 0,
    South: 0,
    West: 0,
  });
  const phaseRef = useRef<"green" | "yellow" | "idle">("idle");
  const phaseTimerRef = useRef(0);
  const activeRoadRef = useRef<Road>("North");
  const releaseCooldownRef = useRef(0);
  const rafRef = useRef(0);
  const lastTsRef = useRef(0);
  const lastSnapUiRef = useRef(0);
  const runningRef = useRef(false);
  const loopStartedRef = useRef(false);
  const fallbackTimersRef = useRef<Record<Road, number>>({
    North: randInterval(FALLBACK_SPAWN_MIN_S, FALLBACK_SPAWN_MAX_S),
    East: randInterval(FALLBACK_SPAWN_MIN_S, FALLBACK_SPAWN_MAX_S),
    South: randInterval(FALLBACK_SPAWN_MIN_S, FALLBACK_SPAWN_MAX_S),
    West: randInterval(FALLBACK_SPAWN_MIN_S, FALLBACK_SPAWN_MAX_S),
  });
  const lastCameraCountRef = useRef<Record<Road, number | null>>({
    North: null,
    East: null,
    South: null,
    West: null,
  });
  const wasAvailableRef = useRef<Record<Road, boolean>>({
    North: false,
    East: false,
    South: false,
    West: false,
  });
  const liveImageRefs = useRef<Record<Road, HTMLImageElement | null>>({
    North: null,
    East: null,
    South: null,
    West: null,
  });
  const liveAvailableRefs = useRef<Record<Road, boolean>>({
    North: false,
    East: false,
    South: false,
    West: false,
  });
  const simulateOfflineRoadRef = useRef<Road | null>(null);

  useEffect(() => {
    simulateOfflineRoadRef.current = simulateOfflineRoad;
  }, [simulateOfflineRoad]);

  const roadFeedAvailable = useCallback(
    (road: Road) => {
      if (simulateOfflineRoad === road) return false;
      return cameras.feedsByRoad[road].available;
    },
    [cameras.feedsByRoad, simulateOfflineRoad]
  );

  // Load per-road JPEGs from shared poll — no extra fetches.
  useEffect(() => {
    for (const road of ROADS) {
      const feed = cameras.feedsByRoad[road];
      const available = roadFeedAvailable(road);
      liveAvailableRefs.current[road] = available;
      if (!available || !feed.imageUrl) {
        liveImageRefs.current[road] = null;
        continue;
      }
      const img = new Image();
      img.decoding = "async";
      img.onload = () => {
        liveImageRefs.current[road] = img;
      };
      img.onerror = () => {
        liveImageRefs.current[road] = null;
      };
      img.src = feed.imageUrl;
    }
  }, [cameras.feedsByRoad, roadFeedAvailable]);

  const pushLog = useCallback((text: string) => {
    const entry: LogEntry = { id: uid("log"), time: formatClock(), text };
    setLog((prev) => [entry, ...prev].slice(0, LOG_CAP));
  }, []);

  const packSnapshot = useCallback((): SimSnapshot => {
    const queues = Object.fromEntries(
      ROADS.map((r) => [
        r,
        vehiclesRef.current.filter(
          (v) => v.road === r && (v.mode === "queued" || v.mode === "entering")
        ).length,
      ])
    ) as Record<Road, number>;
    return {
      lights: { ...lightsRef.current },
      countdown: { ...countdownRef.current },
      queues,
      currentGreen: phaseRef.current === "green" ? activeRoadRef.current : null,
    };
  }, []);

  const spawnOnRoad = useCallback(
    (road: Road, count: number, reason: "camera" | "fallback") => {
      const n = Math.min(SPAWN_CAP_PER_UPDATE, Math.max(0, count));
      if (n <= 0) return;
      const batch = appendToRoad(vehiclesRef.current, road, n);
      batch.forEach((v, i) => {
        v.queueOffset = OFFSCREEN_OFFSET + i * gapFor(v.type);
        vehiclesRef.current.push(v);
      });

      if (reason === "camera") {
        pushLog(`🎥 ${road}: +${n} from live feed`);
      } else {
        pushLog(`⚠️ ${road}: +${n} (camera fallback)`);
      }
    },
    [pushLog]
  );

  const startGreen = useCallback(
    (target: Road) => {
      activeRoadRef.current = target;
      phaseRef.current = "green";
      const secs = computeGreenSeconds(vehiclesRef.current, target);
      phaseTimerRef.current = secs;
      releaseCooldownRef.current = 0.4;
      for (const r of ROADS) {
        lightsRef.current[r] = r === target ? "green" : "red";
        countdownRef.current[r] = r === target ? secs : 0;
      }
      const q = vehiclesRef.current.filter(
        (v) => v.road === target && (v.mode === "queued" || v.mode === "entering")
      ).length;
      pushLog(`🟢 ${target} green — queue ${q}, extending to ${secs}s`);
    },
    [pushLog]
  );

  const startYellow = useCallback((road: Road) => {
    phaseRef.current = "yellow";
    phaseTimerRef.current = YELLOW_SECONDS;
    lightsRef.current[road] = "yellow";
    countdownRef.current[road] = YELLOW_SECONDS;
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const tMs = performance.now();
    drawRoads(ctx, tMs, liveImageRefs.current, liveAvailableRefs.current);
    for (const road of ROADS) {
      drawTrafficLight(ctx, road, lightsRef.current[road], countdownRef.current[road], tMs);
    }
    for (const v of vehiclesRef.current) {
      drawVehicle(ctx, v);
    }
  }, []);

  const tick = useCallback(
    (dt: number) => {
      if (!runningRef.current) {
        draw();
        return;
      }

      const active = activeRoadRef.current;

      if (phaseRef.current === "green" || phaseRef.current === "yellow") {
        phaseTimerRef.current -= dt;
        countdownRef.current[active] = Math.max(0, phaseTimerRef.current);
      }

      for (const v of vehiclesRef.current) {
        if (v.mode === "entering") {
          const dist = v.queueOffset - v.targetQueueOffset;
          if (dist <= 1.5) {
            v.queueOffset = v.targetQueueOffset;
            v.mode = "queued";
          } else {
            const speed = Math.max(40, Math.min(ENTRY_SPEED, dist * 1.8));
            v.queueOffset = Math.max(v.targetQueueOffset, v.queueOffset - speed * dt);
          }
        }
      }

      if (phaseRef.current === "green" && lightsRef.current[active] === "green") {
        releaseCooldownRef.current -= dt;
        if (releaseCooldownRef.current <= 0) {
          const front = vehiclesRef.current
            .filter((v) => v.road === active && v.mode === "queued")
            .sort((a, b) => a.queueOffset - b.queueOffset)[0];
          if (front) {
            front.mode = "crossing";
            front.pathT = 0;
            const rest = vehiclesRef.current
              .filter(
                (v) =>
                  v.road === active && (v.mode === "queued" || v.mode === "entering")
              )
              .sort((a, b) => a.queueOffset - b.queueOffset);
            let o = 0;
            for (const v of rest) {
              v.targetQueueOffset = o;
              if (v.mode === "queued") v.queueOffset = o;
              o += gapFor(v.type);
            }
            releaseCooldownRef.current = RELEASE_INTERVAL_S;
          }
        }
      }

      for (const v of vehiclesRef.current) {
        if (v.mode === "crossing") {
          const speed = v.maneuver === "straight" ? 0.55 : 0.4;
          v.pathT += dt * speed;
          if (v.pathT >= 1) {
            v.pathT = 1;
            v.mode = "exiting";
          }
        } else if (v.mode === "exiting") {
          v.pathT += dt * 0.7;
          if (v.pathT >= 2.2) v.mode = "done";
        }
      }
      vehiclesRef.current = vehiclesRef.current.filter((v) => v.mode !== "done");

      for (const road of ROADS) {
        const queued = vehiclesRef.current
          .filter((v) => v.road === road && v.mode === "queued")
          .sort((a, b) => a.queueOffset - b.queueOffset);
        let target = 0;
        for (const v of queued) {
          v.targetQueueOffset = target;
          if (v.queueOffset > target + 1) {
            v.queueOffset = Math.max(target, v.queueOffset - 60 * dt);
          }
          target = v.queueOffset + gapFor(v.type);
        }
      }

      for (const road of ROADS) {
        if (liveAvailableRefs.current[road]) continue;
        fallbackTimersRef.current[road] -= dt;
        if (fallbackTimersRef.current[road] <= 0) {
          const n = Math.random() < 0.4 ? 0 : 1;
          if (n > 0) spawnOnRoad(road, n, "fallback");
          fallbackTimersRef.current[road] = randInterval(
            FALLBACK_SPAWN_MIN_S,
            FALLBACK_SPAWN_MAX_S
          );
        }
      }

      if (phaseRef.current === "green") {
        const queuedLeft = vehiclesRef.current.some(
          (v) => v.road === active && (v.mode === "queued" || v.mode === "entering")
        );
        const crossing = vehiclesRef.current.some(
          (v) => v.road === active && v.mode === "crossing"
        );
        if ((!queuedLeft && !crossing) || phaseTimerRef.current <= 0) {
          startYellow(active);
        }
      } else if (phaseRef.current === "yellow") {
        if (phaseTimerRef.current <= 0) {
          lightsRef.current[active] = "red";
          countdownRef.current[active] = 0;
          startGreen(nextRoad(active));
        }
      } else if (phaseRef.current === "idle") {
        startGreen("North");
      }

      draw();
      if (performance.now() - lastSnapUiRef.current > 200) {
        lastSnapUiRef.current = performance.now();
        setSnapshot(packSnapshot());
      }
    },
    [draw, packSnapshot, spawnOnRoad, startGreen, startYellow]
  );

  const tickRefFn = useRef(tick);
  tickRefFn.current = tick;

  // Single app-lifetime RAF loop — never restarted by page remounts.
  useEffect(() => {
    if (loopStartedRef.current) return;
    loopStartedRef.current = true;
    lastTsRef.current = performance.now();
    const loop = (ts: number) => {
      const dt = Math.min(0.05, (ts - lastTsRef.current) / 1000);
      lastTsRef.current = ts;
      tickRefFn.current(dt);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafRef.current);
      loopStartedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!running) return;

    for (const road of ROADS) {
      const feed = cameras.feedsByRoad[road];
      const available = roadFeedAvailable(road);
      const count = feed.vehicleCount;

      if (!available) {
        if (wasAvailableRef.current[road]) {
          pushLog(`⚠️ ${road} camera offline — fallback traffic`);
        }
        wasAvailableRef.current[road] = false;
        continue;
      }

      if (count == null) continue;

      if (!wasAvailableRef.current[road]) {
        wasAvailableRef.current[road] = true;
        pushLog(`🎥 ${road} linked — ${count} vehicles detected`);
      }

      const prev = lastCameraCountRef.current[road];
      if (prev == null) {
        lastCameraCountRef.current[road] = count;
        const seed = Math.min(SPAWN_CAP_PER_UPDATE, count);
        if (seed > 0) spawnOnRoad(road, seed, "camera");
        continue;
      }

      if (count > prev) {
        const delta = Math.min(SPAWN_CAP_PER_UPDATE, count - prev);
        spawnOnRoad(road, delta, "camera");
      } else if (count < prev) {
        pushLog(`🎥 ${road} count dropped to ${count} — no despawn`);
      }
      lastCameraCountRef.current[road] = count;
    }
  }, [
    cameras.feedsByRoad,
    running,
    roadFeedAvailable,
    pushLog,
    spawnOnRoad,
  ]);

  const start = useCallback(() => {
    if (runningRef.current) return;
    vehiclesRef.current = [];
    for (const r of ROADS) {
      lastCameraCountRef.current[r] = null;
      wasAvailableRef.current[r] = false;
      fallbackTimersRef.current[r] = randInterval(2, 4);
    }
    runningRef.current = true;
    setRunning(true);
    setLog([]);
    pushLog("▶ Dystopia simulation started");
    for (const r of ROADS) {
      if (!roadFeedAvailable(r)) {
        pushLog(`⚠️ ${r} camera unavailable — fallback traffic`);
      }
    }
    startGreen("North");
  }, [pushLog, roadFeedAvailable, startGreen]);

  const stop = useCallback(() => {
    runningRef.current = false;
    setRunning(false);
    vehiclesRef.current = [];
    phaseRef.current = "idle";
    for (const r of ROADS) {
      lastCameraCountRef.current[r] = null;
      wasAvailableRef.current[r] = false;
      lightsRef.current[r] = "red";
      countdownRef.current[r] = 0;
    }
    setSnapshot(packSnapshot());
    pushLog("⏹ Simulation stopped");
    draw();
  }, [draw, packSnapshot, pushLog]);

  const registerCanvas = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      canvasRef.current = canvas;
      if (canvas) draw();
    },
    [draw]
  );

  const value = useMemo<DystopiaContextValue>(
    () => ({
      running,
      simulateOfflineRoad,
      setSimulateOfflineRoad,
      log,
      snapshot,
      cameras,
      start,
      stop,
      registerCanvas,
      pollIntervalMs: LIVE_CAMERA_POLL_MS,
    }),
    [
      running,
      simulateOfflineRoad,
      log,
      snapshot,
      cameras,
      start,
      stop,
      registerCanvas,
    ]
  );

  return <DystopiaContext.Provider value={value}>{children}</DystopiaContext.Provider>;
}
