"use client";

/**
 * Junction X — standalone 4-way adaptive traffic signal simulation.
 * Frontend-only. Does not import camera/detection/Command Signal code.
 * Project Z = voice-control layer + scenery polish.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Crosshair, Mic, MicOff, Play, RotateCcw, Siren } from "lucide-react";

/* Minimal Web Speech API typings (not always in TS lib) */
interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly 0: { transcript: string };
}
interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

/* ── Tunable signal constants ─────────────────────────────────────────── */
const BASE_GREEN = 4;
const PER_VEHICLE_SECONDS = 2;
const MIN_GREEN = 4;
const MAX_GREEN = 30;
const TRUCK_WEIGHT = 1.5;
const YELLOW_SECONDS = 1.5;
const RELEASE_INTERVAL_S = 1.7;
const EMERGENCY_GRACE_S = 2.5;

const ROADS = ["North", "East", "South", "West"] as const;
type Road = (typeof ROADS)[number];
type LightColor = "red" | "yellow" | "green";
type VehicleType = "car" | "truck" | "ambulance" | "fire";
type Maneuver = "straight" | "left" | "right";

/* ── Maneuver mix (tunable) ───────────────────────────────────────────── */
const MANEUVER_STRAIGHT_PCT = 0.6;
const MANEUVER_LEFT_PCT = 0.2;
// remainder = right turn

interface RoadSetup {
  cars: number;
  trucks: number;
  emergency: boolean;
  emergencyKind: "ambulance" | "fire";
}

interface Vehicle {
  id: string;
  road: Road;
  type: VehicleType;
  maneuver: Maneuver;
  /** Distance behind stop line (px). 0 = at stop line. */
  queueOffset: number;
  /** Target offset while mode === "entering" (joins queue smoothly). */
  targetQueueOffset: number;
  /** Animation phase */
  mode: "entering" | "queued" | "crossing" | "exiting" | "done";
  /** Progress along path while crossing/exiting (0–1+) */
  pathT: number;
  color: string;
}

interface SimSnapshot {
  lights: Record<Road, LightColor>;
  countdown: Record<Road, number>;
  queues: Record<Road, number>;
  currentGreen: Road | null;
  emergencyAlert: string | null;
  alertKind: "emergency" | "voice" | null;
  waitingEmergency: Road | null;
  closedRoads: Road[];
  continuous: boolean;
}

const CANVAS = 640;
const CX = CANVAS / 2;
const CY = CANVAS / 2;
const ROAD_W = 88;
const LANE_W = ROAD_W / 2;
const INTER = 100;
const STOP_GAP = INTER / 2 + 8;
const CAR_GAP = 48;
const TRUCK_GAP = 62;
const CAR_LEN = 34;
const CAR_W = 18;
const TRUCK_LEN = 52;
const TRUCK_W = 20;
const EMS_LEN = 48;
const EMS_W = 22;
/** Past canvas edge so new vehicles aren't visible at spawn. */
const OFFSCREEN_OFFSET = CANVAS / 2 + 120;
const ENTRY_SPEED = 140; // px/s approaching queue

const COLOR_MAP: Record<string, string> = {
  red: "#ef4444",
  blue: "#3b82f6",
  green: "#22c55e",
  yellow: "#eab308",
  white: "#f8fafc",
  black: "#1e293b",
  silver: "#94a3b8",
  orange: "#f97316",
  gray: "#64748b",
  grey: "#64748b",
  purple: "#a855f7",
};

const CAR_COLORS = Object.values(COLOR_MAP);

/**
 * KEEP-LEFT lane geometry (Indian roads).
 *
 * Lateral offset from road centerline for a vehicle traveling in `travel`:
 *   "left" of travel direction = +HALF on the appropriate axis.
 *
 * INBOUND (queue / approach) — already correct before this fix:
 *   North southbound: x = CX + HALF   (east side)
 *   East  westbound:  y = CY + HALF   (south side)
 *   South northbound: x = CX - HALF   (west side)
 *   West  eastbound:  y = CY - HALF   (north side)
 *
 * BUG (old exit code): straight-through exits used the MIRRORED side
 *   North exit: x = CX - HALF  ← wrong; southbound keep-left is CX + HALF
 *   East  exit: y = CY - HALF  ← wrong; westbound keep-left is CY + HALF
 *   South exit: x = CX + HALF  ← wrong; northbound keep-left is CX - HALF
 *   West  exit: y = CY + HALF  ← wrong; eastbound keep-left is CY - HALF
 * Root cause: exit targeted the opposite side of the centerline (destination
 * road's inbound/opposite-direction lane) instead of the outbound lane for
 * continued travel. Same bug on all 4 axes — not an N/S-only sign flip.
 */
const HALF = LANE_W / 2;

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
  // Facing north: left→west, right→east
  if (maneuver === "left") return order[(i + 3) % 4]; // N→W→S→E
  return order[(i + 1) % 4]; // N→E→S→W
}

/** Keep-left lane center for a given travel direction. */
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
      return {
        x: lane.value,
        y: atOutbound ? CY + STOP_GAP : CY - STOP_GAP,
        rot: lane.rot,
      };
    case "north":
      return {
        x: lane.value,
        y: atOutbound ? CY - STOP_GAP : CY + STOP_GAP,
        rot: lane.rot,
      };
    case "west":
      return {
        x: atOutbound ? CX - STOP_GAP : CX + STOP_GAP,
        y: lane.value,
        rot: lane.rot,
      };
    case "east":
      return {
        x: atOutbound ? CX + STOP_GAP : CX - STOP_GAP,
        y: lane.value,
        rot: lane.rot,
      };
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

/** Control point for a quadratic Bezier turn (keep-left lanes). */
function turnControl(from: Travel, maneuver: "left" | "right"): { x: number; y: number } {
  // Pull toward the near/far corner of the intersection box for a visible curve.
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
  // Convert math heading (atan2) to our rot where 0 = north (up / -y)
  const mathHeading = Math.atan2(dy, dx);
  const ourRot = mathHeading + Math.PI / 2;
  return { x, y, rot: ourRot };
}

function laneSideLabel(travel: Travel): "LEFT" {
  // By construction every keep-left travel uses the LEFT lane relative to travel.
  void travel;
  return "LEFT";
}

