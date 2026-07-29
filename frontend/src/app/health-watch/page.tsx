"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import {
  HeartPulse, TrendingUp, TrendingDown, Minus, RefreshCw,
  ChevronDown, ChevronRight, AlertCircle, Activity, Info,
  Search, ArrowUpDown, GitCompare, X, RotateCcw,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  BarChart, Bar, Cell, LabelList,
} from "recharts";
import clsx from "clsx";
import { api, HealthWatchWard, HealthWatchWardDetail } from "@/lib/api";
import MapboxMap from "@/components/MapboxMap";
import DataSourceBadge from "@/components/DataSourceBadge";
import StatCard from "@/components/StatCard";
import ReasoningBox from "@/components/ReasoningBox";
import type { DataSourceType } from "@/components/DataSourceBadge";

type SortKey     = "risk" | "alpha" | "trend";
type QuickFilter = "all" | "up" | "high";

function riskColor(s: number) {
  return s >= 65 ? "text-red-400" : s >= 40 ? "text-yellow-400" : "text-emerald-400";
}
function riskBg(s: number) {
  return s >= 65 ? "border-red-500/40 bg-red-500/5"
       : s >= 40 ? "border-yellow-500/40 bg-yellow-500/5"
                : "border-emerald-500/40 bg-emerald-500/5";
}
function riskHex(s: number) { return s >= 65 ? "#ef4444" : s >= 40 ? "#f59e0b" : "#10b981"; }
function riskLabel(s: number) { return s >= 65 ? "High" : s >= 40 ? "Medium" : "Low"; }
function safeSourceType(t?: string): DataSourceType {
  if (t === "live" || t === "reported" || t === "estimated") return t;
  return "estimated";
}
function timeAgo(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (d < 1) return "just now";
  if (d < 60) return `${d}m ago`;
  return `${Math.floor(d / 60)}h ago`;
}

// ─────────────────────────────────────────────────────────────────────────────
// TrendIcon
// ─────────────────────────────────────────────────────────────────────────────

function TrendIcon({ trend, showLabel = false }: { trend: string; showLabel?: boolean }) {
  const icon =
    trend === "up"   ? <TrendingUp  className="w-3.5 h-3.5 text-red-400"      aria-hidden /> :
    trend === "down" ? <TrendingDown className="w-3.5 h-3.5 text-emerald-400" aria-hidden /> :
                       <Minus        className="w-3.5 h-3.5 text-slate-500"   aria-hidden />;
  if (!showLabel) return icon;
  const lbl = trend === "up" ? "Rising" : trend === "down" ? "Falling" : "Stable";
  return <span className="flex items-center gap-1 text-[10px] text-slate-400">{icon}{lbl}</span>;
}

// ─────────────────────────────────────────────────────────────────────────────
// ScoreBreakdown — expandable formula panel with aria-expanded/aria-controls
// ─────────────────────────────────────────────────────────────────────────────

