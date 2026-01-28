import { Link } from "react-router-dom";
import {
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Brain,
  BarChart3,
  Users,
  Settings,
  FileText,
} from "lucide-react";

const DEMO_URL = "https://calendly.com/scott-owen-aspire/ai-demo";

export default function Framework() {
  return (
    <div className="space-y-16">
      {/* HERO */}
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.07] p-10 md:p-14">
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-purple-500/20 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />

        <div className="relative">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs text-white/70">
            <ShieldCheck className="h-4 w-4" />
            The Operating Model Behind Every Aspire Deployment
          </p>

          <h1 className="mt-6 text-4xl md:text-6xl font-semibold tracking-tight">
            ASPIRE Enterprise
            <span className="text-white/70"> AI Framework</span>
          </h1>

          <p className="mt-5 max-w-2xl text-base md:text-lg text-white/70 leading-relaxed">
            The ASPIRE framework governs what the agent can say, when it must stop,
            how escalation occurs, and how performance is measured and improved.
            This is not a chatbot. It is a controlled service channel.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={DEMO_URL}
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
              See our agents <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* FRAMEWORK PILLARS */}
      <section className="space-y-6">
        <div className="text-center">
          <h2 className="text-3xl font-semibold">The Six Pillars</h2>
          <p className="mt-3 text-white/70 max-w-2xl mx-auto">
            Each pillar represents a core capability that makes Aspire deployments
            reliable, measurable, and continuously improving.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <PillarCard
            letter="A"
            title="Architecture"
            icon={<Settings className="h-5 w-5" />}
            points={[
              "Secure, scalable infrastructure",
              "Australian data residency",
              "Essential Eight (ML2) aligned",
            ]}
          />
          <PillarCard
            letter="S"
            title="Scope Control"
            icon={<ShieldCheck className="h-5 w-5" />}
            points={[
              "Defined answer boundaries",
              "Controlled escalation paths",
              "No hallucination by design",
            ]}
          />
          <PillarCard
            letter="P"
            title="Performance"
            icon={<BarChart3 className="h-5 w-5" />}
            points={[
              "Real-time dashboards",
              "Quality scoring rubrics",
              "Continuous optimisation",
            ]}
          />
          <PillarCard
            letter="I"
            title="Integration"
            icon={<Brain className="h-5 w-5" />}
            points={[
              "CRM and workflow integration",
              "Knowledge base management",
              "API and webhook support",
            ]}
          />
          <PillarCard
            letter="R"
            title="Reporting"
            icon={<FileText className="h-5 w-5" />}
            points={[
              "Interaction audit trails",
              "Compliance reporting",
              "Monthly performance reviews",
            ]}
          />
          <PillarCard
            letter="E"
            title="Escalation"
            icon={<Users className="h-5 w-5" />}
            points={[
              "Structured handover summaries",
              "Context preservation",
              "Human-in-the-loop triggers",
            ]}
          />
        </div>
      </section>

      {/* PORTAL */}
      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 to-white/5 p-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold">The Aspire Portal</h2>
            <p className="mt-3 text-white/70">
              Every interaction becomes operational intelligence. Track volumes,
              top enquiries, resolution versus escalation, and optimisation
              opportunities in real time.
            </p>
            <div className="mt-6 space-y-3">
              <Bullet text="Real-time dashboards and trend reporting" />
              <Bullet text="Conversation review and quality scoring" />
              <Bullet text="Knowledge base management and updates" />
              <Bullet text="User management and access control" />
            </div>
          </div>
          <Link
            to="/auth"
            className="inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-3 text-sm font-semibold text-black hover:bg-white/90"
          >
            Access Portal <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* GOVERNANCE */}
      <section className="rounded-3xl border border-white/10 bg-white/5 p-10">
        <h2 className="text-2xl font-semibold">Governance by Design</h2>
        <p className="mt-3 text-white/70 max-w-3xl">
          Aspire is built for environments where an incorrect answer becomes a
          service failure, a reputational issue, or a governance issue.
        </p>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-6">
            <h3 className="font-semibold">Controlled Responses</h3>
            <p className="mt-2 text-sm text-white/70">
              Agents only answer from approved knowledge sources. When they don't
              know, they say so and escalate cleanly.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-6">
            <h3 className="font-semibold">Audit Trails</h3>
            <p className="mt-2 text-sm text-white/70">
              Every interaction is logged with full transcripts, timestamps, and
              outcome classifications for compliance review.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-6">
            <h3 className="font-semibold">Quality Scoring</h3>
            <p className="mt-2 text-sm text-white/70">
              5-dimension rubric scoring evaluates accuracy, tone, escalation
              handling, and resolution quality.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-6">
            <h3 className="font-semibold">Continuous Improvement</h3>
            <p className="mt-2 text-sm text-white/70">
              Monthly review cycles identify knowledge gaps, update responses,
              and tune agent behaviour for better outcomes.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Ready to see the framework in action?</h2>
            <p className="mt-2 text-white/70">
              Book a live walkthrough and see how Aspire handles voice, chat, and
              escalation under governance.
            </p>
          </div>
          <a
            href={DEMO_URL}
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

function PillarCard({
  letter,
  title,
  icon,
  points,
}: {
  letter: string;
  title: string;
  icon: React.ReactNode;
  points: string[];
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 text-lg font-bold">
          {letter}
        </div>
        <div className="flex items-center gap-2 text-white/80">
          {icon}
          <span className="font-semibold">{title}</span>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {points.map((p) => (
          <Bullet key={p} text={p} />
        ))}
      </div>
    </div>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 text-sm text-white/75">
      <CheckCircle2 className="mt-0.5 h-4 w-4 text-white/70" />
      <span>{text}</span>
    </div>
  );
}