function pickManeuver(): Maneuver {
  const r = Math.random();
  if (r < MANEUVER_STRAIGHT_PCT) return "straight";
  if (r < MANEUVER_STRAIGHT_PCT + MANEUVER_LEFT_PCT) return "left";
  return "right";
}

function describeExit(v: Vehicle): string {
  const from = travelFromApproach(v.road);
  const to = turnTravel(from, v.maneuver);
  const destRoad =
    to === "south"
      ? "South"
      : to === "north"
        ? "North"
        : to === "east"
          ? "East"
          : "West";
  return `vehicle entered from ${v.road}, ${v.maneuver}, now on ${destRoad} road traveling ${to}, lane side: ${laneSideLabel(to)}`;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function weightedQueueCount(vehicles: Vehicle[], road: Road): number {
  return vehicles
    .filter(
      (v) =>
        v.road === road &&
        (v.mode === "queued" || v.mode === "entering" || v.mode === "crossing")
    )
    .reduce((sum, v) => {
      if (v.type === "truck") return sum + TRUCK_WEIGHT;
      if (v.type === "ambulance" || v.type === "fire") return sum + 1.2;
      return sum + 1;
    }, 0);
}

function computeGreenSeconds(vehicles: Vehicle[], road: Road): number {
  const w = weightedQueueCount(vehicles, road);
  const raw = BASE_GREEN + Math.round(w) * PER_VEHICLE_SECONDS;
  return clamp(raw, MIN_GREEN, MAX_GREEN);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function nextRoad(road: Road): Road {
  return ROADS[(ROADS.indexOf(road) + 1) % ROADS.length];
}

function nextOpenRoad(from: Road, closed: Set<Road>): Road {
  let r = nextRoad(from);
  for (let i = 0; i < ROADS.length; i++) {
    if (!closed.has(r)) return r;
    r = nextRoad(r);
  }
  return from;
}

const SPAWN_COUNT_MAX = 20;
const SPAWN_STAGGER_MS = 450;

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  a: 1,
  an: 1,
};

/** Independent slot extractors — word order does not matter. */
function extractRoadSlot(text: string): Road | null {
  const m = text.match(/\b(north|south|east|west)\b/);
  if (!m) return null;
  return (m[1].charAt(0).toUpperCase() + m[1].slice(1)) as Road;
}

function extractNumberSlot(text: string): number | null {
  const digit = text.match(/\b(\d{1,3})\b/);
  if (digit) return Number(digit[1]);
  const wordKeys = Object.keys(NUMBER_WORDS).sort((a, b) => b.length - a.length);
  for (const w of wordKeys) {
    if (new RegExp(`\\b${w}\\b`).test(text)) return NUMBER_WORDS[w];
  }
  return null;
}

function extractColorSlot(text: string): string | null {
  for (const key of Object.keys(COLOR_MAP)) {
    if (new RegExp(`\\b${key}\\b`).test(text)) return COLOR_MAP[key];
  }
  return null;
}

function extractVehicleTypeSlot(text: string): VehicleType | null {
  if (/\bfire\s*truck\b|\bfiretruck\b/.test(text)) return "fire";
  if (/\bambulance\b/.test(text)) return "ambulance";
  if (/\btruck\b/.test(text)) return "truck";
  if (/\bcar\b/.test(text)) return "car";
  if (/\bvehicles?\b/.test(text)) return "car";
  return null;
}

type ActionGroup = "close" | "prioritize" | "emergency" | "spawn" | "reset";

function extractActionGroups(text: string): Set<ActionGroup> {
  const groups = new Set<ActionGroup>();
  if (
    /\bclose\b/.test(text) ||
    /\bblock\b/.test(text) ||
    /\bshut(?:\s+down)?\b/.test(text)
  ) {
    groups.add("close");
  }
  if (
    /\bprioritize\b/.test(text) ||
    /\bpriority\b/.test(text) ||
    /\bgreen\b/.test(text) ||
    /\bgo\b/.test(text) ||
    /\bclear the way\b/.test(text)
  ) {
    groups.add("prioritize");
  }
  if (
    /\bemergency\b/.test(text) ||
    /\bambulance\b/.test(text) ||
    /\bfire\s*truck\b/.test(text) ||
    /\bfiretruck\b/.test(text) ||
    /\burgent\b/.test(text)
  ) {
    groups.add("emergency");
  }
  if (
    /\badd\b/.test(text) ||
    /\bspawn\b/.test(text) ||
    /\bsend\b/.test(text) ||
    /\bdump\b/.test(text) ||
    /\bput\b/.test(text) ||
    /\bbring\b/.test(text) ||
    /\bneeds?\b/.test(text)
  ) {
    groups.add("spawn");
  }
  if (
    /\breset\b/.test(text) ||
    /\bclear all\b/.test(text) ||
    /\bnormal\b/.test(text) ||
    /\brestart\b/.test(text)
  ) {
    groups.add("reset");
  }
  // Bare "clear" without "clear all" / "clear the way" — treat as reset only if no road
  // (handled in decision logic via reset group; avoid stealing "clear the way")
  if (/\bclear\b/.test(text) && !/\bclear the way\b/.test(text) && !/\bclear all\b/.test(text)) {
    groups.add("reset");
  }
  return groups;
}

function defaultColorForType(type: VehicleType): string {
  if (type === "fire") return "#dc2626";
  if (type === "ambulance") return "#f8fafc";
  if (type === "truck") return "#475569";
  return CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
}

type VoiceAction =
  | { kind: "emergency"; road: Road; vehicleType: "ambulance" | "fire" }
  | { kind: "priority"; road: Road }
  | { kind: "close"; road: Road }
  | { kind: "spawn"; road: Road; vehicleType: VehicleType; color: string; count: number }
  | { kind: "reset" }
  | { kind: "unmatched" };

/**
 * Flexible slot-based voice parser.
 * Extracts ROAD / NUMBER / TYPE / COLOR / ACTION independently, then decides.
 */
function parseVoiceCommand(raw: string): VoiceAction {
  const text = raw.toLowerCase();
  const road = extractRoadSlot(text);
  const number = extractNumberSlot(text);
  const colorSlot = extractColorSlot(text);
  const typeSlot = extractVehicleTypeSlot(text);
  const actions = extractActionGroups(text);

  const isEmsType = typeSlot === "ambulance" || typeSlot === "fire";

  // 1) Ambulance/firetruck type always wins → emergency
  if (isEmsType && road) {
    return {
      kind: "emergency",
      road,
      vehicleType: typeSlot === "fire" ? "fire" : "ambulance",
    };
  }

  // 2) Emergency keyword group + road
  if (actions.has("emergency") && road) {
    return {
      kind: "emergency",
      road,
      vehicleType: typeSlot === "fire" ? "fire" : "ambulance",
    };
  }

  // 3) Close
  if (actions.has("close") && road) {
    return { kind: "close", road };
  }

  // 4) Prioritize
  if (actions.has("prioritize") && road) {
    return { kind: "priority", road };
  }

  // 5) Spawn — explicit spawn words, OR number+road with no other action,
  //    OR road + (type|color) with no other action ("west red truck")
  const otherAction =
    actions.has("close") ||
    actions.has("prioritize") ||
    actions.has("emergency") ||
    actions.has("reset");
  const impliedSpawnByNumber = number != null && !!road && !otherAction && !actions.has("spawn");
  const impliedSpawnByTypeColor =
    !!road && (typeSlot != null || colorSlot != null) && !otherAction && !actions.has("spawn");

  if ((actions.has("spawn") || impliedSpawnByNumber || impliedSpawnByTypeColor) && road) {
    const vehicleType: VehicleType = typeSlot ?? "car";
    const color = colorSlot ?? defaultColorForType(vehicleType);
    const count = Math.min(SPAWN_COUNT_MAX, Math.max(1, number ?? 1));
    return { kind: "spawn", road, vehicleType, color, count };
  }

  // 6) Reset
  if (actions.has("reset")) {
    return { kind: "reset" };
  }

  // 7) Unmatched
  return { kind: "unmatched" };
}

function vehicleSize(type: VehicleType) {
  if (type === "truck") return { len: TRUCK_LEN, w: TRUCK_W };
  if (type === "ambulance" || type === "fire") return { len: EMS_LEN, w: EMS_W };
  return { len: CAR_LEN, w: CAR_W };
}

function gapFor(type: VehicleType) {
  return type === "truck" || type === "ambulance" || type === "fire" ? TRUCK_GAP : CAR_GAP;
}

function backOfQueueOffset(vehicles: Vehicle[], road: Road): number {
  const waiting = vehicles
    .filter((v) => v.road === road && (v.mode === "queued" || v.mode === "entering"))
    .sort((a, b) => (a.targetQueueOffset ?? a.queueOffset) - (b.targetQueueOffset ?? b.queueOffset));
  if (waiting.length === 0) return 0;
  const last = waiting[waiting.length - 1];
  const lastTarget = last.targetQueueOffset ?? last.queueOffset;
  return lastTarget + gapFor(last.type);
}

/** World position + rotation for a vehicle on its path. */
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

    const ctrl = turnControl(approachTravel, v.maneuver);
    return poseOnBezier(enter, ctrl, leave, t);
  }

  // Exiting on correct keep-left outbound lane for exitTravel
  const exitT = Math.max(0, v.pathT - 1);
  const exitDist = 280 * Math.min(exitT, 1.2);
  return exitPoint(exitTravel, exitDist);
}

