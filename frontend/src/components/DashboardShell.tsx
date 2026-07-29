"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import ChatPanel from "./ChatPanel";
import { DystopiaProvider } from "@/dystopia/DystopiaProvider";

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

  return (
    <DystopiaProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">{children}</main>
        <ChatPanel module={module} />
      </div>
    </DystopiaProvider>
  );
}
