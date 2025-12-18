// frontend/src/pages/government.jsx
import React, { useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  ShieldCheck,
  PhoneCall,
  MessageSquare,
  Zap,
  ArrowRight,
  CheckCircle2,
  Building2,
  AlertTriangle,
} from "lucide-react";

import OutboundCTA from "../components/OutboundCTA.jsx";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const GOV_DEMO_NUMBER = "+61 489 087 448";
const BOOKING_URL = "https://calendly.com/scott-owen-aspire/ai-receptionist-demo";

export default function Government() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    org: "",
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e) =>
    setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await axios.post(`${API}/contact`, formData);
      if (res.data.status === "success") {
        toast.success("Message sent", {
          description: "We’ll get back to you within 24 hours.",
        });
        setFormData({ name: "", email: "", phone: "", org: "", message: "" });
      } else {
        toast.error("Error", { description: "Unexpected server response." });
      }
    } catch (err) {
      console.error(err);
      toast.error("Error", {
        description: "Failed to send. Please try again shortly.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-16">
      {/* HERO */}
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/7 p-10 md:p-14">
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />

        <div className="relative">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs text-white/70">
            <ShieldCheck className="h-4 w-4" />
            Government AI Agents • Powered by ASPIRE™ Enterprise AI Framework
          </p>

          <h1 className="mt-6 text-4xl md:text-6xl font-semibold tracking-tight">
            24/7 service delivery,
            <span className="text-white/70"> without compromising governance.</span>
          </h1>

          <p className="mt-5 max-w-2xl text-base md:text-lg text-white/70 leading-relaxed">
            Aspire deploys premium voice and chat agents designed for councils
            and complex public-facing environments — controlled responses,
            clean escalation, and measurable outcomes.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={BOOKING_URL}
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black hover:bg-white/90"
            >
              Book a Demo <ArrowRight className="h-4 w-4" />
            </a>

            <a
              href={`tel:${GOV_DEMO_NUMBER.replace(/\s/g, "")}`}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white/90 hover:bg-white/10"
            >
              <PhoneCall className="h-4 w-4" />
              Call the AI Demo: {GOV_DEMO_NUMBER}
            </a>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <ValueCard
              icon={<PhoneCall className="h-4 w-4" />}
              title="Inbound Voice"
              text="After-hours coverage with consistent triage and handoff."
            />
            <ValueCard
              icon={<MessageSquare className="h-4 w-4" />}
              title="Web Chat"
              text="Grounded answers for common enquiries and self-service."
            />
            <ValueCard
              icon={<Zap className="h-4 w-4" />}
              title="Workflows"
              text="Structured routing, summaries, and auditable actions."
            />
          </div>
        </div>
      </section>

      {/* LIVE DEMO (embedded) */}
      <section className="rounded-3xl border border-white/10 bg-white/5 p-10">
        <p className="text-2xl font-semibold">Live demo (Government)</p>
        <p className="mt-3 text-white/70">
          Call the number above to experience the voice agent. The chat widget
          should appear bottom-right on every page.
        </p>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <Tile
            title="What to test"
            points={[
              "Tone: calm, respectful, public-facing",
              "Control: avoids guessing, stays within scope",
              "Escalation: routes sensitive topics to humans",
            ]}
          />
          <Tile
            title="What you should see"
            points={[
              "Fast triage and clear resolution pathways",
              "Better service consistency after-hours",
              "Clean capture of details for staff follow-up",
            ]}
          />
        </div>
      </section>

      {/* SECURITY / GOVERNANCE WEIGHT */}
      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 to-white/5 p-10">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl border border-white/15 bg-white/5 p-3 text-white/80">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-semibold">Security and governance</p>
            <p className="mt-3 text-white/70 max-w-3xl">
              Aspire deployments are designed under the ASPIRE™ Enterprise AI
              Framework, with security posture aligned to Essential Eight
              principles (Maturity Level 2).
            </p>
          </div>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-3">
          <Mini
            title="Controlled knowledge"
            text="Approved sources, reduced hallucinations, clear boundaries."
          />
          <Mini
            title="Escalation by design"
            text="Sensitive matters route to humans with concise summaries."
          />
          <Mini
            title="Measurable outcomes"
            text="Deflection, resolution, top topics, and optimisation cycles."
          />
        </div>
      </section>

      {/* OUTBOUND (optional but available) */}
      <section className="rounded-3xl border border-white/10 bg-white/5 p-8 md:p-10">
        <OutboundCTA
          variant="government"
          assistantId={import.meta.env.VITE_VAPI_ASSISTANT_ID_OUTBOUND_GOV}
          fromNumber={import.meta.env.VITE_VAPI_FROM_NUMBER}
        />
      </section>

      {/* FRAMEWORK PROMINENCE */}
      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 to-white/5 p-10">
        <p className="text-2xl font-semibold">Why Aspire holds up in government</p>
        <p className="mt-3 text-white/70 max-w-3xl">
          The ASPIRE™ Enterprise AI Framework is the difference between a
          “chatbot trial” and a production-grade service capability.
        </p>
        <div className="mt-6 grid gap-6 md:grid-cols-3">
          <MiniPlain text="Governance-first design (privacy, consent, escalation)." />
          <MiniPlain text="Knowledge precision and controlled responses." />
          <MiniPlain text="Continuous optimisation based on real interactions." />
        </div>
      </section>

      {/* CONTACT */}
      <section
        id="contact"
        className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 to-white/5 p-10 md:p-14"
      >
        <div className="grid gap-10 md:grid-cols-2 md:items-start">
          <div>
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">
              Talk to Aspire
            </h2>
            <p className="mt-4 text-white/70 leading-relaxed">
              Tell us what you want the agent to handle across calls, chat, and
              after-hours. We’ll respond with a clear recommendation and next steps.
            </p>

            <div className="mt-6 space-y-3">
              <Bullet text="Voice + chat deployed fast." />
              <Bullet text="Framework-led governance and escalation." />
              <Bullet text="Designed for service delivery pressure." />
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              name="name"
              placeholder="Your name"
              value={formData.name}
              onChange={handleChange}
              required
              className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/30"
            />

            <input
              name="org"
              placeholder="Organisation"
              value={formData.org}
              onChange={handleChange}
              className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/30"
            />

            <input
              name="email"
              type="email"
              placeholder="Email"
              value={formData.email}
              onChange={handleChange}
              required
              className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/30"
            />

            <input
              name="phone"
              type="tel"
              placeholder="Phone (optional)"
              value={formData.phone}
              onChange={handleChange}
              className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/30"
            />

            <textarea
              name="message"
              placeholder="What do you want the agent to handle?"
              value={formData.message}
              onChange={handleChange}
              required
              rows={5}
              className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/30"
            />

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black hover:bg-white/90 disabled:opacity-60"
            >
              {isSubmitting ? "Sending..." : "Send"}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}

/* UI helpers */

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

function Tile({ title, points }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-black/20 p-8">
      <p className="text-lg font-semibold">{title}</p>
      <div className="mt-4 space-y-3">
        {points.map((p) => (
          <Bullet key={p} text={p} />
        ))}
      </div>
    </div>
  );
}

function Mini({ title, text }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
      <p className="text-sm font-semibold text-white/85">{title}</p>
      <p className="mt-2 text-sm text-white/65">{text}</p>
    </div>
  );
}

function MiniPlain({ text }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-white/70">
      {text}
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
