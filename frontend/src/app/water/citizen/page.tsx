"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Droplets,
  LogOut,
  CreditCard,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Clock,
  ChevronDown,
  AlertTriangle,
  Send,
  MessageSquare,
  RefreshCw,
  Megaphone,
} from "lucide-react";
import ErrorBoundary from "@/components/ErrorBoundary";
import DataError from "@/components/DataError";
import LoadingSkeleton from "@/components/LoadingSkeleton";
import type { PipelineAccount } from "@/lib/water/mockAccounts";
import { MOCK_ACCOUNTS } from "@/lib/water/mockAccounts";
import type { ScheduledEvent } from "@/lib/water/mockSchedules";
import {
  ZONES,
  getScheduleForZone,
  notificationTypeLabel,
} from "@/lib/water/mockSchedules";
import type { WaterIssue } from "@/lib/water/issuesStore";
import type { WaterAnnouncement } from "@/lib/water/announcementsStore";

// UPI Validation regex (name@bank pattern)
const UPI_REGEX = /^[\w.\-]+@[a-zA-Z]{2,}$/;

// Local in-memory paid accounts set
const paidAccountsSet = new Set<string>();

function severityColor(s: ScheduledEvent["severity"]): string {
  if (s === "critical") return "text-red-400 bg-red-500/10 border-red-500/30";
  if (s === "warning") return "text-yellow-400 bg-yellow-500/10 border-yellow-500/30";
  return "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
}

