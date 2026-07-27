"use client";

import { useEffect, useMemo, useState } from "react";
import { api, Complaint, Ward } from "@/lib/api";
import DataSourceBadge from "@/components/DataSourceBadge";
import LoadingSkeleton from "@/components/LoadingSkeleton";
import DataError from "@/components/DataError";
import ErrorBoundary from "@/components/ErrorBoundary";
import { formatDateTime, parseWardId } from "@/lib/validation";

export default function ComplaintsPage() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [wardFilter, setWardFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, w] = await Promise.all([api.complaints.all(), api.water.wards()]);
      setComplaints(c);
      setWards(w);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load complaints");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return complaints.filter((c) => {
      const wardMatch =
        wardFilter === "all" ||
        (parseWardId(wardFilter) !== null && c.ward_id === parseWardId(wardFilter));
      const statusMatch = statusFilter === "all" || c.status === statusFilter;
      return wardMatch && statusMatch;
    });
  }, [complaints, wardFilter, statusFilter]);

  return (
    <ErrorBoundary fallbackTitle="Complaints module failed to render">
    <div className="p-6 space-y-6">
      {error && <DataError message={error} onRetry={load} />}
      <div>
        <h1 className="text-2xl font-bold">Water Complaints</h1>
        <p className="text-slate-400 text-sm mt-1">Simulated citizen reports across all wards</p>
        <div className="mt-2">
          <DataSourceBadge type="estimated" detail="Simulated citizen reports" />
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <div>
          <label className="text-xs text-slate-400">Ward</label>
          <select
            value={wardFilter}
            onChange={(e) => setWardFilter(e.target.value)}
            className="block mt-1 bg-white/5 border border-border rounded-lg px-3 py-2 text-sm min-w-[180px]"
          >
            <option value="all">All Wards</option>
            {wards.map((w) => (
              <option key={w.id} value={String(w.id)}>{w.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-400">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="block mt-1 bg-white/5 border border-border rounded-lg px-3 py-2 text-sm min-w-[140px]"
          >
            <option value="all">All Statuses</option>
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/5">
            <tr>
              <th className="text-left p-3">Ward</th>
              <th className="text-left p-3">Complaint Type</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="p-6"><LoadingSkeleton rows={4} /></td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-6 text-center text-slate-400">No complaints match the selected filters.</td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr key={c.id} className="border-t border-border hover:bg-white/5">
                  <td className="p-3">{c.ward_name}</td>
                  <td className="p-3 capitalize">{c.type.replace(/_/g, "-")}</td>
                  <td className="p-3">
                    <span className={c.status === "open" ? "text-yellow-400" : "text-emerald-400"}>
                      {c.status}
                    </span>
                  </td>
                  <td className="p-3 text-slate-400">
                    {formatDateTime(c.created_at)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
    </ErrorBoundary>
  );
}
