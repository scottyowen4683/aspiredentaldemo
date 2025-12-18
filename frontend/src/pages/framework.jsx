import React from "react";
import { Link } from "react-router-dom";
import {
  ShieldCheck,
  Layers,
  Workflow,
  BookOpenCheck,
  LineChart,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";

export default function Framework() {
  return (
    <div className="space-y-16">
      {/* HERO */}
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-10 md:p-14">
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-blue-600/20 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />

        <div className="relative">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs text-white/70">
            <ShieldCheck className="h-4 w-4" />
            ASPIRE™ Enterprise AI Framework
          </p>

          <h1 className="mt-6 text-4xl md:text-6xl font-semibold tracking-tight">
            Build AI that’s trusted.
            <span className="text-white/70"> Not AI that’s “cool”.</span>
          </h1>

          <p className="mt-5 max-w-2xl text-base md:text-lg text-white/70 leading-relaxed">
            The ASPIRE™ Enterprise AI Framework is the operating system behind
            every Aspire deployment — ensuring your voice and chat agents are
            governed, measurable, and reliable in production.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
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
              href="/#contact"
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black hover:bg-white/90"
            >
              Talk to Aspire <ArrowRight className="h-4 w-4" />
            </a>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <ValueCard
              icon={<Layers className="h-4 w-4" />}
              title="Governed Architecture"
              text="Clear boundaries, safe escalation, and predictable behaviour."
            />
            <ValueCard
              icon={<Workflow className="h-4 w-4" />}
              title="Action, not chat"
              text="Structured workflows that create outcomes — not transcripts."
            />
            <ValueCard
              icon={<LineChart className="h-4 w-4" />}
              title="Measurable lift"
              text="Resolution, deflection, satisfaction, and operational ROI."
            />
          </div>
        </div>
      </section>

      {/* PRINCIPLES */}
      <section className="grid gap-6 md:grid-cols-2">
        <Principle
          icon={<ShieldCheck className="h-5 w-5" />}
          title="Governance first"
          text="We design for privacy, consent, escalation, and auditability from day one — so the system is safe in real service environments."
        />
        <Principle
          icon={<BookOpenCheck className="h-5 w-5" />}
          title="Knowledge precision"
          text="We reduce hallucinations by designing how knowledge is sourced, framed, and cited — and by controlling what the agent is allowed to say."
        />
        <Principle
          icon={<Workflow className="h-5 w-5" />}
          title="Workflow orchestration"
          text="AI isn’t valuable because it talks. It’s valuable because it can trigger the right actions — emails, summaries, tickets, routing, callbacks."
        />
        <Principle
          icon={<LineChart className="h-5 w-5" />}
          title="Continuous optimisation"
          text="We tune prompts, flows, and knowledge monthly based on real enquiries — improving outcomes without rebuilding everything."
        />
      </section>

      {/* THE FRAMEWORK (pillars) */}
      <section className="rounded-3xl border border-white/10 bg-white/5 p-10 md:p-14">
        <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">
          The Framework Pillars
        </h2>
        <p className="mt-4 max-w-3xl text-white/70 leading-relaxed">
          A premium deployment isn’t a prompt. It’s a system. These pillars keep
          your agents consistent, controllable, and credible.
        </p>

        <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Pillar
            title="1) Intent & Triage"
            points={[
              "Classify the enquiry quickly and correctly.",
              "Route sensitive matters to humans.",
              "Capture essentials without friction.",
            ]}
          />
          <Pillar
            title="2) Knowledge Design"
            points={[
              "Ground answers in approved sources.",
              "Control confidence and uncertainty.",
              "Avoid policy risk and made-up answers.",
            ]}
          />
          <Pillar
            title="3) Experience & Tone"
            points={[
              "Human, calm, and consistent delivery.",
              "No robotic phrasing or ‘AI vibes’.",
              "Short answers by default; detail on request.",
            ]}
          />
          <Pillar
            title="4) Escalation & Handover"
            points={[
              "Summaries that humans can act on.",
              "Clear next steps for staff.",
              "Callback logic for high intent queries.",
            ]}
          />
          <Pillar
            title="5) Automation & Integrations"
            points={[
              "Email/SMS/API actions that are auditable.",
              "Bookings, requests, workflows triggered reliably.",
              "Designed to work with existing systems.",
            ]}
          />
          <Pillar
            title="6) Performance & Reporting"
            points={[
              "Deflection, resolution, satisfaction measured.",
              "Top questions and failure modes tracked.",
              "Monthly optimisation, not set-and-forget.",
            ]}
          />
        </div>
      </section>

      {/* WHO IT'S FOR */}
      <section className="grid gap-6 md:grid-cols-2">
        <UseCase
          title="Government"
          subtitle="Built for governance, consistency, and service delivery pressure."
          bullets={[
            "After-hours coverage without compromising standards.",
            "Handles common enquiries with controlled boundaries.",
            "Supports disaster/event comms with rapid updates.",
          ]}
          cta={{ label: "Explore Government", to: "/government" }}
        />
        <UseCase
          title="Business"
          subtitle="Built for conversion, time-savings, and operational lift."
          bullets={[
            "Capture missed calls and high intent leads.",
            "Automate bookings, follow ups, and callbacks.",
            "Reduce staff load without degrading experience.",
          ]}
          cta={{ label: "Explore Business", to: "/business" }}
        />
      </section>

      {/* CTA */}
      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 to-white/5 p-10 md:p-14">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-2xl md:text-3xl font-semibold tracking-tight">
              Want the framework applied to your organisation?
            </p>
            <p className="mt-3 text-white/70 max-w-2xl">
              Tell us what you want the agent to handle. We’ll respond with a
              clear recommendation and a clean path to deployment.
            </p>
          </div>
          <a
            href="/#contact"
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-6 py-3 text-sm font-semibold text-black hover:bg-white/90"
          >
            Talk to Aspire <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </section>
    </div>
  );
}

/* small UI */

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

function Principle({ icon, title, text }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
      <div className="flex items-center gap-3 text-white/85">
        <div className="rounded-2xl border border-white/15 bg-white/5 p-3">
          {icon}
        </div>
        <p className="text-lg font-semibold">{title}</p>
      </div>
      <p className="mt-4 text-sm text-white/70 leading-relaxed">{text}</p>
    </div>
  );
}

function Pillar({ title, points }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-black/20 p-7">
      <p className="text-sm font-semibold text-white/90">{title}</p>
      <div className="mt-4 space-y-3">
        {points.map((p) => (
          <Bullet key={p} text={p} />
        ))}
      </div>
    </div>
  );
}

function UseCase({ title, subtitle, bullets, cta }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-10">
      <p className="text-2xl font-semibold">{title}</p>
      <p className="mt-3 text-sm text-white/70">{subtitle}</p>

      <div className="mt-6 space-y-3">
        {bullets.map((b) => (
          <Bullet key={b} text={b} />
        ))}
      </div>

      <Link
        to={cta.to}
        className="mt-8 inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white/90 hover:bg-white/10"
      >
        {cta.label} <ArrowRight className="h-4 w-4" />
      </Link>
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
