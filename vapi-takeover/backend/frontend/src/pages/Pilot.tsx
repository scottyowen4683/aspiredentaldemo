import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState, useRef, useEffect, useMemo } from "react";
import { Loader2, AlertCircle, X, RotateCcw } from "lucide-react";
import { fetchAssistantByPilotSlug, PilotConfig } from "@/services/assistantService";

// Chat message type
interface Message {
  role: "user" | "assistant";
  text: string;
}

// Floating Chat Widget Component
function ChatWidget({
  assistant,
  pilotConfig,
}: {
  assistant: any;
  pilotConfig: PilotConfig | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const greeting = pilotConfig?.greeting || assistant?.first_message ||
    "Hello — I'm the AI assistant. How can I help you today?";

  const title = pilotConfig?.title || `${pilotConfig?.companyName || assistant?.friendly_name || "AI"} Chat`;

  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", text: greeting },
  ]);

  // Storage key for session persistence
  const storageKey = useMemo(() => {
    return `aspire:pilotSession:${assistant?.id || "unknown"}`;
  }, [assistant?.id]);

  // Restore session from localStorage
  const [sessionId, setSessionId] = useState<string | null>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed.sessionId || null;
      }
      return null;
    } catch {
      return null;
    }
  });

  // Restore messages from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.messages && parsed.messages.length > 0) {
          setMessages(parsed.messages);
        }
      }
    } catch {
      // Ignore errors
    }
  }, [storageKey]);

  // Save session to localStorage
  useEffect(() => {
    if (sessionId || messages.length > 1) {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ sessionId, messages }));
      } catch {
        // Ignore errors
      }
    }
  }, [sessionId, messages, storageKey]);

  const canSend = useMemo(() => {
    return Boolean(assistant?.id) && input.trim().length > 0 && !busy;
  }, [assistant?.id, input, busy]);

  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, open]);

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
    if (!text || busy || !assistant?.id) return;

    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    setBusy(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assistantId: assistant.id,
          message: text,
          sessionId: sessionId || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || `Request failed (${res.status})`);
      }

      if (data?.sessionId) {
        setSessionId(data.sessionId);
      }

      const reply = data?.response || "Sorry, I did not get a reply. Please try again.";
      setMessages((prev) => [...prev, { role: "assistant", text: reply }]);
    } catch (err: any) {
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
                <RotateCcw className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-3 w-3" />
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
              {busy && (
                <div className="flex justify-start">
                  <div className="bg-white/5 text-white ring-1 ring-white/10 rounded-2xl px-4 py-3 text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Input */}
          <div className="border-t border-white/10 bg-[#0A1020]/90 px-3 py-3 backdrop-blur-xl">
            <div className="flex items-center gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) send();
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
                href="https://aspireexecutive.ai"
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

// Main Pilot Page Component
export default function Pilot() {
  const { slug } = useParams<{ slug: string }>();

  // Fetch assistant data
  const { data: assistant, isLoading: isLoadingAssistant, error } = useQuery({
    queryKey: ["pilot-assistant", slug],
    queryFn: () => fetchAssistantByPilotSlug(slug || ""),
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  });

  const pilotConfig = assistant?.pilot_config as PilotConfig | undefined;

  // Loading state
  if (isLoadingAssistant) {
    return (
      <div className="min-h-screen bg-[#070A12] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-white/60 mx-auto mb-4" />
          <p className="text-white/60">Loading pilot...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !assistant) {
    return (
      <div className="min-h-screen bg-[#070A12] flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-8">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-white mb-2">Pilot Not Found</h1>
          <p className="text-white/60 mb-6">
            This pilot page doesn't exist or has been deactivated.
          </p>
          <button
            onClick={() => window.history.back()}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10 hover:text-white"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const companyName = pilotConfig?.companyName || assistant.friendly_name || "AI Assistant";
  const title = pilotConfig?.title || `Aspire AI Chat Pilot — ${companyName}`;
  const description = pilotConfig?.description ||
    `This page is a controlled evaluation environment to trial an AI assistant for common, low-risk enquiries. It is vendor-hosted and not connected to ${companyName} systems.`;

  // Default scope items if not configured
  const scopeItems = pilotConfig?.scope || [
    "Informational enquiries only (e.g. general guidance, FAQs, opening hours)."
  ];

  // Default test questions if not configured
  const testQuestions = pilotConfig?.testQuestions || [
    "What services do you offer?",
    "What are your opening hours?",
    "How can I contact support?",
    "What are your prices?",
  ];

  // Default constraints
  const constraints = pilotConfig?.constraints || [
    "No payments or account-specific actions",
    "No decisions or formal determinations",
    "Escalation/deflection is intentional",
  ];

  // Reviewer notes
  const reviewerNotes = pilotConfig?.reviewerNotes || [
    "Does the assistant stay within low-risk scope?",
    "Does it route/escalate when uncertain?",
    "Is the tone appropriate and professional?",
    "Are responses consistent and clearly worded?",
  ];

  return (
    <div className="min-h-screen bg-[#070A12] text-white">
      {/* Background blur effects */}
      <div className="pointer-events-none fixed inset-0 opacity-60">
        <div className="absolute -top-48 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-white/10 blur-[120px]" />
        <div className="absolute bottom-[-240px] right-[-140px] h-[520px] w-[520px] rounded-full bg-white/10 blur-[140px]" />
      </div>

      <div className="relative mx-auto max-w-6xl px-6 py-10">
        {/* Header Section */}
        <header className="flex flex-col gap-6 rounded-3xl border border-white/10 bg-white/[0.03] p-7 shadow-[0_18px_70px_rgba(0,0,0,0.55)] backdrop-blur-xl">
          {/* Logo Row */}
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-5">
              <div className="flex items-center gap-4">
                <img
                  src="/aspire1.png"
                  alt="Aspire Executive Solutions"
                  className="h-10 w-auto opacity-95"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
                <div className="h-8 w-px bg-white/15" />
                {assistant.pilot_logo_url ? (
                  <img
                    src={assistant.pilot_logo_url}
                    alt={companyName}
                    className="h-10 w-auto max-w-[150px] opacity-95 object-contain"
                  />
                ) : (
                  <span className="text-lg font-semibold text-white/90">{companyName}</span>
                )}
              </div>
            </div>

            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/70">
              <span className="h-2 w-2 rounded-full bg-emerald-400/80" />
              Pilot environment • Chat evaluation only
            </div>
          </div>

          {/* Title & Description */}
          <div className="max-w-3xl">
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
              {title}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-white/70 md:text-base">
              {description}
            </p>
          </div>

          {/* Info Cards Grid */}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <div className="text-sm font-semibold">Scope</div>
              <div className="mt-1 text-sm text-white/65">
                {scopeItems[0]}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <div className="text-sm font-semibold">Governance</div>
              <div className="mt-1 text-sm text-white/65">
                Designed to escalate or stop when a request is outside scope.
                {companyName} remains in control.
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <div className="text-sm font-semibold">Urgent matters</div>
              <div className="mt-1 text-sm text-white/65">
                Not for emergencies. For urgent issues, use official channels.
              </div>
            </div>
          </div>

          {/* Support Contact */}
          {pilotConfig?.supportContact && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <div className="text-sm font-semibold">Pilot support & escalation</div>
              <div className="mt-1 text-sm text-white/70">
                For any queries or escalations, please contact{" "}
                <span className="font-semibold text-white">{pilotConfig.supportContact.name}</span>
                {pilotConfig.supportContact.phone && (
                  <>
                    {" "}on{" "}
                    <a
                      href={`tel:${pilotConfig.supportContact.phone}`}
                      className="font-semibold text-white underline decoration-white/30 underline-offset-4 hover:decoration-white/60"
                    >
                      {pilotConfig.supportContact.phone}
                    </a>
                  </>
                )}
                {pilotConfig.supportContact.email && (
                  <>
                    {" "}or email{" "}
                    <a
                      href={`mailto:${pilotConfig.supportContact.email}`}
                      className="font-semibold text-white underline decoration-white/30 underline-offset-4 hover:decoration-white/60"
                    >
                      {pilotConfig.supportContact.email}
                    </a>
                  </>
                )}
                .
              </div>
            </div>
          )}

          {/* Disclaimer */}
          <div className="text-xs leading-relaxed text-white/55">
            By using this pilot, you acknowledge responses may be incomplete or
            subject to change. Please avoid entering sensitive personal
            information unless explicitly required for a specific task.
          </div>
        </header>

        {/* Main Content */}
        <main className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
          {/* How to Test Section */}
          <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-7 shadow-[0_18px_70px_rgba(0,0,0,0.45)] backdrop-blur-xl">
            <h2 className="text-sm font-semibold text-white/90">How to test</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/65">
              Ask a few typical questions. Focus on clarity, accuracy, escalation
              behaviour and tone.
            </p>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {testQuestions.map((q) => (
                <div
                  key={q}
                  className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-white/70"
                >
                  {q}
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <div className="text-sm font-semibold">Notes for reviewers</div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-white/65">
                {reviewerNotes.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </div>
          </section>

          {/* Pilot Constraints Sidebar */}
          <aside className="rounded-3xl border border-white/10 bg-white/[0.03] p-7 shadow-[0_18px_70px_rgba(0,0,0,0.45)] backdrop-blur-xl">
            <h2 className="text-sm font-semibold text-white/90">Pilot constraints</h2>
            <ul className="mt-3 space-y-2 text-sm text-white/65">
              {constraints.map((c, i) => (
                <li key={i}>• {c}</li>
              ))}
            </ul>

            <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <div className="text-sm font-semibold">Assistant status</div>
              <div className="mt-2 text-xs text-white/60">
                Status:{" "}
                <span className="text-emerald-300">
                  Active
                </span>
              </div>
              {scopeItems.length > 1 && (
                <div className="mt-3">
                  <div className="text-xs font-semibold text-white/70 mb-1">Additional scope:</div>
                  <ul className="text-xs text-white/55 space-y-1">
                    {scopeItems.slice(1).map((item, i) => (
                      <li key={i}>• {item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </aside>
        </main>

        {/* Floating Chat Widget */}
        <ChatWidget assistant={assistant} pilotConfig={pilotConfig} />
      </div>
    </div>
  );
}
