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
      <button onClick={() => setOpen(true)} aria-label="Open chat assistant"
        className="fixed bottom-5 right-5 rounded-full bg-blue-600 px-5 py-3 text-sm font-medium text-white shadow-lg hover:bg-blue-700">
        Ask the assistant
      </button>
    );
  }

  return (
    <section aria-label="Claims assistant" className="fixed bottom-5 right-5 flex h-[32rem] w-[22rem] max-w-[calc(100vw-2rem)] flex-col rounded-lg border bg-white shadow-xl">
      <header className="flex items-center justify-between border-b px-4 py-2">
        <h2 className="text-sm font-semibold">Claims assistant</h2>
        <button onClick={() => setOpen(false)} aria-label="Close chat" className="text-gray-500 hover:text-gray-800">✕</button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto p-3 text-sm" aria-live="polite">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className={`max-w-[85%] rounded-lg px-3 py-2 ${m.role === "user" ? "bg-blue-600 text-white" : m.error ? "border border-red-200 bg-red-50 text-red-700" : "bg-gray-100"}`}>
              <Rich text={m.text} />
              {!!m.sources?.length && (
                <div className="mt-2 border-t border-gray-300 pt-1 text-xs text-gray-600">
                  <div className="font-medium">Sources</div>
                  <ul className="list-inside list-disc">
                    {m.sources.map((s, k) => <li key={k}>{s.documentTitle} — {s.section}</li>)}
                  </ul>
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && <p className="text-xs text-gray-500">Thinking…</p>}
        <div ref={endRef} />
      </div>

      <form className="flex gap-2 border-t p-3" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} maxLength={1000} placeholder="Type your question…"
          aria-label="Your message" className="flex-1 rounded border px-2 py-1 text-sm" disabled={busy} />
        <button type="submit" disabled={busy || !input.trim()}
          className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:opacity-40">Send</button>
      </form>
    </section>
  );
}
