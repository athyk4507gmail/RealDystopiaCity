"use client";

/**
 * App-level Dystopia simulation engine — TWO-JUNCTION layout.
 *
 * Six real Caltrans D8 I-10 camera feeds, renamed camera_1 through camera_6:
 *   Junction A (left,  center 320×320): camera_1 North arm, camera_2 West arm,  camera_3 South arm
 *   Junction B (right, center 960×320): camera_4 North arm, camera_5 East arm,  camera_6 South arm
 *   Connecting road links the two junctions horizontally at y=320.
 *
 * Physics / signal timing UNCHANGED: Green = BASE_GREEN + queue×PER_VEHICLE_SECONDS,
 * clamped MIN_GREEN–MAX_GREEN; clockwise rotation through all 6 roads; no hardcoded priority.
 * Mounted once in DashboardShell — keeps running while user navigates other pages.
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

// ─── Road / Camera identity ───────────────────────────────────────────────────

const ROADS = [
  "camera_1",
  "camera_2",
  "camera_3",
  "camera_4",
  "camera_5",
  "camera_6",
] as const;
export type Road = (typeof ROADS)[number];
export type LightColor = "red" | "yellow" | "green";
type VehicleType = "car" | "truck";
type Maneuver = "straight" | "left" | "right";

/** All six approaches are camera-driven; simulated traffic is per-road fallback only. */
export const CAMERA_DRIVEN_ROADS: Road[] = [
  "camera_1", "camera_2", "camera_3", "camera_4", "camera_5", "camera_6",
];
/** Legacy single-camera highlight (kept for API compat). */
export const CAMERA_DRIVEN_ROAD: Road = "camera_1";

// ─── Junction groupings (ISSUE 3) ───────────────────────────────────────────────
const JUNCTION_A_ROADS: Road[] = ["camera_1", "camera_2", "camera_3"];
const JUNCTION_B_ROADS: Road[] = ["camera_4", "camera_5", "camera_6"];

// ─── Signal-timing constants (UNCHANGED) ─────────────────────────────────────

export const BASE_GREEN = 4;
export const PER_VEHICLE_SECONDS = 2;
export const MIN_GREEN = 4;
export const MAX_GREEN = 30;
const TRUCK_WEIGHT = 1.5;
const YELLOW_SECONDS = 1.5;
const RELEASE_INTERVAL_S = 1.7;

const MANEUVER_STRAIGHT_PCT = 0.6;
const MANEUVER_LEFT_PCT = 0.2;

// ─── Canvas geometry ──────────────────────────────────────────────────────────

/** Two-junction canvas: Junction A at (320,320), Junction B at (960,320). */
export const CANVAS_W = 1280;
export const CANVAS_H = 640;
/** Legacy single-value export — equals CANVAS_W for compat. */
export const CANVAS = CANVAS_W;

// Junction centers
const CAX = 320;
const CAY = 320;
const CBX = 960;
const CBY = 320;

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
const OFFSCREEN_OFFSET = 440; // same as original — works for all 6 arms
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

// ─── Types ────────────────────────────────────────────────────────────────────

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
  /** FIX 5: Current velocity for smooth acceleration/deceleration */
  velocity: number;
  /** FIX 5: Target velocity for smooth transitions */
  targetVelocity: number;
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

// ─── Geometry helpers ─────────────────────────────────────────────────────────

type Travel = "north" | "east" | "south" | "west";

/** Return the (cx, cy) of the junction this road belongs to. */
function junctionCenter(road: Road): { cx: number; cy: number } {
  if (road === "camera_1" || road === "camera_2" || road === "camera_3")
    return { cx: CAX, cy: CAY };
  return { cx: CBX, cy: CBY };
}

/**
 * Direction the vehicle is MOVING when it enters the junction.
 * Junction A: camera_1→N arm (south), camera_2→W arm (east), camera_3→S arm (north)
 * Junction B: camera_4→N arm (south), camera_5→E arm (west),  camera_6→S arm (north)
 */
function travelFromApproach(road: Road): Travel {
  switch (road) {
    case "camera_1": return "south";
    case "camera_2": return "east";
    case "camera_3": return "north";
    case "camera_4": return "south";
    case "camera_5": return "west";
    case "camera_6": return "north";
  }
}

function turnTravel(from: Travel, maneuver: Maneuver): Travel {
  const order: Travel[] = ["north", "east", "south", "west"];
  const i = order.indexOf(from);
  if (maneuver === "straight") return from;
  if (maneuver === "left") return order[(i + 3) % 4];
  return order[(i + 1) % 4];
}

function laneCenter(
  travel: Travel,
  cx: number,
  cy: number
): { axis: "x" | "y"; value: number; rot: number } {
  switch (travel) {
    case "south": return { axis: "x", value: cx + HALF, rot: Math.PI };
    case "north": return { axis: "x", value: cx - HALF, rot: 0 };
    case "west":  return { axis: "y", value: cy + HALF, rot: -Math.PI / 2 };
    case "east":  return { axis: "y", value: cy - HALF, rot: Math.PI / 2 };
  }
}

