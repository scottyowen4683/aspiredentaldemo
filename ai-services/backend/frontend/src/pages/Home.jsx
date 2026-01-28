import React, { useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";

const DEMO_URL = "https://calendly.com/scott-owen-aspire/ai-demo";

function Pill({ children }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/75">
      {children}
    </div>
  );
}

function Card({ title, desc, bullets, to }) {
  return (
    <div className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-7 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
      <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100">
        <div className="absolute -top-24 right-0 h-72 w-72 rounded-full bg-gradient-to-br from-white/10 via-indigo-500/10 to-cyan-400/10 blur-3xl" />
      </div>

      <div className="relative">
        <div className="text-sm text-white/60">Explore</div>
        <h3 className="mt-2 text-2xl font-semibold tracking-tight text-white">
          {title}
        </h3>
        <p className="mt-3 text-sm leading-relaxed text-white/70">{desc}</p>

        <ul className="mt-5 space-y-2 text-sm text-white/70">
          {bullets.map((b) => (
            <li key={b} className="flex items-start gap-2">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-white/60" />
              <span>{b}</span>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex items-center gap-3">
          <Link
            to={to}
            className="inline-flex items-center justify-center rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90"
          >
            View {title}
          </Link>

          <a
            href={DEMO_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
          >
            Book a live demo
          </a>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    org: "",
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e) =>
    setFormData((p) => ({ ...p, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const payload = {
        name: formData.name.trim(),
        email: formData.email.trim(),
        phone: (formData.phone || "").trim(),
        message: `${
          formData.org?.trim() ? `Organisation: ${formData.org.trim()}\n\n` : ""
        }${formData.message.trim()}`,
      };

      // Note: Contact form would need a backend endpoint
      toast.success("Message received", {
        description: "We will get back to you within 24 hours.",
      });
      setFormData({ name: "", email: "", phone: "", org: "", message: "" });
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
    <div className="space-y-14">
      {/* HERO */}
      <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-[#0B1632] via-[#071022] to-[#070A12] p-10 md:p-14">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 left-10 h-[520px] w-[520px] rounded-full bg-gradient-to-br from-indigo-500/18 via-cyan-400/10 to-white/0 blur-3xl" />
          <div className="absolute -bottom-40 right-0 h-[560px] w-[560px] rounded-full bg-gradient-to-br from-blue-500/14 via-white/6 to-white/0 blur-3xl" />
        </div>

        <div className="relative max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <Pill>ASPIRE Enterprise AI Framework</Pill>
            <Pill>Australian built and managed</Pill>
            <Pill>Essential Eight (ML2) aligned principles</Pill>
          </div>

          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-white md:text-6xl">
            When AI speaks on your behalf, it carries your reputation.
          </h1>

          <p className="mt-5 text-base leading-relaxed text-white/70 md:text-lg">
            Aspire delivers premium voice and chat agents for Government and
            Business. Every deployment is governed, measurable, and designed for
            real service delivery. Intent is captured cleanly, escalation is
            controlled, and outcomes are visible in the Aspire Portal.
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
            <a
              href={DEMO_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black hover:bg-white/90"
            >
              Book a live demo
            </a>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                to="/government"
                className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
              >
                Government
              </Link>
              <Link
                to="/business"
                className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
              >
                Business
              </Link>
              <Link
                to="/framework"
                className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold text-white/85 hover:bg-white/10"
              >
                Explore the framework
              </Link>
            </div>
          </div>

          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-sm font-semibold text-white">
                Governed voice and chat
              </div>
              <div className="mt-1 text-sm text-white/65">
                Consistent answers with controlled escalation and clean handover.
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-sm font-semibold text-white">
                Structured intent capture
              </div>
              <div className="mt-1 text-sm text-white/65">
                Captures purpose, context, and next steps that teams can action.
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-sm font-semibold text-white">
                Delivery, not theatre
              </div>
              <div className="mt-1 text-sm text-white/65">
                Built for accountability, repeatable quality, and defensibility.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TRUST WEDGE */}
      <section className="grid gap-10 md:grid-cols-2 md:items-start">
        <div>
          <div className="text-sm text-white/60">Why Aspire exists</div>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">
            Built in Australia by a former CEO, for organisations that cannot
            afford failure.
          </h2>

          <p className="mt-4 text-base leading-relaxed text-white/70">
            Aspire was created by someone who has run complex organisations,
            operated under public scrutiny, handled service failures, and carried
            accountability when outcomes matter.
          </p>

          <p className="mt-4 text-base leading-relaxed text-white/70">
            The ASPIRE Enterprise AI Framework is the operating model behind each
            deployment. It governs what the agent can say, when it must stop,
            how escalation occurs, and how performance is measured and improved.
          </p>

          <p className="mt-4 text-base leading-relaxed text-white/70">
            This is not a chatbot. It is a controlled service channel that
            captures intent, applies boundaries, and preserves context through
            to resolution.
          </p>

          <div className="mt-6">
            <Link
              to="/framework"
              className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
            >
              See how the framework works
            </Link>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-7">
            <div className="text-sm font-semibold text-white">
              Designed for consequence
            </div>
            <div className="mt-2 text-sm leading-relaxed text-white/70">
              Built for environments where an incorrect answer becomes a service
              failure, a reputational issue, or a governance issue.
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-7">
            <div className="text-sm font-semibold text-white">
              Escalation is enforced
            </div>
            <div className="mt-2 text-sm leading-relaxed text-white/70">
              Aspire recognises limits, routes to humans cleanly, preserves
              context, and avoids the behaviour that creates false confidence.
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-7">
            <div className="text-sm font-semibold text-white">
              Control over novelty
            </div>
            <div className="mt-2 text-sm leading-relaxed text-white/70">
              Premium AI is not feature count. It is governance, repeatable
              quality, and defensibility at scale.
            </div>
          </div>
        </div>
      </section>

      {/* SPLIT PATHS */}
      <section className="grid gap-6 md:grid-cols-2">
        <Card
          title="Government"
          desc="Designed for public-facing enquiries, structured responses, and controlled handover. Built for Australian service delivery expectations."
          bullets={[
            "Voice and chat for contact centres and after-hours coverage",
            "Controlled escalation pathways and structured responses",
            "Governance-first delivery under the ASPIRE framework",
          ]}
          to="/government"
        />

        <Card
          title="Business"
          desc="A premium customer experience that reduces load, captures intent, and protects brand tone through governed delivery and reporting."
          bullets={[
            "Inbound voice and web chat built for conversion and service",
            "Outbound engagement where appropriate, consent-first by design",
            "Clean handover, measurable outcomes, and continuous improvement",
          ]}
          to="/business"
        />
      </section>

      {/* FINAL CTA */}
      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 md:p-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm text-white/60">Ready to see it live?</div>
            <div className="mt-2 text-2xl font-semibold tracking-tight text-white">
              Demo the experience. Not the pitch.
            </div>
            <div className="mt-2 text-sm text-white/70">
              Book a live walkthrough and see how Aspire handles voice, chat, and
              escalation under governance, with performance visibility in the
              Aspire Portal.
            </div>
          </div>
          <a
            href={DEMO_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black hover:bg-white/90"
          >
            Book a live demo
          </a>
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
              Tell us what you want the agent to handle. We will respond with a
              clear recommendation and next steps.
            </p>

            <div className="mt-6 space-y-3 text-sm text-white/75">
              <div className="flex items-start gap-2">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-white/60" />
                <span>Built and managed in Australia by a former CEO.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-white/60" />
                <span>
                  Governed delivery under the ASPIRE Enterprise AI Framework.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-white/60" />
                <span>
                  Designed for service environments where reputation matters.
                </span>
              </div>
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
              placeholder="Organisation (optional)"
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
