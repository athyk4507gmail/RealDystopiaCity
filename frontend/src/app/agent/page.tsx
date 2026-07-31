"use client";

import { useState } from "react";
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Send,
  Wrench,
  BookOpen,
  HeartPulse,
  Droplets,
  Building2,
} from "lucide-react";
import clsx from "clsx";
import { api, AgentChatResponse, AgentTraceStep } from "@/lib/api";
import { sanitizeChatMessage } from "@/lib/validation";
import StatCard from "@/components/StatCard";
import { useRole, type Role, ROLE_LABELS } from "@/providers/RoleProvider";

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  trace?: AgentTraceStep[];
  truncated?: boolean;
  suggested_department?: string;
}

function riskColor(score: number) {
  if (score >= 65) return "red" as const;
  if (score >= 40) return "yellow" as const;
  return "green" as const;
}

function ToolResultCards({ step }: { step: AgentTraceStep }) {
  const result = step.result || {};
  if (step.tool === "get_ward_health_risk" && result.ok) {
    const score = Number(result.risk_score ?? 0);
    const features = (result.features || {}) as Record<string, unknown>;
    return (
      <div className="mt-2 grid grid-cols-2 gap-2">
        <StatCard
          label="Health risk"
          value={score}
          sub={String(result.ward_name || "")}
          color={riskColor(score)}
        />
        <StatCard
          label="Stagnant reports"
          value={Number(features.stagnant_reports_7d ?? 0)}
          sub="7-day"
          color="cyan"
        />
      </div>
    );
  }
  if (step.tool === "get_water_complaints" && result.ok) {
    return (
      <div className="mt-2">
        <StatCard
          label="Complaints"
          value={Number(result.count ?? 0)}
          sub={String(result.ward_name || "")}
          color="yellow"
        />
      </div>
    );
  }
  if (step.tool === "file_complaint" && result.ok) {
    const complaint = (result.complaint || {}) as Record<string, unknown>;
    return (
      <div className="mt-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs">
        Filed Complaint #{String(complaint.id)} — {String(complaint.type)} in{" "}
        {String(complaint.ward_name)}
      </div>
    );
  }
  return null;
}

