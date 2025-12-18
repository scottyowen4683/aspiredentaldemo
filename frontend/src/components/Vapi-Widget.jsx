import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

const GREETING =
  "Hello, I'm your demo chat bot, you can ask me anything about Aspire AI";

export default function VapiWidget({
  assistantId,
  brandUrl = "https://aspireexecutivesolutions.com.au",
  brandText = "Aspire Executive Solutions",
}) {
  const { pathname } = useLocation();

  // Widget open state
  const [open, setOpen] = useState(false);

  // Chat state
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");

  // "Fresh every visit": do not store this anywhere persistent
  const [chatId, setChatId] = useState(null);

  // Messages start with greeting
  const [messages, setMessages] = useState(() => [
    { role: "assistant", text: GREETING },
  ]);

  const scrollRef = useRef(null);

  const canSend = useMemo(() => {
    return Boolean(assistantId) && input.trim().length > 0 && !busy;
  }, [assistantId, input, busy]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  // Optional: keep chat context while navigating pages in the same visit.
  // If you want a fresh chat per page route, uncomment below.
  /*
  useEffect(() => {
    setChatId(null);
    setMessages([{ role: "assistant", text: GREETING }]);
    setBusy(false);
    setInput("");
  }, [pathname]);
  */

  function resetChat() {
    setChatId(null);
    setMessages([{ role: "assistant", text: GREETING }]);
    setBusy(false);
    setInput("");
  }

  async function send() {
    const text = input.trim();
    if (!canSend) return;

    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    setBusy(true);

    try {
      const res = await fetch("/.netlify/functions/vapi-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assistantId,
          input: text,
          previousChatId: chatId || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Chat request failed");
      }

      if (data?.id) setChatId(data.id);

      const reply =
        data?.output?.[0]?.content ||
        data?.output?.[0]?.text ||
        "Sorry, I did not get a reply. Please try again.";

      setMessages((prev) => [...prev, { role: "assistant", text: reply }]);
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "Something went wrong. Please refresh and try again.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-[2147483647]">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group inline-flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black shadow-[0_14px_45px_rgba(0,0,0,0.35)] ring-1 ring-white/10 transition hover:translate-y-[-1px] hover:bg-white/95"
          aria-label="Open chat"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-black text-white shadow-sm">
            💬
          </span>
          <span className="tracking-wide">Chat With Me</span>
        </button>
      ) : (
        <div className="flex h-[540px] w-[380px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0A1020] shadow-[0_18px_70px_rgba(0,0,0,0.55)] ring-1 ring-white/10">
          {/* Header */}
          <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-[#0A1020]/90 px-4 py-3 backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-black">
                🤖
              </div>
              <div className="leading-tight">
                <div className="text-sm font-semibold text-white">
                  Aspire AI Demo Chat
                </div>
                <div className="text-xs text-white/60">
                  {busy ? "Thinking..." : "Online"}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={resetChat}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/10 hover:text-white"
                aria-label="Reset chat"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/10 hover:text-white"
                aria-label="Close chat"
              >
                Close
              </button>
            </div>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-auto bg-gradient-to-b from-[#0A1020] to-[#070A12] px-4 py-4"
          >
            <div className="space-y-3">
              {messages.map((m, i) => {
                const isUser = m.role === "user";
                return (
                  <div
                    key={i}
                    className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={[
                        "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-snug shadow-sm",
                        isUser
                          ? "bg-white text-black"
                          : "bg-white/5 text-white ring-1 ring-white/10",
                      ].join(" ")}
                    >
                      {m.text}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Input */}
          <div className="border-t border-white/10 bg-[#0A1020]/90 px-3 py-3 backdrop-blur-xl">
            <div className="flex items-center gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") send();
                }}
                placeholder="Type your message..."
                className="h-11 flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm text-white placeholder:text-white/40 outline-none ring-0 transition focus:border-white/20"
              />
              <button
                type="button"
                onClick={send}
                disabled={!canSend}
                className={[
                  "h-11 rounded-2xl px-4 text-sm font-semibold transition",
                  canSend
                    ? "bg-white text-black hover:bg-white/95"
                    : "cursor-not-allowed bg-white/20 text-white/60",
                ].join(" ")}
              >
                Send
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between px-1 text-[11px] text-white/50">
              <span>
                Powered by{" "}
                <a
                  href={brandUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-white/70 underline decoration-white/30 underline-offset-2 hover:text-white"
                >
                  {brandText}
                </a>
              </span>
              <span className="text-white/40">{pathname}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
