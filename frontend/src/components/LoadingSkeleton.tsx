import clsx from "clsx";

interface LoadingSkeletonProps {
  className?: string;
  rows?: number;
}

export default function LoadingSkeleton({ className, rows = 3 }: LoadingSkeletonProps) {
  return (
    <div className={clsx("space-y-3", className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-4 rounded skeleton-bar" style={{ width: `${90 - i * 12}%` }} />
      ))}
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="glass-panel" aria-busy="true">
      <div className="h-3 w-20 rounded skeleton-bar mb-3" />
      <div className="h-8 w-16 rounded skeleton-bar" />
    </div>
  );
}

export function MapSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={clsx("glass-panel animate-pulse", className)}
      aria-busy="true"
      aria-label="Loading map"
    />
  );
}
