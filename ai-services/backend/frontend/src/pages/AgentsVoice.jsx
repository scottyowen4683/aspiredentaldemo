import React from "react";
import { Link } from "react-router-dom";
import {
  PhoneCall,
  ArrowRight,
  CheckCircle2,
  ShieldCheck,
  Users,
  Clock,
} from "lucide-react";

export default function AgentsVoice() {
  return (
    <div className="space-y-16">
      {/* HERO */}
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-10 md:p-14">
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-blue-600/20 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />

        <div className="relative">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs text-white/70">
            <PhoneCall className="h-4 w-4" />
            Voice Agents
          </p>

          <h1 className="mt-6 text-4xl md:text-6xl font-semibold tracking-tight">
            Instant call answering.
            <span className="text-white/70"> Controlled delivery.</span>
          </h1>

          <p className="mt-5 max-w-2xl text-base md:text-lg text-white/70 leading-relaxed">
            Premium voice agents that answer calls instantly, triage enquiries,
            capture intent, and escalate cleanly. Calm, consistent tone by
            design, governed by the ASPIRE Framework.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="https://calendly.com/scott-owen-aspire/ai-demo"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black hover:bg-white/90"
            >
              Book a demo <ArrowRight className="h-4 w-4" />
            </a>
            <Link
              to="/agents"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white/90 hover:bg-white/10"
            >
              All Agents <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <ValueCard
              icon={<Clock className="h-4 w-4" />}
              title="Fast pickup"
              text="Answers instantly, no hold queues. Callers get immediate attention."
            />
            <ValueCard
              icon={<ShieldCheck className="h-4 w-4" />}
              title="Controlled responses"
              text="Governed behaviour with clear boundaries and escalation rules."
            />
            <ValueCard
              icon={<Users className="h-4 w-4" />}
              title="Clean handover"
              text="When escalation is needed, humans receive structured context."
            />
          </div>
        </div>
      </section>

      {/* CAPABILITIES */}
      <section className="rounded-3xl border border-white/10 bg-white/5 p-10">
        <h2 className="text-2xl font-semibold">Voice agent capabilities</h2>
        <p className="mt-3 text-white/70">
          What our voice agents can do for your organisation.
        </p>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <CapabilityCard
            title="Inbound call handling"
            points={[
              "Instant answering with no hold time",
              "Structured triage and intent capture",
              "After-hours coverage with consistent quality",
            ]}
          />
          <CapabilityCard
            title="Escalation and routing"
            points={[
              "Recognises limits and routes to humans",
              "Structured summaries for staff action",
              "Context preserved through handover",
            ]}
          />
          <CapabilityCard
            title="Compliance and governance"
            points={[
              "Consent-aware interactions",
              "Auditable conversation logs",
              "ASPIRE Framework governance",
            ]}
          />
          <CapabilityCard
            title="Reporting and optimisation"
            points={[
              "Real-time call metrics",
              "Top enquiry tracking",
              "Monthly performance tuning",
            ]}
          />
        </div>
      </section>

      {/* CTA */}
      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 to-white/5 p-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-2xl font-semibold">Ready to deploy voice agents?</p>
            <p className="mt-3 text-white/70">
              Book a demo to see how voice agents can transform your call handling.
            </p>
          </div>
          <a
            href="https://calendly.com/scott-owen-aspire/ai-demo"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-3 text-sm font-semibold text-black hover:bg-white/90"
          >
            Book a demo <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </section>
    </div>
  );
}

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

function CapabilityCard({ title, points }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-black/20 p-7">
      <p className="text-lg font-semibold">{title}</p>
      <div className="mt-4 space-y-3">
        {points.map((p) => (
          <div key={p} className="flex items-start gap-2 text-sm text-white/75">
            <CheckCircle2 className="mt-0.5 h-4 w-4 text-white/70" />
            <span>{p}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
