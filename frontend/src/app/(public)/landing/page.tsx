"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const stats = [
  { value: "6", label: "Integrated city modules" },
  { value: "12B", label: "Gemma 4 parameters" },
  { value: "3", label: "AI inference modes" },
  { value: "<15m", label: "Data refresh cache" },
];

const coreModules = [
  {
    idx: "/0.1",
    tag: "AI",
    title: "Water Distribution",
    desc: "AI scheduling, leakage detection, and demand forecasting per ward.",
  },
  {
    idx: "/0.2",
    tag: "ML",
    title: "Traffic Mood & Risk Zones",
    desc: "Event-based congestion prediction and driver-behavior accident risk scoring.",
  },
  {
    idx: "/0.3",
    tag: "SIM",
    title: "City Metabolism",
    desc: "Cross-system cascade modeling and stress-testing across all six modules.",
  },
];

const architectureCards = [
  { num: "01", title: "Water Layer", sub: "FastAPI + Gemma 4", tags: ["FastAPI", "Gemma4", "Realtime"] },
  { num: "02", title: "Reasoning Layer", sub: "Gemma 4 / XGBoost", tags: ["Gemma4", "XGB", "Python"] },
  { num: "03", title: "Data Layer", sub: "PostgreSQL + PostGIS", tags: ["Postgres", "PostGIS", "Multi-ward"] },
  { num: "04", title: "Orchestration", sub: "FastAPI", tags: ["REST", "Python", "Backend"] },
  { num: "05", title: "Delivery", sub: "Next.js + Mapbox", tags: ["Next.js", "Mapbox", "Live"] },
  { num: "06", title: "Output", sub: "Structured Dashboard", tags: ["Charts", "Alerts", "Reports"] },
];

const features = [
  {
    title: "Real-time Data Integration",
    description:
      "Live feeds from OpenWeather, TomTom, and municipal sensors with 15-minute cache refresh cycles.",
  },
  {
    title: "Spatial Intelligence",
    description:
      "PostGIS-powered geospatial queries for ward-level analysis and multi-zone cascade modeling.",
  },
  {
    title: "AI-Powered Reasoning",
    description:
      "Google Gemma 4 (12B) processes multimodal inputs for context-aware decision making.",
  },
  {
    title: "Predictive Analytics",
    description:
      "XGBoost and scikit-learn models for demand forecasting, risk scoring, and anomaly detection.",
  },
  {
    title: "Cross-System Simulation",
    description:
      "City metabolism engine models cascading effects across water, traffic, and infrastructure.",
  },
  {
    title: "Interactive Visualization",
    description:
      "Mapbox GL-powered dashboards with live updates, heatmaps, and customizable overlays.",
  },
];

const pipelineSteps = [
  { number: "01", title: "User Query", description: "Citizen or official submits request via dashboard" },
  { number: "02", title: "Gemma 4 Reasoning", description: "Multimodal AI interprets context and intent" },
  { number: "03", title: "Module Processing", description: "Route to appropriate city module" },
  { number: "04", title: "ML Scoring", description: "XGBoost/scikit-learn for numeric predictions" },
  { number: "05", title: "Map Visualization", description: "Render results on Mapbox with spatial context" },
  { number: "06", title: "AI Chat Response", description: "Natural language summary via CityPulse AI" },
];

