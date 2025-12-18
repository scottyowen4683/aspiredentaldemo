import React from "react";
import { Link } from "react-router-dom";

const DEMO_URL = "https://calendly.com/scott-owen-aspire/ai-demo";

function Pill({ children }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/75">
      {children}
    </div>
  );
}

function Card({ title, desc, bullets, to }) {
  return (
    <div className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-7 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
      <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100">
        <div className="absolute -top-24 right-0 h-72 w-72 rounded-full bg-gradient-to-br from-white/10 via-indigo-500/10 to-cyan-400/10 blur-3xl" />
      </div>

      <div className="relative">
        <div className="text-sm text-white/60">Explore</div>
        <h3 className="mt-2 text-2xl font-semibold tracking-tight text-white">
          {title}
        </h3>
        <p className="mt-3 text-sm leading-relaxed text-white/70">{desc}</p>

        <ul className="mt-5 space-y-2 text-sm text-white/70">
          {bullets.map((b) => (
            <li key={b} className="flex items-start gap-2">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-white/60" />
              <span>{b}</span>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex items-center gap-3">
          <Link
            to={to}
            className="inline-flex items-center justify-center rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90"
          >
            View {title}
          </Link>

          <a
            href={DEMO_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
          >
            Book a live demo
          </a>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="space-y-14">
      {/* HERO */}
      <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-[#0B1632] via-[#071022] to-[#070A12] p-10 md:p-14">
        {/* Lighter, premium glow (less “too dark”) */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 left-10 h-[520px] w-[520px] rounded-full bg-gradient-to-br from-indigo-500/18 via-cyan-400/10 to-white/0 blur-3xl" />
          <div className="absolute -bottom-40 right-0 h-[560px] w-[560px] rounded-full bg-gradient-to-br from-blue-500/14 via-white/6 to-white/0 blur-3xl" />
        </div>

        <div className="relative max-w-3xl">
          <Pill>ASPIRE™ Enterprise AI Framework</Pill>
          <span className="mx-2 text-white/35">•</span>
          <Pill>Essential Eight (ML2) aligned principles</Pill>

          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-white md:text-6xl">
            When AI speaks on your behalf, it carries your reputation.
          </h1>

          <p className="mt-5 text-base leading-relaxed text-white/70 md:text-lg">
            Aspire designs premium voice and chat agents for Government and
            Business. Built to reduce contact centre load, capture intent, and
            escalate cleanly under a framework designed for real operations.
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
            <a
              href={DEMO_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black hover:bg-white/90"
            >
              Book a live demo
            </a>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                to="/government"
                className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
              >
                Government
              </Link>
              <Link
                to="/business"
                className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
              >
                Business
              </Link>
              <Link
                to="/framework"
                className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold text-white/85 hover:bg-white/10"
              >
                Explore the framework
              </Link>
            </div>
          </div>

          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-sm font-semibold text-white">Voice + Chat</div>
              <div className="mt-1 text-sm text-white/65">
                Consistent answers with controlled escalation.
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-sm font-semibold text-white">Intent Capture</div>
              <div className="mt-1 text-sm text-white/65">
                Captures purpose, context, and next steps.
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-sm font-semibold text-white">Governed Delivery</div>
              <div className="mt-1 text-sm text-white/65">
                Designed for accountability, not “AI theatre”.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TRUST WEDGE (CEO-built) */}
      <section className="grid gap-10 md:grid-cols-2 md:items-start">
        <div>
          <div className="text-sm text-white/60">Why Aspire exists</div>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">
            Built by a CEO, not another tech vendor.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-white/70">
            Aspire was created by someone who has run complex organisations,
            managed public scrutiny, dealt with service failures, and carried
            accountability when things go wrong.
          </p>
          <p className="mt-4 text-base leading-relaxed text-white/70">
            This platform wasn’t designed in a lab or a sales deck. It was
            shaped by operational reality, governance, escalation, workforce
            dynamics, after-hours demand, and reputational consequence.
          </p>
          <p className="mt-4 text-base leading-relaxed text-white/70">
            That’s why Aspire doesn’t just answer questions. It captures intent,
            applies controls, and escalates cleanly under the ASPIRE™ Enterprise
            AI Framework.
          </p>

          <div className="mt-6">
            <Link
              to="/framework"
              className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
            >
              See how the framework works
            </Link>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-7">
            <div className="text-sm font-semibold text-white">
              Designed for consequence
            </div>
            <div className="mt-2 text-sm leading-relaxed text-white/70">
              Built for environments where an incorrect answer becomes a service
              failure, a reputational issue, or a governance problem.
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-7">
            <div className="text-sm font-semibold text-white">
              Escalation is a feature
            </div>
            <div className="mt-2 text-sm leading-relaxed text-white/70">
              Aspire is designed to recognise limits, route to humans cleanly,
              and preserve context, not “keep talking until it sounds right”.
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-7">
            <div className="text-sm font-semibold text-white">
              Control over novelty
            </div>
            <div className="mt-2 text-sm leading-relaxed text-white/70">
              Premium AI isn’t about features. It’s about governance, repeatable
              quality, and defensibility.
            </div>
          </div>
        </div>
      </section>

      {/* SPLIT PATHS */}
      <section className="grid gap-6 md:grid-cols-2">
        <Card
          title="Government"
          desc="Designed for public-facing enquiries, structured responses, and controlled handover, aligned to Australian expectations."
          bullets={[
            "Voice + chat agents for contact centres and after-hours",
            "Escalation pathways and controlled responses",
            "Governance-first delivery under the ASPIRE™ framework",
          ]}
          to="/government"
        />

        <Card
          title="Business"
          desc="A premium customer experience that reduces load, captures intent, and protects brand tone, without guesswork."
          bullets={[
            "Inbound voice and web chat built for conversion and service",
            "Outbound callbacks (consent-first) where appropriate",
            "Designed for clean handover and reporting",
          ]}
          to="/business"
        />
      </section>

      {/* FINAL CTA */}
      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 md:p-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm text-white/60">Ready to see it live?</div>
            <div className="mt-2 text-2xl font-semibold tracking-tight text-white">
              Demo the experience. Not the pitch.
            </div>
            <div className="mt-2 text-sm text-white/70">
              Book a live walkthrough and see how Aspire handles voice, chat, and escalation under governance.
            </div>
          </div>
          <a
            href={DEMO_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black hover:bg-white/90"
          >
            Book a live demo
          </a>
        </div>
      </section>
    </div>
  );
}
