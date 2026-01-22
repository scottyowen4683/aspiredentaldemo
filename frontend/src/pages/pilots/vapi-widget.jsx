import React, { useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_GREETING =
  "Hello — I’m the Aspire AI assistant. Ask me a question and I’ll do my best to help.";

/**
 * Stable session + chat persistence:
 * - sessionId is OURS (stored in localStorage) so continuity survives refresh/reload
 * - chatId is Vapi's chat id (stored in localStorage) so we can always send previousChatId
 *
 * This is the key to fixing “new chat id created each time”.
 */

function makeId(prefix = "sess") {
  // good enough uniqueness for web session IDs
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function safeLowerTrim(s) {
  return String(s || "").trim().toLowerCase();
}

export default function VapiWidget({
  assistantId,
  tenantId,
  brandUrl = "https://aspireexecutive.ai",
  title = "Aspire AI Chat",
  greeting = DEFAULT_GREETING,
  // Optional: if you run multiple tenants on one domain, allow isolating storage
  storageNamespace = "aspire_chat",
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");

  const [messages, setMessages] = useState(() => [
    { role: "assistant", text: greeting },
  ]);

  const scrollRef = useRef(null);

  const effectiveTenantId = safeLowerTrim(tenantId || "moreton");

  // Storage keys are tenant + assistant scoped so they don’t collide between council demo pages
  const storageKeys = useMemo(() => {
    const a = safeLowerTrim(assistantId || "no_assistant");
    const t = safeLowerTrim(effectiveTenantId || "no_tenant");
    const base = `${storageNamespace}::${t}::${a}`;
    return {
      sessionId: `${base}::sessionId`,
      chatId: `${base}::chatId`,
    };
  }, [assistantId, effectiveTenantId, storageNamespace]);

  // Stable sessionId + persisted chatId (Vapi)
  const [sessionId, setSessionId] = useState(null);
  const [chatId, setChatId] = useState(null);

  // Initialise persisted session/chat on mount + when tenant/assistant changes
  useEffect(() => {
    // Always reset message list to greeting when the tenant greeting changes
    setMessages([{ role: "assistant", text: greeting }]);
    setBusy(false);
    setInput("");

    // Create/restore session id
    let sid = null;
    try {
      sid = window.localStorage.getItem(storageKeys.sessionId);
    } catch {
      sid = null;
    }
    if (!sid) {
      sid = makeId("sess");
      try {
        window.localStorage.setItem(storageKeys.sessionId, sid);
      } catch {
        // ignore
      }
    }
    setSessionId(sid);

    // Restore Vapi chat id if present
    let cid = null;
    try {
      cid = window.localStorage.getItem(storageKeys.chatId);
    } catch {
      cid = null;
    }
    setChatId(cid || null);
  }, [greeting, storageKeys]);

  // Scroll to bottom
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  const canSend = useMemo(() => {
    return (
      Boolean(assistantId) &&
      Boolean(effectiveTenantId) &&
      Boolean(sessionId) &&
      input.trim().length > 0 &&
      !busy
    );
  }, [assistantId, effectiveTenantId, sessionId, input, busy]);

  function resetChat() {
    // New session (ours) and clear vapi chat id
    const newSid = makeId("sess");
    setSessionId(newSid);
    setChatId(null);

    try {
      window.localStorage.setItem(storageKeys.sessionId, newSid);
      window.localStorage.removeItem(storageKeys.chatId);
    } catch {
      // ignore
    }

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
        { role: "assistant", text: "Missing assistantId (page config)." },
      ]);
      setInput("");
      return;
    }

    if (!effectiveTenantId) {
      setMessages((prev) => [
        ...prev,
        { role: "user", text },
        { role: "assistant", text: "Missing tenantId (page config)." },
      ]);
      setInput("");
      return;
    }

    if (!sessionId) {
      setMessages((prev) => [
        ...prev,
        { role: "user", text },
        { role: "assistant", text: "Missing sessionId (local session init failed)." },
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
          tenantId: effectiveTenantId,

          // ✅ THE FIX:
          // Your own stable id, so your backend/tools can use it for memory
          sessionId,

          // ✅ Keep Vapi pinned to same thread
          previousChatId: chatId || undefined,

          // Message
          input: text,

          // ✅ Extra: put session + tenant into metadata so downstream tools can also read it
          // (safe even if vapi-chat ignores it)
          metadata: {
            tenantId: effectiveTenantId,
            sessionId,
            source: "aspire_widget",
          },
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
        const msg =
          data?.error ||
          data?.message ||
          (typeof data?.raw === "string" && data.raw.trim()
            ? data.raw
            : `Request failed (${res.status})`);
        throw new Error(msg);
      }

      // ✅ Persist chat id for continuity across reloads and Vapi forks
      if (data?.id) {
        setChatId(data.id);
        try {
          window.localStorage.setItem(storageKeys.chatId, data.id);
        } catch {
          // ignore
        }
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
          {/* Header */}
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
