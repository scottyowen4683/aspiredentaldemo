import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, PhoneCall, MessageSquare, Zap, ShieldCheck } from "lucide-react";

export default function Agents() {
  return (
    <div className="space-y-16">
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-10 md:p-14">
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-blue-600/20 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />

        <div className="relative">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs text-white/70">
            <ShieldCheck className="h-4 w-4" />
            Aspire AI Agents
          </p>

          <h1 className="mt-6 text-4xl md:text-6xl font-semibold tracking-tight">
            Choose the agent.
            <span className="text-white/70"> Keep the outcomes.</span>
          </h1>

          <p className="mt-5 max-w-2xl text-base md:text-lg text-white/70 leading-relaxed">
            Voice, chat, and outbound agents — designed as a governed system,
            not a collection of gimmicks.
          </p>

          <div className="mt-8 grid gap-6 md:grid-cols-3">
            <AgentCard
              icon={<PhoneCall className="h-4 w-4" />}
              title="Voice Agents"
              text="Answer calls, triage issues, capture intent, escalate cleanly."
              to="/agents/voice"
            />
            <AgentCard
              icon={<MessageSquare className="h-4 w-4" />}
              title="Chat Agents"
              text="Instant web chat that resolves and routes — without junk UX."
              to="/agents/chat"
            />
            <AgentCard
              icon={<Zap className="h-4 w-4" />}
              title="Outbound Agents"
              text="Callbacks, campaigns, confirmations — with a premium voice."
              to="/agents/outbound"
            />
          </div>

          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              to="/framework"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white/90 hover:bg-white/10"
            >
              See the Framework <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="/#contact"
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black hover:bg-white/90"
            >
              Talk to Aspire <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

function AgentCard({ icon, title, text, to }) {
  return (
    <Link
      to={to}
      className="group rounded-3xl border border-white/10 bg-white/5 p-8 hover:bg-white/10 transition-colors"
    >
      <div className="flex items-center gap-2 text-white/85">
        <div className="rounded-2xl border border-white/15 bg-white/5 p-3 group-hover:bg-white/10">
          {icon}
        </div>
        <p className="text-lg font-semibold">{title}</p>
      </div>
      <p className="mt-4 text-sm text-white/70 leading-relaxed">{text}</p>
      <div className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-white/85">
        Explore <ArrowRight className="h-4 w-4" />
      </div>
    </Link>
  );
}
