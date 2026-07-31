import clsx from "clsx";

interface PriorityBadgeProps {
  priority: string;
}

export default function PriorityBadge({ priority }: PriorityBadgeProps) {
  const p = priority.toLowerCase();
  return (
    <span
      className={clsx(
        "px-2 py-0.5 rounded text-xs font-medium",
        p === "high" && "bg-red-500/20 text-red-400",
        p === "medium" && "bg-yellow-500/20 text-yellow-400",
        p === "low" && "bg-emerald-500/20 text-emerald-400"
      )}
    >
      {priority}
    </span>
  );
}