function defaultSetup(): Record<Road, RoadSetup> {
  return {
    North: { cars: 4, trucks: 1, emergency: false, emergencyKind: "ambulance" },
    East: { cars: 2, trucks: 0, emergency: false, emergencyKind: "ambulance" },
    South: { cars: 6, trucks: 2, emergency: false, emergencyKind: "fire" },
    West: { cars: 1, trucks: 1, emergency: false, emergencyKind: "ambulance" },
  };
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
  maneuver?: Maneuver;
  targetQueueOffset: number;
  startOffset?: number;
}): Vehicle {
  const start = opts.startOffset ?? OFFSCREEN_OFFSET + opts.targetQueueOffset;
  return {
    id: uid(opts.type),
    road: opts.road,
    type: opts.type,
    maneuver: opts.maneuver ?? (opts.type === "ambulance" || opts.type === "fire" ? "straight" : pickManeuver()),
    queueOffset: start,
    targetQueueOffset: opts.targetQueueOffset,
    mode: "entering",
    pathT: 0,
    color: opts.color,
  };
}

function spawnQueue(road: Road, setup: RoadSetup, densityBias = 1): Vehicle[] {
  const types: VehicleType[] = [];
  for (let i = 0; i < setup.cars; i++) types.push("car");
  for (let i = 0; i < setup.trucks; i++) types.push("truck");
  const shuffled = shuffle(types);

  const list: Vehicle[] = [];
  if (setup.emergency) {
    list.push(
      makeVehicle({
        road,
        type: setup.emergencyKind,
        color: setup.emergencyKind === "fire" ? "#dc2626" : "#f8fafc",
        maneuver: "straight",
        targetQueueOffset: 0,
      })
    );
  }

  let target = setup.emergency ? gapFor(setup.emergencyKind) : 0;
  for (const type of shuffled) {
    list.push(
      makeVehicle({
        road,
        type,
        color:
          type === "truck"
            ? "#475569"
            : CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)],
        targetQueueOffset: target,
      })
    );
    target += gapFor(type) * densityBias;
  }

  // Stagger off-screen start so convoy drives in as a line
  list.forEach((v, i) => {
    v.queueOffset = OFFSCREEN_OFFSET + i * gapFor(v.type);
  });
  return list;
}

