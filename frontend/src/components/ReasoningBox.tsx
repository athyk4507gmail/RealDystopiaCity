interface ReasoningBoxProps {
  reasoning: string;
  title?: string;
}

export default function ReasoningBox({ reasoning, title = "AI Reasoning" }: ReasoningBoxProps) {
  return (
    <div className="rounded-lg border border-accent/20 bg-accent/5 p-3">
      <p className="text-xs font-medium text-accent mb-1">{title} — Gemma 4</p>
      <p className="text-sm text-slate-300 leading-relaxed">{reasoning}</p>
    </div>
  );
}
