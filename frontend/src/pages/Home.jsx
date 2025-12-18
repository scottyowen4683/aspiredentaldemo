import React, { useState } from "react";
import { Link } from "react-router-dom";
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
  Briefcase,
} from "lucide-react";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function Home() {
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
    <div className="space-y-20">
      {/* HERO */}
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-10 md:p-14">
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-blue-600/20 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />

        <div className="relative">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs text-white/70">
            <ShieldCheck className="h-4 w-4" />
            Australian-first. Enterprise-grade. Built for real operations.
          </p>

          <h1 className="mt-6 text-4xl md:text-6xl font-semibold tracking-tight">
            AI Agents that answer, act,
            <span className="text-white/70"> and deliver outcomes.</span>
          </h1>

          <p className="mt-5 max-w-2xl text-base md:text-lg text-white/70 leading-relaxed">
            Aspire deploys voice and chat agents that resolve routine enquiries,
            capture intent, trigger workflows, and escalate cleanly — without
            turning your organisation into a science project.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/ai-receptionist"
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black hover:bg-white/90"
            >
              Hear the Voice Demo <ArrowRight className="h-4 w-4" />
            </Link>

            <Link
              to="/government"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white/90 hover:bg-white/10"
            >
              Government <Building2 className="h-4 w-4" />
            </Link>

            <Link
              to="/business"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white/90 hover:bg-white/10"
            >
              Business <Briefcase className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <Pill
              icon={<PhoneCall className="h-4 w-4" />}
              title="Voice Agents"
              text="Inbound + outbound calls with confident, human delivery."
            />
            <Pill
              icon={<MessageSquare className="h-4 w-4" />}
              title="Chat Agents"
              text="Web chat that answers instantly and escalates cleanly."
            />
            <Pill
              icon={<Zap className="h-4 w-4" />}
              title="Automations"
              text="Structured workflows that actually reduce workload."
            />
          </div>
        </div>
      </section>

      {/* FRAMEWORK */}
      <section className="grid gap-10 md:grid-cols-2 md:items-start">
        <div>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">
            ASPIRE™ Enterprise AI Framework
          </h2>
          <p className="mt-4 text-white/70 leading-relaxed">
            The framework behind every deployment — designed to keep your AI
            reliable, safe, and measurable.
          </p>

          <div className="mt-6 space-y-3">
            <Bullet text="Governance-first design (privacy, consent, escalation)." />
            <Bullet text="Knowledge precision: reduce hallucinations, increase trust." />
            <Bullet text="Workflow orchestration: email/API actions that are auditable." />
            <Bullet text="Continuous optimisation: improve outcomes month-on-month." />
          </div>

          <div className="mt-8 flex gap-3">
            <a
              href="/#contact"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white/90 hover:bg-white/10"
            >
              Request a demo pack <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
          <p className="text-sm font-semibold text-white/80">
            What “premium” means in practice
          </p>

          <div className="mt-6 grid gap-4">
            <Card
              title="Less noise, more control"
              text="Short pages, crisp language, and clear next steps — designed for executives."
            />
            <Card
              title="Compliance-ready"
              text="Privacy Act and Australian data expectations front-of-mind — without jargon."
            />
            <Card
              title="Outcomes, not features"
              text="Reduced calls, faster resolution, cleaner handoffs, measurable service lift."
            />
          </div>
        </div>
      </section>

      {/* AUDIENCE PATHS */}
      <section className="grid gap-6 md:grid-cols-2">
        <AudienceTile
          title="Government"
          subtitle="24/7 customer service for councils and complex organisations."
          to="/government"
        />
        <AudienceTile
          title="Business"
          subtitle="Capture enquiries, reduce missed calls, automate booking and follow-up."
          to="/business"
        />
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
              Tell us what you want the agent to handle (calls, chat, outbound,
              workflows). We’ll reply with a clear recommendation and the next
              steps.
            </p>

            <div className="mt-6 space-y-3 text-white/75">
              <Bullet text="Fast deploy, clean governance." />
              <Bullet text="No GHL / LeadConnector. No clutter." />
              <Bullet text="Premium build quality — end to end." />
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
    </div>
  );
}

/* small UI helpers */

function Pill({ icon, title, text }) {
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

function Bullet({ text }) {
  return (
    <div className="flex items-start gap-2 text-sm text-white/75">
      <CheckCircle2 className="mt-0.5 h-4 w-4 text-white/70" />
      <span>{text}</span>
    </div>
  );
}

function Card({ title, text }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
      <p className="text-sm font-semibold text-white/85">{title}</p>
      <p className="mt-2 text-sm text-white/65">{text}</p>
    </div>
  );
}

function AudienceTile({ title, subtitle, to }) {
  return (
    <Link
      to={to}
      className="group rounded-3xl border border-white/10 bg-white/5 p-8 hover:bg-white/10 transition-colors"
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xl font-semibold">{title}</p>
          <p className="mt-2 text-sm text-white/65">{subtitle}</p>
        </div>
        <div className="rounded-2xl border border-white/15 bg-white/5 p-3 text-white/80 group-hover:bg-white/10">
          <ArrowRight className="h-4 w-4" />
        </div>
      </div>
    </Link>
  );
}