function spawnContinuousBurst(road: Road, original: RoadSetup): Vehicle[] {
  const density = original.cars + original.trucks;
  const bias = density <= 0 ? 0.3 : Math.min(1, density / 8);
  const n = Math.random() < 0.25 ? 0 : Math.random() < 0.55 ? 1 : 2;
  if (n === 0) return [];
  const cars =
    Math.round(n * (original.cars / Math.max(1, density || 1)) * bias) ||
    (Math.random() > 0.5 ? 1 : 0);
  const trucks = Math.max(0, n - cars);
  return spawnQueue(road, { cars, trucks, emergency: false, emergencyKind: "ambulance" });
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
  // NW quadrant
  drawBuilding(ctx, 28, 36, 70, 88, "#1e293b");
  drawBuilding(ctx, 110, 50, 52, 64, "#243447");
  drawTree(ctx, 70, 150, 1.1);
  drawTree(ctx, 150, 130, 0.9);
  drawTree(ctx, 40, 175, 0.8);

  // NE quadrant
  drawBuilding(ctx, CX + margin + 20, 40, 64, 96, "#1e3a4a");
  drawBuilding(ctx, CX + margin + 100, 55, 80, 70, "#1e293b");
  drawTree(ctx, CX + margin + 50, 160, 1);
  drawTree(ctx, CANVAS - 50, 140, 1.2);
  drawTree(ctx, CANVAS - 90, 175, 0.85);

  // SW quadrant
  drawBuilding(ctx, 36, CY + margin + 24, 76, 100, "#243447");
  drawBuilding(ctx, 124, CY + margin + 40, 58, 72, "#1e293b");
  drawTree(ctx, 60, CANVAS - 50, 1);
  drawTree(ctx, 150, CANVAS - 70, 1.15);
  drawTree(ctx, 95, CY + margin + 20, 0.75);

  // SE quadrant
  drawBuilding(ctx, CX + margin + 28, CY + margin + 30, 88, 84, "#1e3a4a");
  drawBuilding(ctx, CX + margin + 130, CY + margin + 50, 60, 110, "#243447");
  drawTree(ctx, CANVAS - 55, CANVAS - 55, 1.1);
  drawTree(ctx, CX + margin + 70, CANVAS - 45, 0.9);
  drawTree(ctx, CANVAS - 110, CY + margin + 25, 0.8);
}

function drawRoads(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#1a2332";
  ctx.fillRect(0, 0, CANVAS, CANVAS);

  // Grass/blocks
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

  // Asphalt plus
  ctx.fillStyle = "#334155";
  ctx.fillRect(CX - ROAD_W / 2, 0, ROAD_W, CANVAS);
  ctx.fillRect(0, CY - ROAD_W / 2, CANVAS, ROAD_W);

  // Intersection box
  ctx.fillStyle = "#3f4b5c";
  ctx.fillRect(CX - INTER / 2, CY - INTER / 2, INTER, INTER);
  ctx.strokeStyle = "#64748b";
  ctx.lineWidth = 2;
  ctx.strokeRect(CX - INTER / 2, CY - INTER / 2, INTER, INTER);

  // Lane dividers
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

  // Stop lines
  ctx.strokeStyle = "#f8fafc";
  ctx.lineWidth = 3;
  ctx.beginPath();
  // North inbound
  ctx.moveTo(CX, CY - INTER / 2);
  ctx.lineTo(CX + ROAD_W / 2, CY - INTER / 2);
  // East
  ctx.moveTo(CX + INTER / 2, CY);
  ctx.lineTo(CX + INTER / 2, CY + ROAD_W / 2);
  // South
  ctx.moveTo(CX - ROAD_W / 2, CY + INTER / 2);
  ctx.lineTo(CX, CY + INTER / 2);
  // West
  ctx.moveTo(CX - INTER / 2, CY - ROAD_W / 2);
  ctx.lineTo(CX - INTER / 2, CY);
  ctx.stroke();

  // Road labels
  ctx.fillStyle = "#94a3b8";
  ctx.font = "600 13px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("NORTH", CX, 18);
  ctx.fillText("SOUTH", CX, CANVAS - 8);
  ctx.save();
  ctx.translate(14, CY);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("WEST", 0, 0);
  ctx.restore();
  ctx.save();
  ctx.translate(CANVAS - 14, CY);
  ctx.rotate(Math.PI / 2);
  ctx.fillText("EAST", 0, 0);
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
  countdown: number
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

  // windshield
  ctx.fillStyle = "rgba(15,23,42,0.35)";
  ctx.fillRect(-w / 2 + 2, -len / 2 + 4, w - 4, 8);

  if (v.type === "ambulance") {
    ctx.fillStyle = "#dc2626";
    ctx.fillRect(-3, -4, 6, 14);
    ctx.fillRect(-7, 2, 14, 6);
  }
  if (v.type === "fire") {
    ctx.fillStyle = "#fbbf24";
    ctx.fillRect(-w / 2 + 2, len / 2 - 12, w - 4, 6);
  }
  ctx.restore();
}

/* ── Component ────────────────────────────────────────────────────────── */

