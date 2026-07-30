"use client";

import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { api, BusRoute, RouteRecommendation } from "@/lib/api";
import ReasoningBox from "@/components/ReasoningBox";
import StatCard from "@/components/StatCard";
import DataSourceBadge from "@/components/DataSourceBadge";
import { TiltCard } from "@/components/TiltCard";

export default function TrustScorePage() {
  const [routes, setRoutes] = useState<BusRoute[]>([]);
  const [slot, setSlot] = useState("8AM");
  const [origin, setOrigin] = useState("Hebbal");
  const [dest, setDest] = useState("Jayanagar");
  const [recommendation, setRecommendation] = useState<RouteRecommendation | null>(null);

  const load = async () => {
    const r = await api.trustScore.routes(slot);
    setRoutes(r);
  };

  useEffect(() => { load(); }, [slot]);

  const getRecommendation = async () => {
    const rec = await api.trustScore.recommend({ origin, destination: dest, time_slot: slot });
    setRecommendation(rec);
  };

  const report = async (id: number, onTime: boolean) => {
    await api.trustScore.report(id, onTime);
    load();
  };

  const avgScore = routes.length
    ? (routes.reduce((a, r) => a + r.trust_score, 0) / routes.length).toFixed(1)
    : "—";

  return (
    <div className="page-panel">
      <TiltCard>
        <div className="mb-6">
          <h1 className="page-title">Public Transport Trust Score</h1>
          <p className="text-slate-400 text-sm mt-2">Reliability predictions to keep commuters on buses</p>
          <div className="mt-2 flex gap-2">
            <DataSourceBadge type="reported" detail="Real route names/stops from transit structure" />
            <DataSourceBadge type="estimated" detail="Delay variance and trust score modeling" />
          </div>
        </div>
      </TiltCard>

      <div className="grid grid-cols-4 gap-4 mb-2">
        <StatCard label="Routes Tracked" value={routes.length} color="cyan" sourceType="reported" />
        <StatCard label="Avg Trust Score" value={avgScore} color="green" sourceType="estimated" />
        <StatCard label="Best Route" value={routes[0] ? `Route ${routes[0].route_number}` : "—"} color="purple" sourceType="estimated" />
        <StatCard label="Time Slot" value={slot} color="yellow" sourceType="reported" />
      </div>

      <div className="flex gap-4 items-end">
        <div>
          <label className="text-xs text-slate-400">Time Slot</label>
          <select value={slot} onChange={(e) => setSlot(e.target.value)} className="block mt-1 bg-white/5 border border-border rounded-lg px-3 py-2 text-sm">
            {["6AM", "8AM", "12PM", "6PM"].map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-400">From</label>
          <input value={origin} onChange={(e) => setOrigin(e.target.value)} className="block mt-1 bg-white/5 border border-border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-slate-400">To</label>
          <input value={dest} onChange={(e) => setDest(e.target.value)} className="block mt-1 bg-white/5 border border-border rounded-lg px-3 py-2 text-sm" />
        </div>
        <button onClick={getRecommendation} className="px-4 py-2 rounded-lg bg-accent text-black text-sm font-medium">
          Get AI Recommendation
        </button>
      </div>

      {recommendation && (
        <div className="rounded-xl border border-accent/30 p-4 space-y-2">
          <h3 className="font-medium text-accent">Recommended: {recommendation.recommended_route}</h3>
          <p className="text-sm">Trust Score: {recommendation.trust_score}</p>
          <ReasoningBox reasoning={recommendation.reasoning} />
          {recommendation.alternatives?.length > 0 && (
            <p className="text-xs text-slate-400">Alternatives: {recommendation.alternatives.join(", ")}</p>
          )}
        </div>
      )}

      <div className="glass-panel overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/5">
            <tr>
              <th className="text-left p-3">Route</th>
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Trust Score</th>
              <th className="text-left p-3">Avg Delay</th>
              <th className="text-left p-3">Reports</th>
              <th className="text-left p-3">Crowdsource</th>
            </tr>
          </thead>
          <tbody>
            {routes.map((r, i) => (
              <tr key={r.id} className="border-t border-border hover:bg-white/5">
                <td className="p-3">
                  <span className="font-mono font-bold text-accent">#{r.route_number}</span>
                  {i === 0 && <span className="ml-2 text-xs bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded">Top</span>}
                </td>
                <td className="p-3 text-slate-300">{r.name}</td>
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-2 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${r.trust_score}%`,
                          background: r.trust_score > 70 ? "#10b981" : r.trust_score > 45 ? "#f59e0b" : "#ef4444",
                        }}
                      />
                    </div>
                    <span>{r.trust_score}</span>
                  </div>
                </td>
                <td className="p-3">{r.avg_delay_minutes} min</td>
                <td className="p-3 text-xs text-slate-400">
                  {r.citizen_reports_on_time} on-time / {r.citizen_reports_late} late
                </td>
                <td className="p-3">
                  <div className="flex gap-1">
                    <button onClick={() => report(r.id, true)} className="p-1 rounded hover:bg-emerald-500/20 text-emerald-400"><ThumbsUp className="w-4 h-4" /></button>
                    <button onClick={() => report(r.id, false)} className="p-1 rounded hover:bg-red-500/20 text-red-400"><ThumbsDown className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="glass-panel">
        <h3 className="font-medium mb-3">Trust Score Leaderboard</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={routes} layout="vertical">
            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} stroke="#64748b" />
            <YAxis dataKey="route_number" type="category" tick={{ fontSize: 10 }} stroke="#64748b" width={40} />
            <Tooltip contentStyle={{ background: "#111827", border: "1px solid #1e293b" }} />
            <Bar dataKey="trust_score" fill="#06b6d4" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
