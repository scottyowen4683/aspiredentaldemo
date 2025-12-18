import React, { useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import {
  PhoneCall,
  MessageSquare,
  Zap,
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";

import VapiWidget from "../components/VapiWidget.jsx";
import OutboundCTA from "../components/OutboundCTA.jsx";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const DEMO_NUMBER = "+61 7 4357 2749";
const BOOKING_URL = "https://calendly.com/scott-owen-aspire/ai-receptionist-demo";

const BIZ_ASSISTANT_ID =
  import.meta.env.VITE_VAPI_ASSISTANT_ID_BIZ ||
  import.meta.env.VITE_VAPI_ASSISTANT_ID_BUSINESS;

export default function Business() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
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
        setFormData({ name: "", email: "", phone: "", message: "" });
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
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-10 md:p-14">
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-blue-600/20 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />

        <div className="relative">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs text-white/70">
            <ShieldCheck className="h-4 w-4" />
            Business AI Agents • Voice + Chat + Automations
          </p>

          <h1 className="mt-6 text-4xl md:text-6xl font-semibold tracking-tight">
            Stop missing calls.
            <span className="text-white/70"> Start capturing intent.</span>
          </h1>

          <p className="mt-5 max-w-2xl text-base md:text-lg text-white/70 leading-relaxed">
            Aspire deploys premium AI agents that answer customers, handle the
            basics, trigger workflows, and escalate the right jobs — fast.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={BOOKING_URL}
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black hover:bg-white/90"
            >
              Book a Demo <ArrowRight className="h-4 w-4" />
            </a>

            <a
              href={`tel:${DEMO_NUMBER.replace(/\s/g, "")}`}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white/90 hover:bg-white/10"
            >
              <PhoneCall className="h-4 w-4" />
              Call the AI Demo: {DEMO_NUMBER}
            </a>

            <Link
              to="/demo"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white/90 hover:bg-white/10"
            >
              View live demos <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <ValueCard
              icon={<PhoneCall className="h-4 w-4" />}
              title="Voice Agent"
              text="Answers instantly, captures details, escalates cleanly."
            />
            <ValueCard
              icon={<MessageSquare className="h-4 w-4" />}
              title="Chat Agent"
              text="Website chat that resolves FAQs and books next steps."
            />
            <ValueCard
              icon={<Zap className="h-4 w-4" />}
              title="Automations"
              text="Email/API workflows that reduce admin workload."
            />
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/5 p-8 md:p-10">
        <OutboundCTA
          variant="business"
          assistantId={import.meta.env.VITE_VAPI_ASSISTANT_ID_OUTBOUND_BIZ}
          fromNumber={import.meta.env.VITE_VAPI_FROM_NUMBER}
        />
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <FeatureTile
          title="Capture missed calls automatically"
          points={[
            "After-hours coverage without after-hours wages.",
            "Instant summaries to your team (email/SMS/workflow).",
            "Consistent customer experience, every time.",
          ]}
        />
        <FeatureTile
          title="Reduce repetitive admin"
          points={[
            "Answer FAQs, policies, pricing, availability, basic troubleshooting.",
            "Take bookings / collect enquiry details cleanly.",
            "Escalate only when required — with context.",
          ]}
        />
      </section>

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
              Tell us what you want the agent to handle. We’ll respond with a
              clear recommendation and next steps.
            </p>
            <div className="mt-6 space-y-3">
              <Bullet text="Voice + chat deployed fast." />
              <Bullet text="Governance and escalation built-in." />
              <Bullet text="No clutter, no GHL/LeadConnector noise." />
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

      <VapiWidget assistantId={BIZ_ASSISTANT_ID} />
    </div>
  );
}

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

function FeatureTile({ title, points }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
      <p className="text-lg font-semibold">{title}</p>
      <div className="mt-4 space-y-3">
        {points.map((p) => (
          <Bullet key={p} text={p} />
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