export default function JunctionXPage() {
  const [mode, setMode] = useState<"setup" | "running" | "ended">("setup");
  const [setup, setSetup] = useState(defaultSetup);
  const [continuous, setContinuous] = useState(true);
  const [snapshot, setSnapshot] = useState<SimSnapshot | null>(null);
  const [emergencyPick, setEmergencyPick] = useState<Road>("North");
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState<string>("");
  const [voiceSupported, setVoiceSupported] = useState(true);
  const [controlRoad, setControlRoad] = useState<Road>("North");

  const canvasRef = useRef<HTMLCanvasElement>(null);
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
  const activeRoadRef = useRef<Road>("North");
  const phaseTimerRef = useRef(0);
  const releaseCooldownRef = useRef(0);
  const emergencyRoadRef = useRef<Road | null>(null);
  const emergencyAlertRef = useRef<string | null>(null);
  const alertKindRef = useRef<"emergency" | "voice" | null>(null);
  const emergencyGraceRef = useRef<number | null>(null);
  const resumeFromRef = useRef<Road | null>(null);
  const emergencyQueueRef = useRef<{ road: Road; vehicleType: "ambulance" | "fire" }[]>([]);
  const closedRoadsRef = useRef<Set<Road>>(new Set());
  const continuousRef = useRef(continuous);
  const setupRef = useRef(setup);
  const originalSetupRef = useRef(setup);
  const rafRef = useRef<number>(0);
  const lastTsRef = useRef<number>(0);
  const modeRef = useRef(mode);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const lastSnapUiRef = useRef(0);

  continuousRef.current = continuous;
  setupRef.current = setup;
  modeRef.current = mode;

  const updateSetup = (road: Road, patch: Partial<RoadSetup>) => {
    setSetup((prev) => ({ ...prev, [road]: { ...prev[road], ...patch } }));
  };

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
      emergencyAlert: emergencyAlertRef.current,
      alertKind: alertKindRef.current,
      waitingEmergency: emergencyQueueRef.current[0]?.road ?? null,
      closedRoads: [...closedRoadsRef.current],
      continuous: continuousRef.current,
    };
  }, []);

  const startGreen = useCallback((road: Road) => {
    let target = road;
    if (closedRoadsRef.current.has(target)) {
      target = nextOpenRoad(target, closedRoadsRef.current);
    }
    if (closedRoadsRef.current.has(target)) {
      // All closed
      phaseRef.current = "idle";
      return;
    }

    // Continuous respawn when returning to a road with empty queue
    if (continuousRef.current) {
      const waiting = vehiclesRef.current.filter(
        (v) => v.road === target && (v.mode === "queued" || v.mode === "entering")
      );
      if (waiting.length === 0) {
        const burst = spawnContinuousBurst(target, originalSetupRef.current[target]);
        vehiclesRef.current.push(...burst);
      }
    }

    activeRoadRef.current = target;
    phaseRef.current = "green";
    const secs = computeGreenSeconds(vehiclesRef.current, target);
    phaseTimerRef.current = secs;
    for (const r of ROADS) {
      lightsRef.current[r] = r === target ? "green" : "red";
      countdownRef.current[r] = r === target ? secs : 0;
    }
    releaseCooldownRef.current = 0.4;
  }, []);

  const startYellow = useCallback((road: Road) => {
    phaseRef.current = "yellow";
    phaseTimerRef.current = YELLOW_SECONDS;
    lightsRef.current[road] = "yellow";
    countdownRef.current[road] = YELLOW_SECONDS;
  }, []);

  const activateEmergency = useCallback(
    (road: Road, vehicleType: "ambulance" | "fire" = "ambulance") => {
      if (modeRef.current !== "running") return;

      const hasEms = vehiclesRef.current.some(
        (v) =>
          v.road === road &&
          (v.type === "ambulance" || v.type === "fire") &&
          v.mode !== "done"
      );
      if (!hasEms) {
        // Push existing waiting vehicles back
        for (const v of vehiclesRef.current) {
          if (v.road === road && (v.mode === "queued" || v.mode === "entering")) {
            v.targetQueueOffset += gapFor(vehicleType);
            if (v.mode === "queued") v.queueOffset = v.targetQueueOffset;
          }
        }
        vehiclesRef.current.push(
          makeVehicle({
            road,
            type: vehicleType,
            color: vehicleType === "fire" ? "#dc2626" : "#f8fafc",
            maneuver: "straight",
            targetQueueOffset: 0,
          })
        );
      }

      emergencyRoadRef.current = road;
      emergencyAlertRef.current = `EMERGENCY VEHICLE DETECTED — ${road.toUpperCase()} PRIORITY GREEN`;
      alertKindRef.current = "emergency";
      emergencyGraceRef.current = null;
      resumeFromRef.current = nextOpenRoad(road, closedRoadsRef.current);

      activeRoadRef.current = road;
      phaseRef.current = "green";
      phaseTimerRef.current = MAX_GREEN;
      for (const r of ROADS) {
        lightsRef.current[r] = r === road ? "green" : "red";
        countdownRef.current[r] = r === road ? phaseTimerRef.current : 0;
      }
      releaseCooldownRef.current = 0.2;
      setSnapshot(packSnapshot());
    },
    [packSnapshot]
  );

  const triggerEmergency = useCallback(
    (road: Road, vehicleType: "ambulance" | "fire" = "ambulance") => {
      if (modeRef.current !== "running") return;
      if (emergencyRoadRef.current && emergencyRoadRef.current !== road) {
        if (!emergencyQueueRef.current.some((q) => q.road === road)) {
          emergencyQueueRef.current.push({ road, vehicleType });
        }
        setSnapshot(packSnapshot());
        return;
      }
      if (emergencyRoadRef.current === road) return;
      activateEmergency(road, vehicleType);
    },
    [activateEmergency, packSnapshot]
  );

  const forcePriorityGreen = useCallback(
    (road: Road) => {
      if (modeRef.current !== "running") return;
      if (emergencyRoadRef.current) {
        // Don't interrupt active emergency — queue as soft priority after
        if (!emergencyQueueRef.current.some((q) => q.road === road)) {
          // Not an EMS queue item — just note via voice banner briefly? Skip.
        }
      }
      closedRoadsRef.current.delete(road);
      emergencyRoadRef.current = null;
      emergencyGraceRef.current = null;
      emergencyAlertRef.current = `🎙️ Voice override: ${road.toUpperCase()} priority green`;
      alertKindRef.current = "voice";
      resumeFromRef.current = nextOpenRoad(road, closedRoadsRef.current);
      activeRoadRef.current = road;
      phaseRef.current = "green";
      const secs = Math.max(computeGreenSeconds(vehiclesRef.current, road), 8);
      phaseTimerRef.current = secs;
      for (const r of ROADS) {
        lightsRef.current[r] = r === road ? "green" : "red";
        countdownRef.current[r] = r === road ? secs : 0;
      }
      releaseCooldownRef.current = 0.2;
      // Clear voice banner after phase ends via tick when yellow starts — keep until then
      setSnapshot(packSnapshot());
    },
    [packSnapshot]
  );

  const closeRoad = useCallback(
    (road: Road) => {
      if (modeRef.current !== "running") return;
      closedRoadsRef.current.add(road);
      if (activeRoadRef.current === road && phaseRef.current === "green") {
        startYellow(road);
      }
      lightsRef.current[road] = "red";
      setSnapshot(packSnapshot());
    },
    [packSnapshot, startYellow]
  );

  const spawnTraffic = useCallback(
    (road: Road, vehicleType: VehicleType, color: string) => {
      if (modeRef.current !== "running") return;
      const target = backOfQueueOffset(vehiclesRef.current, road);
      vehiclesRef.current.push(
        makeVehicle({
          road,
          type: vehicleType,
          color,
          maneuver:
            vehicleType === "ambulance" || vehicleType === "fire" ? "straight" : pickManeuver(),
          targetQueueOffset: target,
        })
      );
      setSnapshot(packSnapshot());
    },
    [packSnapshot]
  );

  const spawnTrafficStaggered = useCallback(
    (road: Road, vehicleType: VehicleType, color: string, count: number) => {
      const n = Math.min(SPAWN_COUNT_MAX, Math.max(1, count));
      for (let i = 0; i < n; i++) {
        window.setTimeout(() => {
          if (modeRef.current !== "running") return;
          spawnTraffic(road, vehicleType, color);
        }, i * SPAWN_STAGGER_MS);
      }
    },
    [spawnTraffic]
  );

  const clearOverrides = useCallback(() => {
    closedRoadsRef.current.clear();
    emergencyQueueRef.current = [];
    emergencyRoadRef.current = null;
    emergencyAlertRef.current = null;
    alertKindRef.current = null;
    emergencyGraceRef.current = null;
    const nxt = nextOpenRoad(activeRoadRef.current, closedRoadsRef.current);
    startGreen(nxt);
    setSnapshot(packSnapshot());
  }, [packSnapshot, startGreen]);

  const applyVoiceAction = useCallback(
    (action: VoiceAction): string | null => {
      switch (action.kind) {
        case "emergency":
          triggerEmergency(action.road, action.vehicleType);
          return null;
        case "priority":
          forcePriorityGreen(action.road);
          return null;
        case "close":
          closeRoad(action.road);
          return null;
        case "spawn":
          spawnTrafficStaggered(action.road, action.vehicleType, action.color, action.count);
          return null;
        case "reset":
          clearOverrides();
          return null;
        case "unmatched":
          return "couldn't match a command";
      }
    },
    [
      triggerEmergency,
      forcePriorityGreen,
      closeRoad,
      spawnTrafficStaggered,
      clearOverrides,
    ]
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawRoads(ctx);
    for (const road of ROADS) {
      drawTrafficLight(ctx, road, lightsRef.current[road], countdownRef.current[road]);
    }
    for (const v of vehiclesRef.current) {
      drawVehicle(ctx, v);
    }
  }, []);

  const tick = useCallback(
    (dt: number) => {
      if (modeRef.current !== "running") {
        draw();
        return;
      }

      const active = activeRoadRef.current;
      const emsRoad = emergencyRoadRef.current;

      // Phase timer
      if (phaseRef.current === "green" || phaseRef.current === "yellow") {
        if (!(emsRoad && phaseRef.current === "green")) {
          phaseTimerRef.current -= dt;
        }
        countdownRef.current[active] = Math.max(0, phaseTimerRef.current);
      }

      // Animate vehicles entering from off-screen into their queue slot
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

      // Release vehicles from green road
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

      // Animate moving vehicles (turns slightly slower so the curve is readable)
      for (const v of vehiclesRef.current) {
        if (v.mode === "crossing") {
          const speed = v.maneuver === "straight" ? 0.55 : 0.4;
          v.pathT += dt * speed;
          if (v.pathT >= 1) {
            v.pathT = 1;
            v.mode = "exiting";
            if (process.env.NODE_ENV === "development") {
              // eslint-disable-next-line no-console
              console.debug("[JunctionX lane]", describeExit(v));
            }
          }
        } else if (v.mode === "exiting") {
          v.pathT += dt * 0.7;
          if (v.pathT >= 2.2) {
            v.mode = "done";
          }
        }
      }
      vehiclesRef.current = vehiclesRef.current.filter((v) => v.mode !== "done");

      // Soft queue inching toward stop line when gaps exist
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

      // Emergency clear logic
      if (emsRoad) {
        const emsPending = vehiclesRef.current.some(
          (v) =>
            v.road === emsRoad &&
            (v.type === "ambulance" || v.type === "fire") &&
            (v.mode === "queued" || v.mode === "entering" || v.mode === "crossing")
        );

        if (!emsPending) {
          if (emergencyGraceRef.current == null) {
            emergencyGraceRef.current = EMERGENCY_GRACE_S;
          }
          emergencyGraceRef.current -= dt;
          countdownRef.current[emsRoad] = Math.max(0, emergencyGraceRef.current);
          if (emergencyGraceRef.current <= 0) {
            emergencyRoadRef.current = null;
            emergencyAlertRef.current = null;
            alertKindRef.current = null;
            emergencyGraceRef.current = null;
            lightsRef.current[emsRoad] = "red";
            countdownRef.current[emsRoad] = 0;
            const queued = emergencyQueueRef.current.shift();
            if (queued) {
              activateEmergency(queued.road, queued.vehicleType);
            } else {
              const resume =
                resumeFromRef.current ?? nextOpenRoad(emsRoad, closedRoadsRef.current);
              resumeFromRef.current = null;
              startGreen(resume);
            }
          }
        } else {
          countdownRef.current[emsRoad] = Math.ceil(
            vehiclesRef.current.filter(
              (v) =>
                v.road === emsRoad &&
                (v.type === "ambulance" || v.type === "fire") &&
                v.mode !== "done"
            ).length * RELEASE_INTERVAL_S
          );
        }
      } else {
        // Normal phase transitions
        if (phaseRef.current === "green") {
          if (alertKindRef.current === "voice" && phaseTimerRef.current < 0.2) {
            emergencyAlertRef.current = null;
            alertKindRef.current = null;
          }
          const queuedLeft = vehiclesRef.current.some(
            (v) =>
              v.road === active && (v.mode === "queued" || v.mode === "entering")
          );
          const crossing = vehiclesRef.current.some(
            (v) => v.road === active && v.mode === "crossing"
          );
          if ((!queuedLeft && !crossing) || phaseTimerRef.current <= 0) {
            if (alertKindRef.current === "voice") {
              emergencyAlertRef.current = null;
              alertKindRef.current = null;
            }
            startYellow(active);
          }
        } else if (phaseRef.current === "yellow") {
          if (phaseTimerRef.current <= 0) {
            lightsRef.current[active] = "red";
            countdownRef.current[active] = 0;
            const nxt = nextOpenRoad(active, closedRoadsRef.current);
            startGreen(nxt);
          }
        }
      }

      // End condition
      if (!continuousRef.current) {
        const anyLeft = vehiclesRef.current.length > 0;
        if (!anyLeft && phaseRef.current !== "idle") {
          modeRef.current = "ended";
          setMode("ended");
          phaseRef.current = "idle";
          for (const r of ROADS) {
            lightsRef.current[r] = "red";
            countdownRef.current[r] = 0;
          }
        }
      }

      draw();
      // Throttle React stats updates (~5 Hz) so the canvas loop stays smooth
      if (performance.now() - lastSnapUiRef.current > 200) {
        lastSnapUiRef.current = performance.now();
        setSnapshot(packSnapshot());
      }
    },
    [draw, packSnapshot, startGreen, startYellow, activateEmergency]
  );

  const tickRefFn = useRef(tick);
  tickRefFn.current = tick;

  // Preview / RAF loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (mode === "setup") {
      vehiclesRef.current = [];
      for (const r of ROADS) {
        lightsRef.current[r] = "red";
        countdownRef.current[r] = 0;
      }
      draw();
      return;
    }

    lastTsRef.current = performance.now();
    const loop = (ts: number) => {
      const dt = Math.min(0.05, (ts - lastTsRef.current) / 1000);
      lastTsRef.current = ts;
      tickRefFn.current(dt);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [mode, draw]);

  const handleGo = () => {
    originalSetupRef.current = structuredClone(setup);
    continuousRef.current = continuous;
    vehiclesRef.current = ROADS.flatMap((r) => spawnQueue(r, setup[r]));
    emergencyRoadRef.current = null;
    emergencyAlertRef.current = null;
    alertKindRef.current = null;
    emergencyGraceRef.current = null;
    emergencyQueueRef.current = [];
    closedRoadsRef.current.clear();

    const emsRoad = ROADS.find((r) => setup[r].emergency);
    setMode("running");
    modeRef.current = "running";

    if (emsRoad) {
      startGreen("North");
      queueMicrotask(() =>
        triggerEmergency(emsRoad, setup[emsRoad].emergencyKind)
      );
    } else {
      startGreen("North");
    }
    setSnapshot(packSnapshot());
  };

  const handleReset = () => {
    cancelAnimationFrame(rafRef.current);
    recognitionRef.current?.stop();
    setListening(false);
    setMode("setup");
    modeRef.current = "setup";
    vehiclesRef.current = [];
    emergencyRoadRef.current = null;
    emergencyAlertRef.current = null;
    alertKindRef.current = null;
    emergencyGraceRef.current = null;
    emergencyQueueRef.current = [];
    closedRoadsRef.current.clear();
    setTranscript("");
    setSnapshot(null);
  };

  const toggleListening = () => {
    const w = window as Window & {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) {
      setVoiceSupported(false);
      setTranscript("Speech recognition not supported in this browser — use buttons.");
      return;
    }
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }
    const rec = new SR();
    recognitionRef.current = rec;
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onresult = (event) => {
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const piece = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += piece;
        else setTranscript(`Heard: '${piece.trim()}'`);
      }
      if (finalText.trim()) {
        const heard = finalText.trim();
        const action = parseVoiceCommand(heard);
        const fail = applyVoiceAction(action);
        if (fail) {
          setTranscript(`Heard: '${heard}' — ${fail}`);
        } else {
          setTranscript(`Heard: '${heard}'`);
        }
      }
    };
    rec.onerror = () => {
      setListening(false);
      setTranscript("Mic error — use the button panel fallback.");
    };
    rec.onend = () => {
      setListening(false);
    };
    try {
      rec.start();
      setListening(true);
      setVoiceSupported(true);
      setTranscript("Listening…");
    } catch {
      setVoiceSupported(false);
      setTranscript("Could not start mic — use buttons.");
    }
  };

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  return (
    <div className="p-6 space-y-5 max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Crosshair className="w-6 h-6 text-amber-400" />
            <h1 className="text-2xl font-bold">Junction X</h1>
          </div>
          <p className="text-slate-400 mt-1 text-sm">
            4-way adaptive signals · Project Z voice control · keep-left Indian roads
          </p>
        </div>
        {mode !== "setup" && (
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
          >
            <RotateCcw className="w-4 h-4" />
            Reset to setup
          </button>
        )}
      </div>

      {snapshot?.emergencyAlert ? (
        <div
          className={`rounded-lg border px-4 py-3 text-center font-bold text-white animate-pulse shadow-lg ${
            snapshot.alertKind === "voice"
              ? "border-cyan-400/50 bg-cyan-700/90 shadow-cyan-900/40"
              : "border-red-500/50 bg-red-600/90 shadow-red-900/40"
          }`}
        >
          {snapshot.alertKind === "voice" ? "🎙️ " : "🚨 "}
          {snapshot.emergencyAlert}
        </div>
      ) : null}

      {snapshot?.waitingEmergency ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          ⏳ {snapshot.waitingEmergency} waiting for emergency clearance
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[640px_1fr]">
        <div className="rounded-xl border border-border bg-card p-3 overflow-hidden">
          <canvas
            ref={canvasRef}
            width={CANVAS}
            height={CANVAS}
            className="w-full h-auto rounded-lg"
          />
        </div>

        <div className="space-y-4">
          {mode === "setup" ? (
            <section className="rounded-xl border border-border bg-card p-4 space-y-4">
              <h2 className="font-semibold text-lg">Setup — configure each approach</h2>
              <p className="text-xs text-slate-400">
                Static preview shown on the left. 0 is valid for any field.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {ROADS.map((road) => (
                  <div key={road} className="rounded-lg border border-border p-3 space-y-2">
                    <div className="font-medium text-amber-300">{road}</div>
                    <label className="flex items-center justify-between text-sm gap-2">
                      Cars
                      <input
                        type="number"
                        min={0}
                        max={40}
                        value={setup[road].cars}
                        onChange={(e) =>
                          updateSetup(road, { cars: Math.max(0, Number(e.target.value) || 0) })
                        }
                        className="w-20 rounded border border-border bg-black/30 px-2 py-1"
                      />
                    </label>
                    <label className="flex items-center justify-between text-sm gap-2">
                      Trucks
                      <input
                        type="number"
                        min={0}
                        max={20}
                        value={setup[road].trucks}
                        onChange={(e) =>
                          updateSetup(road, { trucks: Math.max(0, Number(e.target.value) || 0) })
                        }
                        className="w-20 rounded border border-border bg-black/30 px-2 py-1"
                      />
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={setup[road].emergency}
                        onChange={(e) => updateSetup(road, { emergency: e.target.checked })}
                      />
                      Emergency vehicle
                    </label>
                    {setup[road].emergency && (
                      <select
                        value={setup[road].emergencyKind}
                        onChange={(e) =>
                          updateSetup(road, {
                            emergencyKind: e.target.value as "ambulance" | "fire",
                          })
                        }
                        className="w-full rounded border border-border bg-black/30 px-2 py-1 text-sm"
                      >
                        <option value="ambulance">Ambulance</option>
                        <option value="fire">Fire truck</option>
                      </select>
                    )}
                  </div>
                ))}
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={continuous}
                  onChange={(e) => setContinuous(e.target.checked)}
                />
                Continuous traffic (respawn 0–2 vehicles when a road’s turn returns empty)
              </label>

              <button
                type="button"
                onClick={handleGo}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-amber-400"
              >
                <Play className="w-4 h-4" />
                Go — start simulation
              </button>

              <div className="text-xs text-slate-500 space-y-1 border-t border-border pt-3">
                <div>
                  Green = clamp({BASE_GREEN} + queue×{PER_VEHICLE_SECONDS}, {MIN_GREEN}, {MAX_GREEN})
                  · trucks count as {TRUCK_WEIGHT}×
                </div>
                <div>Rotation: North → East → South → West (clockwise)</div>
              </div>
            </section>
          ) : (
            <>
              <section className="rounded-xl border border-border bg-card p-4 space-y-3">
                <h2 className="font-semibold">Live stats</h2>
                <div className="text-sm space-y-1">
                  <div>
                    Current green:{" "}
                    <span className="text-emerald-400 font-semibold">
                      {snapshot?.currentGreen ?? "—"}
                    </span>
                  </div>
                  <div>
                    Phase countdown:{" "}
                    <span className="text-cyan-300 font-mono">
                      {snapshot?.currentGreen
                        ? `${Math.ceil(snapshot.countdown[snapshot.currentGreen])}s`
                        : "—"}
                    </span>
                  </div>
                  {mode === "ended" && (
                    <div className="text-amber-300 text-sm">
                      Simulation ended — all initial vehicles cleared. Reset to run again.
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {ROADS.map((r) => (
                    <div
                      key={r}
                      className={`rounded border px-2 py-1.5 ${
                        snapshot?.closedRoads?.includes(r)
                          ? "border-slate-600 bg-slate-800/80 opacity-70"
                          : snapshot?.lights[r] === "green"
                            ? "border-emerald-500/40 bg-emerald-500/10"
                            : snapshot?.lights[r] === "yellow"
                              ? "border-yellow-500/40 bg-yellow-500/10"
                              : "border-border"
                      }`}
                    >
                      <div className="font-medium">{r}</div>
                      <div className="text-xs text-slate-400">
                        {snapshot?.closedRoads?.includes(r)
                          ? "CLOSED"
                          : `${snapshot?.lights[r]?.toUpperCase()} · queue ${snapshot?.queues[r] ?? 0}`}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-xl border border-cyan-500/30 bg-card p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-cyan-300">Project Z — Voice control</div>
                  <button
                    type="button"
                    onClick={toggleListening}
                    className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium ${
                      listening
                        ? "bg-cyan-600 text-white"
                        : "border border-cyan-500/40 hover:bg-cyan-500/10"
                    }`}
                  >
                    {listening ? <Mic className="w-4 h-4 animate-pulse" /> : <MicOff className="w-4 h-4" />}
                    {listening ? "Listening…" : "Start listening"}
                  </button>
                </div>
                <p className="text-xs text-slate-400">
                  Flexible slots — try: “8 vehicles north”, “north needs 15 trucks”, “west red
                  truck”, “ambulance west”, “prioritize east”, “close south”, “reset”
                </p>
                <div className="rounded border border-border bg-black/30 px-2 py-1.5 text-xs text-cyan-200/90 min-h-[1.75rem]">
                  {transcript || (voiceSupported ? "Mic idle" : "Voice unsupported — use buttons below")}
                </div>
              </section>

              <section className="rounded-xl border border-orange-500/30 bg-card p-4 space-y-3">
                <div className="flex items-center gap-2 font-semibold text-orange-300">
                  <Siren className="w-4 h-4" />
                  Manual command panel (always available)
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={controlRoad}
                    onChange={(e) => {
                      const r = e.target.value as Road;
                      setControlRoad(r);
                      setEmergencyPick(r);
                    }}
                    className="rounded border border-border bg-black/30 px-2 py-1.5 text-sm"
                  >
                    {ROADS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={mode !== "running"}
                    onClick={() => forcePriorityGreen(controlRoad)}
                    className="rounded-lg bg-cyan-700 px-2.5 py-1.5 text-xs font-semibold hover:bg-cyan-600 disabled:opacity-40"
                  >
                    Prioritize {controlRoad}
                  </button>
                  <button
                    type="button"
                    disabled={mode !== "running"}
                    onClick={() => closeRoad(controlRoad)}
                    className="rounded-lg bg-slate-700 px-2.5 py-1.5 text-xs font-semibold hover:bg-slate-600 disabled:opacity-40"
                  >
                    Close {controlRoad}
                  </button>
                  <button
                    type="button"
                    disabled={mode !== "running"}
                    onClick={() =>
                      spawnTraffic(
                        controlRoad,
                        "car",
                        CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)]
                      )
                    }
                    className="rounded-lg bg-amber-700 px-2.5 py-1.5 text-xs font-semibold hover:bg-amber-600 disabled:opacity-40"
                  >
                    Add car {controlRoad}
                  </button>
                  <button
                    type="button"
                    disabled={mode !== "running"}
                    onClick={() => spawnTraffic(controlRoad, "truck", "#475569")}
                    className="rounded-lg bg-amber-800 px-2.5 py-1.5 text-xs font-semibold hover:bg-amber-700 disabled:opacity-40"
                  >
                    Add truck {controlRoad}
                  </button>
                  <button
                    type="button"
                    disabled={mode !== "running"}
                    onClick={() => triggerEmergency(controlRoad, "ambulance")}
                    className="rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold hover:bg-red-500 disabled:opacity-40"
                  >
                    EMS {controlRoad}
                  </button>
                  <button
                    type="button"
                    disabled={mode !== "running"}
                    onClick={() => clearOverrides()}
                    className="rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-white/5 disabled:opacity-40"
                  >
                    Reset overrides
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 pt-1 border-t border-border">
                  {ROADS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      disabled={mode !== "running"}
                      onClick={() => triggerEmergency(r)}
                      className="rounded border border-red-500/40 px-2 py-1 text-xs hover:bg-red-500/10 disabled:opacity-40"
                    >
                      {r} EMS
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-500">
                  Camera-sim EMS buttons preserved — same emergency override as before.
                </p>
              </section>

              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={continuous}
                  onChange={(e) => setContinuous(e.target.checked)}
                />
                Continuous traffic
              </label>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
