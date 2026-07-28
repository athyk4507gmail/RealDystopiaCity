"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  LogOut,
  Bell,
  CheckCircle2,
  AlertCircle,
  Droplets,
  Calendar,
  Wrench,
  PlusCircle,
  Clock,
  MessageSquare,
  RefreshCw,
  Megaphone,
  Send,
  XCircle,
} from "lucide-react";
import type { WaterAnnouncement } from "@/lib/water/announcementsStore";
import ErrorBoundary from "@/components/ErrorBoundary";
import DataError from "@/components/DataError";
import LoadingSkeleton from "@/components/LoadingSkeleton";
import StatCard from "@/components/StatCard";
import {
  ZONES,
  getWeekEvents,
  notificationTypeLabel,
} from "@/lib/water/mockSchedules";
import type { WaterIssue } from "@/lib/water/issuesStore";

export default function MunicipalityDashboardPage() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Issues state
  const [issues, setIssues] = useState<WaterIssue[]>([]);
  const [issuesLoading, setIssuesLoading] = useState(true);
  const [issuesError, setIssuesError] = useState<string | null>(null);

  // Manual issue creation state
  const [newWard, setNewWard] = useState<string>(ZONES[0]);
  const [newType, setNewType] = useState<WaterIssue["type"]>("leakage");
  const [newDesc, setNewDesc] = useState("");
  const [newEta, setNewEta] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  // Editing issue state (id -> { status, comment, eta })
  const [editingIssues, setEditingIssues] = useState<
    Record<
      string,
      {
        status: WaterIssue["status"];
        resolution_comment: string;
        estimated_resolution_time: string;
        saving?: boolean;
        saved?: boolean;
      }
    >
  >({});

  // Announcements state
  const [announceArea, setAnnounceArea] = useState<string>(ZONES[0]);
  const [announceMessage, setAnnounceMessage] = useState("");
  const [announcements, setAnnouncements] = useState<WaterAnnouncement[]>([]);
  const [announceLoading, setAnnounceLoading] = useState(false);
  const [announceSuccess, setAnnounceSuccess] = useState<string | null>(null);
  const [announceError, setAnnounceError] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Auth Check (Route Guard)
  // -------------------------------------------------------------------------
  useEffect(() => {
    fetch("/api/water/auth?check=1")
      .then((r) => r.json())
      .then((d) => {
        if (!d.authenticated || d.role !== "municipality") {
          router.replace("/water/login?role=municipality");
        } else {
          setAuthLoading(false);
        }
      })
      .catch(() => {
        setAuthError("Could not verify session");
        setAuthLoading(false);
      });
  }, [router]);

  // -------------------------------------------------------------------------
  // Fetch Shared Issues
  // -------------------------------------------------------------------------
  const fetchIssues = useCallback(async () => {
    setIssuesLoading(true);
    setIssuesError(null);
    try {
      const res = await fetch("/api/water/issues");
      if (!res.ok) throw new Error("Failed to load issues");
      const data: WaterIssue[] = await res.json();
      setIssues(data);

      // Initialize edit state
      const initialEdit: Record<string, any> = {};
      data.forEach((issue) => {
        initialEdit[issue.id] = {
          status: issue.status,
          resolution_comment: issue.resolution_comment || "",
          estimated_resolution_time: issue.estimated_resolution_time || "",
        };
      });
      setEditingIssues(initialEdit);
    } catch {
      setIssuesError("Failed to fetch water issues");
    } finally {
      setIssuesLoading(false);
    }
  }, []);

  // -------------------------------------------------------------------------
  // Fetch Announcements History
  // -------------------------------------------------------------------------
  const fetchAnnouncements = useCallback(async () => {
    try {
      const res = await fetch("/api/water/announce");
      if (!res.ok) return;
      const data: WaterAnnouncement[] = await res.json();
      setAnnouncements(data);
    } catch {
      // non-fatal — history just stays empty
    }
  }, []);

  useEffect(() => {
    if (!authLoading) {
      fetchIssues();
      fetchAnnouncements();
    }
  }, [authLoading, fetchIssues, fetchAnnouncements]);

  // -------------------------------------------------------------------------
  // Send Announcement Handler
  // -------------------------------------------------------------------------
  const handleSendAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!announceMessage.trim()) return;
    setAnnounceLoading(true);
    setAnnounceSuccess(null);
    setAnnounceError(null);

    try {
      const res = await fetch("/api/water/announce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          area: announceArea,
          message: announceMessage.trim(),
        }),
      });

      if (!res.ok) throw new Error("Server error — please retry");
      const data = await res.json();

      if (data.emailSent) {
        setAnnounceSuccess(
          `Announcement sent to ${data.recipientCount} recipient${data.recipientCount !== 1 ? "s" : ""} and posted to ${announceArea} citizen feed. (${data.sentAt})`,
        );
      } else {
        // Still saved, but email failed
        setAnnounceError(
          `Announcement saved to ${announceArea} citizen feed, but email delivery failed: ${data.emailError ?? "Unknown error"}`,
        );
      }

      setAnnounceMessage("");
      await fetchAnnouncements();
    } catch (err) {
      setAnnounceError(
        err instanceof Error ? err.message : "Failed to send announcement",
      );
    } finally {
      setAnnounceLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/water/auth", { method: "DELETE" });
    router.push("/water/login?role=municipality");
  };

  // -------------------------------------------------------------------------
  // Manual Issue Creation Handler
  // -------------------------------------------------------------------------
  const handleCreateIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDesc.trim()) return;
    setCreateLoading(true);
    setCreateSuccess(null);

    try {
      const res = await fetch("/api/water/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ward_name: newWard,
          type: newType,
          description: newDesc.trim(),
          reported_by: "municipality",
          status: "Open",
          estimated_resolution_time: newEta || undefined,
        }),
      });

      if (!res.ok) throw new Error("Failed to create issue");
      setNewDesc("");
      setNewEta("");
      setCreateSuccess("Issue created successfully and published to live feed.");
      await fetchIssues();
    } catch {
      setIssuesError("Could not create issue");
    } finally {
      setCreateLoading(false);
    }
  };

  // -------------------------------------------------------------------------
  // Issue Update Handler (Status / Comment / ETA)
  // -------------------------------------------------------------------------
  const handleUpdateIssue = async (issueId: string) => {
    const editState = editingIssues[issueId];
    if (!editState) return;

    setEditingIssues((prev) => ({
      ...prev,
      [issueId]: { ...prev[issueId], saving: true, saved: false },
    }));

    try {
      const res = await fetch("/api/water/issues", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: issueId,
          status: editState.status,
          resolution_comment: editState.resolution_comment,
          estimated_resolution_time: editState.estimated_resolution_time,
        }),
      });

      if (!res.ok) throw new Error("Update failed");

      setEditingIssues((prev) => ({
        ...prev,
        [issueId]: { ...prev[issueId], saving: false, saved: true },
      }));

      // Refresh list to keep in sync
      const updatedData: WaterIssue[] = await (await fetch("/api/water/issues")).json();
      setIssues(updatedData);
    } catch {
      setEditingIssues((prev) => ({
        ...prev,
        [issueId]: { ...prev[issueId], saving: false },
      }));
    }
  };

  const weekEvents = getWeekEvents();

  if (authLoading) {
    return (
      <div className="p-6 space-y-4">
        <LoadingSkeleton rows={4} />
      </div>
    );
  }

  if (authError) {
    return (
      <div className="p-6">
        <DataError
          message={authError}
          onRetry={() => router.push("/water/login?role=municipality")}
        />
      </div>
    );
  }

  const openIssuesCount = issues.filter((i) => i.status === "Open").length;
  const inProgressCount = issues.filter((i) => i.status === "In Progress").length;
  const resolvedCount = issues.filter((i) => i.status === "Resolved").length;

  return (
    <ErrorBoundary fallbackTitle="Municipality Dashboard failed to render">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">Municipality Operations</h1>
              <span className="text-xs bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 px-2.5 py-0.5 rounded-full font-medium">
                BWSSB Staff
              </span>
            </div>
            <p className="text-slate-400 text-sm mt-1">
              Water Distribution &amp; Infrastructure Issue Management Portal
            </p>
          </div>
          <div className="flex gap-2">
            <a
              href="/water"
              className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm flex items-center gap-2"
            >
              <Droplets className="w-4 h-4 text-cyan-400" />
              Water Overview
            </a>
            <button
              id="municipality-logout-btn"
              onClick={handleLogout}
              className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm flex items-center gap-2 text-slate-400 hover:text-red-400 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Issues"
            value={issues.length}
            color="cyan"
            sourceType="reported"
            sourceDetail="Shared Issue Registry"
          />
          <StatCard
            label="Open Issues"
            value={openIssuesCount}
            color="red"
            sourceType="reported"
          />
          <StatCard
            label="In Progress"
            value={inProgressCount}
            color="yellow"
            sourceType="reported"
          />
          <StatCard
            label="Resolved"
            value={resolvedCount}
            color="green"
            sourceType="reported"
          />
        </div>

        {/* ============================================================
            SECTION 1: Supply Schedule Overview
        ============================================================ */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <Calendar className="w-5 h-5 text-accent" />
              Ward Supply Schedule Overview
            </h2>
            <span className="text-xs text-slate-400">7 Days Outlook</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-border">
                  <th className="pb-3 font-medium">Zone / Ward</th>
                  <th className="pb-3 font-medium">Date &amp; Window</th>
                  <th className="pb-3 font-medium">Event Type</th>
                  <th className="pb-3 font-medium">Severity</th>
                  <th className="pb-3 font-medium">Operational Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {weekEvents.slice(0, 8).map((e) => (
                  <tr key={e.id} className="hover:bg-white/[0.02]">
                    <td className="py-3 font-medium text-slate-200">{e.zone}</td>
                    <td className="py-3 text-slate-400">
                      {new Date(e.date).toLocaleDateString("en-IN", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}{" "}
                      · <span className="text-slate-300 font-mono text-xs">{e.time}{e.endTime ? `-${e.endTime}` : ""}</span>
                    </td>
                    <td className="py-3">
                      <span className="text-xs bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded">
                        {notificationTypeLabel(e.type)}
                      </span>
                    </td>
                    <td className="py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded font-medium ${
                          e.severity === "critical"
                            ? "bg-red-500/20 text-red-400"
                            : e.severity === "warning"
                            ? "bg-yellow-500/20 text-yellow-400"
                            : "bg-emerald-500/20 text-emerald-400"
                        }`}
                      >
                        {e.severity.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 text-xs text-slate-400 max-w-xs">{e.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ============================================================
            SECTION 2: Issue Management & Manual Creation
        ============================================================ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Cols: Manage Existing Issues */}
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-lg flex items-center gap-2">
                  <Wrench className="w-5 h-5 text-accent" />
                  Water Issue Management
                </h2>
                <button
                  type="button"
                  onClick={fetchIssues}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-white/5 px-3 py-1.5 rounded-lg border border-border"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Refresh List
                </button>
              </div>

              {issuesLoading && <LoadingSkeleton rows={4} />}
              {issuesError && <DataError message={issuesError} onRetry={fetchIssues} />}

              {!issuesLoading && !issuesError && issues.length === 0 && (
                <p className="text-sm text-slate-400 italic">No reported water issues.</p>
              )}

              <div className="space-y-4 max-h-[650px] overflow-y-auto pr-1">
                {issues.map((issue) => {
                  const edit = editingIssues[issue.id] || {
                    status: issue.status,
                    resolution_comment: issue.resolution_comment || "",
                    estimated_resolution_time: issue.estimated_resolution_time || "",
                  };

                  return (
                    <div
                      key={issue.id}
                      className="rounded-lg border border-border bg-white/[0.02] p-4 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-accent">
                            {issue.ward_name}
                          </span>
                          <span className="text-xs bg-white/10 text-slate-300 px-2 py-0.5 rounded capitalize">
                            {issue.type.replace("_", " ")}
                          </span>
                          <span className="text-xs text-slate-500">
                            Reported by:{" "}
                            <strong className="text-slate-300">
                              {issue.reported_by}
                            </strong>
                          </span>
                        </div>

                        {/* Status Badge */}
                        <span
                          className={`text-xs px-2.5 py-0.5 rounded font-semibold ${
                            issue.status === "Open"
                              ? "bg-red-500/20 text-red-400 border border-red-500/30"
                              : issue.status === "In Progress"
                              ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                              : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                          }`}
                        >
                          {issue.status}
                        </span>
                      </div>

                      <p className="text-sm text-slate-300">{issue.description}</p>
                      <p className="text-xs text-slate-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Reported at: {new Date(issue.reported_at).toLocaleString("en-IN")}
                      </p>

                      {/* Staff Resolution & Comment Controls */}
                      <div className="border-t border-border/60 pt-3 space-y-3">
                        <p className="text-xs font-semibold text-accent uppercase tracking-wide">
                          Staff Update &amp; Resolution Comment
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-xs text-slate-400">Update Status</label>
                            <select
                              value={edit.status}
                              onChange={(e) =>
                                setEditingIssues((prev) => ({
                                  ...prev,
                                  [issue.id]: {
                                    ...prev[issue.id],
                                    status: e.target.value as WaterIssue["status"],
                                  },
                                }))
                              }
                              className="w-full bg-white/5 border border-border rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                            >
                              <option value="Open" style={{ background: "#111827" }}>
                                Open
                              </option>
                              <option value="In Progress" style={{ background: "#111827" }}>
                                In Progress
                              </option>
                              <option value="Resolved" style={{ background: "#111827" }}>
                                Resolved
                              </option>
                            </select>
                          </div>

                          <div className="space-y-1">
                            <label className="text-xs text-slate-400">
                              Estimated Fix Time (ETA)
                            </label>
                            <input
                              type="datetime-local"
                              value={edit.estimated_resolution_time}
                              onChange={(e) =>
                                setEditingIssues((prev) => ({
                                  ...prev,
                                  [issue.id]: {
                                    ...prev[issue.id],
                                    estimated_resolution_time: e.target.value,
                                  },
                                }))
                              }
                              className="w-full bg-white/5 border border-border rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs text-slate-400">
                            Resolution Comment / Progress Note
                          </label>
                          <input
                            type="text"
                            value={edit.resolution_comment}
                            onChange={(e) =>
                              setEditingIssues((prev) => ({
                                ...prev,
                                [issue.id]: {
                                  ...prev[issue.id],
                                  resolution_comment: e.target.value,
                                },
                              }))
                            }
                            placeholder="e.g. Repair crew dispatched with seal kit..."
                            className="w-full bg-white/5 border border-border rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-accent/50"
                          />
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          {edit.saved ? (
                            <span className="text-xs text-emerald-400 flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Saved &amp; Updated
                            </span>
                          ) : (
                            <span className="text-xs text-slate-500">
                              Changes appear live on resident portal
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleUpdateIssue(issue.id)}
                            disabled={edit.saving}
                            className="px-3 py-1.5 rounded-lg bg-accent text-black font-semibold text-xs hover:opacity-90 disabled:opacity-50"
                          >
                            {edit.saving ? "Saving…" : "Save Update"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Col: Manual Issue Creation Form */}
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <h2 className="font-semibold text-lg flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-accent" />
                Report / Create New Issue
              </h2>
              <p className="text-xs text-slate-400">
                Staff can log planned disruptions, burst main alerts, or scheduled maintenance directly.
              </p>

              <form onSubmit={handleCreateIssue} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 uppercase tracking-wide">
                    Select Ward / Area
                  </label>
                  <select
                    value={newWard}
                    onChange={(e) => setNewWard(e.target.value)}
                    className="w-full bg-white/5 border border-border rounded-lg px-3 py-2 text-sm text-slate-200"
                  >
                    {ZONES.map((z) => (
                      <option key={z} value={z} style={{ background: "#111827" }}>
                        {z}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 uppercase tracking-wide">
                    Issue Type
                  </label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as WaterIssue["type"])}
                    className="w-full bg-white/5 border border-border rounded-lg px-3 py-2 text-sm text-slate-200"
                  >
                    <option value="leakage" style={{ background: "#111827" }}>
                      Pipe Leakage / Burst
                    </option>
                    <option value="supply_disruption" style={{ background: "#111827" }}>
                      Supply Disruption
                    </option>
                    <option value="contamination" style={{ background: "#111827" }}>
                      Water Contamination
                    </option>
                    <option value="maintenance" style={{ background: "#111827" }}>
                      Scheduled Maintenance
                    </option>
                    <option value="other" style={{ background: "#111827" }}>
                      Other Alert
                    </option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 uppercase tracking-wide">
                    Description
                  </label>
                  <textarea
                    rows={3}
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    placeholder="Describe the issue or maintenance details..."
                    required
                    className="w-full bg-white/5 border border-border rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-accent/50 resize-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 uppercase tracking-wide">
                    Estimated Resolution Time (Optional)
                  </label>
                  <input
                    type="datetime-local"
                    value={newEta}
                    onChange={(e) => setNewEta(e.target.value)}
                    className="w-full bg-white/5 border border-border rounded-lg px-3 py-2 text-sm text-slate-200"
                  />
                </div>

                {createSuccess && (
                  <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 p-2.5 rounded-lg">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    {createSuccess}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={createLoading}
                  className="w-full px-4 py-2.5 rounded-lg bg-accent text-black font-semibold text-sm hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {createLoading ? "Publishing…" : "Create &amp; Publish Issue"}
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* ============================================================
            SECTION 3: Announcements — Send to Citizens + Email
        ============================================================ */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-accent" />
              Announcements — Notify Citizens &amp; Email Recipients
            </h2>
            <button
              type="button"
              onClick={fetchAnnouncements}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-white/5 px-3 py-1.5 rounded-lg border border-border"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh History
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Compose Form */}
            <div className="space-y-4">
              <p className="text-xs text-slate-400">
                Post an announcement to the citizen disruption feed for the selected area and email all
                configured recipients via Resend.
              </p>

              <form onSubmit={handleSendAnnouncement} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 uppercase tracking-wide">
                    Location / Area
                  </label>
                  <select
                    id="announce-area-select"
                    value={announceArea}
                    onChange={(e) => setAnnounceArea(e.target.value)}
                    className="w-full bg-white/5 border border-border rounded-lg px-3 py-2.5 text-sm text-slate-200"
                  >
                    {ZONES.map((z) => (
                      <option key={z} value={z} style={{ background: "#111827" }}>
                        {z}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 uppercase tracking-wide">
                    Announcement Message
                  </label>
                  <textarea
                    id="announce-message-input"
                    rows={4}
                    value={announceMessage}
                    onChange={(e) => setAnnounceMessage(e.target.value)}
                    placeholder="e.g. Water supply delayed in Indira Nagar due to emergency trunk repair. Supply expected to resume by 6 PM."
                    required
                    className="w-full bg-white/5 border border-border rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-accent/50 resize-none"
                  />
                </div>

                {/* Success Banner */}
                {announceSuccess && (
                  <div className="flex items-start gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 p-3 rounded-lg">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{announceSuccess}</span>
                  </div>
                )}

                {/* Error Banner — shown even if announcement was saved */}
                {announceError && (
                  <div className="flex items-start gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/30 p-3 rounded-lg">
                    <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{announceError}</span>
                  </div>
                )}

                <button
                  id="announce-send-btn"
                  type="submit"
                  disabled={announceLoading || !announceMessage.trim()}
                  className="w-full px-4 py-2.5 rounded-lg bg-accent text-black font-semibold text-sm hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {announceLoading ? (
                    <>
                      <span className="inline-block w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                      Sending…
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Send Announcement
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Right: Announcement History */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-1.5">
                <Bell className="w-4 h-4 text-accent" />
                Sent Announcement History
              </h3>

              {announcements.length === 0 && (
                <p className="text-xs text-slate-500 italic py-4 text-center">
                  No announcements sent yet in this session.
                </p>
              )}

              <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                {announcements.map((ann) => (
                  <div
                    key={ann.id}
                    className="rounded-lg border border-border bg-white/[0.02] p-3.5 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-accent">{ann.area}</span>
                      <div className="flex items-center gap-1.5">
                        {ann.emailSent ? (
                          <span className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded font-medium">
                            ✓ Emailed {ann.recipientCount}
                          </span>
                        ) : (
                          <span className="text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-2 py-0.5 rounded font-medium">
                            Feed only
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">{ann.message}</p>
                    <p className="text-xs text-slate-500">
                      {new Date(ann.sentAt).toLocaleString("en-IN")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}
