import React from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ShieldCheck,
  Zap,
  CheckCircle2,
  Workflow,
  LineChart,
  PhoneCall,
} from "lucide-react";

export default function AgentsOutbound() {
  return (
    <div className="space-y-16">
      {/* HERO */}
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-10 md:p-14">
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-blue-600/20 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />

        <div className="relative">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs text-white/70">
            <ShieldCheck className="h-4 w-4" />
            Outbound Agents
          </p>

          <h1 className="mt-6 text-4xl md:text-6xl font-semibold tracking-tight">
            Outbound that protects the brand.
            <span className="text-white/70"> Not scripts.</span>
          </h1>

          <p className="mt-5 max-w-3xl text-base md:text-lg text-white/70 leading-relaxed">
            Aspire outbound agents deliver controlled outreach — callbacks,
            confirmations, reminders, and campaigns — with consent-first logic,
            calm human tone, and escalation built in. Governed by the{" "}
            <span className="text-white/85 font-semibold">
              ASPIRE™ Enterprise AI Framework
            </span>
            .
          </p>

          {/* Executive proof row */}
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <ValueCard
              icon={<ShieldCheck className="h-4 w-4" />}
              title="Consent-first"
              text="Designed for opt-in outreach and clear customer expectations."
            />
            <ValueCard
              icon={<Workflow className="h-4 w-4" />}
              title="Outcome-driven"
              text="Captures outcomes cleanly and routes next steps with intent."
            />
            <ValueCard
              icon={<LineChart className="h-4 w-4" />}
              title="Measurable lift"
              text="Track conversions, call outcomes, and operational ROI."
            />
          </div>

          {/* What it’s for / How it behaves */}
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <Tile
              icon={<PhoneCall className="h-4 w-4" />}
              title="What it’s used for"
              bullets={[
                "Missed-call recovery and web-lead callbacks",
                "Service confirmations and appointment reminders",
                "Proactive updates (events, outages, disruptions)",
                "Collections and follow-ups with guardrails",
                "Targeted campaigns without harming the brand",
              ]}
            />
            <Tile
              icon={<Zap className="h-4 w-4" />}
              title="How it behaves"
              bullets={[
                "Stays inside scope — no guessing or invented claims",
                "Escalates to humans when required or requested",
                "Uses calm, consistent tone aligned to your standards",
                "Summarises outcomes so teams can act immediately",
                "Operates under governance, auditability, and control",
              ]}
            />
          </div>

          {/* Governance section */}
          <div className="mt-10 rounded-3xl border border-white/10 bg-black/20 p-10">
            <div className="flex items-start gap-4">
              <div className="rounded-2xl border border-white/15 bg-white/5 p-3">
                <ShieldCheck className="h-5 w-5 text-white/80" />
              </div>
              <div>
                <p className="text-xl md:text-2xl font-semibold tracking-tight">
                  Governed outbound — not “spray and pray”.
                </p>
                <p className="mt-3 max-w-3xl text-sm md:text-base text-white/70 leading-relaxed">
                  Outbound is where reputational risk lives. Aspire outbound
                  agents are designed with explicit boundaries, escalation, and
                  outcome capture so your team stays in control — even at scale.
                </p>

                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  <Mini
                    title="Guardrails"
                    text="Clear scope, fallback behaviour, and escalation rules."
                  />
                  <Mini
                    title="Consent & compliance"
                    text="Consent-first outreach with controlled messaging."
                  />
                  <Mini
                    title="Reporting"
                    text="Track outcomes, failure modes, and optimisation opportunities."
                  />
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
              Government Outbound <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/business"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white/90 hover:bg-white/10"
            >
              Business Outbound <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/framework"
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black hover:bg-white/90"
            >
              See the Framework <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-6">
            <Link
              to="/agents"
              className="inline-flex items-center gap-2 text-sm font-semibold text-white/70 hover:text-white"
            >
              Back to Agents <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

/* UI bits */

function ValueCard({ icon, title, text }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-center gap-2 text-white/80">
        {icon}
        <p className="text-sm font-semibold">{title}</p>
      </div>
      <p className="mt-2 text-sm text-white/65">{text}</p>
    </div>
  );
}

function Tile({ icon, title, bullets }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
      <div className="flex items-center gap-3 text-white/85">
        <div className="rounded-2xl border border-white/15 bg-white/5 p-3">
          {icon}
        </div>
        <p className="text-lg font-semibold">{title}</p>
      </div>
      <div className="mt-5 space-y-3">
        {bullets.map((b) => (
          <Bullet key={b} text={b} />
        ))}
      </div>
    </div>
  );
}

function Mini({ title, text }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <p className="text-sm font-semibold text-white/90">{title}</p>
      <p className="mt-2 text-sm text-white/65 leading-relaxed">{text}</p>
    </div>
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
