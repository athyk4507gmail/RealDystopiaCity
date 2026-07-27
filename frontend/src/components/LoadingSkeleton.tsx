import clsx from "clsx";

interface LoadingSkeletonProps {
  className?: string;
  rows?: number;
}

export default function LoadingSkeleton({ className, rows = 3 }: LoadingSkeletonProps) {
  return (
    <div className={clsx("animate-pulse space-y-3", className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-4 rounded bg-white/10" style={{ width: `${90 - i * 12}%` }} />
      ))}
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-border p-4 animate-pulse" aria-busy="true">
      <div className="h-3 w-20 rounded bg-white/10 mb-3" />
      <div className="h-8 w-16 rounded bg-white/10" />
    </div>
  );
}

export function MapSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={clsx("rounded-xl border border-border bg-white/5 animate-pulse", className)}
      aria-busy="true"
      aria-label="Loading map"
    />
  );
}
