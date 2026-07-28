"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import clsx from "clsx";

interface DataErrorProps {
  message: string;
  onRetry?: () => void;
  className?: string;
}

export default function DataError({ message, onRetry, className }: DataErrorProps) {
  return (
    <div
      role="alert"
      className={clsx(
        "error-banner flex items-start gap-3 rounded-lg border border-[#f87171]/35 bg-[#f87171]/[0.08] p-4 text-sm text-[#fca5a5]",
        className,
      )}
    >
      <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
      <div className="flex-1">
        <p>{message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 inline-flex items-center gap-1 text-xs text-red-200 hover:text-white"
          >
            <RefreshCw className="w-3 h-3" /> Retry
          </button>
        )}
      </div>
    </div>
  );
}
