"use client";

import { Sparkles } from "lucide-react";
import GemmaChat from "@/components/GemmaChat";

export default function GemmaPage() {
  return (
    <div className="min-h-screen bg-slate-950 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Header */}
        <div className="space-y-2 text-center">
          <div className="flex items-center justify-center gap-2">
            <Sparkles className="w-6 h-6 text-blue-400" />
            <h1 className="text-3xl font-bold text-foreground">CityPulse AI</h1>
          </div>
          <p className="text-slate-400">
            Powered by Gemma LLM — Ask questions about your city
          </p>
        </div>

        {/* Generic Chat */}
        <div className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-2">
              General Assistant
            </h2>
            <p className="text-sm text-slate-400 mb-3">
              Chat with CityPulse AI for general city insights and information.
            </p>
          </div>
          <GemmaChat
            systemPrompt="You are CityPulse AI, a municipal intelligence assistant for sustainable cities. Answer questions concisely and helpfully using available city data."
            placeholder="Ask about city services, traffic, water supply, or any municipal topic..."
          />
        </div>

        {/* Water Module Chat */}
        <div className="space-y-3 border-t border-border pt-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-2">
              Water Intelligence
            </h2>
            <p className="text-sm text-slate-400 mb-3">
              Ask specific questions about water supply, schedules, and sustainability.
            </p>
          </div>
          <GemmaChat
            systemPrompt="You are CityPulse AI's Water Module assistant. Focus on water supply schedules, leakage detection, demand prediction, and water conservation strategies. Be concise and actionable."
            placeholder="Ask about water supply, schedules, or conservation..."
          />
        </div>

        {/* Traffic Module Chat */}
        <div className="space-y-3 border-t border-border pt-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-2">
              Traffic Intelligence
            </h2>
            <p className="text-sm text-slate-400 mb-3">
              Get insights on traffic patterns, congestion forecasts, and routing recommendations.
            </p>
          </div>
          <GemmaChat
            systemPrompt="You are CityPulse AI's Traffic Module assistant. Provide insights on traffic patterns, congestion, signal optimization, and travel recommendations. Focus on practical solutions."
            placeholder="Ask about traffic, congestion, or routing..."
          />
        </div>

        {/* Info Box */}
        <div className="rounded-lg bg-slate-800/50 border border-border p-4 text-sm text-slate-300 space-y-2">
          <p className="font-medium text-slate-200">ℹ️ About Gemma Integration</p>
          <ul className="list-inside list-disc space-y-1 text-xs">
            <li>
              Requires <code className="bg-slate-900 px-1.5 py-0.5 rounded text-xs">GEMMA_API_KEY</code> in backend/.env
            </li>
            <li>
              Supports OpenAI-compatible providers (HuggingFace, OpenRouter, Groq, Together, etc.)
            </li>
            <li>
              Falls back to rule-based responses if API is not configured
            </li>
            <li>
              No API keys are ever exposed to the frontend
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