function statusBadge(status: PipelineAccount["paymentStatus"]) {
  if (status === "paid")
    return (
      <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2.5 py-0.5 rounded font-semibold">
        Paid
      </span>
    );
  if (status === "overdue")
    return (
      <span className="text-xs bg-red-500/20 text-red-400 px-2.5 py-0.5 rounded font-semibold">
        Overdue
      </span>
    );
  return (
    <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2.5 py-0.5 rounded font-semibold">
      Pending
    </span>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Pay Bill Panel Sub-component
// ---------------------------------------------------------------------------
function PayBillPanel({
  account,
  onPaid,
}: {
  account: PipelineAccount;
  onPaid: () => void;
}) {
  const [upi, setUpi] = useState("");
  const [step, setStep] = useState<"form" | "processing" | "success">("form");
  const [txnId] = useState(
    () => "TXN" + Math.random().toString(36).slice(2, 10).toUpperCase(),
  );
  const [upiError, setUpiError] = useState<string | null>(null);
  const paidAt = new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });

  const handlePay = (e: React.FormEvent) => {
    e.preventDefault();
    if (!UPI_REGEX.test(upi.trim())) {
      setUpiError("Enter a valid UPI ID (format: name@bank, e.g. user@okaxis)");
      return;
    }
    setUpiError(null);
    setStep("processing");
    setTimeout(() => {
      paidAccountsSet.add(account.accountNumber);
      setStep("success");
      onPaid();
    }, 2500);
  };

  if (step === "success") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-emerald-400">
          <CheckCircle2 className="w-5 h-5" />
          <span className="font-semibold text-base">Payment Successful</span>
        </div>
        <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-400">Transaction ID</span>
            <span className="font-mono text-xs text-accent font-semibold">{txnId}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Amount Paid</span>
            <span className="font-bold">₹{account.monthlyBillAmount.toLocaleString("en-IN")}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">UPI ID</span>
            <span className="font-mono text-xs">{upi}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Timestamp</span>
            <span className="text-xs">{paidAt}</span>
          </div>
        </div>
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3.5 py-2.5 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
          <p className="text-xs text-yellow-300">
            <strong>Demo Payment Simulation</strong> — No real transaction occurred. No funds were transferred.
          </p>
        </div>
      </div>
    );
  }

  if (step === "processing") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-8">
        <span className="inline-block w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        <p className="text-sm font-medium text-slate-300">Processing demo payment…</p>
        <p className="text-xs text-slate-500">Verifying UPI ID with {upi}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handlePay} className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-xs text-slate-400 uppercase tracking-wide">
          Enter UPI ID
        </label>
        <input
          id="citizen-upi-input"
          type="text"
          value={upi}
          onChange={(e) => setUpi(e.target.value)}
          placeholder="e.g. resident@okicici or user@ybl"
          className="w-full bg-white/5 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/50"
        />
        {upiError && (
          <p className="text-xs text-red-400 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            {upiError}
          </p>
        )}
      </div>

      <div className="rounded-lg bg-white/5 border border-border px-3.5 py-2.5 flex justify-between text-sm">
        <span className="text-slate-400">Total Payable</span>
        <span className="font-bold text-accent">
          ₹{account.monthlyBillAmount.toLocaleString("en-IN")}
        </span>
      </div>

      <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 flex items-start gap-2">
        <AlertCircle className="w-3.5 h-3.5 text-yellow-400 shrink-0 mt-0.5" />
        <p className="text-xs text-yellow-300">
          <strong>Demo Simulation</strong> — No real payment gateway. No money charged.
        </p>
      </div>

      <button
        id="citizen-pay-now-btn"
        type="submit"
        className="w-full px-4 py-2.5 rounded-lg bg-accent text-black font-semibold text-sm hover:opacity-90 flex items-center justify-center gap-2"
      >
        <CreditCard className="w-4 h-4" />
        Pay Now (Demo)
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Main Citizen Dashboard Component
// ---------------------------------------------------------------------------
export default function CitizenDashboardPage() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Selected Location / Ward state
  const [selectedWard, setSelectedWard] = useState<string>(ZONES[0]);

  // Shared Ward Issues state
  const [wardIssues, setWardIssues] = useState<WaterIssue[]>([]);
  const [issuesLoading, setIssuesLoading] = useState(true);
  const [issuesError, setIssuesError] = useState<string | null>(null);

  // Ward Announcements state
  const [wardAnnouncements, setWardAnnouncements] = useState<WaterAnnouncement[]>([]);

  // Citizen Complaint Form state
  const [complaintType, setComplaintType] = useState<WaterIssue["type"]>("leakage");
  const [complaintDesc, setComplaintDesc] = useState("");
  const [complaintLoading, setComplaintLoading] = useState(false);
  const [complaintSuccess, setComplaintSuccess] = useState<string | null>(null);

  // Bill Payment state
  const [selectedAccount, setSelectedAccount] = useState<string>(
    MOCK_ACCOUNTS[0].accountNumber,
  );
  const [account, setAccount] = useState<PipelineAccount>(MOCK_ACCOUNTS[0]);
  const [showPayPanel, setShowPayPanel] = useState(false);
  const [paidRefresh, setPaidRefresh] = useState(0);

  // -------------------------------------------------------------------------
  // Auth Check (Route Guard)
  // -------------------------------------------------------------------------
  useEffect(() => {
    fetch("/api/water/auth?check=1")
      .then((r) => r.json())
      .then((d) => {
        if (!d.authenticated || d.role !== "citizen") {
          router.replace("/water/login?role=citizen");
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
  // Fetch Ward Issues from Shared API
  // -------------------------------------------------------------------------
  const fetchWardIssues = useCallback(async () => {
    setIssuesLoading(true);
    setIssuesError(null);
    try {
      const [issuesRes, announcementsRes] = await Promise.all([
        fetch(`/api/water/issues?ward_name=${encodeURIComponent(selectedWard)}`),
        fetch(`/api/water/announce?area=${encodeURIComponent(selectedWard)}`),
      ]);
      if (!issuesRes.ok) throw new Error("Failed to load issues");
      const issuesData: WaterIssue[] = await issuesRes.json();
      setWardIssues(issuesData);
      if (announcementsRes.ok) {
        const announcementsData: WaterAnnouncement[] = await announcementsRes.json();
        setWardAnnouncements(announcementsData);
      }
    } catch {
      setIssuesError("Failed to fetch live disruptions");
    } finally {
      setIssuesLoading(false);
    }
  }, [selectedWard]);

  useEffect(() => {
    if (!authLoading) {
      fetchWardIssues();
    }
  }, [authLoading, selectedWard, fetchWardIssues]);

  // -------------------------------------------------------------------------
  // Account derives paid state
  // -------------------------------------------------------------------------
  useEffect(() => {
    const base = MOCK_ACCOUNTS.find((a) => a.accountNumber === selectedAccount)!;
    if (paidAccountsSet.has(selectedAccount)) {
      setAccount({
        ...base,
        paymentStatus: "paid",
        lastPaidDate: new Date().toISOString().split("T")[0],
      });
    } else {
      setAccount(base);
    }
    setShowPayPanel(false);
  }, [selectedAccount, paidRefresh]);

  const handleLogout = async () => {
    await fetch("/api/water/auth", { method: "DELETE" });
    router.push("/water/login?role=citizen");
  };

  // -------------------------------------------------------------------------
  // Raise Complaint Submit Handler
  // -------------------------------------------------------------------------
  const handleComplaintSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!complaintDesc.trim()) return;
    setComplaintLoading(true);
    setComplaintSuccess(null);

    try {
      const res = await fetch("/api/water/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ward_name: selectedWard,
          type: complaintType,
          description: complaintDesc.trim(),
          reported_by: "citizen",
          status: "Open",
        }),
      });

      if (!res.ok) throw new Error("Failed to submit complaint");

      setComplaintDesc("");
      setComplaintSuccess(
        `Complaint submitted successfully! It is now logged for ${selectedWard} and visible to municipality staff.`,
      );
      await fetchWardIssues();
    } catch {
      setIssuesError("Could not submit complaint");
    } finally {
      setComplaintLoading(false);
    }
  };

  const scheduleEvents = getScheduleForZone(selectedWard);

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
          onRetry={() => router.push("/water/login?role=citizen")}
        />
      </div>
    );
  }

  return (
    <ErrorBoundary fallbackTitle="Citizen Dashboard failed to render">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">Resident Self-Service</h1>
              <span className="text-xs bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 px-2.5 py-0.5 rounded-full font-medium">
                Resident Account
              </span>
            </div>
            <p className="text-slate-400 text-sm mt-1">
              BWSSB Citizen Portal — Water Schedules, Disruption Feed &amp; Bill Payments
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
              id="citizen-logout-btn"
              onClick={handleLogout}
              className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm flex items-center gap-2 text-slate-400 hover:text-red-400 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>

        {/* ============================================================
            SECTION 1: Location & Supply Schedule
        ============================================================ */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <Calendar className="w-5 h-5 text-accent" />
              Location &amp; Supply Schedule
            </h2>

            {/* Ward Selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-medium">Select Area / Ward:</span>
              <select
                id="citizen-ward-select"
                value={selectedWard}
                onChange={(e) => setSelectedWard(e.target.value)}
                className="bg-white/10 border border-accent/40 text-cyan-400 rounded-lg px-3 py-1.5 text-sm font-semibold focus:outline-none"
              >
                {ZONES.map((z) => (
                  <option key={z} value={z} style={{ background: "#111827", color: "#e2e8f0" }}>
                    {z}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-border/50 pt-4">
            {scheduleEvents.slice(0, 3).map((e) => (
              <div
                key={e.id}
                className={`rounded-lg border p-4 space-y-2 ${severityColor(e.severity)}`}
              >
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold uppercase tracking-wide">
                    {notificationTypeLabel(e.type)}
                  </span>
                  <span className="text-xs font-mono opacity-80">{e.time}{e.endTime ? `-${e.endTime}` : ""}</span>
                </div>
                <p className="text-sm font-medium opacity-90">{e.reason}</p>
                <p className="text-xs opacity-70">
                  Date: {new Date(e.date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
                </p>
              </div>
            ))}

            {scheduleEvents.length === 0 && (
              <div className="md:col-span-3 text-center py-4 text-sm text-slate-400 italic">
                No planned disruptions or outages for {selectedWard} this week.
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ============================================================
              SECTION 2: Live Disruption / Issue Feed
          ============================================================ */}
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-lg flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-accent" />
                  Live Disruption &amp; Issue Feed — {selectedWard}
                </h2>
                <button
                  type="button"
                  onClick={fetchWardIssues}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-white bg-white/5 px-2.5 py-1 rounded border border-border"
                >
                  <RefreshCw className="w-3 h-3" /> Refresh
                </button>
              </div>

              {issuesLoading && <LoadingSkeleton rows={3} />}
              {issuesError && <DataError message={issuesError} onRetry={fetchWardIssues} />}

              {!issuesLoading && !issuesError && wardIssues.length === 0 && wardAnnouncements.length === 0 && (
                <p className="text-sm text-slate-400 italic py-4 text-center">
                  No active issues or disruptions reported in {selectedWard}.
                </p>
              )}

              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {/* Municipality Announcements — show first */}
                {wardAnnouncements.map((ann) => (
                  <div
                    key={ann.id}
                    className="rounded-lg border border-cyan-500/40 bg-cyan-500/5 p-4 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-cyan-400 font-semibold text-xs">
                        <Megaphone className="w-3.5 h-3.5" />
                        Municipality Announcement
                      </div>
                      <span className="text-xs bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 rounded font-medium">
                        Official Notice
                      </span>
                    </div>
                    <p className="text-sm text-slate-200">{ann.message}</p>
                    <p className="text-xs text-slate-500">
                      Posted: {new Date(ann.sentAt).toLocaleString("en-IN")}
                    </p>
                  </div>
                ))}

                {/* Issues */}
                {wardIssues.map((issue) => (
                  <div
                    key={issue.id}
                    className="rounded-lg border border-border bg-white/[0.02] p-4 space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs bg-white/10 text-slate-300 px-2 py-0.5 rounded capitalize">
                        {issue.type.replace("_", " ")}
                      </span>
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

                    <p className="text-sm text-slate-200">{issue.description}</p>

                    <p className="text-xs text-slate-500">
                      Reported: {new Date(issue.reported_at).toLocaleString("en-IN")} ({issue.reported_by})
                    </p>

                    {/* Staff Resolution Comment & ETA display */}
                    {(issue.resolution_comment || issue.estimated_resolution_time) && (
                      <div className="rounded-lg bg-cyan-500/10 border border-cyan-500/20 p-3 space-y-1 text-xs">
                        <div className="flex items-center gap-1.5 text-cyan-400 font-semibold">
                          <MessageSquare className="w-3.5 h-3.5" />
                          Municipality Staff Update
                        </div>
                        {issue.estimated_resolution_time && (
                          <p className="text-slate-300">
                            <strong>Expected Fix (ETA):</strong>{" "}
                            <span className="text-accent font-mono">
                              {new Date(issue.estimated_resolution_time).toLocaleString("en-IN")}
                            </span>
                          </p>
                        )}
                        {issue.resolution_comment && (
                          <p className="text-slate-300">
                            <strong>Comment:</strong> {issue.resolution_comment}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* ============================================================
                SECTION 3: Raise a Complaint Form
            ============================================================ */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <h2 className="font-semibold text-lg flex items-center gap-2">
                <Send className="w-5 h-5 text-accent" />
                Raise a Complaint / Report Issue
              </h2>

              <form onSubmit={handleComplaintSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 uppercase tracking-wide">
                      Affected Area
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={selectedWard}
                      className="w-full bg-white/5 border border-border rounded-lg px-3 py-2 text-sm text-slate-300 font-semibold cursor-not-allowed"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 uppercase tracking-wide">
                      Issue Type
                    </label>
                    <select
                      value={complaintType}
                      onChange={(e) => setComplaintType(e.target.value as WaterIssue["type"])}
                      className="w-full bg-white/5 border border-border rounded-lg px-3 py-2 text-sm text-slate-200"
                    >
                      <option value="leakage" style={{ background: "#111827" }}>
                        Pipe Leakage
                      </option>
                      <option value="supply_disruption" style={{ background: "#111827" }}>
                        Supply Disruption / Low Pressure
                      </option>
                      <option value="contamination" style={{ background: "#111827" }}>
                        Water Quality / Contamination
                      </option>
                      <option value="other" style={{ background: "#111827" }}>
                        Other Complaint
                      </option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-slate-400 uppercase tracking-wide">
                    Complaint Description
                  </label>
                  <textarea
                    rows={3}
                    value={complaintDesc}
                    onChange={(e) => setComplaintDesc(e.target.value)}
                    placeholder={`Describe the water issue in ${selectedWard}...`}
                    required
                    className="w-full bg-white/5 border border-border rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-accent/50 resize-none"
                  />
                </div>

                {complaintSuccess && (
                  <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 p-2.5 rounded-lg">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    {complaintSuccess}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={complaintLoading}
                  className="w-full px-4 py-2.5 rounded-lg bg-accent text-black font-semibold text-sm hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {complaintLoading ? "Submitting…" : "Submit Complaint to Municipality"}
                </button>
              </form>
            </div>
          </div>

          {/* ============================================================
              SECTION 4: Pay Water Bill (Demo)
          ============================================================ */}
          <div className="space-y-4">
            {/* Account Selector & Bill Overview */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <h2 className="font-semibold text-lg flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-accent" />
                Pay Water Bill (Demo)
              </h2>

              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 uppercase tracking-wide">
                  Select Pipeline Account
                </label>
                <div className="relative">
                  <select
                    id="citizen-account-select"
                    value={selectedAccount}
                    onChange={(e) => setSelectedAccount(e.target.value)}
                    className="w-full bg-white/5 border border-border rounded-lg px-3 py-2.5 text-sm text-slate-200 appearance-none font-mono"
                  >
                    {MOCK_ACCOUNTS.map((a) => (
                      <option
                        key={a.accountNumber}
                        value={a.accountNumber}
                        style={{ background: "#111827" }}
                      >
                        {a.accountNumber} — {a.ownerName} ({a.zone})
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                </div>
              </div>

              {/* Bill Details Card */}
              <div className="rounded-lg border border-border/80 bg-white/[0.02] p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-border/50 pb-2">
                  <span className="text-xs text-slate-400">Account Owner</span>
                  <span className="text-sm font-semibold text-slate-200">{account.ownerName}</span>
                </div>
                <div className="flex items-center justify-between border-b border-border/50 pb-2">
                  <span className="text-xs text-slate-400">Address</span>
                  <span className="text-xs text-slate-300 max-w-[220px] text-right">{account.address}</span>
                </div>
                <div className="flex items-center justify-between border-b border-border/50 pb-2">
                  <span className="text-xs text-slate-400">Bill Status</span>
                  {statusBadge(account.paymentStatus)}
                </div>
                <div className="flex items-center justify-between border-b border-border/50 pb-2">
                  <span className="text-xs text-slate-400">Current Bill Amount</span>
                  <span className="text-xl font-bold text-accent">
                    ₹{account.monthlyBillAmount.toLocaleString("en-IN")}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Due Date</span>
                  <span className={`text-xs font-semibold ${account.paymentStatus === "overdue" ? "text-red-400" : "text-slate-300"}`}>
                    {formatDate(account.dueDate)}
                  </span>
                </div>
              </div>

              {/* Pay Button / Form */}
              {account.paymentStatus !== "paid" && !showPayPanel && (
                <button
                  id="citizen-open-pay-panel-btn"
                  onClick={() => setShowPayPanel(true)}
                  className="w-full px-4 py-2.5 rounded-lg bg-accent text-black font-semibold text-sm hover:opacity-90 flex items-center justify-center gap-2"
                >
                  <CreditCard className="w-4 h-4" />
                  Proceed to Pay Bill
                </button>
              )}

              {showPayPanel && account.paymentStatus !== "paid" && (
                <div className="border-t border-border pt-4">
                  <PayBillPanel
                    account={account}
                    onPaid={() => setPaidRefresh((n) => n + 1)}
                  />
                </div>
              )}

              {account.paymentStatus === "paid" && (
                <div className="flex items-center gap-2 text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3.5 py-2.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  This pipeline account bill is fully paid for the current cycle.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}
