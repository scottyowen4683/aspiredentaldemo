import React from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  MessageSquare,
  ShieldCheck,
  CheckCircle2,
  LineChart,
  Workflow,
  BookOpenCheck,
} from "lucide-react";

const BOOKING_URL = "https://calendly.com/scott-owen-aspire/ai-demo";

export default function AgentsChat() {
  return (
    <div className="space-y-16">
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-10 md:p-14">
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-blue-600/20 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />

        <div className="relative">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs text-white/70">
            <ShieldCheck className="h-4 w-4" />
            Chat Agents • Governed by the ASPIRE™ Enterprise AI Framework
          </p>

          <h1 className="mt-6 text-4xl md:text-6xl font-semibold tracking-tight">
            Chat that resolves.
            <span className="text-white/70"> Not chat that irritates.</span>
          </h1>

          <p className="mt-5 max-w-3xl text-base md:text-lg text-white/70 leading-relaxed">
            A premium web chat experience designed for real service delivery:
            grounded answers, controlled escalation, and structured capture —
            without the pop-up widget chaos.
          </p>

          {/* Capability row */}
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <ValueCard
              icon={<BookOpenCheck className="h-4 w-4" />}
              title="Knowledge precision"
              text="Grounded responses that stay inside scope — designed to reduce hallucinations and policy risk."
            />
            <ValueCard
              icon={<Workflow className="h-4 w-4" />}
              title="Clean handover"
              text="Escalation that feels intentional: captures the right details and hands over with context your team can use."
            />
            <ValueCard
              icon={<LineChart className="h-4 w-4" />}
              title="Measurable outcomes"
              text="Real-time reporting in the Aspire Portal: top questions, deflection signals, resolution vs escalation, and failure modes."
            />
          </div>

          {/* CTAs */}
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={BOOKING_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black hover:bg-white/90"
            >
              Book a demo <ArrowRight className="h-4 w-4" />
            </a>

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

          {/* Tiles */}
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <Tile
              title="Best for"
              bullets={[
                "High-volume FAQs and self-service deflection",
                "Capturing enquiry details cleanly (without forms that feel like work)",
                "Routing to the right team with context",
                "Reducing repeat contacts and follow-up loops",
                "Supporting after-hours service without degrading quality",
              ]}
            />
            <Tile
              title="How Aspire does it"
              bullets={[
                "Controlled answers grounded in approved sources",
                "Escalation rules for sensitive topics and edge cases",
                "Structured capture (intent, contact, urgency) when required",
                "Governed deployment under the ASPIRE™ Framework",
                "Monthly optimisation based on real conversations",
              ]}
            />
          </div>

          {/* Portal section */}
          <div className="mt-10 rounded-3xl border border-white/10 bg-black/20 p-10">
            <p className="text-2xl md:text-3xl font-semibold tracking-tight">
              Visibility through the Aspire Portal.
              <span className="text-white/70"> Continuous improvement by design.</span>
            </p>
            <p className="mt-3 max-w-3xl text-sm md:text-base text-white/70 leading-relaxed">
              Chat should be measurable, not mysterious. The Aspire Portal shows
              what people asked, what was resolved, what escalated, where the
              knowledge is weak, and what to tune next.
            </p>

            <div className="mt-6 grid gap-3 md:grid-cols-2">
              <Bullet text="Top enquiry themes and emerging issues" />
              <Bullet text="Resolution vs escalation with reasons" />
              <Bullet text="Deflection signals and workload reduction" />
              <Bullet text="Knowledge gaps and recommended updates" />
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/framework"
                className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white/90 hover:bg-white/10"
              >
                See the Framework <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href={BOOKING_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black hover:bg-white/90"
              >
                Book a demo <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>

          {/* Navigation */}
          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              to="/agents"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white/90 hover:bg-white/10"
            >
              Back to Agents <ArrowRight className="h-4 w-4" />
            </Link>

            <Link
              to="/framework"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white/90 hover:bg-white/10"
            >
              Framework <ArrowRight className="h-4 w-4" />
            </Link>
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

function Tile({ title, bullets }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
      <div className="flex items-center gap-2 text-white/85">
        <MessageSquare className="h-4 w-4" />
        <p className="text-lg font-semibold">{title}</p>
      </div>

      <div className="mt-4 space-y-3">
        {bullets.map((b) => (
          <Bullet key={b} text={b} />
        ))}
      </div>
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
