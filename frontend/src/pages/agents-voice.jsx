import React from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  PhoneCall,
  ShieldCheck,
  CheckCircle2,
  Gauge,
  LineChart,
  Workflow,
} from "lucide-react";

const DEMO_NUMBER = "+61 7 4357 2749";
const BOOKING_URL = "https://calendly.com/scott-owen-aspire/ai-demo";

export default function AgentsVoice() {
  return (
    <div className="space-y-16">
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-10 md:p-14">
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-blue-600/20 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />

        <div className="relative">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs text-white/70">
            <ShieldCheck className="h-4 w-4" />
            Voice Agents • Governed by the ASPIRE™ Enterprise AI Framework
          </p>

          <h1 className="mt-6 text-4xl md:text-6xl font-semibold tracking-tight">
            The voice experience your customers expect.
            <span className="text-white/70"> At scale.</span>
          </h1>

          <p className="mt-5 max-w-3xl text-base md:text-lg text-white/70 leading-relaxed">
            A calm, confident voice agent that answers instantly, captures
            intent, and escalates with a structured summary your team can act on.
            Designed for real operations — not demos.
          </p>

          {/* Premium capability row */}
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <ValueCard
              icon={<Gauge className="h-4 w-4" />}
              title="Built for load"
              text="Architected for high-volume periods — including handling high throughput (up to ~100 calls per minute, deployment-dependent)."
            />
            <ValueCard
              icon={<Workflow className="h-4 w-4" />}
              title="Controlled escalation"
              text="Clear guardrails, safe handover, and concise call summaries so humans can step in fast."
            />
            <ValueCard
              icon={<LineChart className="h-4 w-4" />}
              title="Visible performance"
              text="Real-time reporting in the Aspire Portal: volumes, resolution vs escalation, top topics, and optimisation opportunities."
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

            <a
              href={`tel:${DEMO_NUMBER.replace(/\s/g, "")}`}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white/90 hover:bg-white/10"
            >
              <PhoneCall className="h-4 w-4" />
              Call the AI: {DEMO_NUMBER}
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
              title="What it handles"
              bullets={[
                "Common enquiries, FAQs, and service questions",
                "Structured triage and routing by intent",
                "Bookings, requests, and form capture",
                "Escalation for sensitive or complex calls",
                "After-hours coverage with governance and control",
              ]}
            />
            <Tile
              title="What your team receives"
              bullets={[
                "Concise summaries with caller details and intent",
                "Clear recommended next action and urgency",
                "Reduced back-and-forth and repeat calls",
                "Call outcome reporting via the Aspire Portal",
                "A monthly optimisation loop under the ASPIRE™ Framework",
              ]}
            />
          </div>

          {/* Portal section */}
          <div className="mt-10 rounded-3xl border border-white/10 bg-black/20 p-10">
            <p className="text-2xl md:text-3xl font-semibold tracking-tight">
              Real-time reporting via the Aspire Portal.
              <span className="text-white/70"> Not guesswork.</span>
            </p>
            <p className="mt-3 max-w-3xl text-sm md:text-base text-white/70 leading-relaxed">
              Every call becomes measurable: what people asked, what was resolved,
              what escalated, and why. This is what makes the voice experience
              sustainable at scale — visibility, governance, and continuous
              improvement.
            </p>

            <div className="mt-6 grid gap-3 md:grid-cols-2">
              <Bullet text="Top call drivers and emerging topics" />
              <Bullet text="Resolution vs escalation (and reasons)" />
              <Bullet text="Deflection and workload reduction signals" />
              <Bullet text="Monthly tuning to improve outcomes" />
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

function Tile({ title, bullets }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
      <p className="text-lg font-semibold">{title}</p>
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
