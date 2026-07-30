import { ReactNode } from "react";
import clsx from "clsx";

interface BudgetStatCardProps {
  title: string;
  value: string;
  icon: ReactNode;
  description: string;
  trend: "positive" | "negative" | "neutral";
}

export default function BudgetStatCard({ title, value, icon, description, trend }: BudgetStatCardProps) {
  const getTrendColor = () => {
    switch (trend) {
      case "positive": return "border-emerald-500/30 bg-emerald-500/5 text-emerald-400";
      case "negative": return "border-red-500/30 bg-red-500/5 text-red-400";
      case "neutral": return "border-slate-500/30 bg-slate-500/5 text-slate-400";
    }
  };
  
  const getIconColor = () => {
    switch (trend) {
      case "positive": return "text-emerald-500";
      case "negative": return "text-red-500";
      case "neutral": return "text-slate-500";
    }
  };
  
  return (
    <div className={clsx("rounded-xl border p-4 transition-all hover:scale-[1.02]", getTrendColor())}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wide">{title}</h3>
        <div className={getIconColor()}>
          {icon}
        </div>
      </div>
      <p className="text-2xl font-bold mb-1">{value}</p>
      <p className="text-xs text-slate-400 truncate">{description}</p>
    </div>
  );
}