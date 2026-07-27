import clsx from "clsx";
import DataSourceBadge, { DataSourceType } from "./DataSourceBadge";

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  color?: "cyan" | "green" | "yellow" | "red" | "purple";
  sourceType?: DataSourceType;
  sourceDetail?: string;
}

const colors = {
  cyan: "border-cyan-500/30 bg-cyan-500/5",
  green: "border-emerald-500/30 bg-emerald-500/5",
  yellow: "border-yellow-500/30 bg-yellow-500/5",
  red: "border-red-500/30 bg-red-500/5",
  purple: "border-purple-500/30 bg-purple-500/5",
};

export default function StatCard({ label, value, sub, color = "cyan", sourceType, sourceDetail }: StatCardProps) {
  return (
    <div className={clsx("rounded-xl border p-4", colors[color])}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-400 uppercase tracking-wide">{label}</p>
        {sourceType ? <DataSourceBadge type={sourceType} detail={sourceDetail} /> : null}
      </div>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}
