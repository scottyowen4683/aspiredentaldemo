import React, { useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_GREETING =
  "Hello — I’m the Aspire AI assistant. Ask me a question and I’ll do my best to help.";

function safeStringify(obj, maxLen = 1400) {
  try {
    const s = JSON.stringify(obj, null, 2);
    return s.length > maxLen ? s.slice(0, maxLen) + "\n…(truncated)" : s;
  } catch {
    return String(obj);
  }
}

function extractReply(data) {
  // Common shapes we might receive back from a chat proxy
  const candidates = [
    data?.output?.[0]?.content,
    data?.output?.[0]?.text,
    data?.reply,
    data?.message,
    data?.text,
    data?.content,
    data?.data?.output?.[0]?.content,
    data?.data?.output?.[0]?.text,
    data?.data?.message,
    data?.data?.text,
  ];

  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }

  // If Vapi returns an array of messages
  if (Array.isArray(data?.messages)) {
    const last = [...data.messages].reverse().find((m) => m?.role !== "user");
    if (last?.content && typeof last.content === "string") return last.content;
    if (last?.text && typeof last.text === "string") return last.text;
  }

  return null;
}

export default function VapiWidget({
  assistantId,
  brandUrl = "https://aspireexecutive.ai",
  title = "Aspire AI Chat",
  greeting = DEFAULT_GREETING,
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [chatId, setChatId] = useState(null);

  const [messages, setMessages] = useState(() => [
    { role: "assistant", text: greeting },
  ]);

  const scrollRef = useRef(null);

  const canSend = useMemo(() => {
    return Boolean(assistantId) && input.trim().length > 0 && !busy;
  }, [assistantId, input, busy]);

  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  function resetChat() {
    setChatId(null);
    setMessages([{ role: "assistant", text: greeting }]);
    setBusy(false);
    setInput("");
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;

    if (!assistantId) {
      setMessages((prev) => [
        ...prev,
        { role: "user", text },
        {
          role: "assistant",
          text:
            "Error: assistantId is missing. Confirm Netlify env var VITE_VAPI_ASSISTANT_MORETON is set for this pilot site and redeploy.",
        },
      ]);
      setInput("");
      return;
    }

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

      const rawText = await res.text();
      let data;
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        data = { raw: rawText };
      }

      if (!res.ok) {
        const msg =
          data?.error ||
          data?.message ||
          (typeof data?.raw === "string" && data.raw.trim()
            ? data.raw
            : `Request failed (${res.status})`);
        throw new Error(msg);
      }

      if (data?.id) setChatId(data.id);

      const reply = extractReply(data);

      if (!reply) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text:
              "No reply field was found in the server response.\n\n" +
              "Debug (response snippet):\n" +
              safeStringify(data),
          },
        ]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", text: reply }]);
      }
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: `Error: ${err?.message || "Unknown error"}` },
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
          <span className="tracking-wide">Chat</span>
        </button>
      ) : (
        <div className="flex h-[540px] w-[380px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0A1020] shadow-[0_18px_70px_rgba(0,0,0,0.55)] ring-1 ring-white/10">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-[#0A1020]/90 px-4 py-3 backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-black">
                🤖
              </div>
              <div className="leading-tight">
                <div className="text-sm font-semibold text-white">{title}</div>
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
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/10 hover:text-white"
              >
                Close
              </button>
            </div>
          </div>

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
                    className={`flex ${
                      isUser ? "justify-end" : "justify-start"
                    }`}
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

          <div className="border-t border-white/10 bg-[#0A1020]/90 px-3 py-3 backdrop-blur-xl">
            <div className="flex items-center gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") send();
                }}
                placeholder="Type your message..."
                className="h-11 flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm text-white placeholder:text-white/40 outline-none transition focus:border-white/20"
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

            <div className="mt-2 px-1 text-[11px] text-white/50">
              Powered by{" "}
              <a
                href={brandUrl}
                target="_blank"
                rel="noreferrer"
                className="text-white/70 underline decoration-white/30 underline-offset-2 hover:text-white"
              >
                Aspire Executive Solutions
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
