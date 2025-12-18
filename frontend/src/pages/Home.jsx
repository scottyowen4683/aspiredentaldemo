import React, { useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import {
  ArrowRight,
  ShieldCheck,
  Building2,
  Briefcase,
  PhoneCall,
  MessageSquare,
  Zap,
  CheckCircle2,
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
        <div className="absolute -top-28 -right-28 h-80 w-80 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="absolute -bottom-28 -left-28 h-80 w-80 rounded-full bg-cyan-400/10 blur-3xl" />

        <div className="relative">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs text-white/70">
            <ShieldCheck className="h-4 w-4" />
            ASPIRE™ Enterprise AI Framework • Essential Eight (ML2) aligned principles
          </p>

          <h1 className="mt-6 text-4xl md:text-6xl font-semibold tracking-tight">
            Premium AI agents for organisations that
            <span className="text-white/70"> can’t afford guesswork.</span>
          </h1>

          <p className="mt-5 max-w-3xl text-base md:text-lg text-white/70 leading-relaxed">
            Aspire builds voice + chat agents that reduce contact centre load, handle
            routine enquiries, capture intent, and escalate cleanly — all governed under
            a framework designed for real operations.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="/#contact"
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black hover:bg-white/90"
            >
              Request a demo <ArrowRight className="h-4 w-4" />
            </a>

            <Link
              to="/framework"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white/90 hover:bg-white/10"
            >
              Explore the framework <ArrowRight className="h-4 w-4" />
            </Link>

            <Link
              to="/agents"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white/90 hover:bg-white/10"
            >
              View capabilities <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <Pill
              icon={<PhoneCall className="h-4 w-4" />}
              title="Voice Agents"
              text="Inbound + outbound calling with confident, human delivery."
            />
            <Pill
              icon={<MessageSquare className="h-4 w-4" />}
              title="Chat Agents"
              text="Web chat that’s grounded, controlled, and measurable."
            />
            <Pill
              icon={<Zap className="h-4 w-4" />}
              title="Workflow Automation"
              text="Structured routing, summaries, and auditable actions."
            />
          </div>
        </div>
      </section>

      {/* CHOOSE YOUR PATH (premium split, not “side-by-side silly”) */}
      <section className="grid gap-6 md:grid-cols-2">
        <PathCard
          icon={<Building2 className="h-5 w-5" />}
          title="Government"
          subtitle="Public-facing service delivery, after-hours coverage, controlled responses and escalation."
          to="/government"
          cta="Explore Government"
        />
        <PathCard
          icon={<Briefcase className="h-5 w-5" />}
          title="Business"
          subtitle="Stop missing calls, capture enquiries, and automate follow-up with premium voice + chat."
          to="/business"
          cta="Explore Business"
        />
      </section>

      {/* FRAMEWORK (premium differentiator) */}
      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 to-white/5 p-10 md:p-14">
        <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">
          ASPIRE™ Enterprise AI Framework
        </h2>

        <p className="mt-4 max-w-3xl text-white/70 leading-relaxed">
          The framework is the product. It’s what turns “AI capability” into a dependable,
          governable service — with clear boundaries, escalation, and continuous optimisation.
        </p>

        <div className="mt-8 grid gap-6 md:grid-cols-3">
          <Mini
            title="Governance-first"
            text="Consent, privacy posture, escalation pathways, and auditability built in."
          />
          <Mini
            title="Knowledge precision"
            text="Controlled sources and structured answers to reduce hallucinations."
          />
          <Mini
            title="Continuous optimisation"
            text="Measured outcomes, iteration cycles, and performance improvement."
          />
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            to="/framework"
            className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black hover:bg-white/90"
          >
            See the framework <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/agents"
            className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white/90 hover:bg-white/10"
          >
            Capabilities <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* TRUST / SECURITY WEIGHT (tasteful) */}
      <section className="grid gap-6 md:grid-cols-2">
        <InfoCard
          title="Security posture"
          text="Designed with a security posture aligned to Essential Eight principles (Maturity Level 2). Built for environments where reputational and operational risk matters."
        />
        <InfoCard
          title="Premium experience"
          text="Short, confident language. Controlled outputs. Clear next steps. This isn’t a gadget — it’s an operational capability."
        />
      </section>

      {/* CONTACT */}
      <section
        id="contact"
        className="rounded-3xl border border-white/10 bg-white/5 p-10 md:p-14"
      >
        <div className="grid gap-10 md:grid-cols-2 md:items-start">
          <div>
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">
              Talk to Aspire
            </h2>
            <p className="mt-4 text-white/70 leading-relaxed">
              Tell us what you want the agent to handle (calls, chat, after-hours,
              workflows). We’ll come back with a clear recommendation and next steps.
            </p>

            <div className="mt-6 space-y-3">
              <Bullet text="Government and business deployments." />
              <Bullet text="Framework-led governance and escalation." />
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

/* UI */

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

function PathCard({ icon, title, subtitle, to, cta }) {
  return (
    <Link
      to={to}
      className="group rounded-3xl border border-white/10 bg-white/5 p-10 hover:bg-white/10 transition-colors"
    >
      <div className="flex items-center gap-3 text-white/80">
        <div className="rounded-2xl border border-white/15 bg-white/5 p-3">
          {icon}
        </div>
        <p className="text-sm font-semibold tracking-wide">{title}</p>
      </div>

      <p className="mt-5 text-2xl font-semibold tracking-tight">{title}</p>
      <p className="mt-3 text-sm text-white/70 leading-relaxed">{subtitle}</p>

      <div className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black group-hover:bg-white/90">
        {cta} <ArrowRight className="h-4 w-4" />
      </div>
    </Link>
  );
}

function Mini({ title, text }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-6">
      <p className="text-sm font-semibold text-white/85">{title}</p>
      <p className="mt-2 text-sm text-white/65">{text}</p>
    </div>
  );
}

function InfoCard({ title, text }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-10">
      <p className="text-lg font-semibold">{title}</p>
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
