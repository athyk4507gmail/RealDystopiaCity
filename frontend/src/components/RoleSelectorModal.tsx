"use client";

import React, { useEffect } from "react";
import { useRole, type Role, ROLE_LABELS } from "@/providers/RoleProvider";
import { Bot, Droplets, TrafficCone, Activity, X, ShieldAlert } from "lucide-react";
import clsx from "clsx";

export default function RoleSelectorModal() {
  const {
    role,
    setRole,
    showSelector,
    setShowSelector,
    preSelectedRole,
    setPreSelectedRole,
  } = useRole();

  // Close selector on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowSelector(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setShowSelector]);

  if (!showSelector) return null;

  const rolesList: Array<{
    id: Role;
    label: string;
    description: string;
    icon: any;
    color: string;
    borderColor: string;
    bgHover: string;
    badge?: string;
  }> = [
    {
      id: "citizen",
      label: "Citizen (Default)",
      description: "General citizen access. Converse with Civic Agent for ward queries and reports.",
      icon: Bot,
      color: "text-accent",
      borderColor: "group-hover:border-cyan-500/50",
      bgHover: "hover:bg-cyan-500/5",
    },
    {
      id: "water",
      label: "Water Department",
      description: "Manage city-wide water schedules, demand prediction, and Health Watch tracking.",
      icon: Droplets,
      color: "text-cyan-400",
      borderColor: "group-hover:border-cyan-500/50",
      bgHover: "hover:bg-cyan-500/5",
    },
    {
      id: "traffic",
      label: "Traffic Department",
      description: "Monitor real-time vehicle feeds, override signals, and analyze traffic mood.",
      icon: TrafficCone,
      color: "text-yellow-400",
      borderColor: "group-hover:border-yellow-500/50",
      bgHover: "hover:bg-yellow-500/5",
    },
    {
      id: "operations",
      label: "City Operations",
      description: "Simulate urban stress cascades, track accident black spots, and review complaints.",
      icon: Activity,
      color: "text-emerald-400",
      borderColor: "group-hover:border-emerald-500/50",
      bgHover: "hover:bg-emerald-500/5",
    },
  ];

  const handleSelect = (selectedId: Role) => {
    setRole(selectedId);
    setPreSelectedRole(null); // Clear pre-selection
    setShowSelector(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-slate-900 shadow-2xl p-6 md:p-8">
        
        {/* Close Button */}
        <button
          onClick={() => {
            setShowSelector(false);
            setPreSelectedRole(null);
          }}
          className="absolute top-4 right-4 p-1.5 rounded-lg border border-border hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="mb-6">
          <h2 className="text-xl font-bold text-white">Select Department Role</h2>
          <p className="text-slate-400 text-sm mt-1">
            Choose a department view to adjust configuration panels or run simulations.
          </p>
        </div>

        {/* Role Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rolesList.map((r) => {
            const Icon = r.icon;
            const isActive = role === r.id;
            const isPreselected = preSelectedRole === r.id;

            return (
              <button
                key={r.id}
                onClick={() => handleSelect(r.id)}
                className={clsx(
                  "group relative p-5 rounded-xl border text-left transition-all outline-none",
                  r.bgHover,
                  isActive
                    ? "border-accent bg-accent/5 ring-1 ring-accent"
                    : isPreselected
                    ? "border-amber-500 bg-amber-500/5 ring-2 ring-amber-500 ring-offset-2 ring-offset-slate-900 animate-pulse"
                    : "border-border bg-black/20 hover:border-slate-700"
                )}
              >
                {isPreselected && (
                  <div className="absolute top-3 right-3 flex items-center gap-1 bg-amber-500 text-black text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                    <ShieldAlert className="w-2.5 h-2.5" />
                    <span>Access Needed</span>
                  </div>
                )}
                
                <div className="flex items-start gap-4">
                  <div className={clsx(
                    "p-2.5 rounded-lg border border-border bg-white/5",
                    isActive ? "border-accent/40" : "group-hover:bg-white/10"
                  )}>
                    <Icon className={clsx("w-5 h-5", r.color)} />
                  </div>
                  
                  <div>
                    <h3 className="font-semibold text-white group-hover:text-accent transition-colors flex items-center gap-2">
                      {r.label}
                      {isActive && (
                        <span className="text-[10px] bg-accent/20 text-accent font-medium px-1.5 py-0.5 rounded">
                          Active
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                      {r.description}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Note */}
        <div className="mt-6 border-t border-border pt-4 text-center">
          <p className="text-[11px] text-slate-500">
            * This is a UX simulation role selection screen. No authentication or credentials required.
          </p>
        </div>
      </div>
    </div>
  );
}
