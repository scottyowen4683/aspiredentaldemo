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
            Build AI that is trusted.
            <span className="text-white/70"> Not AI that is trendy.</span>
          </h1>

          <p className="mt-5 max-w-2xl text-base md:text-lg text-white/70 leading-relaxed">
            The ASPIRE™ Enterprise AI Framework is the operating model behind
            every Aspire deployment. It ensures your voice and chat agents are
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
              title="Governed architecture"
              text="Clear boundaries, controlled escalation, and predictable behaviour."
            />
            <ValueCard
              icon={<Workflow className="h-4 w-4" />}
              title="Action, not chat"
              text="Structured workflows designed to produce outcomes, not transcripts."
            />
            <ValueCard
              icon={<LineChart className="h-4 w-4" />}
              title="Measured impact"
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
          text="We design for privacy, consent, escalation, and auditability from day one, so the system is safe in real service environments."
        />
        <Principle
          icon={<BookOpenCheck className="h-5 w-5" />}
          title="Knowledge precision"
          text="We reduce hallucinations by governing how knowledge is sourced, framed, and controlled, including what the agent is allowed to say."
        />
        <Principle
          icon={<Workflow className="h-5 w-5" />}
          title="Workflow orchestration"
          text="AI is not valuable because it talks. It is valuable because it triggers the right actions, emails, summaries, tickets, routing, and callbacks."
        />
        <Principle
          icon={<LineChart className="h-5 w-5" />}
          title="Continuous optimisation"
          text="We tune prompts, flows, and knowledge monthly based on real enquiries, improving outcomes without rebuilding everything."
        />
      </section>

      {/* THE FRAMEWORK (pillars) */}
      <section className="rounded-3xl border border-white/10 bg-white/5 p-10 md:p-14">
        <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">
          The framework pillars
        </h2>
        <p className="mt-4 max-w-3xl text-white/70 leading-relaxed">
          A premium deployment is not a prompt. It is a system. These pillars
          keep your agents consistent, controllable, and credible.
        </p>

        <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Pillar
            title="1) Intent and triage"
            points={[
              "Classify the enquiry quickly and correctly.",
              "Route sensitive matters to humans.",
              "Capture essentials without friction.",
            ]}
          />
          <Pillar
            title="2) Knowledge design"
            points={[
              "Ground answers in approved sources.",
              "Control confidence and uncertainty.",
              "Avoid policy risk and invented answers.",
            ]}
          />
          <Pillar
            title="3) Experience and tone"
            points={[
              "Human, calm, and consistent delivery.",
              "No robotic phrasing or performative AI language.",
              "Short answers by default, detail on request.",
            ]}
          />
          <Pillar
            title="4) Escalation and handover"
            points={[
              "Summaries that humans can action.",
              "Clear next steps for staff.",
              "Callback logic for high intent enquiries.",
            ]}
          />
          <Pillar
            title="5) Automation and integrations"
            points={[
              "Email, SMS, and API actions that are auditable.",
              "Bookings, requests, and workflows triggered reliably.",
              "Designed to work with existing systems.",
            ]}
          />
          <Pillar
            title="6) Performance and reporting"
            points={[
              "Deflection, resolution, and satisfaction measured.",
              "Top questions and failure modes tracked.",
              "Monthly optimisation, not set and forget.",
            ]}
          />
        </div>
      </section>

      {/* ASPIRE PORTAL */}
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 to-white/5 p-10 md:p-14">
        <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-indigo-500/15 blur-3xl" />
        <div className="absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />

        <div className="relative">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs text-white/70">
            <Layers className="h-4 w-4" />
            Aspire Portal
          </p>

          <h2 className="mt-6 text-3xl md:text-4xl font-semibold tracking-tight">
            Oversight, assurance, and control without guesswork.
          </h2>
          <p className="mt-4 max-w-3xl text-white/70 leading-relaxed">
            The Aspire Portal is the operational layer behind your AI agents. It
            is where leaders and teams gain visibility into what the agent is
            handling, how it is performing, and where escalation is occurring,
            so AI becomes governable, measurable, and continuously improvable.
          </p>

          <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <PortalCard
              title="Operational visibility"
              text="See what people ask, what the agent answers, and what escalates across voice and chat."
            />
            <PortalCard
              title="Performance reporting"
              text="Track deflection, resolution, escalation rates, and top intents with outcomes you can measure."
            />
            <PortalCard
              title="Quality assurance"
              text="Identify failure modes, refine prompts and flows, and lift performance without rebuilding the system."
            />
            <PortalCard
              title="Governance and defensibility"
              text="Designed for auditability and controlled behaviour aligned to Essential Eight (ML2) principles."
            />
            <PortalCard
              title="Continuous optimisation"
              text="Monthly tuning based on real enquiries, improving outcomes over time."
            />
            <PortalCard
              title="Enterprise readiness"
              text="A premium AI deployment is a managed service with control and accountability."
            />
          </div>

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
          </div>
        </div>
      </section>

      {/* WHO IT IS FOR */}
      <section className="grid gap-6 md:grid-cols-2">
        <UseCase
          title="Government"
          subtitle="Built for governance, consistency, and service delivery pressure."
          bullets={[
            "After-hours coverage without compromising standards.",
            "Handles common enquiries with controlled boundaries.",
            "Supports disaster and event communications with rapid updates.",
          ]}
          cta={{ label: "Explore Government", to: "/government" }}
        />
        <UseCase
          title="Business"
          subtitle="Built for conversion, time savings, and operational lift."
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
              Tell us what you want the agent to handle. We will respond with a
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

function PortalCard({ title, text }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-black/20 p-7">
      <p className="text-sm font-semibold text-white/90">{title}</p>
      <p className="mt-3 text-sm text-white/70 leading-relaxed">{text}</p>
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