function stopLinePoint(
  travel: Travel,
  cx: number,
  cy: number,
  atOutbound = false
): { x: number; y: number; rot: number } {
  const lane = laneCenter(travel, cx, cy);
  switch (travel) {
    case "south":
      return { x: lane.value, y: atOutbound ? cy + STOP_GAP : cy - STOP_GAP, rot: lane.rot };
    case "north":
      return { x: lane.value, y: atOutbound ? cy - STOP_GAP : cy + STOP_GAP, rot: lane.rot };
    case "west":
      return { x: atOutbound ? cx - STOP_GAP : cx + STOP_GAP, y: lane.value, rot: lane.rot };
    case "east":
      return { x: atOutbound ? cx + STOP_GAP : cx - STOP_GAP, y: lane.value, rot: lane.rot };
  }
}

function queuePoint(
  road: Road,
  queueOffset: number
): { x: number; y: number; rot: number } {
  const { cx, cy } = junctionCenter(road);
  const travel = travelFromApproach(road);
  const stop = stopLinePoint(travel, cx, cy, false);
  switch (travel) {
    case "south": return { ...stop, y: stop.y - queueOffset };
    case "north": return { ...stop, y: stop.y + queueOffset };
    case "west":  return { ...stop, x: stop.x + queueOffset };
    case "east":  return { ...stop, x: stop.x - queueOffset };
  }
}

function exitPoint(
  travel: Travel,
  cx: number,
  cy: number,
  exitDist: number
): { x: number; y: number; rot: number } {
  const start = stopLinePoint(travel, cx, cy, true);
  switch (travel) {
    case "south": return { ...start, y: start.y + exitDist };
    case "north": return { ...start, y: start.y - exitDist };
    case "west":  return { ...start, x: start.x - exitDist };
    case "east":  return { ...start, x: start.x + exitDist };
  }
}

