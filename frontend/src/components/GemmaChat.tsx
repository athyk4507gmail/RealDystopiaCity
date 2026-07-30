"use client";

import { useState } from "react";
import { Send, Loader2, AlertCircle } from "lucide-react";
import { api } from "@/lib/api";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface GemmaChatProps {
  systemPrompt?: string;
  initialMessage?: string;
  placeholder?: string;
  className?: string;
}

export default function GemmaChat({
  systemPrompt,
  initialMessage,
  placeholder = "Ask CityPulse AI...",
  className = "",
}: GemmaChatProps) {
  const [messages, setMessages] = useState<Message[]>(
    initialMessage
      ? [
          {
            id: "initial",
            role: "assistant",
            content: initialMessage,
            timestamp: new Date(),
          },
        ]
      : []
  );
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const response = await api.gemma.chat(input, systemPrompt);
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: response.reply,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to get response from Gemma";
      setError(errorMsg);
      setMessages((prev) =>
        prev.filter((m) => m.id !== userMessage.id)
      );
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={`flex flex-col gap-4 rounded-lg border border-border bg-slate-900/50 p-4 ${className}`}>
      {/* Messages */}
      <div className="max-h-96 space-y-3 overflow-y-auto">
        {messages.length === 0 && !error && (
          <div className="text-center text-sm text-slate-400">
            Start a conversation with CityPulse AI
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-xs rounded-lg px-3 py-2 text-sm ${
                msg.role === "user"
                  ? "bg-blue-600/30 text-blue-100"
                  : "bg-slate-700/50 text-slate-100"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            Thinking...
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded bg-red-500/20 px-3 py-2 text-sm text-red-300 border border-red-500/30">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-medium">Error</div>
            <div className="text-xs">{error}</div>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={loading}
          className="flex-1 rounded bg-slate-800 px-3 py-2 text-sm text-foreground placeholder-slate-500 outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          className="rounded bg-blue-600 px-3 py-2 text-slate-50 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Send message (Enter)"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
}
