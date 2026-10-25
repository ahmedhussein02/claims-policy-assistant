"use client";
import { useEffect, useRef, useState } from "react";
import { useIsAuthenticated } from "@azure/msal-react";
import { ApiClientError, useChatApi, type ChatSource } from "@/lib/api";

interface Msg { role: "user" | "assistant"; text: string; sources?: ChatSource[]; error?: boolean }

const WELCOME: Msg = {
  role: "assistant",
  text: "Hi! Ask me about our claims policies, or about your own claims (for example, \"What is the status of CLM-001?\").",
};

/** Renders **bold** and keeps line breaks, without ever injecting HTML. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => (
        <span key={i} className={line === "" ? "block h-2" : "block"}>
          {line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
            part.startsWith("**") && part.endsWith("**") ? <strong key={j}>{part.slice(2, -2)}</strong> : part
          )}
        </span>
      ))}
    </>
  );
}

export default function ChatWidget() {
  const signedIn = useIsAuthenticated();
  const sendChat = useChatApi();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy, open]);

  if (!signedIn) return null;

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text }]);
    setBusy(true);
    try {
      const reply = await sendChat(text, conversationId);
      setConversationId(reply.conversationId);
      setMessages((m) => [...m, { role: "assistant", text: reply.answer, sources: reply.sources }]);
    } catch (e) {
      const msg = e instanceof ApiClientError ? e.message : "Something went wrong. Please try again.";
      setMessages((m) => [...m, { role: "assistant", text: msg, error: true }]);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button 
        onClick={() => setOpen(true)} 
        aria-label="Open chat assistant"
        className="group fixed bottom-6 right-6 inline-flex items-center gap-2 px-6 py-3.5 overflow-hidden rounded-2xl bg-slate-100 text-blue-600 font-semibold text-sm cursor-pointer border border-blue-200/60 shadow-xl transition-all duration-300 hover:shadow-2xl hover:border-blue-400 active:scale-95 after:absolute after:inset-0 after:-translate-x-full hover:after:translate-x-full after:bg-gradient-to-r after:from-transparent after:via-white/70 after:to-transparent after:transition-transform after:duration-700"
      >
        <svg className="w-4 h-4 text-blue-600 transition-transform duration-300 group-hover:rotate-12 relative z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
        </svg>
        <span className="relative z-10">Ask the assistant</span>
      </button>
    );
  }

  return (
    <section aria-label="Claims assistant" className="fixed bottom-6 right-6 flex h-[34rem] w-[24rem] max-w-[calc(100vw-2rem)] flex-col rounded-2xl border border-slate-200/80 bg-white/95 backdrop-blur-md shadow-2xl overflow-hidden z-50">
      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center border border-blue-500/30">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
          </div>
          <h2 className="text-sm font-bold text-white tracking-wide">Claims assistant</h2>
        </div>
        <button 
          onClick={() => setOpen(false)} 
          aria-label="Close chat" 
          className="text-slate-400 hover:text-white transition-colors cursor-pointer p-1"
        >
          ✕
        </button>
      </header>

      <div className="flex-1 space-y-3.5 overflow-y-auto p-4 text-sm bg-slate-50/50" aria-live="polite">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-xs ${
              m.role === "user" 
                ? "bg-blue-600 text-white rounded-br-none" 
                : m.error 
                ? "border border-red-200 bg-red-50 text-red-700 rounded-bl-none" 
                : "bg-white text-slate-800 border border-slate-200/80 rounded-bl-none shadow-sm"
            }`}>
              <Rich text={m.text} />
              {!!m.sources?.length && (
                <div className="mt-2.5 border-t border-slate-200 pt-2 text-xs text-slate-500">
                  <div className="font-semibold text-slate-700">Sources</div>
                  <ul className="list-inside list-disc mt-1 space-y-0.5">
                    {m.sources.map((s, k) => <li key={k}>{s.documentTitle} — {s.section}</li>)}
                  </ul>
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-200/80 px-4 py-2.5 rounded-2xl rounded-bl-none text-xs font-medium text-slate-500 shadow-xs flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-pulse" />
              Thinking…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form className="flex gap-2.5 border-t border-slate-200/80 bg-white p-4" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <input 
          value={input} 
          onChange={(e) => setInput(e.target.value)} 
          maxLength={1000} 
          placeholder="Type your question…"
          aria-label="Your message" 
          className="flex-1 rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" 
          disabled={busy} 
        />
        <button 
          type="submit" 
          disabled={busy || !input.trim()}
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40 transition-all cursor-pointer shadow-sm active:scale-95"
        >
          Send
        </button>
      </form>
    </section>
  );
}