export default function LandingPage() {
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 500);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToArchitecture = (e: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement>) => {
    e.preventDefault();
    const element = document.getElementById("architecture");
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <main className="landing-page-root bg-black min-h-screen text-white font-sans">
      <nav className="flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-2">
          <img
            src="/logo-citypulse.png"
            alt="CityPulse AI"
            className="w-8 h-8 rounded-full object-cover"
          />
          <span className="font-semibold text-white">CityPulse AI</span>
        </div>
        <Link href="/signin" className="landing-btn nav-btn-signin text-sm">
          Sign In
        </Link>
      </nav>



      <section className="text-center max-w-3xl mx-auto pt-16 pb-16 px-6">
        <h1 className="text-5xl md:text-6xl font-bold text-white leading-tight">
          Unified intelligence for sustainable cities.
        </h1>
        <p className="mt-6 text-lg text-white/70">
          CityPulse AI unifies water distribution, traffic management, and cross-system
          city metabolism — all reasoning powered by Google Gemma 4.
        </p>
        <button
          type="button"
          onClick={scrollToArchitecture}
          className="mt-8 px-6 py-3 rounded-xl bg-teal-500/15 backdrop-blur-md border border-teal-300/35 text-teal-300 font-medium hover:bg-teal-500/22 transition"
        >
          View Architecture →
        </button>
      </section>

      <section className="flex flex-wrap justify-center gap-12 pb-20 px-6">
        {stats.map((s) => (
          <div key={s.label} className="text-center">
            <div className="text-3xl font-bold text-white">{s.value}</div>
            <div className="text-sm text-white/50 mt-1">{s.label}</div>
          </div>
        ))}
      </section>

      <section id="modules" className="px-8 pb-24 scroll-mt-20">
        <h2 className="text-3xl font-bold text-white mb-8">Core Modules</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {coreModules.map((c) => (
            <div
              key={c.idx}
              className="intelligence-layer-card rounded-2xl p-6 bg-white/5 backdrop-blur-md border border-white/10"
            >
              <div className="flex justify-between items-center mb-4">
                <span className="card-index-label text-white/40 text-sm font-mono">{c.idx}</span>
                <span className="badge-btn text-xs px-2 py-1">{c.tag}</span>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">{c.title}</h3>
              <p className="text-white/75 text-sm leading-relaxed">{c.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ARCHITECTURE */}
      <section id="architecture" className="bg-black px-8 md:px-16 py-16 border-t border-white/10 scroll-mt-20">
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-12 sm:mb-16">Architecture</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {architectureCards.map((a) => (
            <div 
              key={a.num} 
              className="arch-card text-white p-6 sm:p-8 min-h-[240px] sm:min-h-[280px] flex flex-col justify-between cursor-pointer"
            >
              <div>
                <h3 className="text-xl sm:text-2xl font-bold tracking-tight">
                  <span className="arch-number">{a.num}</span> - {a.title}
                </h3>
                <p className="mt-1 text-white/60 text-sm sm:text-base">{a.sub}</p>
              </div>
              <div className="flex flex-wrap gap-2 mt-6">
                {a.tags.map((t) => (
                  <span key={t} className="px-3 py-1 bg-black border border-white/15 text-white text-xs rounded-md font-medium">{t}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CORE PIPELINE */}
      <section className="core-pipeline-section bg-black text-white px-8 md:px-16 py-16 border-t border-white/10">
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-12 sm:mb-16">Core Pipeline</h1>
        
        <div className="max-w-4xl">
          <div className="pipeline-list">
            {pipelineSteps.map((step, index) => (
              <div className="pipeline-box" key={index}>
                <span className="pipeline-number">{step.number}</span>
                <div className="pipeline-content">
                  <h3 className="pipeline-title">{step.title}</h3>
                  <p className="pipeline-description">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TECH STACK */}
      <section className="bg-black px-8 md:px-16 py-16 border-t border-white/10">
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-12 sm:mb-16">Tech Stack</h1>
        
        <div className="tech-stack-grid">
          <div className="tech-stack-card">
            <h3 className="tech-stack-title">Frontend</h3>
            <ul className="tech-stack-list">
              <li>→ Next.js 15</li>
              <li>→ React 19</li>
              <li>→ TypeScript</li>
              <li>→ Tailwind CSS</li>
              <li>→ Mapbox GL JS</li>
              <li>→ Recharts</li>
            </ul>
          </div>
          
          <div className="tech-stack-card">
            <h3 className="tech-stack-title">Backend</h3>
            <ul className="tech-stack-list">
              <li>→ FastAPI</li>
              <li>→ Python 3.11</li>
              <li>→ SQLAlchemy</li>
              <li>→ PostgreSQL</li>
              <li>→ PostGIS</li>
              <li>→ Docker</li>
            </ul>
          </div>
          
          <div className="tech-stack-card">
            <h3 className="tech-stack-title">AI & ML</h3>
            <ul className="tech-stack-list">
              <li>→ Google Gemma 4</li>
              <li>→ 12B parameters</li>
              <li>→ XGBoost</li>
              <li>→ scikit-learn</li>
              <li>→ Multimodal</li>
              <li>→ Real-time inference</li>
            </ul>
          </div>
        </div>
      </section>

      {/* KEY CAPABILITIES */}
      <section className="bg-black text-white px-8 md:px-16 py-16 border-t border-white/10">
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-12 sm:mb-16">Key Capabilities</h1>
        
        <div className="capabilities-grid">
          {features.map((feature) => (
            <div key={feature.title} className="feature-card">
              <h3 className="feature-title">{feature.title}</h3>
              <p className="feature-description">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* USE CASES */}
      <section id="use-cases" className="bg-black px-8 md:px-16 py-16 border-t border-white/10 scroll-mt-20">
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-16">Use Cases</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {[
            {
              title: "Emergency Response",
              desc: "Green corridor routing for ambulances with real-time traffic signal coordination.",
              icon: "🚑"
            },
            {
              title: "Water Management",
              desc: "AI-driven scheduling and leakage detection across municipal wards.",
              icon: "💧"
            },
            {
              title: "Traffic Optimization",
              desc: "Event-based congestion prediction and dynamic signal timing adjustments.",
              icon: "🚦"
            },
            {
              title: "Risk Assessment",
              desc: "Driver behavior analysis and accident-prone zone identification.",
              icon: "⚠️"
            },
            {
              title: "Public Transit",
              desc: "Bus route reliability scoring and schedule optimization recommendations.",
              icon: "🚌"
            },
            {
              title: "City Planning",
              desc: "Cross-system stress testing and infrastructure cascade modeling.",
              icon: "🏙️"
            },
          ].map((useCase, idx) => (
            <div 
              key={idx}
              className="usecase-card p-8 cursor-pointer"
            >
              <div className="use-case-icon text-5xl mb-4">{useCase.icon}</div>
              <h3 className="text-2xl font-bold tracking-tight mb-3">{useCase.title}</h3>
              <p className="leading-relaxed">{useCase.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA SECTION */}
      <section className="bg-black text-white px-8 md:px-16 py-24 border-t border-white/10">
        <div className="cta-container">
          <div className="cta-content">
            <h1 className="cta-heading">
              Ready to transform your city?
            </h1>
            <p className="cta-subheading">
              Join municipalities worldwide using CityPulse AI to build smarter, more sustainable urban systems.
            </p>
            <div className="cta-buttons-wrapper">
              <Link href="/water">
                <button className="cta-primary-btn">
                  <span>Launch Dashboard</span>
                  <svg className="cta-arrow" width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M7.5 5L12.5 10L7.5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </Link>
              <Link href="/signin">
                <button className="cta-secondary-btn">
                  <span>Sign In</span>
                </button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="landing-footer footer-section bg-black border-t border-white/10">
        <div className="footer-content">
          {/* Footer Brand */}
          <div className="footer-brand">
            <div className="footer-brand-row">
              <span className="footer-brand-text">CityPulse AI</span>
            </div>
            <p className="footer-tagline">
              Sustainable City Intelligence
            </p>
            <p className="footer-description">
              AI-powered platform for smart city management, powered by Google Gemma 4.
            </p>
          </div>

          {/* Footer Links Grid */}
          <div className="footer-links-grid">
            <div className="footer-links-column">
              <h4 className="footer-links-title">Platform</h4>
              <ul className="footer-links-list">
                <li><a href="/water" className="footer-link">Water Distribution</a></li>
                <li><a href="/traffic" className="footer-link">Traffic Management</a></li>
                <li><a href="/metabolism" className="footer-link">City Metabolism</a></li>
                <li><a href="/trust-score" className="footer-link">Trust Score</a></li>
              </ul>
            </div>

            <div className="footer-links-column">
              <h4 className="footer-links-title">Resources</h4>
              <ul className="footer-links-list">
                <li><a href="#architecture" className="footer-link">Architecture</a></li>
                <li><a href="#use-cases" className="footer-link">Use Cases</a></li>
                <li><a href="#modules" className="footer-link">Modules</a></li>
                <li><a href="/signin" className="footer-link">Documentation</a></li>
              </ul>
            </div>

            <div className="footer-links-column">
              <h4 className="footer-links-title">Company</h4>
              <ul className="footer-links-list">
                <li><a href="/signin" className="footer-link">About</a></li>
                <li><a href="/signin" className="footer-link">Contact</a></li>
                <li><a href="/signin" className="footer-link">Privacy</a></li>
                <li><a href="/signin" className="footer-link">Terms</a></li>
              </ul>
            </div>
          </div>
        </div>

        {/* Footer Bottom */}
        <div className="footer-bottom">
          <div className="footer-divider"></div>
          <div className="footer-bottom-content">
            <p className="footer-copyright">
              © 2026 CityPulse AI. All rights reserved.
            </p>
            <div className="footer-badges">
              <span className="footer-badge">Powered by Gemma 4</span>
              <span className="footer-badge">Open Source</span>
            </div>
          </div>
        </div>
      </footer>

      {/* SCROLL TO TOP BUTTON */}
      <button
        onClick={scrollToTop}
        className={`scroll-top-btn ${showScrollTop ? 'scroll-top-visible' : ''}`}
        aria-label="Scroll to top"
      >
        <svg className="scroll-top-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
        </svg>
        <span className="scroll-top-tooltip">Back to top</span>
      </button>
    </main>
  );
}
