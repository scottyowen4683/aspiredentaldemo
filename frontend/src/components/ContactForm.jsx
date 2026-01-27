import React, { useMemo, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { CheckCircle2, Mail, Phone, Building2 } from "lucide-react";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

export default function ContactForm({
  variant = "default",
  title = "Talk to Aspire",
  subtitle = "Tell us what you want the agent to handle. We will respond with a clear recommendation and next steps.",
  showOrg = true,
  ctaLabel = "Send",
  className = "",
}) {
  const API = useMemo(() => {
    const base = (BACKEND_URL || "").replace(/\/+$/, "");
    return base ? `${base}/api` : "";
  }, []);

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

  const buildPayload = () => {
    const orgLine =
      showOrg && formData.org?.trim()
        ? `Organisation: ${formData.org.trim()}\n\n`
        : "";

    return {
      name: formData.name.trim(),
      email: formData.email.trim(),
      phone: formData.phone.trim(),
      message: `${orgLine}${formData.message.trim()}`,
    };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!API) {
      toast.error("Configuration error", {
        description: "VITE_BACKEND_URL is not set. The form cannot send yet.",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await axios.post(`${API}/contact`, buildPayload());
      if (res?.data?.status === "success") {
        toast.success("Message sent", {
          description: "We will get back to you within 24 hours.",
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
    <section
      id="contact"
      className={[
        "rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 to-white/5 p-10 md:p-14",
        className,
      ].join(" ")}
    >
      <div className="grid gap-10 md:grid-cols-2 md:items-start">
        <div>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">
            {title}
          </h2>
          <p className="mt-4 text-white/70 leading-relaxed">{subtitle}</p>

          <div className="mt-6 space-y-3">
            <Bullet text="Built and managed in Australia by a former CEO." />
            <Bullet text="Governed delivery under the ASPIRE Enterprise AI Framework." />
            <Bullet text="Designed for service environments where reputation matters." />
          </div>

          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            <InfoChip icon={<Mail className="h-4 w-4" />} label="Email" value="scott@aspireexecutive.com.au" />
            <InfoChip icon={<Phone className="h-4 w-4" />} label="Location" value="Australia" />
            {showOrg ? (
              <InfoChip icon={<Building2 className="h-4 w-4" />} label="Best for" value={variant === "government" ? "Councils and agencies" : "Service-led businesses"} />
            ) : null}
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

          {showOrg ? (
            <input
              name="org"
              placeholder="Organisation"
              value={formData.org}
              onChange={handleChange}
              className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/30"
            />
          ) : null}

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
            {isSubmitting ? "Sending..." : ctaLabel}
          </button>
        </form>
      </div>
    </section>
  );
}

/* small UI */

function Bullet({ text }) {
  return (
    <div className="flex items-start gap-2 text-sm text-white/75">
      <CheckCircle2 className="mt-0.5 h-4 w-4 text-white/70" />
      <span>{text}</span>
    </div>
  );
}

function InfoChip({ icon, label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center gap-2 text-white/75">
        {icon}
        <div className="text-xs font-semibold">{label}</div>
      </div>
      <div className="mt-2 text-sm text-white/70">{value}</div>
    </div>
  );
}
