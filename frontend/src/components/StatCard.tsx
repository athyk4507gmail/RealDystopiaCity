import { useEffect, useState } from "react";
import clsx from "clsx";
import DataSourceBadge, { DataSourceType } from "./DataSourceBadge";
import { Droplets, CheckCircle, AlertTriangle, MessageCircle, TrendingUp, TrendingDown } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  color?: "cyan" | "green" | "yellow" | "red" | "purple";
  sourceType?: DataSourceType;
  sourceDetail?: string;
  trend?: number;
  icon?: "droplet" | "check" | "alert" | "message";
  className?: string;
}

const colors = {
  cyan: "border-cyan-500/30 bg-cyan-500/5 hover:border-cyan-500/50 hover:shadow-[0_2px_4px_rgba(0,0,0,0.4),0_8px_16px_rgba(0,0,0,0.35),0_20px_40px_-8px_rgba(0,0,0,0.5),0_32px_64px_-16px_rgba(0,0,0,0.6),0_0_24px_rgba(6,182,212,0.15)]",
  green: "border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/50 hover:shadow-[0_2px_4px_rgba(0,0,0,0.4),0_8px_16px_rgba(0,0,0,0.35),0_20px_40px_-8px_rgba(0,0,0,0.5),0_32px_64px_-16px_rgba(0,0,0,0.6),0_0_24px_rgba(16,185,129,0.15)]",
  yellow: "border-yellow-500/30 bg-yellow-500/5 hover:border-yellow-500/50 hover:shadow-[0_2px_4px_rgba(0,0,0,0.4),0_8px_16px_rgba(0,0,0,0.35),0_20px_40px_-8px_rgba(0,0,0,0.5),0_32px_64px_-16px_rgba(0,0,0,0.6),0_0_24px_rgba(245,158,11,0.15)]",
  red: "border-red-500/30 bg-red-500/5 hover:border-red-500/50 hover:shadow-[0_2px_4px_rgba(0,0,0,0.4),0_8px_16px_rgba(0,0,0,0.35),0_20px_40px_-8px_rgba(0,0,0,0.5),0_32px_64px_-16px_rgba(0,0,0,0.6),0_0_24px_rgba(239,68,68,0.15)]",
  purple: "border-purple-500/30 bg-purple-500/5 hover:border-purple-500/50 hover:shadow-[0_2px_4px_rgba(0,0,0,0.4),0_8px_16px_rgba(0,0,0,0.35),0_20px_40px_-8px_rgba(0,0,0,0.5),0_32px_64px_-16px_rgba(0,0,0,0.6),0_0_24px_rgba(168,85,247,0.15)]",
};

const iconMap = {
  droplet: Droplets,
  check: CheckCircle,
  alert: AlertTriangle,
  message: MessageCircle,
};

const iconColors = {
  cyan: "text-cyan-400 bg-cyan-400/10 border border-cyan-400/20",
  green: "text-emerald-400 bg-emerald-400/10 border border-emerald-400/20",
  yellow: "text-yellow-400 bg-yellow-400/10 border border-yellow-400/20",
  red: "text-red-400 bg-red-400/10 border border-red-400/20",
  purple: "text-purple-400 bg-purple-400/10 border border-purple-400/20",
};

function CountUp({ value, duration = 800 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    let start = 0;
    const end = value;
    const incrementTime = duration / end;
    const timer = setInterval(() => {
      start += 1;
      setDisplay(start);
      if (start >= end) clearInterval(timer);
    }, incrementTime);
    return () => clearInterval(timer);
  }, [value, duration]);

  return <span>{display}</span>;
}

export default function StatCard({ label, value, sub, color = "cyan", sourceType, sourceDetail, trend, icon, className }: StatCardProps) {
  const Icon = icon ? iconMap[icon] : null;
  const numValue = typeof value === "number" ? value : 0;

  return (
    <div className={clsx("stat-card-glass", colors[color], className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">{label}</p>
        {sourceType ? <DataSourceBadge type={sourceType} detail={sourceDetail} /> : null}
      </div>
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-3">
          {Icon && (
            <div className={clsx("p-2 stat-icon-container", iconColors[color])}>
              <Icon className="w-6 h-6" />
            </div>
          )}
          <p className="text-2xl font-bold">
            {typeof value === "number" ? <CountUp value={value} /> : value}
          </p>
        </div>
        {trend !== undefined && (
          <div className={clsx("flex items-center gap-1 text-xs font-semibold", trend > 0 ? "text-emerald-400" : "text-red-400")}>
            {trend > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            <span>{Math.abs(trend)}</span>
          </div>
        )}
      </div>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}
