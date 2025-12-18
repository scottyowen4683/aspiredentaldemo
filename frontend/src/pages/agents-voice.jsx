import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, PhoneCall, ShieldCheck, CheckCircle2 } from "lucide-react";

const DEMO_NUMBER = "+61 7 4357 2749";
const BOOKING_URL = "https://calendly.com/scott-owen-aspire/ai-receptionist-demo";

export default function AgentsVoice() {
  return (
    <div className="space-y-16">
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-10 md:p-14">
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-blue-600/20 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />

        <div className="relative">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs text-white/70">
            <ShieldCheck className="h-4 w-4" />
            Voice Agents
          </p>

          <h1 className="mt-6 text-4xl md:text-6xl font-semibold tracking-tight">
            The voice experience
            <span className="text-white/70"> your customers expect.</span>
          </h1>

          <p className="mt-5 max-w-2xl text-base md:text-lg text-white/70 leading-relaxed">
            A calm, confident voice agent that answers instantly, captures intent,
            and escalates with a summary your team can act on.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={BOOKING_URL}
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
              to="/ai-receptionist"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white/90 hover:bg-white/10"
            >
              Voice demo page <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <Tile
              title="What it handles"
              bullets={[
                "Common enquiries, FAQs, service questions",
                "Bookings, requests, triage and routing",
                "Escalation for sensitive or complex calls",
              ]}
            />
            <Tile
              title="What your team receives"
              bullets={[
                "Concise summaries with customer details",
                "Clear next actions and urgency",
                "Reduced time wasted on back-and-forth",
              ]}
            />
          </div>

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
