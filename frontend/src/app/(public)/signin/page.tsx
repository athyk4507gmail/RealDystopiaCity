"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import LiveTrafficAnimation from "@/components/LiveTrafficAnimation";
import RainwaterWidget from "@/components/RainwaterWidget";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const canSubmit = email.trim().length > 0 && password.length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    // Auth not yet connected — placeholder only
    console.log("[CityPulse] Sign-in attempted. Auth not yet connected.");
    setTimeout(() => setLoading(false), 1200);
  };

  return (
    <div className="signin-root">
      <LiveTrafficAnimation />

      <div className="signin-rw-widget-area">
        <RainwaterWidget />
      </div>

      <div className="login-branding">
        <h1 className="login-brand-title">CityPulse AI</h1>
        <p className="login-brand-subtitle">Sign in to your dashboard</p>
      </div>

      <div className="signin-card login-card glass-panel">
        {/* Form */}
        <form onSubmit={handleSubmit} className="signin-form" noValidate>
          {/* Email */}
          <div className="signin-field">
            <label htmlFor="signin-email" className="signin-label">
              Email
            </label>
            <input
              id="signin-email"
              type="email"
              autoComplete="email"
              placeholder="you@city.gov"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="glass-input signin-input"
            />
          </div>

          {/* Password */}
          <div className="signin-field">
            <label htmlFor="signin-password" className="signin-label">
              Password
            </label>
            <div className="signin-password-wrap">
              <input
                id="signin-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="glass-input signin-input signin-input-pw"
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((v) => !v)}
                className="signin-pw-toggle"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Submit */}
          <button
            id="signin-submit"
            type="submit"
            disabled={!canSubmit || loading}
            className="btn-primary signin-submit signin-submit-btn"
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        {/* Back link */}
        <Link href="/landing" className="signin-back signin-back-link">
          ← Back to home
        </Link>
      </div>
    </div>
  );
}
