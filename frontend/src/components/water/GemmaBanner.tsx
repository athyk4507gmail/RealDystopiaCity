"use client";

import { Sparkles } from "lucide-react";

export default function GemmaBanner() {
  return (
    <div className="rounded-lg border border-accent/25 bg-accent/5 px-4 py-2.5 flex items-start gap-2 text-sm text-slate-300">
      <Sparkles className="w-4 h-4 text-accent shrink-0 mt-0.5" />
      <p>
        This module&apos;s decisions are powered by <span className="text-accent font-medium">Gemma</span>
        — using retrieval-augmented reasoning grounded in real ward data and past resolution history, not static rules.
      </p>
    </div>
  );
}
