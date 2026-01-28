import React from "react";
import { Link } from "react-router-dom";
import {
  MessageSquare,
  ArrowRight,
  CheckCircle2,
  ShieldCheck,
  Zap,
  BookOpenCheck,
} from "lucide-react";

export default function AgentsChat() {
  return (
    <div className="space-y-16">
      {/* HERO */}
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-10 md:p-14">
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-blue-600/20 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />

        <div className="relative">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs text-white/70">
            <MessageSquare className="h-4 w-4" />
            Chat Agents
          </p>

          <h1 className="mt-6 text-4xl md:text-6xl font-semibold tracking-tight">
            Premium web chat.
            <span className="text-white/70"> Grounded answers.</span>
          </h1>

          <p className="mt-5 max-w-2xl text-base md:text-lg text-white/70 leading-relaxed">
            Chat agents that resolve common enquiries and route the rest.
            Grounded answers, controlled behaviour, and clean handover, all
            governed by the ASPIRE Framework.
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
              icon={<BookOpenCheck className="h-4 w-4" />}
              title="Grounded answers"
              text="Responses based on approved knowledge sources, not hallucinations."
            />
            <ValueCard
              icon={<ShieldCheck className="h-4 w-4" />}
              title="Safe fallback"
              text="When uncertain, routes to humans or appropriate channels."
            />
            <ValueCard
              icon={<Zap className="h-4 w-4" />}
              title="Instant responses"
              text="24/7 availability with consistent, professional tone."
            />
          </div>
        </div>
      </section>

      {/* CAPABILITIES */}
      <section className="rounded-3xl border border-white/10 bg-white/5 p-10">
        <h2 className="text-2xl font-semibold">Chat agent capabilities</h2>
        <p className="mt-3 text-white/70">
          What our chat agents can do for your organisation.
        </p>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <CapabilityCard
            title="Knowledge-grounded responses"
            points={[
              "Answers from approved knowledge base",
              "Controlled confidence and uncertainty",
              "No invented or hallucinated responses",
            ]}
          />
          <CapabilityCard
            title="Escalation and routing"
            points={[
              "Routes to forms, email, or humans",
              "Context preserved through handover",
              "Clean transition to human support",
            ]}
          />
          <CapabilityCard
            title="Experience and tone"
            points={[
              "Short answers by default",
              "Detail on request",
              "Professional, consistent tone",
            ]}
          />
          <CapabilityCard
            title="Analytics and reporting"
            points={[
              "Top questions tracked",
              "Resolution vs escalation metrics",
              "Continuous improvement signals",
            ]}
          />
        </div>
      </section>

      {/* CTA */}
      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 to-white/5 p-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-2xl font-semibold">Ready to deploy chat agents?</p>
            <p className="mt-3 text-white/70">
              Book a demo to see how chat agents can enhance your customer experience.
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
