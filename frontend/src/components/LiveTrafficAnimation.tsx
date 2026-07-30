"use client";

import { useEffect, useRef, type CSSProperties } from "react";

function buildSkyline(
  container: HTMLElement,
  count: number,
  minH: number,
  maxH: number,
  minW: number,
  maxW: number,
  litRatio: number,
) {
  container.replaceChildren();

  for (let i = 0; i < count; i++) {
    const w = Math.floor(minW + Math.random() * (maxW - minW));
    const h = Math.floor(minH + Math.random() * (maxH - minH));
    const building = document.createElement("div");
    building.className = "live-traffic-building";
    building.style.width = `${w}px`;
    building.style.height = `${h}px`;

    const cols = Math.max(2, Math.floor(w / 10));
    const rows = Math.max(3, Math.floor(h / 12));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const win = document.createElement("div");
        const lit = Math.random() < litRatio;
        win.className = lit ? "live-traffic-window lit" : "live-traffic-window";
        win.style.left = `${c * (w / cols) + 4}px`;
        win.style.bottom = `${r * (h / rows) + 6}px`;
        if (lit) win.style.animationDelay = `${Math.random() * 6}s`;
        building.appendChild(win);
      }
    }
    container.appendChild(building);
  }
}

const SPARK_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

type CrashVariant = "center" | "left" | "right" | "rear" | "sideswipe";

function CrashZone({ variant }: { variant: CrashVariant }) {
  return (
    <div className={`live-traffic-crash-zone crash-${variant}`}>
      <div className="live-traffic-crash-flash" />
      <div className="live-traffic-crash-smoke" />
      {SPARK_ANGLES.map((angle) => (
        <div
          key={angle}
          className="live-traffic-spark"
          style={{ "--spark-angle": `${angle}deg` } as CSSProperties}
        />
      ))}
      <div className="live-traffic-car crash-car-a moving-right" />
      <div className="live-traffic-car crash-car-b moving-left" />
    </div>
  );
}

export default function LiveTrafficAnimation() {
  const skylineBackRef = useRef<HTMLDivElement>(null);
  const skylineFrontRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (skylineBackRef.current) {
      buildSkyline(skylineBackRef.current, 22, 90, 220, 26, 46, 0.25);
    }
    if (skylineFrontRef.current) {
      buildSkyline(skylineFrontRef.current, 16, 120, 260, 34, 60, 0.35);
    }
  }, []);

  return (
    <div className="live-traffic-scene" aria-hidden="true">
      <div className="live-traffic-label">
        <span className="live-traffic-dot" />
        Live Traffic
      </div>

      <div className="live-traffic-skyline back" ref={skylineBackRef} />
      <div className="live-traffic-skyline front" ref={skylineFrontRef} />

      <div className="live-traffic-water">
        <div className="live-traffic-water-wave wave-1" />
        <div className="live-traffic-water-wave wave-2" />
        <div className="live-traffic-water-wave wave-3" />
        <div className="live-traffic-water-shimmer" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="live-traffic-ripple"
            style={{
              left: `${8 + i * 11}%`,
              animationDelay: `${i * 0.7}s`,
            }}
          />
        ))}
      </div>

      <div className="live-traffic-road">
        <div className="live-traffic-lane-edge top" />
        <div className="live-traffic-lane-divider">
          {Array.from({ length: 40 }).map((_, i) => (
            <span key={i} />
          ))}
        </div>
        <div className="live-traffic-lane-edge bottom" />

        <div className="live-traffic-car moving-right lane-1" style={{ animationDelay: "0s" }} />
        <div className="live-traffic-car moving-right lane-1" style={{ animationDelay: "-4.5s" }} />
        <div className="live-traffic-car moving-right lane-2" style={{ animationDelay: "-1.5s" }} />
        <div className="live-traffic-car moving-right lane-2" style={{ animationDelay: "-6s" }} />
        <div className="live-traffic-car moving-left lane-3" style={{ animationDelay: "0s" }} />
        <div className="live-traffic-car moving-left lane-3" style={{ animationDelay: "-5s" }} />
        <div className="live-traffic-car moving-left lane-4" style={{ animationDelay: "-2.5s" }} />
        <div className="live-traffic-car moving-left lane-4" style={{ animationDelay: "-5.5s" }} />

        <CrashZone variant="center" />
        <CrashZone variant="left" />
        <CrashZone variant="right" />
        <CrashZone variant="rear" />
        <CrashZone variant="sideswipe" />
      </div>

      <div className="live-traffic-overlay" />
    </div>
  );
}
