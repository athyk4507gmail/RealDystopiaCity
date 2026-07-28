"use client";

import { useRef, useState } from "react";

export function TiltCard({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({});

  function handleMouseMove(e: React.MouseEvent) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;

    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;

    if (!isFinite(x) || !isFinite(y) || isNaN(x) || isNaN(y)) return;

    setStyle({
      transform: `perspective(1000px) rotateY(${x * 4}deg) rotateX(${-y * 4}deg)`,
    });
  }

  function handleMouseLeave() {
    setStyle({ transform: "perspective(1000px) rotateY(0deg) rotateX(0deg)" });
  }

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={className}
      style={{
        transition: "transform 0.15s ease",
        willChange: "transform",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
