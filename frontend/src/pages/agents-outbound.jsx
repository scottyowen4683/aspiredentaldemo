import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Zap, ShieldCheck, CheckCircle2 } from "lucide-react";
import OutboundCTA from "../components/OutboundCTA.jsx";

export default function AgentsOutbound() {
  return (
    <div className="space-y-16">
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-10 md:p-14">
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-blue-600/20 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />

        <div className="relative">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs text-white/70">
            <ShieldCheck className="h-4 w-4" />
            Outbound Agents
          </p>

          <h1 className="mt-6 text-4xl md:text-6xl font-semibold tracking-tight">
            Outbound that feels premium.
            <span className="text-white/70"> Not scripted.</span>
          </h1>

          <p className="mt-5 max-w-2xl text-base md:text-lg text-white/70 leading-relaxed">
            Callbacks, confirmations, and campaigns — delivered with a calm,
            human tone and clear guardrails.
          </p>

          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <Tile
              title="Use cases"
              bullets={[
                "Missed call callbacks",
                "Quote follow-ups / reactivation",
                "Appointment confirmations and reminders",
              ]}
            />
            <Tile
              title="How it behaves"
              bullets={[
                "Escalates when required",
                "Captures outcomes cleanly",
                "Never ‘makes things up’ — stays inside scope",
              ]}
            />
          </div>

          <div className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-8">
            <OutboundCTA
              variant="business"
              assistantId={import.meta.env.VITE_VAPI_ASSISTANT_ID_OUTBOUND_BIZ}
              fromNumber={import.meta.env.VITE_VAPI_FROM_NUMBER}
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
            <Link
              to="/business"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white/90 hover:bg-white/10"
            >
              Business <ArrowRight className="h-4 w-4" />
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
      <div className="flex items-center gap-2 text-white/85">
        <Zap className="h-4 w-4" />
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
