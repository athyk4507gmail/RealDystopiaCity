"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  useRole,
  ROLE_LABELS,
  ROLE_MODULES,
  MODULE_METADATA,
  type Role,
} from "@/providers/RoleProvider";
import {
  Bot,
  Droplets,
  HeartPulse,
  CloudRain,
  TrafficCone,
  Radio,
  Crosshair,
  Skull,
  Activity,
  AlertTriangle,
  Zap,
  MessageSquare,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import ErrorBoundary from "@/components/ErrorBoundary";

const iconMap: Record<string, React.ElementType> = {
  Droplets,
  HeartPulse,
  CloudRain,
  TrafficCone,
  Radio,
  Crosshair,
  Skull,
  Activity,
  AlertTriangle,
  Zap,
  MessageSquare,
  ShieldCheck,
};

export default function DepartmentLandingPage() {
  const params = useParams();
  const router = useRouter();
  const { role, setRole } = useRole();
  const dept = params.dept as string;

  useEffect(() => {
    if (dept && ["water", "traffic", "operations"].includes(dept)) {
      if (role !== dept) {
        setRole(dept as Role);
      }
    } else {
      router.push("/agent");
    }
  }, [dept]);  // eslint-disable-line react-hooks/exhaustive-deps

  if (!dept || !["water", "traffic", "operations"].includes(dept)) {
    return null;
  }

  const allowedModules = ROLE_MODULES[dept as Role] || [];
  const gridModules = allowedModules.filter((href) => href !== "/agent");

  return (
    <ErrorBoundary fallbackTitle="Department panel failed to load">
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{ROLE_LABELS[dept as Role]} Control Panel</h1>
          <p className="text-slate-400 text-sm mt-1">
            Access simulation systems, configurations, and data overrides for{" "}
            {ROLE_LABELS[dept as Role]}.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {gridModules.map((href) => {
            const meta = MODULE_METADATA[href];
            if (!meta) return null;
            const Icon = iconMap[meta.icon] ?? Activity;
            return (
              <Link
                key={href}
                href={href}
                className="p-5 rounded-xl border border-border bg-card hover:border-accent/40 hover:bg-white/5 transition-all group flex flex-col justify-between h-48"
              >
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="rounded-lg border border-border bg-white/5 p-2">
                      <Icon className="w-5 h-5 text-accent" />
                    </div>
                    <h3 className="font-semibold text-lg text-white group-hover:text-accent transition-colors">
                      {meta.label}
                    </h3>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {meta.description}
                  </p>
                </div>
                <div className="flex items-center gap-1 text-xs text-accent font-medium mt-4 group-hover:gap-2 transition-all">
                  <span>Open panel</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </Link>
            );
          })}

          {/* Civic Agent Affordance Card */}
          <Link
            href="/agent"
            className="p-5 rounded-xl border border-dashed border-accent/20 bg-accent/5 hover:bg-accent/10 hover:border-accent/40 transition-all group flex flex-col justify-between h-48"
          >
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="rounded-lg border border-accent/30 bg-accent/10 p-2">
                  <Bot className="w-5 h-5 text-accent" />
                </div>
                <h3 className="font-semibold text-lg text-accent">Ask Civic Agent</h3>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Consult the municipal agent for cross-cutting queries, complaints, and general city
                statistics without leaving your department.
              </p>
            </div>
            <div className="flex items-center gap-1 text-xs text-accent font-medium mt-4 group-hover:gap-2 transition-all">
              <span>Open Agent Chat</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </Link>
        </div>
      </div>
    </ErrorBoundary>
  );
}
