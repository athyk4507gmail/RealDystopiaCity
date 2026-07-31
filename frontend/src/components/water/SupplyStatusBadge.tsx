"use client";

import { Info } from "lucide-react";
import type { WaterSchedule } from "@/lib/api";

const TOOLTIPS = {
  overdue:
    "This ward has gone longer than the fairness limit (4 days) since its last supply, so it's automatically scheduled ahead of other wards.",
  scheduled:
    "This ward is scheduled today based on priority ranking, though it hasn't exceeded the fairness limit yet.",
  waiting:
    "Supplied recently — within the fair rotation limit, will be scheduled again as it approaches the 4-day limit.",
  notToday:
    "Not scheduled for supply today — higher-priority wards consumed today's water budget.",
} as const;

export default function SupplyStatusBadge({ row }: { row: WaterSchedule }) {
  let label: string;
  let className: string;
  let tooltip: string;

  if (row.supply_today && row.forced_supply) {
    label = "Overdue — Priority";
    className = "bg-red-500/20 text-red-400 border-red-500/30";
    tooltip = TOOLTIPS.overdue;
  } else if (row.supply_today) {
    label = "Scheduled";
    className = "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    tooltip = TOOLTIPS.scheduled;
  } else if (row.forced_supply) {
    label = "Overdue — Not Today";
    className = "bg-orange-500/20 text-orange-400 border-orange-500/30";
    tooltip = "Overdue but not scheduled today — today's water budget was allocated to higher-priority wards.";
  } else if ((row.days_since_supply ?? 0) < 4) {
    label = "Waiting";
    className = "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
    tooltip = TOOLTIPS.waiting;
  } else {
    label = "No Supply Today";
    className = "bg-slate-500/20 text-slate-400 border-slate-500/30";
    tooltip = TOOLTIPS.notToday;
  }

  return (
    <span className="inline-flex items-center gap-1">
      <span className={`text-xs px-2 py-0.5 rounded border font-medium ${className}`}>
        {row.supply_today ? "✅" : "❌"} {label}
      </span>
      <span className="relative group">
        <Info className="w-3.5 h-3.5 text-slate-500 cursor-help" />
        <span className="pointer-events-none absolute left-0 top-full z-20 mt-1 hidden w-56 rounded-lg border border-border bg-card p-2 text-xs text-slate-300 shadow-lg group-hover:block">
          {tooltip}
        </span>
      </span>
    </span>
  );
}
