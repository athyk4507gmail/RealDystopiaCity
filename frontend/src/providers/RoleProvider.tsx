"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

export type Role = "citizen" | "water" | "traffic" | "operations";

export const ROLE_LABELS: Record<Role, string> = {
  citizen: "Citizen",
  water: "Water Department",
  traffic: "Traffic Department",
  operations: "City Operations",
};

export const ROLE_MODULES: Record<Role, string[]> = {
  citizen: ["/agent"],
  water: ["/agent", "/water", "/health-watch"],
  traffic: ["/agent", "/traffic-mood", "/traffic", "/traffic-management", "/junction-x", "/dystopia"],
  operations: ["/agent", "/metabolism", "/risk-zones", "/trust-score", "/complaints"],
};

export const MODULE_METADATA: Record<string, { label: string; description: string; href: string; color: string; icon: string }> = {
  "/water": {
    label: "Water Distribution",
    description: "Manage city-wide water schedules, demand prediction, and citizen complaints.",
    href: "/water",
    color: "text-cyan-400 border-cyan-500/20 bg-cyan-500/5",
    icon: "Droplets",
  },
  "/health-watch": {
    label: "Health Watch",
    description: "Track waterborne disease outbreaks, standing water risks, and public health scores.",
    href: "/health-watch",
    color: "text-rose-400 border-rose-500/20 bg-rose-500/5",
    icon: "HeartPulse",
  },
  "/traffic-mood": {
    label: "Traffic Mood",
    description: "Analyze citizen sentiments, social media feeds, and weather-triggered congestion predictions.",
    href: "/traffic-mood",
    color: "text-purple-400 border-purple-500/20 bg-purple-500/5",
    icon: "CloudRain",
  },
  "/traffic": {
    label: "Traffic Management",
    description: "View real-time vehicle counts, signal timings, and congestion heatmaps.",
    href: "/traffic",
    color: "text-yellow-400 border-yellow-500/20 bg-yellow-500/5",
    icon: "TrafficCone",
  },
  "/traffic-management": {
    label: "Command Signal",
    description: "Override signal parameters, manage intersection algorithms, and adjust light timings.",
    href: "/traffic-management",
    color: "text-cyan-400 border-cyan-500/20 bg-cyan-500/5",
    icon: "Radio",
  },
  "/junction-x": {
    label: "Junction X",
    description: "Monitor live vehicle feeds and AI-driven cross-traffic optimization.",
    href: "/junction-x",
    color: "text-amber-400 border-amber-500/20 bg-amber-500/5",
    icon: "Crosshair",
  },
  "/dystopia": {
    label: "Dystopia View",
    description: "Assess city-wide live camera feeds and synthetic emergency diagnostics.",
    href: "/dystopia",
    color: "text-rose-400 border-rose-500/20 bg-rose-500/5",
    icon: "Skull",
  },
  "/metabolism": {
    label: "City Metabolism",
    description: "Simulate urban stress cascades, resource scarcity, and resilience validation.",
    href: "/metabolism",
    color: "text-emerald-400 border-emerald-500/20 bg-emerald-500/5",
    icon: "Activity",
  },
  "/risk-zones": {
    label: "Risk Zones",
    description: "Track traffic safety hot spots, street accident metrics, and black spots.",
    href: "/risk-zones",
    color: "text-orange-400 border-orange-500/20 bg-orange-500/5",
    icon: "AlertTriangle",
  },
  "/trust-score": {
    label: "Trust Score",
    description: "Analyze transit reliability, public bus timeliness, and routes by confidence score.",
    href: "/trust-score",
    color: "text-accent border-accent/20 bg-accent/5",
    icon: "Zap",
  },
  "/complaints": {
    label: "Complaints Admin",
    description: "Review, triage, and update status of citizen-filed complaints.",
    href: "/complaints",
    color: "text-amber-400 border-amber-500/20 bg-amber-500/5",
    icon: "MessageSquare",
  },
};

interface RoleContextType {
  role: Role;
  setRole: (role: Role) => void;
  showSelector: boolean;
  setShowSelector: (show: boolean) => void;
  preSelectedRole: Role | null;
  setPreSelectedRole: (role: Role | null) => void;
  openSelectorWithHighlight: (role: Role) => void;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRoleState] = useState<Role>("citizen");
  const [showSelector, setShowSelector] = useState(false);
  const [preSelectedRole, setPreSelectedRole] = useState<Role | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("dystopiacity-role");
    if (saved && ["citizen", "water", "traffic", "operations"].includes(saved)) {
      setRoleState(saved as Role);
    }
  }, []);

  const setRole = (newRole: Role) => {
    setRoleState(newRole);
    localStorage.setItem("dystopiacity-role", newRole);
    
    // Redirect on role change
    if (newRole === "citizen") {
      router.push("/agent");
    } else {
      router.push(`/departments/${newRole}`);
    }
  };

  const openSelectorWithHighlight = (highlighted: Role) => {
    setPreSelectedRole(highlighted);
    setShowSelector(true);
  };

  // Enforce soft access restrictions
  useEffect(() => {
    if (pathname === "/" || pathname === "/agent" || pathname.startsWith("/departments")) {
      return;
    }
    
    const matched = Object.keys(MODULE_METADATA).find((p) => pathname.startsWith(p));
    if (matched) {
      const allowedModules = ROLE_MODULES[role];
      if (!allowedModules.includes(matched)) {
        if (role === "citizen") {
          router.push("/agent");
        } else {
          router.push(`/departments/${role}`);
        }
      }
    }
  }, [role, pathname, router]);

  return (
    <RoleContext.Provider
      value={{
        role,
        setRole,
        showSelector,
        setShowSelector,
        preSelectedRole,
        setPreSelectedRole,
        openSelectorWithHighlight,
      }}
    >
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const context = useContext(RoleContext);
  if (!context) {
    throw new Error("useRole must be used within a RoleProvider");
  }
  return context;
}