function turnControl(
  from: Travel,
  maneuver: "left" | "right",
  cx: number,
  cy: number
): { x: number; y: number } {
  if (maneuver === "left") {
    switch (from) {
      case "south": return { x: cx + HALF, y: cy - HALF };
      case "west":  return { x: cx + HALF, y: cy + HALF };
      case "north": return { x: cx - HALF, y: cy + HALF };
      case "east":  return { x: cx - HALF, y: cy - HALF };
    }
  }
  switch (from) {
    case "south": return { x: cx + HALF, y: cy + HALF };
    case "west":  return { x: cx - HALF, y: cy + HALF };
    case "north": return { x: cx - HALF, y: cy - HALF };
    case "east":  return { x: cx + HALF, y: cy - HALF };
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

/** Advance to the next signal in Junction A's clockwise rotation. */
function nextJunctionASignal(active: Road): Road {
  return JUNCTION_A_ROADS[(JUNCTION_A_ROADS.indexOf(active) + 1) % JUNCTION_A_ROADS.length];
}

/** Advance to the next signal in Junction B's clockwise rotation. */
function nextJunctionBSignal(active: Road): Road {
  return JUNCTION_B_ROADS[(JUNCTION_B_ROADS.indexOf(active) + 1) % JUNCTION_B_ROADS.length];
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
  const { cx, cy } = junctionCenter(v.road);
  const approachTravel = travelFromApproach(v.road);
  const exitTravel = turnTravel(approachTravel, v.maneuver);

  if (v.mode === "queued" || v.mode === "entering") {
    return queuePoint(v.road, v.queueOffset);
  }

  const t = Math.min(Math.max(v.pathT, 0), 1);
  if (v.mode === "crossing") {
    const enter = stopLinePoint(approachTravel, cx, cy, false);
    const leave = stopLinePoint(exitTravel, cx, cy, true);
    if (v.maneuver === "straight") {
      return {
        x: enter.x + (leave.x - enter.x) * t,
        y: enter.y + (leave.y - enter.y) * t,
        rot: enter.rot,
      };
    }
    return poseOnBezier(enter, turnControl(approachTravel, v.maneuver, cx, cy), leave, t);
  }

  const exitT = Math.max(0, v.pathT - 1);
  return exitPoint(exitTravel, cx, cy, 280 * Math.min(exitT, 1.2));
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
    velocity: 0,  // FIX 5
    targetVelocity: ENTRY_SPEED,  // FIX 5
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

// ─── Drawing helpers ──────────────────────────────────────────────────────────

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
  const hw = ROAD_W / 2;

  // ── Left side (west of Junction A) ────────────────────────────
  drawBuilding(ctx, 162, 28, 52, 48, "#1e293b");      // NW-A top
  drawTree(ctx, 230, 52, 0.85);
  drawBuilding(ctx, 162, CAY + hw + 12, 52, 52, "#243447"); // SW-A
  drawTree(ctx, 234, CANVAS_H - 72, 0.9);

  // ── Middle strip — between junctions, above connecting road ──
  drawBuilding(ctx, CAX + hw + 22, 24, 56, 44, "#1e3a4a");
  drawTree(ctx, CAX + hw + 90, 46, 0.8);
  drawBuilding(ctx, CBX - hw - 86, 24, 56, 44, "#243447");
  drawTree(ctx, CBX - hw - 22, 48, 0.85);

  // ── Middle strip — below connecting road ─────────────────────
  drawBuilding(ctx, CAX + hw + 22, CAY + hw + 14, 56, 44, "#1e293b");
  drawTree(ctx, CAX + hw + 90, CANVAS_H - 62, 0.8);
  drawBuilding(ctx, CBX - hw - 86, CAY + hw + 14, 56, 44, "#1e3a4a");
  drawTree(ctx, CBX - hw - 22, CANVAS_H - 62, 0.85);

  // ── Right side (east of Junction B) ───────────────────────────
  drawBuilding(ctx, CANVAS_W - 220, 28, 52, 48, "#1e3a4a");  // NE-B
  drawTree(ctx, CANVAS_W - 158, 52, 0.85);
  drawBuilding(ctx, CANVAS_W - 220, CAY + hw + 12, 52, 52, "#1e293b"); // SE-B
  drawTree(ctx, CANVAS_W - 158, CANVAS_H - 72, 0.9);
}

/**
 * Six CCTV monitors — 3 per junction, stacked on the left and right canvas edges.
 * Positioned to avoid overlapping road asphalt (which is drawn before monitors in the
 * final draw order).
 */
const ROAD_MONITORS: { road: Road; x: number; y: number; w: number; h: number }[] = [
  // Junction A — left edge (x: 12..152; road at x: 276..364)
  { road: "camera_1", x: 12, y: 28,            w: 140, h: 105 },
  { road: "camera_2", x: 12, y: 153,           w: 140, h: 105 },
  { road: "camera_3", x: 12, y: CANVAS_H - 128, w: 140, h: 105 },
  // Junction B — right edge (x: 1128..1268; right road edge at x: 1004)
  { road: "camera_4", x: CANVAS_W - 152, y: 28,            w: 140, h: 105 },
  { road: "camera_5", x: CANVAS_W - 152, y: 153,           w: 140, h: 105 },
  { road: "camera_6", x: CANVAS_W - 152, y: CANVAS_H - 128, w: 140, h: 105 },
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
    const scale = w / 118;
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

    // Label: "CAMERA 1", "CAMERA 2", ...
    ctx.fillStyle = "#67e8f9";
    ctx.font = `700 ${smallFont}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(road.replace("_", " ").toUpperCase(), x + w / 2, labelY);
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

/**
 * Draw one junction: vertical through-road + one horizontal arm + intersection box.
 * @param hasWestArm  true for Junction A (west arm = camera_2 approach)
 * @param hasEastArm  true for Junction B (east arm = camera_5 approach)
 */
function drawJunction(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  tMs: number,
  hasWestArm: boolean,
  hasEastArm: boolean,
  pulse: number
) {
  const hw = ROAD_W / 2;

  // ── Asphalt ────────────────────────────────────────────────────────────────
  ctx.fillStyle = "#334155";
  ctx.fillRect(cx - hw, 0, ROAD_W, CANVAS_H);                                 // vertical
  if (hasWestArm) ctx.fillRect(0, cy - hw, cx - hw, ROAD_W);                  // west arm
  if (hasEastArm) ctx.fillRect(cx + hw, cy - hw, CANVAS_W - (cx + hw), ROAD_W); // east arm

  // ── Camera-driven cyan tint on all live arms ────────────────────────────────
  const camTint = `rgba(8,145,178,${0.2 + pulse * 0.08})`;
  ctx.fillStyle = camTint;
  ctx.fillRect(cx - hw, 0, ROAD_W, cy - INTER / 2);                                  // N arm
  ctx.fillRect(cx - hw, cy + INTER / 2, ROAD_W, CANVAS_H - (cy + INTER / 2));        // S arm
  if (hasWestArm) ctx.fillRect(0, cy - hw, cx - INTER / 2, ROAD_W);                  // W arm
  if (hasEastArm) ctx.fillRect(cx + INTER / 2, cy - hw, CANVAS_W - (cx + INTER / 2), ROAD_W); // E arm

  // ── Glowing edges ──────────────────────────────────────────────────────────
  ctx.save();
  ctx.strokeStyle = `rgba(34,211,238,${0.25 + pulse * 0.4})`;
  ctx.lineWidth = 2;
  ctx.shadowColor = "#22d3ee";
  ctx.shadowBlur = 6 + pulse * 10;
  ctx.beginPath();
  ctx.moveTo(cx - hw, 0); ctx.lineTo(cx - hw, cy - INTER / 2);
  ctx.moveTo(cx + hw, 0); ctx.lineTo(cx + hw, cy - INTER / 2);
  ctx.moveTo(cx - hw, CANVAS_H); ctx.lineTo(cx - hw, cy + INTER / 2);
  ctx.moveTo(cx + hw, CANVAS_H); ctx.lineTo(cx + hw, cy + INTER / 2);
  if (hasWestArm) {
    ctx.moveTo(0, cy - hw); ctx.lineTo(cx - INTER / 2, cy - hw);
    ctx.moveTo(0, cy + hw); ctx.lineTo(cx - INTER / 2, cy + hw);
  }
  if (hasEastArm) {
    ctx.moveTo(CANVAS_W, cy - hw); ctx.lineTo(cx + INTER / 2, cy - hw);
    ctx.moveTo(CANVAS_W, cy + hw); ctx.lineTo(cx + INTER / 2, cy + hw);
  }
  ctx.stroke();
  ctx.restore();

  // ── Intersection box ────────────────────────────────────────────────────────
  ctx.fillStyle = "#3f4b5c";
  ctx.fillRect(cx - INTER / 2, cy - INTER / 2, INTER, INTER);
  ctx.strokeStyle = "#64748b";
  ctx.lineWidth = 2;
  ctx.strokeRect(cx - INTER / 2, cy - INTER / 2, INTER, INTER);

  // ── Centre-line dashes ──────────────────────────────────────────────────────
  ctx.strokeStyle = "#eab308";
  ctx.setLineDash([10, 10]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, 0); ctx.lineTo(cx, cy - INTER / 2);
  ctx.moveTo(cx, cy + INTER / 2); ctx.lineTo(cx, CANVAS_H);
  if (hasWestArm) { ctx.moveTo(0, cy); ctx.lineTo(cx - INTER / 2, cy); }
  if (hasEastArm) { ctx.moveTo(cx + INTER / 2, cy); ctx.lineTo(CANVAS_W, cy); }
  ctx.stroke();
  ctx.setLineDash([]);

  // ── Stop lines ──────────────────────────────────────────────────────────────
  ctx.strokeStyle = "#f8fafc";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, cy - INTER / 2); ctx.lineTo(cx + hw, cy - INTER / 2);           // N stop
  ctx.moveTo(cx - hw, cy + INTER / 2); ctx.lineTo(cx, cy + INTER / 2);           // S stop
  if (hasWestArm) {
    ctx.moveTo(cx - INTER / 2, cy); ctx.lineTo(cx - INTER / 2, cy + hw);         // W stop
  }
  if (hasEastArm) {
    ctx.moveTo(cx + INTER / 2, cy - hw); ctx.lineTo(cx + INTER / 2, cy);         // E stop
  }
  ctx.stroke();
}

/** The horizontal road section linking Junction A and Junction B. */
function drawConnectingRoad(
  ctx: CanvasRenderingContext2D,
  tMs: number,
  pulse: number
) {
  const hw = ROAD_W / 2;
  const x1 = CAX + hw;          // 364
  const x2 = CBX - hw;          // 916
  const cy = CAY;

  // Asphalt
  ctx.fillStyle = "#334155";
  ctx.fillRect(x1, cy - hw, x2 - x1, ROAD_W);

  // Subtle tint (vehicles travel through here)
  ctx.fillStyle = `rgba(8,145,178,${0.12 + (Math.sin(tMs / 600) + 1) / 2 * 0.06})`;
  ctx.fillRect(x1, cy - hw, x2 - x1, ROAD_W);

  // Glowing side-edges
  ctx.save();
  ctx.strokeStyle = `rgba(34,211,238,${0.18 + pulse * 0.28})`;
  ctx.lineWidth = 2;
  ctx.shadowColor = "#22d3ee";
  ctx.shadowBlur = 4 + pulse * 7;
  ctx.beginPath();
  ctx.moveTo(x1, cy - hw); ctx.lineTo(x2, cy - hw);
  ctx.moveTo(x1, cy + hw); ctx.lineTo(x2, cy + hw);
  ctx.stroke();
  ctx.restore();

  // Centre-line dashes
  ctx.strokeStyle = "#eab308";
  ctx.setLineDash([10, 10]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x1, cy); ctx.lineTo(x2, cy);
  ctx.stroke();
  ctx.setLineDash([]);

  // Junction-link label
  ctx.font = "600 10px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = `rgba(103,232,249,${0.5 + pulse * 0.35})`;
  ctx.fillText("← JUNCTION LINK →", (x1 + x2) / 2, cy + 4);
}

function drawRoads(
  ctx: CanvasRenderingContext2D,
  tMs: number,
  liveImages: Record<Road, HTMLImageElement | null>,
  liveAvailable: Record<Road, boolean>
) {
  const pulse = (Math.sin(tMs / 450) + 1) / 2;
  const hw = ROAD_W / 2;

  // ── Background ─────────────────────────────────────────────────────────────
  ctx.fillStyle = "#1a2332";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Dark non-road blocks
  ctx.fillStyle = "#0f172a";
  // Left of Jct A vertical road (top + bottom)
  ctx.fillRect(0, 0, CAX - hw, CAY - hw);
  ctx.fillRect(0, CAY + hw, CAX - hw, CANVAS_H - (CAY + hw));
  // Middle strip between junctions (top + bottom of connecting road)
  ctx.fillRect(CAX + hw, 0, CBX - hw - (CAX + hw), CAY - hw);
  ctx.fillRect(CAX + hw, CAY + hw, CBX - hw - (CAX + hw), CANVAS_H - (CAY + hw));
  // Right of Jct B vertical road (top + bottom)
  ctx.fillRect(CBX + hw, 0, CANVAS_W - (CBX + hw), CAY - hw);
  ctx.fillRect(CBX + hw, CAY + hw, CANVAS_W - (CBX + hw), CANVAS_H - (CAY + hw));

  // ── Scenery (behind roads) ─────────────────────────────────────────────────
  drawScenery(ctx);

  // ── Road surfaces ──────────────────────────────────────────────────────────
  drawConnectingRoad(ctx, tMs, pulse);
  drawJunction(ctx, CAX, CAY, tMs, /*hasWestArm*/ true,  /*hasEastArm*/ false, pulse);
  drawJunction(ctx, CBX, CBY, tMs, /*hasWestArm*/ false, /*hasEastArm*/ true,  pulse);

  // ── Road-arm labels ────────────────────────────────────────────────────────
  ctx.font = "600 11px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "#67e8f9";
  // Junction A
  ctx.fillText("CAMERA 1 · LIVE", CAX, 12);
  ctx.fillText("CAMERA 3 · LIVE", CAX, CANVAS_H - 5);
  ctx.save();
  ctx.translate(8, CAY);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("CAMERA 2 · LIVE", 0, 0);
  ctx.restore();
  // Junction B
  ctx.fillText("CAMERA 4 · LIVE", CBX, 12);
  ctx.fillText("CAMERA 6 · LIVE", CBX, CANVAS_H - 5);
  ctx.save();
  ctx.translate(CANVAS_W - 8, CBY);
  ctx.rotate(Math.PI / 2);
  ctx.fillText("CAMERA 5 · LIVE", 0, 0);
  ctx.restore();

  // ── CCTV monitor overlays (drawn last so they sit on top of roads) ─────────
  drawRoadMonitors(ctx, liveImages, liveAvailable, tMs);
}

function lightAnchor(road: Road): { x: number; y: number } {
  const { cx, cy } = junctionCenter(road);
  switch (road) {
    // Junction A
    case "camera_1": return { x: cx + ROAD_W / 2 + 18, y: cy - INTER / 2 - 36 }; // N arm
    case "camera_2": return { x: cx - INTER / 2 - 36, y: cy - ROAD_W / 2 - 18 }; // W arm
    case "camera_3": return { x: cx - ROAD_W / 2 - 18, y: cy + INTER / 2 + 36 }; // S arm
    // Junction B
    case "camera_4": return { x: cx + ROAD_W / 2 + 18, y: cy - INTER / 2 - 36 }; // N arm
    case "camera_5": return { x: cx + INTER / 2 + 36, y: cy + ROAD_W / 2 + 18 }; // E arm
    case "camera_6": return { x: cx - ROAD_W / 2 - 18, y: cy + INTER / 2 + 36 }; // S arm
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
  const lightColors: LightColor[] = ["red", "yellow", "green"];
  const palette = { red: "#ef4444", yellow: "#eab308", green: "#22c55e" };
  lightColors.forEach((c, i) => {
    const lcy = y - 14 + i * 14;
    ctx.beginPath();
    ctx.arc(x, lcy, 5, 0, Math.PI * 2);
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

// ─── Provider ─────────────────────────────────────────────────────────────────

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

// Helper to build a Record<Road, T> initialised to one value
function roadsRecord<T>(value: T): Record<Road, T> {
  return Object.fromEntries(ROADS.map((r) => [r, value])) as Record<Road, T>;
}



export function DystopiaProvider({ children }: { children: ReactNode }) {
  const [running, setRunning] = useState(false);
  const [simulateOfflineRoad, setSimulateOfflineRoad] = useState<Road | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const logIdCounterRef = useRef(0);
  const [snapshot, setSnapshot] = useState<SimSnapshot>({
    lights: roadsRecord<LightColor>("red"),
    countdown: roadsRecord(0),
    queues: roadsRecord(0),
    currentGreen: null,
  });

  const cameras = useLiveCamerasContext();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const vehiclesRef = useRef<Vehicle[]>([]);
  const lightsRef = useRef<Record<Road, LightColor>>(roadsRecord("red"));
  const countdownRef = useRef<Record<Road, number>>(roadsRecord(0));
  
  // ISSUE 3: Junction A signal state
  const junctionAPhaseRef = useRef<"green" | "yellow" | "idle">("idle");
  const junctionATimerRef = useRef(0);
  const junctionAActiveRef = useRef<Road>("camera_1");
  const junctionAReleaseCooldownRef = useRef(0);
  
  // ISSUE 3: Junction B signal state (independent rotation)
  const junctionBPhaseRef = useRef<"green" | "yellow" | "idle">("idle");
  const junctionBTimerRef = useRef(0);
  const junctionBActiveRef = useRef<Road>("camera_4");
  const junctionBReleaseCooldownRef = useRef(0);
  const rafRef = useRef(0);
  const lastTsRef = useRef(0);
  const lastSnapUiRef = useRef(0);
  const runningRef = useRef(false);
  const loopStartedRef = useRef(false);
  const fallbackTimersRef = useRef<Record<Road, number>>(
    Object.fromEntries(
      ROADS.map((r) => [r, randInterval(FALLBACK_SPAWN_MIN_S, FALLBACK_SPAWN_MAX_S)])
    ) as Record<Road, number>
  );
  const lastCameraCountRef = useRef<Record<Road, number | null>>(roadsRecord(null));
  const wasAvailableRef = useRef<Record<Road, boolean>>(roadsRecord(false));
  const liveImageRefs = useRef<Record<Road, HTMLImageElement | null>>(roadsRecord(null));
  const liveAvailableRefs = useRef<Record<Road, boolean>>(roadsRecord(false));
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

  // Load per-road JPEGs from the shared poll — no extra fetches.
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
      img.onload = () => { liveImageRefs.current[road] = img; };
      img.onerror = () => { liveImageRefs.current[road] = null; };
      img.src = feed.imageUrl;
    }
  }, [cameras.feedsByRoad, roadFeedAvailable]);

  const pushLog = useCallback((text: string) => {
    logIdCounterRef.current += 1;
    const entry: LogEntry = { id: `log-${logIdCounterRef.current}`, time: formatClock(), text };
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

    const jctAActive = junctionAActiveRef.current;
    const jctBActive = junctionBActiveRef.current;

    return {
      lights: { ...lightsRef.current },
      countdown: { ...countdownRef.current },
      queues,
      currentGreen:
        junctionAPhaseRef.current === "green" ? jctAActive : null,
    };
  }, []);

  const spawnOnRoad = useCallback(
    (road: Road, count: number, reason: "camera" | "fallback") => {
      console.log(`[SPAWN-A] CALLED: road=${road}, count=${count}, reason=${reason}`);
      const n = Math.min(SPAWN_CAP_PER_UPDATE, Math.max(0, count));
      console.log(`[SPAWN-A] n=${n} (after clamping)`);
      if (n <= 0) {
        console.log(`[SPAWN-A] ABORTED: n <= 0`);
        return;
      }
      const batch = appendToRoad(vehiclesRef.current, road, n);
      console.log(`[SPAWN-B] batch created: ${batch.length} vehicles`);
      batch.forEach((v, idx) => {
        console.log(`[SPAWN-B] pushing vehicle ${idx}: id=${v.id}, queueOffset=${v.queueOffset}, mode=${v.mode}`);
        vehiclesRef.current.push(v);
      });
      console.log(`[SPAWN-C] vehiclesRef.current.length=${vehiclesRef.current.length}, filter by road=${vehiclesRef.current.filter(v => v.road === road).length}`);
      if (reason === "camera") {
        pushLog(`🎥 ${road.replace("_", " ")}: +${n} from live feed`);
      } else {
        pushLog(`⚠️ ${road.replace("_", " ")}: +${n} (camera fallback)`);
      }
    },
    [pushLog]
  );

  // Junction A signal control
  const startJunctionAGreen = useCallback(
    (target: Road) => {
      junctionAActiveRef.current = target;
      junctionAPhaseRef.current = "green";
      junctionAReleaseCooldownRef.current = 0.4;

      const secs = computeGreenSeconds(vehiclesRef.current, target);
      junctionATimerRef.current = secs;

      // Set all Junction A lights to red
      for (const r of JUNCTION_A_ROADS) {
        lightsRef.current[r] = "red";
        countdownRef.current[r] = 0;
      }
      lightsRef.current[target] = "green";
      countdownRef.current[target] = secs;

      const q = vehiclesRef.current.filter(
        (v) => v.road === target && (v.mode === "queued" || v.mode === "entering")
      ).length;
      pushLog(`🟢 Jct A ${String(target).replace(/_/g, " ")} green — queue ${q}, ${secs}s`);
    },
    [pushLog]
  );

  const startJunctionAYellow = useCallback((active: Road) => {
    junctionAPhaseRef.current = "yellow";
    junctionATimerRef.current = YELLOW_SECONDS;
    lightsRef.current[active] = "yellow";
    countdownRef.current[active] = YELLOW_SECONDS;
  }, []);

  // ISSUE 3: Junction B signal control (independent)
  const startJunctionBGreen = useCallback(
    (target: Road) => {
      junctionBActiveRef.current = target;
      junctionBPhaseRef.current = "green";
      junctionBReleaseCooldownRef.current = 0.4;

      const secs = computeGreenSeconds(vehiclesRef.current, target);
      junctionBTimerRef.current = secs;

      // Set all Junction B lights to red
      for (const r of JUNCTION_B_ROADS) {
        lightsRef.current[r] = "red";
        countdownRef.current[r] = 0;
      }
      lightsRef.current[target] = "green";
      countdownRef.current[target] = secs;

      const q = vehiclesRef.current.filter(
        (v) => v.road === target && (v.mode === "queued" || v.mode === "entering")
      ).length;
      pushLog(`🟢 Jct B ${String(target).replace(/_/g, " ")} green — queue ${q}, ${secs}s`);
    },
    [pushLog]
  );

  const startJunctionBYellow = useCallback((active: Road) => {
    junctionBPhaseRef.current = "yellow";
    junctionBTimerRef.current = YELLOW_SECONDS;
    lightsRef.current[active] = "yellow";
    countdownRef.current[active] = YELLOW_SECONDS;
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
    console.log(`[DRAW] vehiclesRef.current.length=${vehiclesRef.current.length}`);
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

      // Junction A signal timing
      if (junctionAPhaseRef.current === "green" || junctionAPhaseRef.current === "yellow") {
        junctionATimerRef.current -= dt;
        const remaining = Math.max(0, junctionATimerRef.current);
        const jctAActive = junctionAActiveRef.current;
        countdownRef.current[jctAActive] = remaining;
      }

      // Junction B signal timing
      if (junctionBPhaseRef.current === "green" || junctionBPhaseRef.current === "yellow") {
        junctionBTimerRef.current -= dt;
        const remaining = Math.max(0, junctionBTimerRef.current);
        const jctBActive = junctionBActiveRef.current;
        countdownRef.current[jctBActive] = remaining;
      }

      // ...

      // Release queued vehicles for Junction A
      if (
        junctionAPhaseRef.current === "green" &&
        lightsRef.current[junctionAActiveRef.current] === "green"
      ) {
        junctionAReleaseCooldownRef.current -= dt;
        if (junctionAReleaseCooldownRef.current <= 0) {
          const activeRoad = junctionAActiveRef.current as Road;
          const front = vehiclesRef.current
            .filter((v) => v.road === activeRoad && v.mode === "queued")
            .sort((a, b) => a.queueOffset - b.queueOffset)[0];
          if (front) {
            front.mode = "crossing";
            front.pathT = 0;
            front.targetVelocity = front.maneuver === "straight" ? 0.55 : 0.4;  // FIX 5: Set target velocity for crossing
            front.velocity = 0;  // FIX 5: Start from stop, accelerate smoothly
            const rest = vehiclesRef.current
              .filter(
                (v) =>
                  v.road === activeRoad && (v.mode === "queued" || v.mode === "entering")
              )
              .sort((a, b) => a.queueOffset - b.queueOffset);
            let o = 0;
            for (const v of rest) {
              v.targetQueueOffset = o;
              if (v.mode === "queued") v.queueOffset = o;
              o += gapFor(v.type);
            }
            junctionAReleaseCooldownRef.current = RELEASE_INTERVAL_S;
          }
        }
      }

      // Release queued vehicles for Junction B
      if (
        junctionBPhaseRef.current === "green" &&
        lightsRef.current[junctionBActiveRef.current] === "green"
      ) {
        junctionBReleaseCooldownRef.current -= dt;
        if (junctionBReleaseCooldownRef.current <= 0) {
          const activeRoad = junctionBActiveRef.current;
          const front = vehiclesRef.current
            .filter((v) => v.road === activeRoad && v.mode === "queued")
            .sort((a, b) => a.queueOffset - b.queueOffset)[0];
          if (front) {
            front.mode = "crossing";
            front.pathT = 0;
            front.targetVelocity = front.maneuver === "straight" ? 0.55 : 0.4;  // FIX 5: Set target velocity for crossing
            front.velocity = 0;  // FIX 5: Start from stop, accelerate smoothly
            const rest = vehiclesRef.current
              .filter(
                (v) =>
                  v.road === activeRoad && (v.mode === "queued" || v.mode === "entering")
              )
              .sort((a, b) => a.queueOffset - b.queueOffset);
            let o = 0;
            for (const v of rest) {
              v.targetQueueOffset = o;
              if (v.mode === "queued") v.queueOffset = o;
              o += gapFor(v.type);
            }
            junctionBReleaseCooldownRef.current = RELEASE_INTERVAL_S;
          }
        }
      }

      // Animate entering vehicles from off-screen to queue
      for (const v of vehiclesRef.current) {
        if (v.mode === "entering") {
          const dist = v.queueOffset - v.targetQueueOffset;
          if (dist <= 1.5) {
            v.queueOffset = v.targetQueueOffset;
            v.mode = "queued";
          } else {
            const speed = Math.max(40, Math.min(140, dist * 1.8));
            v.queueOffset = Math.max(v.targetQueueOffset, v.queueOffset - speed * dt);
          }
        }
      }

      // Update vehicle positions on crossing and exiting
      for (const v of vehiclesRef.current) {
        if (v.mode === "crossing") {
          // Accelerate towards target velocity
          if (v.velocity < v.targetVelocity) {
            v.velocity = Math.min(v.velocity + 0.5 * dt, v.targetVelocity);
          }
          v.pathT += dt * v.velocity;
          if (v.pathT >= 1) {
            v.pathT = 1;
            v.mode = "exiting";
            v.velocity = 0;
          }
        } else if (v.mode === "exiting") {
          v.pathT += dt * 0.7;
          if (v.pathT >= 2.2) {
            v.mode = "done";
          }
        }
      }

      // Junction A signal rotation
      if (junctionAPhaseRef.current === "green") {
        let queuedLeft: boolean;
        let crossing: boolean;
        const jctAActive = junctionAActiveRef.current;
        const r = jctAActive as Road;
        queuedLeft = vehiclesRef.current.some(
          (v) => v.road === r && (v.mode === "queued" || v.mode === "entering")
        );
        crossing = vehiclesRef.current.some(
          (v) => v.road === r && v.mode === "crossing"
        );
        if ((!queuedLeft && !crossing) || junctionATimerRef.current <= 0) {
          startJunctionAYellow(jctAActive);
        }
      } else if (junctionAPhaseRef.current === "yellow") {
        if (junctionATimerRef.current <= 0) {
          const jctAActive = junctionAActiveRef.current;
          lightsRef.current[jctAActive] = "red";
          countdownRef.current[jctAActive] = 0;
          startJunctionAGreen(nextJunctionASignal(jctAActive));
        }
      } else if (junctionAPhaseRef.current === "idle") {
        startJunctionAGreen("camera_1");
      }

      // ISSUE 3: Junction B signal rotation (independent)
      if (junctionBPhaseRef.current === "green") {
        const jctBActive = junctionBActiveRef.current;
        const queuedLeft = vehiclesRef.current.some(
          (v) => v.road === jctBActive && (v.mode === "queued" || v.mode === "entering")
        );
        const crossing = vehiclesRef.current.some(
          (v) => v.road === jctBActive && v.mode === "crossing"
        );
        if ((!queuedLeft && !crossing) || junctionBTimerRef.current <= 0) {
          startJunctionBYellow(jctBActive);
        }
      } else if (junctionBPhaseRef.current === "yellow") {
        if (junctionBTimerRef.current <= 0) {
          const jctBActive = junctionBActiveRef.current;
          lightsRef.current[jctBActive] = "red";
          countdownRef.current[jctBActive] = 0;
          startJunctionBGreen(nextJunctionBSignal(jctBActive));
        }
      } else if (junctionBPhaseRef.current === "idle") {
        startJunctionBGreen("camera_4");
      }

      draw();
      if (performance.now() - lastSnapUiRef.current > 200) {
        lastSnapUiRef.current = performance.now();
        setSnapshot(packSnapshot());
      }
    },
    [draw, packSnapshot, spawnOnRoad, startJunctionAGreen, startJunctionAYellow, startJunctionBGreen, startJunctionBYellow]
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

  const spawnOnRoadRef = useRef(spawnOnRoad);
  spawnOnRoadRef.current = spawnOnRoad;

  useEffect(() => {
    console.log(`[CAMERA SYNC useEffect] FIRED: running=${running}, cameras.feedsByRoad keys=${Object.keys(cameras.feedsByRoad)}`);
    if (!running) {
      console.log(`[CAMERA SYNC useEffect] Aborted: running=false`);
      return;
    }

    for (const road of ROADS) {
      const feed = cameras.feedsByRoad[road];
      const available = roadFeedAvailable(road);
      const count = feed.vehicleCount;

      console.log(`[CAMERA SYNC] road=${road}, available=${available}, count=${count}`);

      if (!available) {
        if (wasAvailableRef.current[road]) {
          pushLog(`⚠️ ${road.replace("_", " ")} camera offline — fallback traffic`);
        }
        wasAvailableRef.current[road] = false;
        continue;
      }

      if (count == null) continue;

      if (!wasAvailableRef.current[road]) {
        wasAvailableRef.current[road] = true;
        pushLog(`🎥 ${road.replace("_", " ")} linked — ${count} vehicles detected`);
      }

      const prev = lastCameraCountRef.current[road];
      console.log(`[CAMERA SYNC] road=${road}, prev=${prev}, count=${count}`);
      if (prev == null) {
        lastCameraCountRef.current[road] = count;
        // Initial spawn: spawn ALL vehicles at once
        console.log(`[CAMERA SYNC] Initial spawn: road=${road}, count=${count}`);
        if (count > 0) {
          console.log(`[CAMERA SYNC] About to call spawnOnRoad(${road}, ${count}, "camera")`);
          spawnOnRoadRef.current(road, count, "camera");
        }
        continue;
      }

      // Sync vehicle count to match camera count exactly
      const currentVehicles = vehiclesRef.current.filter(v => v.road === road && (v.mode === "queued" || v.mode === "entering")).length;
      const targetCount = count;
      console.log(`[CAMERA SYNC] road=${road}, currentVehicles=${currentVehicles}, targetCount=${targetCount}`);
      
      if (targetCount > currentVehicles) {
        // Need to add vehicles - spawn ALL at once, no cap
        const toAdd = targetCount - currentVehicles;
        console.log(`[CAMERA SYNC] Spawning: road=${road}, toAdd=${toAdd}`);
        spawnOnRoadRef.current(road, toAdd, "camera");
      } else if (targetCount < currentVehicles) {
        // Need to remove vehicles
        const toRemove = currentVehicles - targetCount;
        const roadVehicles = vehiclesRef.current.filter(v => v.road === road && (v.mode === "queued" || v.mode === "entering"));
        const sorted = roadVehicles.sort((a, b) => b.queueOffset - a.queueOffset); // Remove from back of queue first
        for (let i = 0; i < Math.min(toRemove, sorted.length); i++) {
          const idx = vehiclesRef.current.indexOf(sorted[i]);
          if (idx !== -1) {
            vehiclesRef.current.splice(idx, 1);
          }
        }
        pushLog(`🎥 ${road.replace("_", " ")} count dropped to ${count} (-${toRemove})`);
      }
      lastCameraCountRef.current[road] = count;
    }
  }, [cameras.feedsByRoad, running, roadFeedAvailable, pushLog]);

  const start = useCallback(() => {
    if (runningRef.current) return;
    vehiclesRef.current = [];
    for (const r of ROADS) {
      lastCameraCountRef.current[r] = null;
      wasAvailableRef.current[r] = false;
      fallbackTimersRef.current[r] = randInterval(2, 4);
    }
    // FIX 1: Reset both junction signal states
    junctionAPhaseRef.current = "idle";
    junctionATimerRef.current = 0;
    junctionAActiveRef.current = "camera_1";
    junctionBPhaseRef.current = "idle";
    junctionBTimerRef.current = 0;
    junctionBActiveRef.current = "camera_4";
    runningRef.current = true;
    setRunning(true);
    setLog([]);
    pushLog("▶ Dystopia simulation started — two junctions, six cameras");
    for (const r of ROADS) {
      if (!roadFeedAvailable(r)) {
        pushLog(`⚠️ ${r.replace("_", " ")} unavailable — fallback traffic`);
      }
    }
    startJunctionAGreen("camera_1");
    startJunctionBGreen("camera_4");
  }, [pushLog, roadFeedAvailable, startJunctionAGreen, startJunctionBGreen]);

  const stop = useCallback(() => {
    runningRef.current = false;
    setRunning(false);
    vehiclesRef.current = [];
    // FIX 1: Reset both junction signal states
    junctionAPhaseRef.current = "idle";
    junctionATimerRef.current = 0;
    junctionBPhaseRef.current = "idle";
    junctionBTimerRef.current = 0;
    for (const r of ROADS) {
      lastCameraCountRef.current[r] = null;
      wasAvailableRef.current[r] = false;
      lightsRef.current[r] = "red";
      countdownRef.current[r] = 0;
    }
    setSnapshot(packSnapshot());
    pushLog("⏹ Simulation stopped");
    draw();
  }, [packSnapshot, pushLog, draw]);

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
    [running, simulateOfflineRoad, log, snapshot, cameras, start, stop, registerCanvas]
  );

  return <DystopiaContext.Provider value={value}>{children}</DystopiaContext.Provider>;
}