function ScoreBreakdown({ scoring }: { scoring: HealthWatchWard["scoring"] }) {
  const [open, setOpen] = useState(false);
  const panelId = "score-breakdown-panel";
  const rows = [
    {
      key: "stagnant_reports",
      label: "Stagnant Water Reports (7d)",
      raw: `${scoring.components.stagnant_reports.raw_value ?? 0} reports`,
      norm: scoring.components.stagnant_reports.normalised,
      w: scoring.components.stagnant_reports.weight,
      ref: `0–${scoring.components.stagnant_reports.ceiling} reports`,
    },
    {
      key: "heat_index",
      label: "Heat Index (temp anomaly)",
      raw: `+${scoring.components.heat_index.anomaly_c ?? 0}°C above 28°C norm`,
      norm: scoring.components.heat_index.normalised,
      w: scoring.components.heat_index.weight,
      ref: `0–${scoring.components.heat_index.ceiling_anomaly}°C anomaly`,
    },
    {
      key: "complaint_density",
      label: "Health Complaints (7d)",
      raw: `${scoring.components.complaint_density.raw_value ?? 0} complaints`,
      norm: scoring.components.complaint_density.normalised,
      w: scoring.components.complaint_density.weight,
      ref: `0–${scoring.components.complaint_density.ceiling} complaints`,
    },
    {
      key: "metabolism_stress",
      label: "Metabolism Water Stress",
      raw: `${scoring.components.metabolism_stress.raw_value ?? 0}% water delta`,
      norm: scoring.components.metabolism_stress.normalised,
      w: scoring.components.metabolism_stress.weight,
      ref: `0 to −${scoring.components.metabolism_stress.ceiling}% delta`,
    },
  ];

  return (
    <div className="rounded-lg border border-border/60 bg-slate-950/40 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={panelId}
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-slate-300 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent transition-colors"
      >
        <span className="font-semibold uppercase tracking-wider text-slate-400">How is this calculated?</span>
        {open ? <ChevronDown className="w-4 h-4" aria-hidden /> : <ChevronRight className="w-4 h-4" aria-hidden />}
      </button>
      <div id={panelId} className={clsx("animate-fade-in", !open && "hidden")}>
        <div className="px-4 pb-4 space-y-3">
          <p className="text-[10px] font-mono text-slate-400 bg-slate-900/60 rounded px-2 py-1.5 leading-relaxed">
            {scoring.formula}
          </p>
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.key} className="text-xs space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-slate-300 font-medium">{r.label}</span>
                  <span className="font-mono text-slate-400">{r.raw}</span>
                </div>
                <div
                  className="flex items-center gap-2"
                  role="meter"
                  aria-label={`${r.label}: ${(r.norm * 100).toFixed(0)}%`}
                  aria-valuenow={r.norm * 100}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div className="flex-1 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-accent transition-all duration-500"
                      style={{ width: `${r.norm * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 w-20 text-right">
                    {(r.norm * r.w * 100).toFixed(1)} / {(r.w * 100).toFixed(0)} pts
                  </span>
                </div>
                <p className="text-[10px] text-slate-600">ref: {r.ref} · weight {(r.w * 100).toFixed(0)}%</p>
              </div>
            ))}
          </div>
          <div className="pt-1 border-t border-border/40 text-[10px] text-slate-500">
            Each input normalised 0–1, weighted, summed (max = 100).
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MetabolismLink — null guard + degraded state
// ─────────────────────────────────────────────────────────────────────────────

function MetabolismLink({ link }: { link: HealthWatchWard["metabolism_link"] | null }) {
  if (!link) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-slate-700/40 bg-slate-900/30 px-3 py-2 text-xs text-slate-500">
        <Activity className="w-3.5 h-3.5 shrink-0" aria-hidden />
        <span>Metabolism data unavailable — not contributing to score</span>
      </div>
    );
  }
  const hasStress = link.active_stress_test && link.active_stress_test !== "none";
  const deltaLabel =
    link.water_supply_delta < 0
      ? `water supply down ${Math.abs(link.water_supply_delta).toFixed(1)}%`
      : link.water_supply_delta > 0
      ? `water supply up ${link.water_supply_delta.toFixed(1)}%`
      : "water supply at baseline";

  return (
    <div
      className={clsx(
        "flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs",
        hasStress
          ? "border-orange-500/30 bg-orange-500/5 text-orange-300"
          : "border-slate-700/50 bg-slate-900/30 text-slate-400",
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Activity className="w-3.5 h-3.5 shrink-0" aria-hidden />
        <span className="truncate">
          {hasStress ? (
            <><span className="font-semibold">Active stress:</span> {link.active_stress_test} — {deltaLabel}</>
          ) : (
            <>City Metabolism: {deltaLabel}</>
          )}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <DataSourceBadge type={safeSourceType(link.source_type)} detail={link.source_detail} />
        <Link
          href="/metabolism"
          className="text-accent hover:underline font-semibold whitespace-nowrap focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent rounded"
        >
          View ↗
        </Link>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TrendSparkline — Recharts LineChart
// ─────────────────────────────────────────────────────────────────────────────

function TrendSparkline({ series }: { series: { date: string; score: number }[] }) {
  const data = series.map((d) => ({ label: d.date.slice(5), score: d.score }));
  return (
    <div className="h-[80px] w-full" role="img" aria-label="7-day risk trend chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#64748b" }} tickLine={false} axisLine={false} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "#64748b" }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 6, fontSize: 11 }}
            labelStyle={{ color: "#94a3b8" }}
            itemStyle={{ color: "#06b6d4" }}
            formatter={(v: unknown) => [`${Number(v).toFixed(1)}`, "Risk"]}
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke="#06b6d4"
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3, fill: "#06b6d4" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GemmaDebugToggle — expandable with aria-expanded/aria-controls
// ─────────────────────────────────────────────────────────────────────────────

function GemmaDebugToggle({
  prompts,
}: {
  prompts: NonNullable<HealthWatchWardDetail["gemma"]>["prompts_debug"];
}) {
  const [open, setOpen] = useState(false);
  const panelId = "gemma-debug-panel";
  return (
    <div className="rounded-lg border border-border/40 bg-slate-950/20 overflow-hidden text-xs">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={panelId}
        className="w-full flex items-center gap-2 px-3 py-2 text-slate-500 hover:text-slate-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent transition-colors"
      >
        {open ? <ChevronDown className="w-3 h-3" aria-hidden /> : <ChevronRight className="w-3 h-3" aria-hidden />}
        <span className="font-mono">Dev: view raw Gemma prompts</span>
      </button>
      <div id={panelId} className={clsx(!open && "hidden")}>
        <div className="px-3 pb-3 space-y-2 animate-fade-in">
          {[
            { label: "Call 1 — Causal system",       text: prompts.causal_system },
            { label: "Call 1 — Causal user",          text: prompts.causal_user },
            { label: "Call 2 — Intervention system",  text: prompts.intervention_system },
            { label: "Call 2 — Intervention user",    text: prompts.intervention_user },
          ].map(({ label, text }) => (
            <div key={label}>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{label}</p>
              <pre className="text-[10px] font-mono text-slate-400 bg-slate-900/60 rounded p-2 whitespace-pre-wrap leading-relaxed overflow-x-auto">
                {text}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WardDetailContent — shared by single-ward view AND compare columns
// ─────────────────────────────────────────────────────────────────────────────

function WardDetailContent({ ward }: { ward: HealthWatchWard }) {
  const feat = ward.features;
  const sb   = ward.source_badges;
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold text-slate-100">{ward.ward_name}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <TrendIcon trend={ward.trend} showLabel />
          </div>
        </div>
        <div className={clsx("rounded-lg border px-3 py-1.5 text-center min-w-[60px]", riskBg(ward.risk_score))}>
          <p className="text-[9px] text-slate-400 uppercase">Risk</p>
          <p className={clsx("text-xl font-black", riskColor(ward.risk_score))}>{ward.risk_score.toFixed(0)}</p>
          <p className="text-[8px] text-slate-500">/ 100 · {riskLabel(ward.risk_score)}</p>
        </div>
      </div>

      <div className="rounded-lg border border-border/60 bg-slate-900/30 p-2">
        <p className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold mb-1">7-Day Trend</p>
        <TrendSparkline series={ward.trend_series} />
      </div>

      <ScoreBreakdown scoring={ward.scoring} />

      <div className="rounded-lg border border-border/60 bg-slate-950/40 p-3 space-y-2">
        <p className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">Contributing Inputs</p>
        {[
          {
            label: "Temp",
            value: `${feat.temp_c}°C (+${feat.temp_anomaly_c}°C)`,
            badge: sb.weather,
          },
          {
            label: "Rainfall 7d",
            value: `${feat.rainfall_7d_mm} mm`,
            badge: sb.weather,
          },
          {
            label: "Stagnant reports",
            value: `${feat.stagnant_reports_7d} in 7d`,
            badge: sb.stagnant_reports,
          },
          {
            label: "Health complaints",
            value: `${feat.complaint_count_7d} in 7d`,
            badge: sb.complaints,
          },
          {
            label: "Metabolism delta",
            value: `${feat.metabolism_water_delta_pct > 0 ? "+" : ""}${feat.metabolism_water_delta_pct}%`,
            badge: sb.metabolism,
          },
        ].map(({ label, value, badge }) => (
          <div key={label} className="flex items-center justify-between gap-2 text-xs">
            <span className="text-slate-400 shrink-0">{label}</span>
            <span className="text-slate-200 font-medium text-right flex-1">{value}</span>
            <DataSourceBadge type={safeSourceType(badge?.source_type)} detail={badge?.source_detail} />
          </div>
        ))}
        {Object.keys(feat.complaint_categories).length > 0 && (
          <div className="pt-1 border-t border-border/40 flex flex-wrap gap-1">
            {Object.entries(feat.complaint_categories).map(([cat, cnt]) => (
              <span
                key={cat}
                className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300"
              >
                {cat.replace(/_/g, " ")} ×{cnt}
              </span>
            ))}
          </div>
        )}
      </div>

      <MetabolismLink link={ward.metabolism_link} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GemmaSection — THREE states: loading / error+retry / success / null-guard
// ─────────────────────────────────────────────────────────────────────────────

function GemmaSection({
  detail,
  loading,
  wardId,
  onRetry,
}: {
  detail: HealthWatchWardDetail | null;
  loading: boolean;
  wardId: number;
  onRetry: () => void;
}) {
  // State 1 — loading
  if (loading) {
    return (
      <div
        className="rounded-lg border border-accent/20 bg-accent/5 p-4 animate-pulse"
        role="status"
        aria-live="polite"
      >
        <p className="text-xs text-accent font-medium">
          Gemma 4 — generating explanation (parallel calls)…
        </p>
      </div>
    );
  }

  // State 2 — error with retry (ward-id scoped)
  if (detail?.gemma_error && detail.ward_id === wardId) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 space-y-3" role="alert">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" aria-hidden />
          <div>
            <p className="text-xs font-semibold text-red-300">Gemma explanation unavailable</p>
            <p className="text-[10px] text-red-400/70 mt-0.5 font-mono">{detail.gemma_error}</p>
          </div>
        </div>
        <button
          onClick={onRetry}
          className="flex items-center gap-1.5 text-xs text-slate-200 bg-slate-800 border border-slate-700 rounded px-3 py-1.5 hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent transition-colors"
        >
          <RotateCcw className="w-3 h-3" aria-hidden /> Retry
        </button>
      </div>
    );
  }

  // State 3 — success with Gemma data (ward-id scoped)
  if (detail?.gemma && detail.ward_id === wardId) {
    const { gemma } = detail;
    return (
      <div className="space-y-3" aria-live="polite">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">
            Gemma 4 Analysis
          </span>
          {gemma.generated_at && (
            <span
              className="text-[9px] text-slate-600 font-mono"
              title={gemma.generated_at}
            >
              Generated {timeAgo(gemma.generated_at)}
              {gemma.gemma_elapsed_ms ? ` · ${gemma.gemma_elapsed_ms}ms` : ""}
            </span>
          )}
        </div>
        <ReasoningBox reasoning={gemma.explanation} title="Causal Explanation" />
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
          <p className="text-xs font-medium text-emerald-400 mb-1">Recommended Action — Gemma 4</p>
          <p className="text-sm text-slate-200 leading-relaxed">{gemma.intervention}</p>
        </div>
        <GemmaDebugToggle prompts={gemma.prompts_debug} />
      </div>
    );
  }

  // State 4 — stale-ward guard / nothing to show
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// CityRiskChart — horizontal bar chart, sorted descending
// ─────────────────────────────────────────────────────────────────────────────

function CityRiskChart({
  wards,
  onSelectWard,
}: {
  wards: HealthWatchWard[];
  onSelectWard: (id: number) => void;
}) {
  const data = [...wards]
    .sort((a, b) => b.risk_score - a.risk_score)
    .map((w) => ({ name: w.ward_name, score: w.risk_score, id: w.ward_id, trend: w.trend }));

  return (
    <div
      className="rounded-xl border border-border bg-slate-900/10 p-4 space-y-2"
      role="img"
      aria-label="City-wide risk score chart for all wards"
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          City-wide Risk Overview
        </p>
        <div className="flex items-center gap-3 text-[10px] text-slate-500">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" aria-hidden /> Low &lt;40
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" aria-hidden /> Med 40–65
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500 inline-block" aria-hidden /> High ≥65
          </span>
        </div>
      </div>
      <div style={{ height: data.length * 22 + 20 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 0, right: 48, left: 90, bottom: 0 }}
            onClick={(e) => {
              const payload = (e as unknown as { activePayload?: Array<{ payload: { id: number } }> })
                ?.activePayload?.[0]?.payload;
              if (payload) onSelectWard(payload.id);
            }}
          >
            <XAxis
              type="number"
              domain={[0, 100]}
              tick={{ fontSize: 9, fill: "#64748b" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              tickLine={false}
              axisLine={false}
              width={88}
            />
            <Tooltip
              contentStyle={{
                background: "#111827",
                border: "1px solid #1e293b",
                borderRadius: 6,
                fontSize: 11,
              }}
              formatter={(
                v: unknown,
                _: unknown,
                p: { payload?: { trend?: string } },
              ) => [
                `${Number(v).toFixed(1)} / 100 · ${p.payload?.trend ?? ""}`,
                "Risk Score",
              ]}
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
            />
            <Bar dataKey="score" radius={[0, 3, 3, 0]} style={{ cursor: "pointer" }}>
              {data.map((entry) => (
                <Cell key={entry.id} fill={riskHex(entry.score)} fillOpacity={0.8} />
              ))}
              <LabelList
                dataKey="score"
                position="right"
                style={{ fill: "#94a3b8", fontSize: 9 }}
                formatter={(v: unknown) => String(Number(v).toFixed(0))}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[9px] text-slate-600 text-right">Click a bar to open ward detail</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CompareWardCard — compact single-ward card for compare mode
// No sparkline, collapsed inputs (top 2 by weight shown, rest expandable),
// ScoreBreakdown collapsed by default.
// ─────────────────────────────────────────────────────────────────────────────

function CompareWardCard({
  ward,
  detail,
  loading,
  onRemove,
}: {
  ward: HealthWatchWard;
  detail: HealthWatchWardDetail | null;
  loading: boolean;
  onRemove: () => void;
}) {
  const [showAllInputs, setShowAllInputs] = useState(false);
  const feat = ward.features;
  const sb   = ward.source_badges;

  // All 5 inputs ranked by their weighted contribution (descending)
  const allInputs = [
    { label: "Stagnant reports",  value: `${feat.stagnant_reports_7d} in 7d`,   badge: sb.stagnant_reports, weight: ward.scoring.components.stagnant_reports.weighted },
    { label: "Health complaints", value: `${feat.complaint_count_7d} in 7d`,    badge: sb.complaints,       weight: ward.scoring.components.complaint_density.weighted },
    { label: "Temp",              value: `${feat.temp_c}°C (+${feat.temp_anomaly_c}°C)`, badge: sb.weather, weight: ward.scoring.components.heat_index.weighted },
    { label: "Metabolism delta",  value: `${feat.metabolism_water_delta_pct > 0 ? "+" : ""}${feat.metabolism_water_delta_pct}%`, badge: sb.metabolism, weight: ward.scoring.components.metabolism_stress.weighted },
    { label: "Rainfall 7d",       value: `${feat.rainfall_7d_mm} mm`,            badge: sb.weather,          weight: 0 },
  ].sort((a, b) => b.weight - a.weight);

  const visibleInputs = showAllInputs ? allInputs : allInputs.slice(0, 2);

  return (
    <div className="rounded-xl border border-border bg-slate-900/10 p-3 space-y-3 flex flex-col">
      {/* Header: name + risk badge + remove */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-sm text-slate-100 truncate">{ward.ward_name}</p>
          <TrendIcon trend={ward.trend} showLabel />
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <div className={clsx("rounded-lg border px-2.5 py-1 text-center", riskBg(ward.risk_score))}>
            <p className="text-[9px] text-slate-400 uppercase leading-none">Risk</p>
            <p className={clsx("text-lg font-black leading-tight", riskColor(ward.risk_score))}>{ward.risk_score.toFixed(0)}</p>
            <p className="text-[8px] text-slate-500 leading-none">{riskLabel(ward.risk_score)}</p>
          </div>
          <button
            onClick={onRemove}
            aria-label={`Remove ${ward.ward_name} from comparison`}
            className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <X className="w-3.5 h-3.5" aria-hidden />
          </button>
        </div>
      </div>

      {/* Score formula — collapsed by default */}
      <ScoreBreakdown scoring={ward.scoring} />

      {/* Top inputs — compact, 2 shown by default */}
      <div className="rounded-lg border border-border/60 bg-slate-950/40 p-2.5 space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">Key Inputs</p>
          <button
            onClick={() => setShowAllInputs((v) => !v)}
            className="text-[9px] text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            aria-expanded={showAllInputs}
          >
            {showAllInputs ? "Less" : `+${allInputs.length - 2} more`}
          </button>
        </div>
        {visibleInputs.map(({ label, value, badge }) => (
          <div key={label} className="flex items-center justify-between gap-1.5 text-xs">
            <span className="text-slate-400 shrink-0">{label}</span>
            <span className="text-slate-200 font-medium text-right flex-1 truncate">{value}</span>
            <DataSourceBadge type={safeSourceType(badge?.source_type)} detail={badge?.source_detail} />
          </div>
        ))}
      </div>

      {/* Metabolism cross-link — compact */}
      <MetabolismLink link={ward.metabolism_link} />

      {/* Gemma section */}
      <div className="flex-1">
        {loading ? (
          <div className="rounded-lg border border-accent/20 bg-accent/5 p-2.5 animate-pulse text-xs text-accent" role="status">
            Gemma loading…
          </div>
        ) : detail?.gemma && detail.ward_id === ward.ward_id ? (
          <div className="space-y-2">
            <ReasoningBox reasoning={detail.gemma.explanation} title="Causal Explanation" />
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2.5">
              <p className="text-[10px] font-medium text-emerald-400 mb-1">Recommended Action</p>
              <p className="text-xs text-slate-200 leading-relaxed">{detail.gemma.intervention}</p>
            </div>
            {detail.gemma.generated_at && (
              <p className="text-[9px] text-slate-600 text-right font-mono">
                Generated {timeAgo(detail.gemma.generated_at)}
              </p>
            )}
          </div>
        ) : detail?.gemma_error ? (
          <p className="text-xs text-red-400/80">Gemma unavailable: {detail.gemma_error}</p>
        ) : null}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ComparePanel — side-by-side 2 or 3 wards
// ─────────────────────────────────────────────────────────────────────────────

function ComparePanel({
  wards,
  compareIds,
  onRemove,
  detailMap,
  loadingSet,
}: {
  wards: HealthWatchWard[];
  compareIds: number[];
  onRemove: (id: number) => void;
  detailMap: Map<number, HealthWatchWardDetail>;
  loadingSet: Set<number>;
}) {
  const cols = compareIds
    .map((id) => wards.find((w) => w.ward_id === id))
    .filter(Boolean) as HealthWatchWard[];

  if (cols.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/50 p-8 text-center text-slate-500 text-sm">
        <GitCompare className="w-6 h-6 mx-auto mb-2 text-slate-700" aria-hidden />
        Select 2 or 3 wards from the list to compare them side by side.
      </div>
    );
  }

  return (
    <div className={clsx("grid gap-3", cols.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
      {cols.map((ward) => (
        <CompareWardCard
          key={ward.ward_id}
          ward={ward}
          detail={detailMap.get(ward.ward_id) ?? null}
          loading={loadingSet.has(ward.ward_id)}
          onRemove={() => onRemove(ward.ward_id)}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main HealthWatchPage
// ─────────────────────────────────────────────────────────────────────────────

export default function HealthWatchPage() {
  // Core data state
  const [wards, setWards]                     = useState<HealthWatchWard[]>([]);
  const [loadingList, setLoadingList]         = useState(true);
  const [listError, setListError]             = useState<string | null>(null);
  const [refreshing, setRefreshing]           = useState(false);

  // Single-ward detail
  const [selectedId, setSelectedId]           = useState<number | null>(null);
  const [detail, setDetail]                   = useState<HealthWatchWardDetail | null>(null);
  const [loadingDetail, setLoadingDetail]     = useState(false);
  const inflightRef                           = useRef<number | null>(null);

  // Compare mode
  const [compareMode, setCompareMode]         = useState(false);
  const [compareIds, setCompareIds]           = useState<number[]>([]);
  const [compareDetails, setCompareDetails]   = useState<Map<number, HealthWatchWardDetail>>(new Map());
  const [compareLoading, setCompareLoading]   = useState<Set<number>>(new Set());

  // Search / filter / sort
  const [search, setSearch]                   = useState("");
  const [sortKey, setSortKey]                 = useState<SortKey>("risk");
  const [quickFilter, setQuickFilter]         = useState<QuickFilter>("all");

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadWards = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    try {
      setWards(await api.healthWatch.wards());
    } catch (e) {
      setListError(`Failed to load ward data: ${String(e)}`);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => { loadWards(); }, [loadWards]);

  const selectWard = useCallback(async (wardId: number) => {
    if (compareMode) {
      // Toggle ward into/out of compareIds (max 3)
      setCompareIds((prev) => {
        if (prev.includes(wardId)) return prev.filter((id) => id !== wardId);
        if (prev.length >= 3) return prev;
        return [...prev, wardId];
      });
      // Fetch detail for compare column if not already loaded
      if (!compareDetails.has(wardId)) {
        setCompareLoading((s) => new Set([...s, wardId]));
        try {
          const d = await api.healthWatch.wardDetail(wardId);
          setCompareDetails((m) => new Map([...m, [wardId, d]]));
        } finally {
          setCompareLoading((s) => {
            const n = new Set(s);
            n.delete(wardId);
            return n;
          });
        }
      }
      return;
    }

    // Single-ward mode with inflightRef race-condition guard
    setSelectedId(wardId);
    setDetail(null);
    setLoadingDetail(true);
    inflightRef.current = wardId;
    try {
      const d = await api.healthWatch.wardDetail(wardId);
      if (inflightRef.current === wardId) setDetail(d);
    } catch (e) {
      if (inflightRef.current === wardId) console.error("Ward detail failed:", e);
    } finally {
      if (inflightRef.current === wardId) setLoadingDetail(false);
    }
  }, [compareMode, compareDetails]);

  const retryDetail = useCallback(() => {
    if (selectedId !== null) {
      setDetail(null);
      selectWard(selectedId);
    }
  }, [selectedId, selectWard]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await api.healthWatch.refresh();
      await loadWards();
      if (selectedId !== null && !compareMode) selectWard(selectedId);
    } finally {
      setRefreshing(false);
    }
  };

  // ── Derived / filtered ward list ──────────────────────────────────────────

  const filteredWards = useMemo(() => {
    let list = [...wards];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((w) => w.ward_name.toLowerCase().includes(q));
    }
    if (quickFilter === "up")   list = list.filter((w) => w.trend === "up");
    if (quickFilter === "high") list = list.filter((w) => w.risk_score >= 65);
    if (sortKey === "risk")  list.sort((a, b) => b.risk_score - a.risk_score);
    if (sortKey === "alpha") list.sort((a, b) => a.ward_name.localeCompare(b.ward_name));
    if (sortKey === "trend") {
      const order: Record<string, number> = { up: 0, flat: 1, down: 2 };
      list.sort((a, b) => (order[a.trend] ?? 1) - (order[b.trend] ?? 1));
    }
    return list;
  }, [wards, search, quickFilter, sortKey]);

  // ── Derived stats ─────────────────────────────────────────────────────────

  const trendingUp   = wards.filter((w) => w.trend === "up").length;
  const highRisk     = wards.filter((w) => w.risk_score >= 65).length;
  const avgScore     = wards.length
    ? Math.round(wards.reduce((s, w) => s + w.risk_score, 0) / wards.length)
    : 0;
  const selectedWard = wards.find((w) => w.ward_id === selectedId) ?? null;

  const mapMarkers = wards.map((w) => ({
    id: w.ward_id,
    lat: w.lat,
    lng: w.lng,
    color: riskHex(w.risk_score),
    className: w.trend === "up" ? "reported-marker trend-up-pulse" : "reported-marker",
    popup: `<strong>${w.ward_name}</strong><br/>Risk: ${w.risk_score.toFixed(0)} / 100 · ${riskLabel(w.risk_score)}<br/>Trend: ${w.trend}`,
  }));

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6 space-y-5">

      {/* Page header */}
      <div className="flex flex-wrap justify-between items-start gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <HeartPulse className="w-6 h-6 text-rose-400" aria-hidden />
            Public Health Early-Warning
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Ward-level environmental risk signal — transparent, rule-based scoring.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setCompareMode((v) => !v);
              if (compareMode) setCompareIds([]);
            }}
            aria-pressed={compareMode}
            className={clsx(
              "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
              compareMode
                ? "bg-accent/10 border-accent/40 text-accent"
                : "bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700",
            )}
          >
            <GitCompare className="w-3.5 h-3.5" aria-hidden />
            {compareMode ? `Compare (${compareIds.length}/3)` : "Compare"}
          </button>
          <button
            onClick={refresh}
            disabled={refreshing || loadingList}
            className="flex items-center gap-2 rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent transition-colors disabled:opacity-50"
          >
            <RefreshCw className={clsx("w-3.5 h-3.5", refreshing && "animate-spin")} aria-hidden />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Trending-up banner */}
      {!loadingList && trendingUp > 0 && (
        <div
          className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3"
          role="alert"
        >
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0" aria-hidden />
          <p className="text-sm text-red-300 font-medium">
            <span className="font-bold">{trendingUp} ward{trendingUp !== 1 ? "s" : ""}</span>{" "}
            trending upward this week.
          </p>
        </div>
      )}

      {/* Ward list error state with retry */}
      {listError && (
        <div
          className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 flex items-start gap-3"
          role="alert"
        >
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" aria-hidden />
          <div className="flex-1">
            <p className="text-sm text-red-300 font-semibold">Failed to load ward data</p>
            <p className="text-xs text-red-400/70 mt-1 font-mono">{listError}</p>
          </div>
          <button
            onClick={loadWards}
            className="flex items-center gap-1.5 text-xs text-slate-200 bg-slate-800 border border-slate-700 rounded px-3 py-1.5 hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent shrink-0"
          >
            <RotateCcw className="w-3 h-3" aria-hidden /> Retry
          </button>
        </div>
      )}

      {/* Stat cards */}
      {!loadingList && !listError && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            label="Trending Up"
            value={trendingUp}
            sub="wards rising this week"
            color="red"
            sourceType="estimated"
            sourceDetail="7-day trend"
          />
          <StatCard
            label="High Risk Wards"
            value={highRisk}
            sub="score ≥ 65 / 100"
            color="yellow"
            sourceType="estimated"
            sourceDetail="Score threshold 65/100"
          />
          <StatCard
            label="City Avg Risk"
            value={`${avgScore}/100`}
            sub="across all wards"
            color="cyan"
            sourceType="estimated"
            sourceDetail="Mean of ward scores"
          />
        </div>
      )}

      {/* City overview chart */}
      {!loadingList && !listError && wards.length > 0 && (
        <CityRiskChart wards={wards} onSelectWard={selectWard} />
      )}

      {/* Main grid: map + ward list | detail / compare */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

        {/* Left: map + search/filter/sort + ward list */}
        <div className="lg:col-span-5 space-y-3">
          <div className="rounded-xl border border-border overflow-hidden h-[300px] md:h-[340px] shadow-lg bg-slate-900/10">
            <MapboxMap markers={mapMarkers} zoom={11} />
          </div>

          {/* Search + sort */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search
                className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none"
                aria-hidden
              />
              <input
                type="search"
                placeholder="Search wards…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search wards by name"
                className="w-full pl-8 pr-3 py-2 bg-slate-900/60 border border-border rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-accent"
              />
            </div>
            <button
              onClick={() =>
                setSortKey((k) =>
                  k === "risk" ? "alpha" : k === "alpha" ? "trend" : "risk",
                )
              }
              aria-label={`Sort by ${sortKey === "risk" ? "name" : sortKey === "alpha" ? "trend" : "risk score"} (currently: ${sortKey})`}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-300 hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              <ArrowUpDown className="w-3 h-3" aria-hidden />
              {sortKey === "risk" ? "Risk" : sortKey === "alpha" ? "A–Z" : "Trend"}
            </button>
          </div>

          {/* Quick-filter chips */}
          <div className="flex gap-1.5" role="group" aria-label="Filter wards">
            {(
              [
                ["all", "All"],
                ["up", "Trending up"],
                ["high", "High risk"],
              ] as [QuickFilter, string][]
            ).map(([val, lbl]) => (
              <button
                key={val}
                onClick={() => setQuickFilter(val)}
                aria-pressed={quickFilter === val}
                className={clsx(
                  "px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                  quickFilter === val
                    ? "bg-accent/15 border-accent/40 text-accent"
                    : "bg-slate-900/40 border-slate-700 text-slate-400 hover:text-slate-200",
                )}
              >
                {lbl}
              </button>
            ))}
            {(search || quickFilter !== "all") && (
              <button
                onClick={() => {
                  setSearch("");
                  setQuickFilter("all");
                }}
                aria-label="Clear filters"
                className="px-2 py-1 rounded-full text-[11px] text-slate-500 hover:text-slate-200 border border-transparent hover:border-slate-700 transition-colors"
              >
                <X className="w-3 h-3 inline" aria-hidden /> Clear
              </button>
            )}
          </div>

          {/* Ward list */}
          <div className="rounded-xl border border-border bg-slate-900/10 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border/60 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                {compareMode ? "Select to compare" : "Wards"}
              </p>
              <p className="text-[10px] text-slate-500">
                {filteredWards.length} / {wards.length}
              </p>
            </div>
            <div className="divide-y divide-border/40 max-h-[320px] overflow-y-auto" role="list">
              {loadingList
                ? Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="px-4 py-3 animate-pulse flex items-center gap-3">
                      <div className="h-3 bg-slate-800 rounded w-32" />
                      <div className="h-3 bg-slate-800 rounded w-12 ml-auto" />
                    </div>
                  ))
                : filteredWards.length === 0
                ? (
                  <p className="px-4 py-6 text-sm text-slate-500 text-center">
                    No wards match the current filter.
                  </p>
                )
                : filteredWards.map((w) => {
                    const isSelected = !compareMode && selectedId === w.ward_id;
                    const isCompared = compareMode && compareIds.includes(w.ward_id);
                    const disableAdd =
                      compareMode &&
                      compareIds.length >= 3 &&
                      !compareIds.includes(w.ward_id);
                    return (
                      <button
                        key={w.ward_id}
                        onClick={() => !disableAdd && selectWard(w.ward_id)}
                        disabled={disableAdd}
                        role="listitem"
                        aria-label={`${w.ward_name} — risk ${w.risk_score.toFixed(0)}/100, trend ${w.trend}`}
                        aria-pressed={compareMode ? isCompared : undefined}
                        className={clsx(
                          "w-full px-4 py-2.5 flex items-center gap-3 text-left transition-colors hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                          isSelected && "bg-accent/5 border-l-2 border-accent",
                          isCompared && "bg-accent/10 border-l-2 border-accent",
                          disableAdd && "opacity-40 cursor-not-allowed",
                        )}
                      >
                        <span
                          className={clsx(
                            "w-2.5 h-2.5 rounded-full shrink-0",
                            w.trend === "up" && "trend-up-pulse",
                          )}
                          style={{ background: riskHex(w.risk_score) }}
                          aria-hidden
                        />
                        <span className="text-sm text-slate-200 flex-1 font-medium truncate">
                          {w.ward_name}
                        </span>
                        <TrendIcon trend={w.trend} />
                        <span
                          className={clsx(
                            "text-sm font-bold tabular-nums w-8 text-right",
                            riskColor(w.risk_score),
                          )}
                          aria-label={`Risk ${w.risk_score.toFixed(0)}`}
                        >
                          {w.risk_score.toFixed(0)}
                        </span>
                      </button>
                    );
                  })}
            </div>
          </div>
        </div>

        {/* Right: detail or compare panel */}
        <div className="lg:col-span-7 space-y-4">
          {compareMode ? (
            <ComparePanel
              wards={wards}
              compareIds={compareIds}
              onRemove={(id) => setCompareIds((p) => p.filter((x) => x !== id))}
              detailMap={compareDetails}
              loadingSet={compareLoading}
            />
          ) : !selectedWard ? (
            <div className="rounded-xl border border-dashed border-border/50 h-full min-h-[400px] flex items-center justify-center">
              <div className="text-center text-slate-500 space-y-2 px-8">
                <HeartPulse className="w-8 h-8 mx-auto text-slate-700" aria-hidden />
                <p className="text-sm">
                  Select a ward to view its risk breakdown and Gemma analysis.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-border bg-slate-900/10 p-4">
                <WardDetailContent ward={selectedWard} />
              </div>
              <GemmaSection
                detail={detail}
                loading={loadingDetail}
                wardId={selectedId!}
                onRetry={retryDetail}
              />
            </>
          )}
        </div>
      </div>

      {/* Disclaimer */}
      <div className="flex items-start gap-3 rounded-xl border border-slate-700/50 bg-slate-900/20 px-4 py-3 text-xs text-slate-500">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-slate-600" aria-hidden />
        <p className="leading-relaxed">
          <span className="font-semibold text-slate-400">Environmental risk signal only.</span>{" "}
          This module is a municipal planning tool — it does not diagnose individuals, detect
          disease in specific people, or replace epidemiological surveillance.{" "}
          <span className="font-semibold text-slate-400">
            Any <span className="text-blue-400/80">Simulated</span> data is synthetic and for
            demonstration only.
          </span>{" "}
          Complaint and stagnant-water inputs are backed by{" "}
          <span className="text-yellow-400/80">fixture data</span> pending branch merge.
        </p>
      </div>

    </div>
  );
}
