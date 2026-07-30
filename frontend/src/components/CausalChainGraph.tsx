"use client";

import { useEffect, useState, useRef } from "react";
import { Droplets, Zap, Car, AlertCircle, RotateCcw } from "lucide-react";
import { api } from "@/lib/api";
import clsx from "clsx";

interface Node {
  id: string;
  label: string;
  category: string;
}

interface Edge {
  source: string;
  target: string;
  coefficient: number;
  justification: string;
}

interface CausalChainGraphProps {
  scenario: string;
  onResilienceDelta: (delta: number | null) => void;
}

const nodePositions: Record<string, { x: number; y: number }> = {
  grid_load: { x: 120, y: 80 },
  water_supply: { x: 380, y: 80 },
  traffic_congestion: { x: 380, y: 280 },
  complaints: { x: 120, y: 280 },
};

// SVG viewBox dimensions â€” must match viewBox="0 0 500 360" below
const SVG_W = 500;
const SVG_H = 360;

const categoryConfig: Record<string, { icon: React.ElementType; color: string; bg: string; glow: string }> = {
  water: { icon: Droplets, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/30", glow: "shadow-[0_0_15px_rgba(96,165,250,0.5)]" },
  power: { icon: Zap, color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/30", glow: "shadow-[0_0_15px_rgba(250,204,21,0.5)]" },
  traffic: { icon: Car, color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/30", glow: "shadow-[0_0_15px_rgba(251,146,60,0.5)]" },
  complaints: { icon: AlertCircle, color: "text-red-400", bg: "bg-red-500/10 border-red-500/30", glow: "shadow-[0_0_15px_rgba(248,113,113,0.5)]" },
};

export default function CausalChainGraph({ scenario, onResilienceDelta }: CausalChainGraphProps) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [sliderVal, setSliderVal] = useState<number>(0);
  const [clampedReason, setClampedReason] = useState<string | null>(null);

  // Animation/Simulation States
  const [traceSteps, setTraceSteps] = useState<any[]>([]);
  const [animatedNodeDeltas, setAnimatedNodeDeltas] = useState<Record<string, number>>({});
  const [activeEdges, setActiveEdges] = useState<Set<string>>(new Set());
  const [inTraceMode, setInTraceMode] = useState<boolean>(false);
  const animationTimers = useRef<NodeJS.Timeout[]>([]);

  // Ref to the outer container so we can measure its rendered size
  // and map SVG coordinate space â†’ CSS pixel space for the popover.
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch Graph
  useEffect(() => {
    handleReset();
    api.metabolism.causalGraph(scenario).then((data) => {
      setNodes(data.nodes || []);
      setEdges(data.edges || []);
    });
  }, [scenario]);

  const handleReset = () => {
    animationTimers.current.forEach((t) => clearTimeout(t));
    animationTimers.current = [];
    setSelectedNode(null);
    setSliderVal(0);
    setClampedReason(null);
    setTraceSteps([]);
    setAnimatedNodeDeltas({});
    setActiveEdges(new Set());
    setInTraceMode(false);
    onResilienceDelta(null);
  };

  const handleNodeClick = (nodeId: string) => {
    if (selectedNode === nodeId) {
      handleReset();
    } else {
      setSelectedNode(nodeId);
      setSliderVal(0);
      setClampedReason(null);
      setTraceSteps([]);
      setAnimatedNodeDeltas({ [nodeId]: 0 });
      setActiveEdges(new Set());
      setInTraceMode(true);
    }
  };

  const handleSliderChange = (val: number) => {
    setSliderVal(val);
    api.metabolism.causalGraphTrace(scenario, selectedNode!, val).then((result: any) => {
      if (result.clamped) {
        setClampedReason(result.clamp_reason);
      } else {
        setClampedReason(null);
      }
      onResilienceDelta(result.final_resilience_delta);
      runPropagationAnimation(result.steps);
    });
  };

  const runPropagationAnimation = (steps: any[]) => {
    animationTimers.current.forEach((t) => clearTimeout(t));
    animationTimers.current = [];
    setTraceSteps(steps);

    const deltas: Record<string, number> = {};
    const edgesActive = new Set<string>();

    const stepsByNumber: Record<number, any[]> = {};
    steps.forEach((step) => {
      if (!stepsByNumber[step.step]) stepsByNumber[step.step] = [];
      stepsByNumber[step.step].push(step);
    });

    const maxStep = Math.max(...steps.map((s) => s.step), 0);

    for (let s = 0; s <= maxStep; s++) {
      const timer = setTimeout(() => {
        const currentSteps = stepsByNumber[s] || [];
        currentSteps.forEach((step) => {
          deltas[step.node_id] = step.value_change_pct;
          if (step.via_edge) edgesActive.add(step.via_edge);
        });
        setAnimatedNodeDeltas({ ...deltas });
        setActiveEdges(new Set(edgesActive));
      }, s * 400);
      animationTimers.current.push(timer);
    }
  };

  const getEdgeLine = (sourceId: string, targetId: string) => {
    const source = nodePositions[sourceId];
    const target = nodePositions[targetId];
    if (!source || !target) return { x1: 0, y1: 0, x2: 0, y2: 0 };
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance === 0) return { x1: source.x, y1: source.y, x2: target.x, y2: target.y };
    const x1 = source.x + (dx / distance) * 70;
    const y1 = source.y + (dy / distance) * 70;
    const x2 = target.x - (dx / distance) * 75;
    const y2 = target.y - (dy / distance) * 75;
    return { x1, y1, x2, y2 };
  };

  // Convert a node's SVG coordinate to a CSS left/top percentage inside the container.
  // The SVG viewBox is 500Ã—360; the container may be any rendered size.
  // We position the popover centred on the node's x, below its card (node.y + 50px in SVG space).
  const getPopoverStyle = (nodeId: string): React.CSSProperties => {
    const pos = nodePositions[nodeId];
    if (!pos) return {};

    // SVG coordinate of the top-left of the popover (centred on node x, below card)
    const popoverSvgX = pos.x; // will be centred via transform
    const popoverSvgY = pos.y + 52; // just below the 70px half-height of the node card

    // Clamp so the popover never goes off the bottom of the viewBox â€”
    // if the node is in the lower half (y >= 200), show ABOVE instead.
    const showAbove = pos.y >= 200;
    const anchorSvgY = showAbove ? pos.y - 52 : popoverSvgY;

    const leftPct  = (popoverSvgX / SVG_W) * 100;
    const topPct   = (anchorSvgY  / SVG_H) * 100;

    return {
      left:      `${leftPct}%`,
      top:       `${topPct}%`,
      transform: showAbove
        ? "translateX(-50%) translateY(-100%)"   // anchor to bottom-centre above the node
        : "translateX(-50%)",                      // anchor to top-centre below the node
    };
  };

  return (
    // overflow-visible so the popover HTML overlay can extend beyond the container bounds
    // if needed; position:relative so the absolute popover is scoped here.
    <div
      ref={containerRef}
      className="relative w-full h-[400px] bg-slate-900/40 border border-slate-800/80 rounded-xl shadow-lg p-4"
      style={{ overflow: "visible" }}
    >
      {/* Top Header controls â€” sits above the SVG via z-index */}
      <div className="absolute top-3 left-4 flex justify-between w-[93%] items-center z-20 pointer-events-none">
        <div>
          <h4 className="text-xs uppercase tracking-wider font-semibold text-slate-400">Interactive Causal Graph</h4>
          <p className="text-[10px] text-slate-500 mt-0.5">Click a node to simulate systemic changes</p>
        </div>
        {inTraceMode && (
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 border border-slate-700 hover:bg-slate-700 hover:text-white text-[10px] text-slate-300 transition-all font-semibold pointer-events-auto shadow-sm"
          >
            <RotateCcw className="w-3 h-3" />
            Reset Trace
          </button>
        )}
      </div>

      {/* SVG canvas â€” nodes and edges only; no popover rendered here */}
      <svg className="absolute inset-0 w-full h-full z-0" viewBox="0 0 500 360">
        <defs>
          <marker id="arrowhead-default" markerWidth="8" markerHeight="6" refX="4" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="#475569" />
          </marker>
          <marker id="arrowhead-active" markerWidth="8" markerHeight="6" refX="4" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="#10b981" />
          </marker>
        </defs>

        {/* Edges */}
        {edges.map((edge, idx) => {
          const edgeId  = `${edge.source}->${edge.target}`;
          const isActive  = activeEdges.has(edgeId);
          const isDimmed  = inTraceMode && !isActive;
          const { x1, y1, x2, y2 } = getEdgeLine(edge.source, edge.target);
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;
          return (
            <g key={idx} className="transition-opacity duration-300 pointer-events-none">
              <line
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={isActive ? "#10b981" : "#475569"}
                strokeWidth={isActive ? 2.5 : 1.5}
                markerEnd={isActive ? "url(#arrowhead-active)" : "url(#arrowhead-default)"}
                className={clsx("transition-colors duration-300", isDimmed && "opacity-20")}
              />
              {!isDimmed && (
                <g transform={`translate(${midX}, ${midY})`} className="pointer-events-auto group">
                  <title>{edge.justification}</title>
                  <rect x="-20" y="-8" width="40" height="16" rx="4"
                    className={clsx("fill-slate-900 transition-colors duration-300", isActive ? "stroke-emerald-500/50" : "stroke-slate-700")}
                  />
                  <text textAnchor="middle" dominantBaseline="central"
                    className={clsx("text-[9px] font-mono font-bold transition-colors duration-300", isActive ? "fill-emerald-400" : "fill-slate-400")}
                  >
                    {edge.coefficient > 0 ? "+" : ""}{edge.coefficient.toFixed(2)}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* Node cards â€” foreignObject contains only the card, NOT the popover */}
        {nodes.map((node) => {
          const pos      = nodePositions[node.id];
          const hasDelta = node.id in animatedNodeDeltas;
          const delta    = animatedNodeDeltas[node.id];
          const isSelected = selectedNode === node.id;
          const isDimmed   = inTraceMode && !hasDelta && !isSelected;
          const config   = categoryConfig[node.category] || categoryConfig.water;
          const Icon     = config.icon;
          if (!pos) return null;
          return (
            <foreignObject
              key={node.id}
              x={pos.x - 72}
              y={pos.y - 35}
              width="144"
              height="70"
              className="pointer-events-auto overflow-visible"
            >
              <div
                onClick={() => handleNodeClick(node.id)}
                className={clsx(
                  "w-36 rounded-lg border p-3 flex flex-col items-center justify-center cursor-pointer select-none transition-all duration-300 bg-slate-950/90 shadow-md",
                  config.bg,
                  isSelected && `${config.glow} border-accent scale-105`,
                  isDimmed && "opacity-35 hover:opacity-50",
                  !isDimmed && !isSelected && "hover:border-slate-600 hover:scale-[1.02]"
                )}
              >
                <Icon className={clsx("w-5 h-5 mb-1.5", config.color)} />
                <span className="text-[10px] font-bold text-slate-200 text-center uppercase tracking-wide">
                  {node.label}
                </span>
                {hasDelta && (
                  <span className={clsx(
                    "text-xs font-mono font-black mt-1 py-0.5 px-1.5 rounded text-[11px] animate-scale-up",
                    delta > 0  ? "bg-red-500/10 text-red-400 border border-red-500/20" :
                    delta < 0  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                                  "bg-slate-800 text-slate-400"
                  )}>
                    {delta > 0 ? "+" : ""}{delta.toFixed(1)}%
                  </span>
                )}
              </div>
            </foreignObject>
          );
        })}
      </svg>

      {/*
        â”€â”€ Popover overlay â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        Rendered as a sibling to the SVG, NOT inside a foreignObject.
        Positioned in CSS percentage coordinates derived from the node's
        SVG viewBox position, so it tracks the node correctly at any container
        size. z-index:50 places it above everything including sibling SVG elements.

        For nodes in the lower half of the graph (traffic_congestion, complaints)
        the popover opens ABOVE the node card to avoid being clipped by the
        container bottom and to prevent overlap with neighbouring nodes.
      */}
      {selectedNode && nodePositions[selectedNode] && (
        <div
          className="absolute z-50 w-44 bg-slate-950/95 border border-slate-700 p-3 rounded-lg shadow-2xl text-center pointer-events-auto animate-fade-in"
          style={getPopoverStyle(selectedNode)}
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-[9px] uppercase tracking-wider font-bold text-slate-400 mb-1.5">
            Simulate: {sliderVal > 0 ? `+${sliderVal}` : sliderVal}%
          </p>
          <input
            type="range"
            min="-30"
            max="30"
            value={sliderVal}
            onChange={(e) => handleSliderChange(parseInt(e.target.value))}
            className="w-full accent-accent bg-slate-800 rounded-lg appearance-none cursor-pointer h-1.5"
          />
          <div className="flex justify-between mt-1 text-[8px] text-slate-500 font-mono">
            <span>-30%</span>
            <span>0%</span>
            <span>+30%</span>
          </div>
          {clampedReason && (
            <p className="text-[8px] text-yellow-500 font-semibold mt-2 animate-pulse leading-normal">
              âš ï¸ {clampedReason}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
