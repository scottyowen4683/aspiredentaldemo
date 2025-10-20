// frontend/src/components/OutboundCTA.jsx
import React, { useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Phone, CheckCircle, Megaphone, Sparkles } from "lucide-react";

const normalizeAu = (raw) => {
  let s = (raw || "").replace(/[^\d+]/g, "");
  if (s.startsWith("0")) s = "+61" + s.slice(1);
  if (s.startsWith("61")) s = "+" + s;
  return /^\+61\d{9}$/.test(s) ? s : null;
};

export default function OutboundCTA({
  variant = "business",                 // "government" | "business"
  assistantId,                          // OUTBOUND assistant id (env-driven)
  fromNumber = import.meta.env.VITE_VAPI_FROM_NUMBER,
  apiBase = "/.netlify/functions",
}) {
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);

  const blocks = {
    government: {
      eyebrow: "Outbound • Government",
      title: "Proactive Community Outreach — Scott’s Cloned Voice",
      lead:
        "Click below and our AI (Scott’s cloned voice) will call you now. Councils can also clone their own authorised voice or pick from hundreds of premium voices.",
      points: [
        "Rates & overdue reminders with compliant wording",
        "Service updates: bin day changes, roadworks, emergencies",
        "Program outreach: libraries, youth, seniors, events",
      ],
    },
    business: {
      eyebrow: "Outbound • Business",
      title: "Instant Lead Callbacks — Scott’s Cloned Voice",
      lead:
        "Click below and our AI (Scott’s cloned voice) will call you now. Businesses can clone their own brand voice or select from hundreds of voices.",
      points: [
        "Immediate web-lead callbacks & missed-call recovery",
        "Quote & invoice follow-ups that convert",
        "Reactivation of old leads and churned customers",
      ],
    },
  };

  const copy = blocks[variant];

  const handleCall = async () => {
    const to = normalizeAu(phone);
    if (!assistantId) return toast.error("Missing outbound Assistant ID.");
    if (!fromNumber) return toast.error("Missing caller ID (fromNumber).");
    if (!to) return toast.error("Enter a valid AU number (e.g. 0412 345 678).");
    if (!consent) return toast.error("Please tick consent to be called.");

    try {
      setLoading(true);
      await axios.post(`${apiBase}/vapi-outbound-call`, {
        to,
        fromNumber,
        assistantId,
        context: { variant, path: window.location.pathname },
      });
      toast.success("All set — we’re calling you now.");
      setPhone("");
      setConsent(false);
    } catch (e) {
      console.error(e);
      const msg = e?.response?.data?.message || "Couldn’t trigger the call.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="my-10 rounded-2xl border p-6 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-sm opacity-70">
        <Megaphone size={16} />
        <span>{copy.eyebrow}</span>
      </div>

      <h3 className="text-2xl font-semibold">{copy.title}</h3>
      <p className="mt-2">{copy.lead}</p>

      <ul className="mt-4 grid gap-2">
        {copy.points.map((p, i) => (
          <li key={i} className="flex items-start gap-2">
            <CheckCircle size={18} className="mt-0.5" />
            <span>{p}</span>
          </li>
        ))}
      </ul>

      <div className="mt-5 grid gap-3 sm:flex sm:items-center">
        <input
          type="tel"
          placeholder="Your phone (e.g. 0412 345 678)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full rounded-lg border px-3 py-2"
          inputMode="tel"
        />
        <button
          onClick={handleCall}
          disabled={loading}
          className="w-full sm:w-auto rounded-lg border px-4 py-2 font-medium hover:opacity-90 disabled:opacity-60 flex items-center gap-2"
        >
          <Phone size={18} />
          {loading ? "Calling…" : "Get the AI to call me now"}
        </button>
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        I consent to receive an automated call now from Aspire.
      </label>

      <div className="mt-4 flex items-start gap-2 text-sm opacity-75">
        <Sparkles size={16} className="mt-0.5" />
        <div>
          Human-sounding AI with full compliance options. Clone your own voice or
          choose from hundreds of premium voices.
        </div>
      </div>
    </section>
  );
}
