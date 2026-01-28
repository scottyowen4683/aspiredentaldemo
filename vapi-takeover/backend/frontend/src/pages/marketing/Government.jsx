// frontend/src/pages/government.jsx
import React, { useState } from "react";
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

import OutboundCTA from "./OutboundCTA.jsx";


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
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (data.status === "success") {
        toast.success("Message sent", {
          description: "We will get back to you within 24 hours.",
        });
        setFormData({ name: "", email: "", phone: "", org: "", message: "" });
      } else {
        toast.error("Error", { description: data.message || "Unexpected server response." });
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
            Government AI Agents. Governed by the ASPIRE™ Enterprise AI Framework.
          </p>

          <h1 className="mt-6 text-4xl md:text-6xl font-semibold tracking-tight">
            24/7 service delivery,
            <span className="text-white/70"> with governance built in.</span>
          </h1>

          <p className="mt-5 max-w-2xl text-base md:text-lg text-white/70 leading-relaxed">
            Aspire deploys premium voice and chat agents for councils and
            public-facing service environments. Controlled responses, clean
            escalation, and measurable outcomes, delivered as a managed service.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={BOOKING_URL}
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black hover:bg-white/90"
            >
              Book a demo <ArrowRight className="h-4 w-4" />
            </a>

            <a
              href={`tel:${GOV_DEMO_NUMBER.replace(/\s/g, "")}`}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white/90 hover:bg-white/10"
            >
              <PhoneCall className="h-4 w-4" />
              Call the AI demo: {GOV_DEMO_NUMBER}
            </a>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <ValueCard
              icon={<PhoneCall className="h-4 w-4" />}
              title="Inbound voice"
              text="After-hours coverage with consistent triage and structured handover."
            />
            <ValueCard
              icon={<MessageSquare className="h-4 w-4" />}
              title="Web chat"
              text="Grounded answers for common enquiries, with controlled escalation when needed."
            />
            <ValueCard
              icon={<Zap className="h-4 w-4" />}
              title="Workflows"
              text="Structured routing, summaries, and auditable actions that teams can execute."
            />
          </div>

          {/* Trust strip */}
          <div className="mt-10 rounded-3xl border border-white/10 bg-black/20 p-8 md:p-10">
            <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
              <div className="max-w-3xl">
                <p className="text-xl md:text-2xl font-semibold tracking-tight">
                  Built and managed in Australia.
                  <span className="text-white/70">
                    {" "}
                    Designed for Australian public sector expectations.
                  </span>
                </p>
                <p className="mt-3 text-sm md:text-base text-white/70 leading-relaxed">
                  Aspire is built in Australia by a former CEO. Deployments are
                  designed to align with the Australian Privacy Principles,
                  governance controls, and defensible service delivery.
                </p>
                <div className="mt-6 grid gap-3 md:grid-cols-2">
                  <Bullet text="Australian Privacy Principles aligned deployment approach" />
                  <Bullet text="Governance, escalation, and auditability by design" />
                  <Bullet text="Integration-ready for TechnologyOne and SAP environments" />
                  <Bullet text="Local Buy approved supplier pathway for councils" />
                </div>
              </div>

              <div className="shrink-0 w-full md:w-auto">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-1 md:gap-4">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-center">
                    <img
                      src="/local-buy.png"
                      alt="Local Buy Approved"
                      className="mx-auto h-10 w-auto opacity-90"
                      loading="lazy"
                    />
                    <div className="mt-2 text-xs text-white/60">
                      Local Buy Approved
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex items-center justify-center gap-3">
                      <img
                        src="/tech-one.png"
                        alt="TechnologyOne"
                        className="h-7 w-auto opacity-90"
                        loading="lazy"
                      />
                      <img
                        src="/sap.png"
                        alt="SAP"
                        className="h-7 w-auto opacity-90"
                        loading="lazy"
                      />
                    </div>
                    <div className="mt-2 text-center text-xs text-white/60">
                      Integration ready
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* LIVE DEMO (embedded) */}
      <section className="rounded-3xl border border-white/10 bg-white/5 p-10">
        <p className="text-2xl font-semibold">Live demo (Government)</p>
        <p className="mt-3 text-white/70">
          Call the number above to experience the government voice agent demo.
        </p>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <Tile
            title="What to test"
            points={[
              "Tone that is calm, respectful, and public facing",
              "Control that avoids guessing and stays within scope",
              "Escalation that routes sensitive topics to humans",
            ]}
          />
          <Tile
            title="What you will see"
            points={[
              "Fast triage and clear resolution pathways",
              "Consistent after-hours service without service drift",
              "Clean capture of details for staff follow up",
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
            text="Approved sources, clear boundaries, and managed behaviour designed to reduce hallucinations."
          />
          <Mini
            title="Escalation by design"
            text="Sensitive matters route to humans with concise, structured summaries."
          />
          <Mini
            title="Measurable outcomes"
            text="Deflection, resolution, top topics, and optimisation cycles visible through the Aspire Portal."
          />
        </div>
      </section>

      {/* OUTBOUND (optional but available) */}
      <section className="rounded-3xl border border-white/10 bg-white/5 p-8 md:p-10">
        <OutboundCTA variant="government" />
      </section>

      {/* FRAMEWORK PROMINENCE */}
      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 to-white/5 p-10">
        <p className="text-2xl font-semibold">
          Why Aspire holds up in government
        </p>
        <p className="mt-3 text-white/70 max-w-3xl">
          The ASPIRE™ Enterprise AI Framework governs how AI agents are designed,
          deployed, measured, and improved in live service environments.
        </p>
        <div className="mt-6 grid gap-6 md:grid-cols-3">
          <MiniPlain text="Governance-first design covering privacy, consent, escalation, and defensibility." />
          <MiniPlain text="Knowledge precision and controlled responses aligned to approved sources." />
          <MiniPlain text="Continuous optimisation based on real interactions, not assumptions." />
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
              after-hours. We will respond with a clear recommendation and next
              steps.
            </p>

            <div className="mt-6 space-y-3">
              <Bullet text="Voice and chat deployed quickly." />
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
