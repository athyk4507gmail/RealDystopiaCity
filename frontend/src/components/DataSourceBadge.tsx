"use client";

import clsx from "clsx";

export type DataSourceType = "live" | "reported" | "estimated";

const styleMap: Record<DataSourceType, string> = {
  live: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  reported: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  estimated: "bg-slate-500/20 text-slate-300 border-slate-500/30",
};

const labelMap: Record<DataSourceType, string> = {
  live: "Live",
  reported: "Reported",
  estimated: "Estimated",
};

interface DataSourceBadgeProps {
  type: DataSourceType;
  detail?: string;
  className?: string;
}

export default function DataSourceBadge({ type, detail, className }: DataSourceBadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        styleMap[type],
        className
      )}
      title={detail}
    >
      {labelMap[type]}
    </span>
  );
}
