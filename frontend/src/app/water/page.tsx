"use client";

import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid,
} from "recharts";
import { RefreshCw, Upload, ChevronDown, ChevronRight } from "lucide-react";
import { api, Ward, WaterSchedule, DemandPrediction } from "@/lib/api";
import MapboxMap from "@/components/MapboxMap";
import StatCard from "@/components/StatCard";
import PriorityBadge from "@/components/PriorityBadge";
import ReasoningBox from "@/components/ReasoningBox";
import DataSourceBadge from "@/components/DataSourceBadge";

function WardScheduleCard({ schedule }: { schedule: WaterSchedule }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-medium">{schedule.ward_name}</span>
        <div className="flex items-center gap-2">
          <PriorityBadge priority={schedule.priority} />
          <span className={`text-xs ${schedule.supply_today ? "text-emerald-400" : "text-slate-500"}`}>
            {schedule.supply_today ? "Supply Today" : "No Supply"}
          </span>
        </div>
      </div>
      {schedule.supply_today && (
        <div className="text-sm text-slate-400">
          {schedule.supply_start_time} – {schedule.supply_end_time}
        </div>
      )}
      <div className="text-xs text-slate-400">
        {schedule.allocation_litres?.toLocaleString()}L · {schedule.duration_hours}h
      </div>
      <ReasoningBox reasoning={schedule.reasoning} />
      <div className="border-t border-border pt-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex w-full items-center justify-between text-sm text-slate-300 hover:text-foreground"
        >
          <span>Supply Locations</span>
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        {open && (
          <div className="mt-2 space-y-2">
            {(schedule.sub_localities || []).map((loc) => (
              <div key={loc.name} className="flex items-center justify-between rounded bg-white/5 px-2 py-1.5 text-xs">
                <span>
                  #{loc.priority_rank} {loc.name}
                </span>
                <span className="text-slate-400">{loc.allocation_litres.toLocaleString()} L</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function WaterPage() {
  const [wards, setWards] = useState<Ward[]>([]);
  const [schedule, setSchedule] = useState<WaterSchedule[]>([]);
  const [demand, setDemand] = useState<DemandPrediction[]>([]);
  const [selectedWard, setSelectedWard] = useState<number>(1);
  const [tab, setTab] = useState<"municipality" | "citizen">("municipality");
  const [loading, setLoading] = useState(false);
  const [leakResult, setLeakResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      console.log("Starting load...");
      console.log("Testing direct fetch to localhost:8000/api/water/wards");
      const testResponse = await fetch("http://localhost:8000/api/water/wards");
      console.log("Test response status:", testResponse.status);
      const testData = await testResponse.json();
      console.log("Test response data:", testData);
      console.log("Test response length:", testData.length);
      
      // Use the test data directly to verify it works
      setWards(testData);
      
      const s = await api.water.schedule();
      console.log("Schedule response:", s);
      setSchedule(s);
      
      if (testData.length) {
        setSelectedWard(testData[0].id);
        const d = await api.water.demand(testData[0].id);
        setDemand(d);
      }
    } catch (e) {
      console.error("Load error:", e);
      setError(`Error loading data: ${e}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const regenerate = async () => {
    setLoading(true);
    const s = await api.water.generateSchedule();
    setSchedule(s);
    setLoading(false);
  };

  const wardDemand = async (id: number) => {
    setSelectedWard(id);
    const d = await api.water.demand(id);
    setDemand(d);
  };

  const handleLeakUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const result = await api.water.detectLeakage(file);
    setLeakResult(result);
    await api.water.createComplaint({
      ward_id: selectedWard,
      type: "leakage",
      description: String(result.reasoning || "Auto-detected leakage"),
    });
  };

  const supplyToday = schedule.filter((s) => s.supply_today).length;
  const highPriority = schedule.filter((s) => s.priority === "High").length;
  const totalComplaints = wards.reduce((a, w) => a + w.complaints, 0);

  const wardPolygons = wards.map((w) => {
    const sched = schedule.find((s) => s.ward_id === w.id);
    const priority = sched?.priority || "Low";
    const color = priority === "High" ? "#ef4444" : priority === "Medium" ? "#f59e0b" : "#10b981";
    return {
      id: w.id,
      coordinates: [w.polygon || [[w.lng - 0.004, w.lat - 0.004], [w.lng + 0.004, w.lat - 0.004], [w.lng + 0.004, w.lat + 0.004], [w.lng - 0.004, w.lat + 0.004], [w.lng - 0.004, w.lat - 0.004]]],
      fillColor: color,
      fillOpacity: 0.35,
      lineColor: color,
    };
  });

  const wardSchedule = schedule.find((s) => s.ward_id === selectedWard);

  return (
    <div className="p-6 space-y-6">
      {error && (
        <div className="bg-red-500/20 border border-red-500/50 p-4 rounded-lg">
          <div className="text-red-400">{error}</div>
        </div>
      )}
      <div className="bg-blue-500/20 border border-blue-500/50 p-4 rounded-lg">
        <div className="text-sm">
          <div>Debug: Wards count: {wards.length}</div>
          <div>Debug: Schedule count: {schedule.length}</div>
          <div>Debug: Loading: {loading ? "true" : "false"}</div>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">AI Smart Water Distribution</h1>
          <p className="text-slate-400 text-sm mt-1">Fair, demand-aware scheduling powered by Gemma 4</p>
          <div className="mt-2 flex gap-2">
            <DataSourceBadge type="reported" detail="Ward identities and population anchors" />
            <DataSourceBadge type="estimated" detail="Schedule, complaints, and demand forecasts are simulated/derived" />
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setTab("municipality")}
            className={`px-4 py-2 rounded-lg text-sm ${tab === "municipality" ? "bg-accent text-black" : "bg-white/5"}`}
          >
            Municipality
          </button>
          <button
            onClick={() => setTab("citizen")}
            className={`px-4 py-2 rounded-lg text-sm ${tab === "citizen" ? "bg-accent text-black" : "bg-white/5"}`}
          >
            Citizen
          </button>
          <button
            onClick={regenerate}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Regenerate Schedule
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Wards" value={wards.length} color="cyan" sourceType="reported" />
        <StatCard label="Supply Today" value={supplyToday} sub={`of ${wards.length} wards`} color="green" sourceType="estimated" />
        <StatCard label="High Priority" value={highPriority} color="red" sourceType="estimated" />
        <StatCard label="Open Complaints" value={totalComplaints} color="yellow" sourceType="estimated" />
      </div>

      {tab === "municipality" ? (
        <div className="grid grid-cols-2 gap-6">
          <div className="rounded-xl border border-border overflow-hidden h-[400px]">
            <MapboxMap polygons={wardPolygons} zoom={10.5} />
          </div>
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {schedule.map((s) => (
              <WardScheduleCard key={s.ward_id} schedule={s} />
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="rounded-xl border border-border p-4">
              <h3 className="font-medium mb-3">Your Ward Supply Status</h3>
              <select
                value={selectedWard}
                onChange={(e) => wardDemand(Number(e.target.value))}
                className="w-full bg-white/5 border border-border rounded-lg px-3 py-2 text-sm mb-4"
              >
                {wards.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
              {wardSchedule && (
                <div className="space-y-3">
                  {wardSchedule.supply_today && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Supply Window</span>
                      <span>{wardSchedule.supply_start_time} – {wardSchedule.supply_end_time}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Next Supply</span>
                    <span className={wardSchedule.supply_today ? "text-emerald-400" : "text-yellow-400"}>
                      {wardSchedule.supply_today ? "Today" : "Not scheduled today"}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Allocation</span>
                    <span>{wardSchedule.allocation_litres?.toLocaleString()} litres</span>
                  </div>
                  <ReasoningBox reasoning={wardSchedule.reasoning} />
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border p-4">
              <h3 className="font-medium mb-3">Water Conservation Tips</h3>
              <div className="space-y-2 text-sm text-slate-300">
                <p>• Fix dripping taps — saves up to 20L/day per tap</p>
                <p>• Water plants early morning or evening to reduce evaporation</p>
                <p>• Use a bucket instead of a hose for washing vehicles</p>
                <p>• Report leaks immediately via the form below</p>
              </div>
              <p className="text-xs text-accent mt-3">Ask CityPulse AI: &quot;How can I save water this summer?&quot;</p>
            </div>

            <div className="rounded-xl border border-border p-4">
              <label className="flex items-center gap-2 px-4 py-3 rounded-lg border border-dashed border-border cursor-pointer hover:border-accent/50">
                <Upload className="w-4 h-4 text-accent" />
                <span className="text-sm">Upload photo for AI detection</span>
                <input type="file" accept="image/*" className="hidden" onChange={handleLeakUpload} />
              </label>
              {leakResult && (
                <div className="mt-3">
                  <ReasoningBox reasoning={String(leakResult.reasoning)} title="Leakage Detection" />
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border p-4">
            <h3 className="font-medium mb-3">Demand Forecast (14 days)</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={demand}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="#64748b" />
                <YAxis tick={{ fontSize: 10 }} stroke="#64748b" />
                <Tooltip contentStyle={{ background: "#111827", border: "1px solid #1e293b" }} />
                <Line type="monotone" dataKey="predicted_litres" stroke="#06b6d4" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border p-4">
        <h3 className="font-medium mb-3">Ward Analytics</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={wards.slice(0, 10)}>
            <XAxis dataKey="name" tick={{ fontSize: 9 }} stroke="#64748b" angle={-30} textAnchor="end" height={60} />
            <YAxis tick={{ fontSize: 10 }} stroke="#64748b" />
            <Tooltip contentStyle={{ background: "#111827", border: "1px solid #1e293b" }} />
            <Bar dataKey="complaints" fill="#f59e0b" name="Complaints" />
            <Bar dataKey="leakage_reports" fill="#ef4444" name="Leakages" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
