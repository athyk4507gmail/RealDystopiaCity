"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import ChatPanel from "./ChatPanel";

const moduleMap: Record<string, string> = {
  "/water": "water",
  "/trust-score": "trust-score",
  "/risk-zones": "risk-zones",
  "/traffic-mood": "traffic-mood",
  "/traffic": "traffic",
  "/metabolism": "metabolism",
};

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const module = Object.entries(moduleMap).find(([path]) => pathname.startsWith(path))?.[1] || "global";

  const mainRef = useRef<HTMLDivElement>(null);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const mainEl = mainRef.current;
    if (!mainEl) return;
    const onScroll = () => setScrollY(mainEl.scrollTop);
    mainEl.addEventListener("scroll", onScroll, { passive: true });
    return () => mainEl.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden relative">
      <div
        className="ambient-particles-bg"
        style={{ transform: `translateY(${-scrollY * 0.12}px)` }}
      />
      <Sidebar />
      <main ref={mainRef} className="flex-1 overflow-y-auto z-10 relative">
        {children}
      </main>
      <ChatPanel module={module} />
    </div>
  );
}
