import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  PhoneCall,
  MessageSquare,
  Zap,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";

import OutboundCTA from "../components/OutboundCTA.jsx";
import VapiWidget from "../components/VapiWidget.jsx";

const GOV_ASSISTANT_ID =
  import.meta.env.VITE_VAPI_ASSISTANT_ID_GOV ||
  import.meta.env.VITE_VAPI_ASSISTANT_ID_GOVERNMENT;

const BIZ_ASSISTANT_ID =
  import.meta.env.VITE_VAPI_ASSISTANT_ID_BIZ ||
  import.meta.env.VITE_VAPI_ASSISTANT_ID_BUSINESS;

const DEMO_NUMBER_BUSINESS = "+61 7 4357 2749";
const DEMO_NUMBER_GOV = "+61 489 087 448";

export default function Demo() {
  const [chatMode, setChatMode] = useState("business"); // "business" | "government"

  const chatAssistantId = useMemo(() => {
    return chatMode === "government" ? GOV_ASSISTANT_ID : BIZ_ASSISTANT_ID;
  }, [chatMode]);

  return (
    <div className="space-y-16">
      {/* HERO */}
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-10 md:p-14">
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-blue-600/20 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />

        <div className="relative">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs text-white/70">
            <ShieldCheck className="h-4 w-4" />
            Live Demos • Voice + Chat + Outbound
          </p>

          <h1 className="mt-6 text-4xl md:text-6xl font-semibold tracking-tight">
            Demo the experience.
            <span className="text-white/70"> Not the pitch.</span>
          </h1>

          <p className="mt-5 max-w-2xl text-base md:text-lg text-white/70 leading-relaxed">
            This page showcases Aspire’s live agent behaviours: inbound voice,
            outbound call capability, and the website chat experience.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/agents"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white/90 hover:bg-white/10"
            >
              Agents <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/framework"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white/90 hover:bg-white/10"
            >
              Framework <ArrowRight className="h-4 w-4" />
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
              icon={<PhoneCall className="h-4 w-4" />}
              title="Inbound Voice"
              text="Instant answer, clean triage, controlled handoff."
            />
            <ValueCard
              icon={<Zap className="h-4 w-4" />}
              title="Outbound Call"
              text="Get the agent to call you. Consent-first."
            />
            <ValueCard
              icon={<MessageSquare className="h-4 w-4" />}
              title="Web Chat"
              text="Grounded answers with a premium experience."
            />
          </div>
        </div>
      </section>

      {/* INBOUND DEMOS */}
      <section className="grid gap-6 md:grid-cols-2">
        <DemoCard
          title="Inbound Voice Demo (Business)"
          subtitle="Call the agent and experience the tone + flow."
          number={DEMO_NUMBER_BUSINESS}
        />
        <DemoCard
          title="Inbound Voice Demo (Government)"
          subtitle="Designed for public-facing enquiries and controlled responses."
          number={DEMO_NUMBER_GOV}
        />
      </section>

      {/* OUTBOUND DEMO */}
      <section className="rounded-3xl border border-white/10 bg-white/5 p-8 md:p-10">
        <div className="mb-6">
          <p className="text-xl font-semibold">Outbound demo</p>
          <p className="mt-2 text-sm text-white/70">
            Request a callback from the agent. Consent is mandatory.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-sm text-white/70">
            <Tag text="Missed call callbacks" />
            <Tag text="Confirmations" />
            <Tag text="Follow-ups" />
            <Tag text="Campaigns" />
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-black/20 p-7">
            <p className="text-sm font-semibold text-white/90">Business outbound</p>
            <p className="mt-2 text-sm text-white/70">
              Lead follow-up, confirmation calls, and customer callbacks.
            </p>
            <div className="mt-5">
              <OutboundCTA
                variant="business"
                assistantId={import.meta.env.VITE_VAPI_ASSISTANT_ID_OUTBOUND_BIZ}
                fromNumber={import.meta.env.VITE_VAPI_FROM_NUMBER}
              />
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/20 p-7">
            <p className="text-sm font-semibold text-white/90">Government outbound</p>
            <p className="mt-2 text-sm text-white/70">
              Service updates, confirmations, and structured callbacks.
            </p>
            <div className="mt-5">
              <OutboundCTA
                variant="government"
                assistantId={import.meta.env.VITE_VAPI_ASSISTANT_ID_OUTBOUND_GOV}
                fromNumber={import.meta.env.VITE_VAPI_FROM_NUMBER}
              />
            </div>
          </div>
        </div>
      </section>

      {/* CHAT DEMO */}
      <section className="rounded-3xl border border-white/10 bg-white/5 p-10 md:p-14">
        <p className="text-2xl font-semibold">Chat demo</p>
        <p className="mt-3 max-w-3xl text-white/70">
          Choose which assistant the chat widget should use on this page.
          (The widget appears bottom-right.)
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={() => setChatMode("business")}
            className={[
              "rounded-2xl px-5 py-3 text-sm font-semibold transition-colors",
              chatMode === "business"
                ? "bg-white text-black"
                : "border border-white/15 bg-white/5 text-white/90 hover:bg-white/10",
            ].join(" ")}
          >
            Business chat
          </button>

          <button
            onClick={() => setChatMode("government")}
            className={[
              "rounded-2xl px-5 py-3 text-sm font-semibold transition-colors",
              chatMode === "government"
                ? "bg-white text-black"
                : "border border-white/15 bg-white/5 text-white/90 hover:bg-white/10",
            ].join(" ")}
          >
            Government chat
          </button>

          <Link
            to="/agents/chat"
            className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white/90 hover:bg-white/10"
          >
            Learn more <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <Tile
            title="What to test"
            bullets={[
              "Tone: calm, confident, short answers by default",
              "Boundaries: it should avoid guessing",
              "Escalation: it should hand off when it can’t answer",
            ]}
          />
          <Tile
            title="What you should see"
            bullets={[
              "Fast responses with clear structure",
              "No ‘AI fluff’",
              "Better UX than generic widgets",
            ]}
          />
        </div>
      </section>

      {/* Mount once */}
      <VapiWidget assistantId={chatAssistantId} />
    </div>
  );
}

/* helpers */

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

function DemoCard({ title, subtitle, number }) {
  const tel = `tel:${(number || "").replace(/\s/g, "")}`;
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-10">
      <p className="text-xl font-semibold">{title}</p>
      <p className="mt-3 text-sm text-white/70">{subtitle}</p>

      <div className="mt-6 flex flex-wrap gap-3">
        <a
          href={tel}
          className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black hover:bg-white/90"
        >
          <PhoneCall className="h-4 w-4" />
          Call {number}
        </a>
        <a
          href="/#contact"
          className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white/90 hover:bg-white/10"
        >
          Ask a question <ArrowRight className="h-4 w-4" />
        </a>
      </div>

      <div className="mt-7 space-y-3">
        <Bullet text="Instant pickup and triage" />
        <Bullet text="Captures intent and contact details" />
        <Bullet text="Escalates when required" />
      </div>
    </div>
  );
}

function Tile({ title, bullets }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-black/20 p-8">
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

function Tag({ text }) {
  return (
    <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/70">
      {text}
    </span>
  );
}
