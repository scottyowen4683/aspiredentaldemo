import React from "react";
import { Link } from "react-router-dom";
import {
  Zap,
  ArrowRight,
  CheckCircle2,
  ShieldCheck,
  Phone,
  Users,
} from "lucide-react";

import OutboundCTA from "../components/OutboundCTA.jsx";

export default function AgentsOutbound() {
  return (
    <div className="space-y-16">
      {/* HERO */}
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-10 md:p-14">
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-blue-600/20 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />

        <div className="relative">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs text-white/70">
            <Zap className="h-4 w-4" />
            Outbound Agents
          </p>

          <h1 className="mt-6 text-4xl md:text-6xl font-semibold tracking-tight">
            Proactive engagement.
            <span className="text-white/70"> Consent-first.</span>
          </h1>

          <p className="mt-5 max-w-2xl text-base md:text-lg text-white/70 leading-relaxed">
            Controlled outbound for callbacks, confirmations, reminders, and
            proactive updates. Consent-first and brand-protective, powered by
            self-hosted AI with ElevenLabs voice synthesis.
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
              icon={<ShieldCheck className="h-4 w-4" />}
              title="Consent-first"
              text="Every outbound call respects consent requirements and compliance."
            />
            <ValueCard
              icon={<Phone className="h-4 w-4" />}
              title="Self-hosted"
              text="Powered by Twilio and ElevenLabs for security and control."
            />
            <ValueCard
              icon={<Users className="h-4 w-4" />}
              title="Brand-protective"
              text="Consistent tone and messaging that protects your reputation."
            />
          </div>
        </div>
      </section>

      {/* LIVE DEMO */}
      <section className="rounded-3xl border border-white/10 bg-white/5 p-8 md:p-10">
        <OutboundCTA variant="business" />
      </section>

      {/* CAPABILITIES */}
      <section className="rounded-3xl border border-white/10 bg-white/5 p-10">
        <h2 className="text-2xl font-semibold">Outbound agent capabilities</h2>
        <p className="mt-3 text-white/70">
          What our outbound agents can do for your organisation.
        </p>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <CapabilityCard
            title="Lead callbacks"
            points={[
              "Immediate web-lead callbacks",
              "Missed-call recovery",
              "High-intent lead engagement",
            ]}
          />
          <CapabilityCard
            title="Reminders and confirmations"
            points={[
              "Appointment reminders",
              "Payment confirmations",
              "Service updates",
            ]}
          />
          <CapabilityCard
            title="Compliance and governance"
            points={[
              "Consent-first design",
              "Auditable call logs",
              "ASPIRE Framework governance",
            ]}
          />
          <CapabilityCard
            title="Reporting"
            points={[
              "Call outcome tracking",
              "Conversion metrics",
              "Performance optimisation",
            ]}
          />
        </div>
      </section>

      {/* CTA */}
      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 to-white/5 p-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-2xl font-semibold">Ready for proactive engagement?</p>
            <p className="mt-3 text-white/70">
              Book a demo to see how outbound agents can transform your customer outreach.
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
