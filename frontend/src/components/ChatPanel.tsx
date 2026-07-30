"use client";

import { useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { api } from "@/lib/api";
import { sanitizeChatMessage } from "@/lib/validation";
import clsx from "clsx";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function ChatPanel({ module }: { module: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hi! I'm CityPulse AI. Ask me anything about the current module data.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const send = async () => {
    const userMsg = sanitizeChatMessage(input);
    if (!userMsg || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: userMsg }]);
    setLoading(true);
    try {
      const res = await api.chat(userMsg, module);
      setMessages((m) => [...m, { role: "assistant", content: res.content }]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Sorry, I couldn't reach the backend. Is it running on port 8000?" },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={clsx(
          "fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-full",
          "bg-accent text-black font-medium shadow-lg shadow-accent/20 hover:bg-accent-dim transition-colors",
          open && "hidden"
        )}
      >
        <MessageCircle className="w-5 h-5" />
        Ask CityPulse AI
      </button>

      {open && (
        <div className="chat-panel fixed bottom-6 right-6 z-50 w-96 h-[500px] flex flex-col glass-panel shadow-2xl">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div>
              <h3 className="citypulse-brand-text font-semibold text-sm">Ask CityPulse AI</h3>
              <p className="text-xs text-slate-400">Gemma 4 powered</p>
            </div>
            <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-foreground">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={clsx(
                  "text-sm rounded-lg px-3 py-2 max-w-[85%]",
                  msg.role === "user"
                    ? "ml-auto bg-accent/20 text-accent"
                    : "bg-white/5 text-slate-300"
                )}
              >
                {msg.content}
              </div>
            ))}
            {loading && (
              <div className="text-sm text-slate-400 animate-pulse">Thinking...</div>
            )}
          </div>

          <div className="p-3 border-t border-border flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Why is Ward 4 not getting water?"
              maxLength={500}
              className="flex-1 bg-white/5 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
            />
            <button
              onClick={send}
              disabled={loading}
              className="p-2 rounded-lg bg-accent text-black hover:bg-accent-dim disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
