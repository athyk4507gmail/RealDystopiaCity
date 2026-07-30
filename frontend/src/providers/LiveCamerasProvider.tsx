"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useLiveCameras, type LiveCamerasState } from "@/hooks/useLiveCameraVehicleCount";

const LiveCamerasContext = createContext<LiveCamerasState | null>(null);

/** Single app-wide poll to GET /live-cameras — shared by Command Signal and Dystopia. */
export function LiveCamerasProvider({ children }: { children: ReactNode }) {
  const value = useLiveCameras({ enabled: true });
  return <LiveCamerasContext.Provider value={value}>{children}</LiveCamerasContext.Provider>;
}

export function useLiveCamerasContext(): LiveCamerasState {
  const ctx = useContext(LiveCamerasContext);
  if (!ctx) {
    throw new Error("useLiveCamerasContext must be used within LiveCamerasProvider");
  }
  return ctx;
}
