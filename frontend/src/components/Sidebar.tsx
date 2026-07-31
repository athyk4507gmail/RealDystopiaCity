"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  HeartPulse,
  Droplets,
  AlertTriangle,
  CloudRain,
  TrafficCone,
  Activity,
  Zap,
  Radio,
  Crosshair,
  Skull,
  Bot,
  MessageSquare,
  ShieldCheck,
} from "lucide-react";
import clsx from "clsx";
import { useRole, ROLE_MODULES, ROLE_LABELS } from "@/providers/RoleProvider";

const modules = [
  { href: "/agent", label: "Civic Agent", icon: Bot, color: "text-accent" },
  { href: "/water", label: "Water Distribution", icon: Droplets, color: "text-cyan-400" },
  { href: "/risk-zones", label: "Risk Zones", icon: AlertTriangle, color: "text-orange-400" },
  { href: "/traffic-mood", label: "Traffic Mood", icon: CloudRain, color: "text-purple-400" },
  { href: "/traffic", label: "Traffic Management", icon: TrafficCone, color: "text-yellow-400" },
  { href: "/traffic-management", label: "Command Signal", icon: Radio, color: "text-cyan-400" },
  { href: "/junction-x", label: "Junction X", icon: Crosshair, color: "text-amber-400" },
  { href: "/dystopia", label: "Dystopia", icon: Skull, color: "text-rose-400" },
  { href: "/metabolism", label: "City Metabolism", icon: Activity, color: "text-emerald-400" },
  { href: "/health-watch", label: "Health Watch", icon: HeartPulse, color: "text-rose-400" },
  { href: "/trust-score", label: "Trust Score", icon: ShieldCheck, color: "text-accent" },
  { href: "/complaints", label: "Complaints Admin", icon: MessageSquare, color: "text-amber-400" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { role, setShowSelector } = useRole();

  const allowed = ROLE_MODULES[role] || [];
  const filteredModules = modules.filter((mod) => allowed.includes(mod.href));

  return (
    <aside className="w-64 shrink-0 border-r border-border bg-card flex flex-col">
      <div className="p-5 border-b border-border">
        <div className="flex items-center gap-2">
          <Zap className="w-6 h-6 text-accent" />
          <div>
            <h1 className="font-bold text-lg leading-tight">DystopiaCITY</h1>
            <p className="text-xs text-slate-400">Sustainable City Intelligence</p>
          </div>
        </div>
      </div>

      {/* Persistent Switch Role Control */}
      <div className="px-5 py-3 border-b border-border bg-white/5 flex items-center justify-between shrink-0">
        <div>
          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Active Role</p>
          <p className="text-xs font-semibold text-slate-200 mt-0.5">{ROLE_LABELS[role]}</p>
        </div>
        <button
          onClick={() => setShowSelector(true)}
          className="text-xs text-accent hover:underline font-medium"
        >
          Switch
        </button>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {filteredModules.map((mod) => {
          const active = pathname.startsWith(mod.href);
          const Icon = mod.icon;
          return (
            <Link
              key={mod.href}
              href={mod.href}
              className={clsx(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                active
                  ? "bg-accent/10 text-accent border border-accent/20"
                  : "text-slate-400 hover:text-foreground hover:bg-white/5"
              )}
            >
              <Icon className={clsx("w-4 h-4", active && mod.color)} />
              {mod.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border shrink-0">
        <div className="text-xs text-slate-500">
          Powered by <span className="text-accent font-medium">Gemma 4</span>
        </div>
      </div>
    </aside>
  );
}
