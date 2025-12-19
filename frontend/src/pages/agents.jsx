import React from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  PhoneCall,
  MessageSquare,
  Zap,
  ShieldCheck,
  LineChart,
  Workflow,
  Gauge,
  CheckCircle2,
} from "lucide-react";

export default function Agents() {
  return (
    <div className="space-y-16">
      {/* HERO */}
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-10 md:p-14">
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-blue-600/20 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />

        <div className="relative">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs text-white/70">
            <ShieldCheck className="h-4 w-4" />
            Aspire AI Agents. Governed by the ASPIRE™ Enterprise AI Framework.
          </p>

          <h1 className="mt-6 text-4xl md:text-6xl font-semibold tracking-tight">
            Premium agents.
            <span className="text-white/70"> Production-grade performance.</span>
          </h1>

          <p className="mt-5 max-w-3xl text-base md:text-lg text-white/70 leading-relaxed">
            Voice, chat, and outbound agents designed for real operations, not
            demos. Built with guardrails, controlled escalation, and measurable
            outcomes. Reported in real time through the{" "}
            <span className="text-white/85 font-semibold">Aspire Portal</span>.
          </p>

          {/* Proof tiles */}
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <ValueCard
              icon={<Gauge className="h-4 w-4" />}
              title="High throughput"
              text="Architected for reliability under load, including high-volume periods. Capacity is deployment dependent and engineered, not assumed."
            />
            <ValueCard
              icon={<LineChart className="h-4 w-4" />}
              title="Real-time reporting"
              text="See what people asked, what resolved, what escalated, and where optimisation is required. Visibility is operational, not vanity metrics."
            />
            <ValueCard
              icon={<Workflow className="h-4 w-4" />}
              title="Controlled outcomes"
              text="Triage, action, escalation. Clean handover summaries so your team receives context and urgency in a format they can act on."
            />
          </div>

          {/* Agent cards */}
          <div className="mt-10 grid items-stretch gap-6 md:grid-cols-3">
            <AgentCard
              icon={<PhoneCall className="h-4 w-4" />}
              title="Voice Agents"
              text="Instant call answering with structured triage, intent capture, and controlled escalation. Calm, consistent tone by design."
              highlights={[
                "Fast pickup and structured triage",
                "Consent-aware and escalation-ready",
                "Outcome summaries for staff",
              ]}
              to="/agents/voice"
            />
            <AgentCard
              icon={<MessageSquare className="h-4 w-4" />}
              title="Chat Agents"
              text="Premium web chat that resolves common enquiries and routes the rest. Grounded answers, controlled behaviour, and clean handover."
              highlights={[
                "Grounded answers and safe fallback",
                "Short answers by default, detail on request",
                "Routes to forms, email, or humans",
              ]}
              to="/agents/chat"
            />
            <AgentCard
              icon={<Zap className="h-4 w-4" />}
              title="Outbound Agents"
              text="Controlled outbound for callbacks, confirmations, reminders, and proactive updates. Consent-first and brand-protective."
              highlights={[
                "Consent-first outbound logic",
                "Guardrails and escalation paths",
                "Measured outcomes and reporting",
              ]}
              to="/agents/outbound"
            />
          </div>

          {/* Portal strip */}
          <div className="mt-10 rounded-3xl border border-white/10 bg-black/20 p-10">
            <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
              <div className="max-w-3xl">
                <p className="text-2xl md:text-3xl font-semibold tracking-tight">
                  The Aspire Portal
                  <span className="text-white/70"> makes performance visible.</span>
                </p>
                <p className="mt-3 text-sm md:text-base text-white/70 leading-relaxed">
                  Every interaction becomes operational intelligence, not noise.
                  Track volumes, top enquiries, resolution versus escalation,
                  failure modes, and optimisation opportunities. This is how
                  Aspire stays premium in production. Measurable, governed, and
                  continuously improved.
                </p>
                <div className="mt-6 grid gap-3 md:grid-cols-2">
                  <Bullet text="Real-time dashboards and trend reporting" />
                  <Bullet text="Top questions, deflection, and escalation drivers" />
                  <Bullet text="Quality review signals to improve performance" />
                  <Bullet text="Monthly optimisation loop under the ASPIRE™ Framework" />
                </div>
              </div>

              <div className="shrink-0">
                <Link
                  to="/framework"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-6 py-3 text-sm font-semibold text-black hover:bg-white/90"
                >
                  See the Framework <ArrowRight className="h-4 w-4" />
                </Link>
                <div className="mt-3 text-xs text-white/55 max-w-[260px]">
                  Agents are deployed under governance, reporting, and control.
                  This is not set and forget.
                </div>
              </div>
            </div>
          </div>

          {/* CTAs */}
          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              to="/government"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white/90 hover:bg-white/10"
            >
              Government <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/business"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white/90 hover:bg-white/10"
            >
              Business <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="https://calendly.com/scott-owen-aspire/ai-demo"
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black hover:bg-white/90"
              target="_blank"
              rel="noreferrer"
            >
              Book a demo <ArrowRight className="h-4 w-4" />
            </a>
          </div>

          <div className="mt-6 text-xs text-white/55">
            Note: throughput depends on deployment configuration, telephony, and
            workflow complexity. We architect for reliability under load.
          </div>
        </div>
      </section>
    </div>
  );
}

/* UI */

function ValueCard({ icon, title, text }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-center gap-2 text-white/80">
        {icon}
        <p className="text-sm font-semibold">{title}</p>
      </div>
      <p className="mt-2 text-sm text-white/65 leading-relaxed">{text}</p>
    </div>
  );
}

function AgentCard({ icon, title, text, highlights, to }) {
  return (
    <Link
      to={to}
      className="group flex h-full flex-col rounded-3xl border border-white/10 bg-white/5 p-8 hover:bg-white/10 transition-colors"
    >
      <div className="flex items-center gap-2 text-white/85">
        <div className="rounded-2xl border border-white/15 bg-white/5 p-3 group-hover:bg-white/10">
          {icon}
        </div>
        <p className="text-lg font-semibold">{title}</p>
      </div>

      {/* THIS IS THE ONLY CHANGE: lock description height so bullet blocks align */}
      <p className="mt-4 text-sm text-white/70 leading-relaxed md:line-clamp-3 md:min-h-[4.5rem]">
        {text}
      </p>

      <div className="mt-5 space-y-2">
        {highlights.map((h) => (
          <Bullet key={h} text={h} />
        ))}
      </div>

      <div className="mt-auto pt-6 inline-flex items-center gap-2 text-sm font-semibold text-white/85">
        Explore <ArrowRight className="h-4 w-4" />
      </div>
    </Link>
  );
}

function Bullet({ text }) {
  return (
    <div className="flex items-start gap-2 text-sm text-white/75">
      <CheckCircle2 className="mt-0.5 h-4 w-4 text-white/70" />
      <span>{text}</span>
    </div>
  );
}
