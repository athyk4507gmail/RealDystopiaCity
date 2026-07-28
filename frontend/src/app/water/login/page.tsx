"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Droplets, Building2, Lock, User, AlertCircle } from "lucide-react";
import ErrorBoundary from "@/components/ErrorBoundary";
import LoadingSkeleton from "@/components/LoadingSkeleton";

function UnifiedWaterLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const roleParam = searchParams.get("role");
  const [activeTab, setActiveTab] = useState<"municipality" | "citizen">(
    roleParam === "citizen" ? "citizen" : "municipality",
  );

  useEffect(() => {
    if (roleParam === "citizen" || roleParam === "municipality") {
      setActiveTab(roleParam);
    }
  }, [roleParam]);

  const [username, setUsername] = useState("");
  const [passcode, setPasscode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTabChange = (tab: "municipality" | "citizen") => {
    setActiveTab(tab);
    setError(null);
    setUsername("");
    setPasscode("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/water/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, passcode }),
      });

      const data = await res.json();

      if (!res.ok || !data.authenticated) {
        setError(data.error ?? "Invalid username or passcode");
        return;
      }

      if (data.role !== activeTab) {
        setError(
          `These credentials belong to the ${data.role} role. Switch tabs to sign in.`,
        );
        return;
      }

      // Redirect to respective dashboard
      if (data.role === "municipality") {
        router.push("/water/municipality");
      } else {
        router.push("/water/citizen");
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-md mx-auto">
      {/* Demo banner */}
      <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 flex items-start gap-3">
        <AlertCircle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
        <p className="text-xs text-yellow-300">
          <strong>Demo / Hackathon Mode</strong> — This is a simulated portal login. Use the demo credentials provided below for each role.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 space-y-5">
        {/* Unified Tab Toggle */}
        <div className="flex bg-white/5 p-1 rounded-lg border border-border">
          <button
            type="button"
            onClick={() => handleTabChange("municipality")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === "municipality"
                ? "bg-accent text-black font-semibold shadow"
                : "text-slate-400 hover:text-foreground"
            }`}
          >
            <Building2 className="w-4 h-4" />
            Municipality Staff
          </button>
          <button
            type="button"
            onClick={() => handleTabChange("citizen")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === "citizen"
                ? "bg-accent text-black font-semibold shadow"
                : "text-slate-400 hover:text-foreground"
            }`}
          >
            <Droplets className="w-4 h-4" />
            Resident Citizen
          </button>
        </div>

        {/* Header info based on active tab */}
        <div className="flex items-center gap-3 border-b border-border/50 pb-3">
          <div className="rounded-lg bg-cyan-500/10 border border-cyan-500/20 p-2">
            {activeTab === "municipality" ? (
              <Building2 className="w-5 h-5 text-cyan-400" />
            ) : (
              <Droplets className="w-5 h-5 text-cyan-400" />
            )}
          </div>
          <div>
            <h1 className="text-lg font-bold">
              {activeTab === "municipality"
                ? "Municipality Staff Portal"
                : "Resident Self-Service Portal"}
            </h1>
            <p className="text-xs text-slate-400">
              {activeTab === "municipality"
                ? "BWSSB Zone Manager & Ops Access"
                : "Water Billing & Complaint Services"}
            </p>
          </div>
        </div>

        {/* Demo hint box */}
        <div className="rounded-lg bg-white/5 border border-border px-4 py-3 text-xs text-slate-400 space-y-1">
          <p className="font-medium text-slate-300">
            Demo credentials for {activeTab === "municipality" ? "Municipality" : "Citizen"}:
          </p>
          {activeTab === "municipality" ? (
            <>
              <p>
                Username: <code className="text-accent font-semibold">admin</code>
              </p>
              <p>
                Passcode: <code className="text-accent font-semibold">water2024</code> or <code className="text-accent font-semibold">bwssb-admin123</code>
              </p>
            </>
          ) : (
            <>
              <p>
                Username: <code className="text-accent font-semibold">resident</code>
              </p>
              <p>
                Passcode: <code className="text-accent font-semibold">bwssb123</code>
              </p>
            </>
          )}
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs text-slate-400 uppercase tracking-wide">Username</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                id="water-login-username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={activeTab === "municipality" ? "admin" : "resident"}
                required
                className="w-full bg-white/5 border border-border rounded-lg pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:border-accent/50"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-slate-400 uppercase tracking-wide">Passcode</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                id="water-login-passcode"
                type="password"
                autoComplete="current-password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-white/5 border border-border rounded-lg pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:border-accent/50"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-300 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <button
            id="water-login-submit"
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2.5 rounded-lg bg-accent text-black text-sm font-semibold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                Signing in…
              </>
            ) : (
              `Sign In as ${activeTab === "municipality" ? "Staff" : "Resident"}`
            )}
          </button>
        </form>
      </div>

      <div className="text-center">
        <a href="/water" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
          ← Back to Water Overview
        </a>
      </div>
    </div>
  );
}

export default function UnifiedWaterLoginPage() {
  return (
    <ErrorBoundary fallbackTitle="Water Login failed to render">
      <Suspense fallback={<LoadingSkeleton rows={4} className="max-w-md mx-auto p-6" />}>
        <UnifiedWaterLoginForm />
      </Suspense>
    </ErrorBoundary>
  );
}
