"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  HeartPulse,
  Droplets,
  Bus,
  AlertTriangle,
  CloudRain,
  TrafficCone,
  Activity,
  Zap,
  MessageSquare,
  Radio,
  Crosshair,
  Skull,
  Bot,
} from "lucide-react";
import clsx from "clsx";

const modules = [
  { href: "/agent", label: "Civic Agent", icon: Bot, color: "text-accent" },
  { href: "/water", label: "Water Distribution", icon: Droplets, color: "text-cyan-400" },
  { href: "/complaints", label: "Complaints", icon: MessageSquare, color: "text-rose-400" },
  { href: "/trust-score", label: "Trust Score", icon: Bus, color: "text-blue-400" },
  { href: "/risk-zones", label: "Risk Zones", icon: AlertTriangle, color: "text-orange-400" },
  { href: "/traffic-mood", label: "Traffic Mood", icon: CloudRain, color: "text-purple-400" },
  { href: "/traffic", label: "Traffic Management", icon: TrafficCone, color: "text-yellow-400" },
  { href: "/traffic-management", label: "Command Signal", icon: Radio, color: "text-cyan-400" },
  { href: "/junction-x", label: "Junction X", icon: Crosshair, color: "text-amber-400" },
  { href: "/dystopia", label: "Dystopia", icon: Skull, color: "text-rose-400" },
  { href: "/metabolism", label: "City Metabolism", icon: Activity, color: "text-emerald-400" },
  { href: "/health-watch", label: "Health Watch", icon: HeartPulse, color: "text-rose-400" },
];

export default function Sidebar() {
  const pathname = usePathname();

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

      <nav className="flex-1 p-3 space-y-1">
        {modules.map((mod) => {
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

      <div className="p-4 border-t border-border">
        <div className="text-xs text-slate-500">
          Powered by <span className="text-accent font-medium">Gemma 4</span>
        </div>
      </div>
    </aside>
  );
}