function TracePanel({ trace }: { trace: AgentTraceStep[] }) {
  const [open, setOpen] = useState(true);
  if (!trace.length) return null;

  return (
    <div className="mt-3 rounded-lg border border-border bg-black/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-300 hover:bg-white/5"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        <Wrench className="w-3.5 h-3.5 text-accent" />
        How I got this ({trace.length} tool call{trace.length === 1 ? "" : "s"})
      </button>
      {open && (
        <div className="space-y-3 border-t border-border p-3">
          {trace.map((step) => (
            <div key={step.step} className="rounded-md border border-border/80 bg-card/60 p-3">
              <div className="flex items-center gap-2 text-xs">
                <span className="rounded bg-accent/15 px-1.5 py-0.5 font-mono text-accent">
                  step {step.step}
                </span>
                <span className="font-semibold text-foreground">{step.tool}</span>
                {step.tool === "search_civic_knowledge" && (
                  <BookOpen className="w-3.5 h-3.5 text-purple-400" />
                )}
                {step.tool === "get_ward_health_risk" && (
                  <HeartPulse className="w-3.5 h-3.5 text-rose-400" />
                )}
                {step.tool.includes("complaint") && (
                  <Droplets className="w-3.5 h-3.5 text-cyan-400" />
                )}
              </div>
              {step.reasoning ? (
                <p className="mt-1 text-[11px] text-slate-500 italic">{step.reasoning}</p>
              ) : null}
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Params</p>
                  <pre className="max-h-40 overflow-auto rounded bg-black/40 p-2 text-[11px] text-slate-300">
                    {JSON.stringify(step.params, null, 2)}
                  </pre>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">
                    Real result
                  </p>
                  {step.tool === "search_civic_knowledge" &&
                  Array.isArray((step.result as { matches?: unknown[] }).matches) ? (
                    <div className="space-y-2 max-h-48 overflow-auto">
                      {((step.result as { matches: Array<Record<string, unknown>> }).matches).map(
                        (m, i) => (
                          <div
                            key={i}
                            className="rounded border border-purple-500/20 bg-purple-500/5 p-2 text-[11px]"
                          >
                            <div className="flex justify-between gap-2 text-purple-300">
                              <span className="font-medium">{String(m.source)}</span>
                              <span className="font-mono">
                                sim {Number(m.similarity ?? 0).toFixed(3)}
                              </span>
                            </div>
                            <p className="mt-1 text-slate-300 whitespace-pre-wrap">
                              {String(m.text)}
                            </p>
                          </div>
                        )
                      )}
                    </div>
                  ) : (
                    <pre className="max-h-40 overflow-auto rounded bg-black/40 p-2 text-[11px] text-slate-300">
                      {JSON.stringify(step.result, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
              <ToolResultCards step={step} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AgentPage() {
  const { role, setRole, setShowSelector, openSelectorWithHighlight } = useRole();
  const [messages, setMessages] = useState<ChatTurn[]>([
    {
      role: "assistant",
      content:
        "I'm the Civic Agent. Ask me anything about DystopiaCITY — ward status, complaints, traffic, or city metabolism. I back up my facts with real municipal database tools.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);

  const send = async () => {
    const userMsg = sanitizeChatMessage(input);
    if (!userMsg || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: userMsg }]);
    setLoading(true);
    setProgressLabel("Step 1/5: deciding next action…");
    try {
      const history = messages
        .filter((m) => m.role === "user" || (m.role === "assistant" && m.trace))
        .map((m) => ({ role: m.role, content: m.content }));
      const res: AgentChatResponse = await api.agent.chatStream(
        userMsg,
        history,
        (ev) => setProgressLabel(ev.label),
        role
      );
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: res.answer,
          trace: res.trace,
          truncated: res.truncated,
          suggested_department: res.suggested_department,
        },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content:
            "Could not reach the Civic Agent API. Is the backend running on port 8000?",
        },
      ]);
    } finally {
      setLoading(false);
      setProgressLabel(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-border px-6 py-5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="rounded-lg border border-accent/30 bg-accent/10 p-2">
            <Bot className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Ask CityPulse anything</h1>
            <p className="text-sm text-slate-400">
              Gemma function-calling over live backend tools — every fact is tool-backed
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowSelector(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-white/5 hover:bg-white/10 text-xs font-semibold transition-colors text-slate-300 hover:text-white"
        >
          <Building2 className="w-4 h-4 text-accent" />
          <span>Departments</span>
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={clsx(
              "max-w-3xl",
              msg.role === "user" ? "ml-auto" : "mr-auto"
            )}
          >
            <div
              className={clsx(
                "rounded-xl px-4 py-3 text-sm whitespace-pre-wrap",
                msg.role === "user"
                  ? "bg-accent/15 text-accent border border-accent/20"
                  : "bg-card border border-border text-slate-200"
              )}
            >
              {msg.content}
              {msg.truncated ? (
                <p className="mt-2 text-[11px] text-amber-400">
                  Step limit reached — answer may be incomplete.
                </p>
              ) : null}
              {msg.suggested_department && (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => {
                      // Call setRole directly — this is the real state change that updates
                      // localStorage, the sidebar Active Role label, and navigates to the
                      // department panel. openSelectorWithHighlight() only opens a modal
                      // without actually committing the role, which is the bug we fixed.
                      setRole(msg.suggested_department as Role);
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 bg-accent hover:bg-accent-dim text-black font-semibold rounded-lg text-xs transition-all shadow"
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    <span>Switch to {ROLE_LABELS[msg.suggested_department as Role]} Panel</span>
                  </button>
                </div>
              )}
            </div>
            {msg.trace ? <TracePanel trace={msg.trace} /> : null}
          </div>
        ))}
        {loading && (
          <div className="text-sm text-accent/90 animate-pulse flex items-center gap-2">
            <Wrench className="w-3.5 h-3.5" />
            {progressLabel || "Agent is calling tools…"}
          </div>
        )}
      </div>

      <div className="border-t border-border p-4 shrink-0">
        <div className="mx-auto flex max-w-3xl gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
            placeholder="e.g. What's the health risk in Koramangala?"
            className="flex-1 rounded-lg border border-border bg-black/30 px-4 py-3 text-sm outline-none focus:border-accent text-white"
            disabled={loading}
          />
          <button
            type="button"
            onClick={send}
            disabled={loading || !input.trim()}
            className="rounded-lg bg-accent px-4 py-3 text-black font-medium disabled:opacity-40 hover:bg-accent-dim flex items-center justify-center"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
