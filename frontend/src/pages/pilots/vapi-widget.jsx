import React, { useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_GREETING =
  "Hello — I’m the Aspire AI assistant. Ask me a question and I’ll do my best to help.";

export default function VapiWidget({
  assistantId,
  brandUrl = "https://aspireexecutive.ai",
  title = "Aspire AI Chat",
  greeting = DEFAULT_GREETING,
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");

  // Fresh every visit: keep in memory only
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
            "Error: assistantId is missing. Confirm Netlify environment variable VITE_VAPI_ASSISTANT_MORETON is set for this pilot site and redeploy.",
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
