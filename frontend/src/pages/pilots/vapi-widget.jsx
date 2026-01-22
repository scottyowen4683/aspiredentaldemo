import React, { useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_GREETING =
  "Hello — I’m the Aspire AI assistant. Ask me a question and I’ll do my best to help.";

export default function VapiWidget({
  assistantId,
  tenantId,
  brandUrl = "https://aspireexecutive.ai",
  title = "Aspire AI Chat",
  greeting = DEFAULT_GREETING,
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");

  const [messages, setMessages] = useState(() => [
    { role: "assistant", text: greeting },
  ]);

  const scrollRef = useRef(null);

  const effectiveTenantId = (tenantId || "moreton").trim().toLowerCase();

  // 🔐 Stable per-assistant + tenant storage key
  const storageKey = useMemo(() => {
    return `aspire:vapiSession:${effectiveTenantId}:${assistantId || "no_asst"}`;
  }, [effectiveTenantId, assistantId]);

  // 🔁 Restore session from localStorage
  const [sessionId, setSessionId] = useState(() => {
    try {
      const v = localStorage.getItem(storageKey);
      return v && v.trim() ? v.trim() : null;
    } catch {
      return null;
    }
  });

  const canSend = useMemo(() => {
    return (
      Boolean(assistantId) &&
      Boolean(effectiveTenantId) &&
      input.trim().length > 0 &&
      !busy
    );
  }, [assistantId, effectiveTenantId, input, busy]);

  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  // Greeting change resets messages but NOT the session
  useEffect(() => {
    setMessages([{ role: "assistant", text: greeting }]);
    setBusy(false);
    setInput("");
  }, [greeting]);

  function resetChat() {
    try {
      localStorage.removeItem(storageKey);
    } catch {}
    setSessionId(null);
    setMessages([{ role: "assistant", text: greeting }]);
    setBusy(false);
    setInput("");
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;

    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    setBusy(true);

    try {
      console.log("SENDING →", {
        assistantId,
        tenantId: effectiveTenantId,
        sessionId,
      });

      const res = await fetch("/.netlify/functions/vapi-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assistantId,
          tenantId: effectiveTenantId,
          input: text,
          sessionId: sessionId || undefined,
        }),
      });

      const raw = await res.text();
      let data = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = { raw };
      }

      if (!res.ok) {
        throw new Error(
          data?.error ||
            data?.message ||
            `Request failed (${res.status})`
        );
      }

      // ✅ Persist returned sessionId
      if (data?.sessionId && typeof data.sessionId === "string") {
        const sid = data.sessionId.trim();
        console.log("RECEIVED ← sessionId:", sid);
        setSessionId(sid);
        try {
          localStorage.setItem(storageKey, sid);
        } catch {}
      }

      const reply =
        data?.output?.[0]?.content ||
        data?.output?.[0]?.text ||
        "Sorry, I did not get a reply. Please try again.";

      setMessages((prev) => [...prev, { role: "assistant", text: reply }]);
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: `Error: ${err.message}` },
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
          className="group inline-flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black shadow-[0_14px_45px_rgba(0,0,0,0.35)]"
        >
          💬 Chat
        </button>
      ) : (
        <div className="flex h-[540px] w-[380px] flex-col overflow-hidden rounded-2xl bg-[#0A1020] shadow-xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <div>
              <div className="text-sm font-semibold text-white">{title}</div>
              <div className="text-xs text-white/60">
                {busy ? "Thinking…" : "Online"}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={resetChat} className="text-xs text-white/70">
                Reset
              </button>
              <button onClick={() => setOpen(false)} className="text-xs text-white/70">
                Close
              </button>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`rounded-xl px-4 py-2 text-sm ${
                  m.role === "user"
                    ? "bg-white text-black"
                    : "bg-white/10 text-white"
                }`}>
                  {m.text}
                </div>
              </div>
            ))}
          </div>

          <div className="p-3 border-t border-white/10">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                className="flex-1 rounded-xl bg-white/10 px-3 text-white"
                placeholder="Type your message…"
              />
              <button
                onClick={send}
                disabled={!canSend}
                className="rounded-xl bg-white px-4 font-semibold"
              >
                Send
              </button>
            </div>
            <div className="mt-2 text-[11px] text-white/50">
              Powered by <a href={brandUrl} target="_blank" rel="noreferrer">Aspire</a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
