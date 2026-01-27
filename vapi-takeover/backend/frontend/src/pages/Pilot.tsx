import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Send, RotateCcw, MessageSquare, CheckCircle, AlertCircle, Phone, Mail, ExternalLink } from "lucide-react";
import { fetchAssistantByPilotSlug, PilotConfig } from "@/services/assistantService";
import { cn } from "@/lib/utils";

// Chat message type
interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export default function Pilot() {
  const { slug } = useParams<{ slug: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch assistant data
  const { data: assistant, isLoading: isLoadingAssistant, error } = useQuery({
    queryKey: ["pilot-assistant", slug],
    queryFn: () => fetchAssistantByPilotSlug(slug || ""),
    enabled: !!slug,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const pilotConfig = assistant?.pilot_config as PilotConfig | undefined;

  // Initialize session from localStorage
  useEffect(() => {
    if (assistant?.id) {
      const storageKey = `aspire:pilotSession:${assistant.id}`;
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed.sessionId && parsed.messages) {
            setSessionId(parsed.sessionId);
            setMessages(parsed.messages.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) })));
          }
        } catch (e) {
          console.error("Failed to restore session:", e);
        }
      }
    }
  }, [assistant?.id]);

  // Save session to localStorage
  useEffect(() => {
    if (assistant?.id && sessionId) {
      const storageKey = `aspire:pilotSession:${assistant.id}`;
      localStorage.setItem(storageKey, JSON.stringify({ sessionId, messages }));
    }
  }, [assistant?.id, sessionId, messages]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Add greeting message on first load
  useEffect(() => {
    if (assistant && messages.length === 0) {
      const greeting = pilotConfig?.greeting || assistant.first_message || "Hello! How can I help you today?";
      setMessages([{
        role: "assistant",
        content: greeting,
        timestamp: new Date(),
      }]);
    }
  }, [assistant, pilotConfig, messages.length]);

  const handleSend = async () => {
    if (!input.trim() || isLoading || !assistant) return;

    const userMessage = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMessage, timestamp: new Date() }]);
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assistantId: assistant.id,
          message: userMessage,
          sessionId,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      const data = await response.json();
      if (data.sessionId) {
        setSessionId(data.sessionId);
      }

      setMessages(prev => [...prev, {
        role: "assistant",
        content: data.response || "I'm sorry, I couldn't process that request.",
        timestamp: new Date(),
      }]);
    } catch (err) {
      console.error("Chat error:", err);
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "I'm sorry, I encountered an error. Please try again.",
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleReset = () => {
    if (assistant?.id) {
      localStorage.removeItem(`aspire:pilotSession:${assistant.id}`);
    }
    setSessionId(null);
    setMessages([]);
    // Re-add greeting
    if (assistant) {
      const greeting = pilotConfig?.greeting || assistant.first_message || "Hello! How can I help you today?";
      setMessages([{
        role: "assistant",
        content: greeting,
        timestamp: new Date(),
      }]);
    }
  };

  const handleTestQuestion = (question: string) => {
    setInput(question);
    inputRef.current?.focus();
  };

  // Loading state
  if (isLoadingAssistant) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500 mx-auto mb-4" />
          <p className="text-slate-400">Loading pilot...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !assistant) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-8">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-white mb-2">Pilot Not Found</h1>
          <p className="text-slate-400 mb-6">
            This pilot page doesn't exist or has been deactivated.
          </p>
          <Button
            variant="outline"
            className="border-slate-700 text-slate-300 hover:bg-slate-800"
            onClick={() => window.history.back()}
          >
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  const companyName = pilotConfig?.companyName || assistant.friendly_name || "AI Assistant";
  const title = pilotConfig?.title || `${companyName} AI Chat Pilot`;
  const scope = pilotConfig?.scope || [];
  const testQuestions = pilotConfig?.testQuestions || [];

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Aspire Logo (always shown) */}
              <img
                src="/aspire1.png"
                alt="Aspire AI"
                className="h-8 object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
              {/* Divider */}
              <div className="h-8 w-px bg-slate-700" />
              {/* Client Logo */}
              {assistant.pilot_logo_url ? (
                <img
                  src={assistant.pilot_logo_url}
                  alt={companyName}
                  className="h-8 max-w-[150px] object-contain"
                />
              ) : (
                <span className="text-lg font-semibold text-slate-200">{companyName}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded-full">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                Online
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Title Section */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
            {title}
          </h1>
          <p className="text-slate-400">
            This is a demonstration of the Aspire AI assistant for {companyName}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Info Cards */}
          <div className="space-y-6">
            {/* Scope Card */}
            {scope.length > 0 && (
              <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-400" />
                  Pilot Scope
                </h3>
                <ul className="space-y-2">
                  {scope.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                      <span className="text-green-400 mt-0.5">•</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Test Questions */}
            {testQuestions.length > 0 && (
              <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-indigo-400" />
                  Try These Questions
                </h3>
                <div className="space-y-2">
                  {testQuestions.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => handleTestQuestion(q)}
                      className="w-full text-left px-3 py-2 text-sm bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-colors text-slate-300 hover:text-white"
                    >
                      "{q}"
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Support Contact */}
            {pilotConfig?.supportContact && (
              <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
                <h3 className="text-lg font-semibold mb-4">Need Help?</h3>
                <div className="space-y-3 text-sm">
                  {pilotConfig.supportContact.name && (
                    <p className="text-slate-300">
                      Contact: <span className="text-white">{pilotConfig.supportContact.name}</span>
                    </p>
                  )}
                  {pilotConfig.supportContact.phone && (
                    <a
                      href={`tel:${pilotConfig.supportContact.phone}`}
                      className="flex items-center gap-2 text-indigo-400 hover:text-indigo-300"
                    >
                      <Phone className="h-4 w-4" />
                      {pilotConfig.supportContact.phone}
                    </a>
                  )}
                  {pilotConfig.supportContact.email && (
                    <a
                      href={`mailto:${pilotConfig.supportContact.email}`}
                      className="flex items-center gap-2 text-indigo-400 hover:text-indigo-300"
                    >
                      <Mail className="h-4 w-4" />
                      {pilotConfig.supportContact.email}
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Pilot Notice */}
            <div className="bg-amber-500/10 rounded-xl p-4 border border-amber-500/30">
              <p className="text-xs text-amber-200/80">
                <strong className="text-amber-300">Pilot Notice:</strong> This is a limited demonstration.
                The AI assistant is configured specifically for this pilot and may have constraints on
                what topics it can address.
              </p>
            </div>
          </div>

          {/* Right Column - Chat Widget */}
          <div className="lg:col-span-2">
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden flex flex-col h-[600px]">
              {/* Chat Header */}
              <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between bg-slate-800/80">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                    <MessageSquare className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <h4 className="text-sm font-medium">{companyName} AI</h4>
                    <p className="text-xs text-slate-400">Powered by Aspire</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleReset}
                  className="text-slate-400 hover:text-white"
                >
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Reset
                </Button>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex",
                      msg.role === "user" ? "justify-end" : "justify-start"
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[80%] rounded-2xl px-4 py-2.5",
                        msg.role === "user"
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-700/50 text-slate-100"
                      )}
                    >
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      <p className="text-xs mt-1 opacity-50">
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-slate-700/50 rounded-2xl px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
                        <span className="text-sm text-slate-400">Thinking...</span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="p-4 border-t border-slate-700 bg-slate-800/80">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSend();
                  }}
                  className="flex gap-2"
                >
                  <Input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Type your message..."
                    disabled={isLoading}
                    className="flex-1 bg-slate-700 border-slate-600 text-white placeholder:text-slate-400 focus-visible:ring-indigo-500"
                  />
                  <Button
                    type="submit"
                    disabled={isLoading || !input.trim()}
                    className="bg-indigo-600 hover:bg-indigo-700"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </form>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-12 pt-8 border-t border-slate-800 text-center text-sm text-slate-500">
          <p className="flex items-center justify-center gap-2">
            Powered by{" "}
            <a
              href="https://aspireexecutive.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1"
            >
              Aspire Executive AI
              <ExternalLink className="h-3 w-3" />
            </a>
          </p>
        </footer>
      </main>
    </div>
  );
}
