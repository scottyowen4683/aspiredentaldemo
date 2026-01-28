import { useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Phone, CheckCircle, Megaphone, Sparkles } from "lucide-react";

const normalizeAu = (raw: string) => {
  let s = (raw || "").replace(/[^\d+]/g, "");
  if (s.startsWith("0")) s = "+61" + s.slice(1);
  if (s.startsWith("61")) s = "+" + s;
  return /^\+61\d{9}$/.test(s) ? s : null;
};

interface OutboundCTAProps {
  variant?: "government" | "business";
}

export default function OutboundCTA({ variant = "business" }: OutboundCTAProps) {
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);

  const blocks = {
    government: {
      eyebrow: "Outbound - Government",
      title: "Proactive Community Outreach - AI Voice Demo",
      lead:
        "Click below and our AI will call you now. Experience how councils can use voice AI for proactive community engagement.",
      points: [
        "Rates & overdue reminders with compliant wording",
        "Service updates: bin day changes, roadworks, emergencies",
        "Program outreach: libraries, youth, seniors, events",
      ],
    },
    business: {
      eyebrow: "Outbound - Business",
      title: "Instant Lead Callbacks - AI Voice Demo",
      lead:
        "Click below and our AI will call you now. Experience how businesses can use voice AI for instant lead engagement.",
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
    if (!to) return toast.error("Enter a valid AU number (e.g. 0412 345 678).");
    if (!consent) return toast.error("Please tick consent to be called.");

    try {
      setLoading(true);

      // Call our self-hosted Twilio API endpoint
      await axios.post("/api/outbound-call", {
        to,
        context: { variant, path: window.location.pathname },
      });

      toast.success("All set - we're calling you now.");
      setPhone("");
      setConsent(false);
    } catch (e: any) {
      console.error(e);
      const msg = e?.response?.data?.message || "Couldn't trigger the call.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="my-10 rounded-3xl border border-white/10 bg-white/5 p-8 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-sm text-white/70">
        <Megaphone size={16} />
        <span>{copy.eyebrow}</span>
      </div>

      <h3 className="text-2xl font-semibold text-white">{copy.title}</h3>
      <p className="mt-2 text-white/70">{copy.lead}</p>

      <ul className="mt-4 grid gap-2">
        {copy.points.map((p, i) => (
          <li key={i} className="flex items-start gap-2 text-white/75">
            <CheckCircle size={18} className="mt-0.5 text-white/70" />
            <span>{p}</span>
          </li>
        ))}
      </ul>

      <div className="mt-6 grid gap-3 sm:flex sm:items-center">
        <input
          type="tel"
          placeholder="Your phone (e.g. 0412 345 678)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          inputMode="tel"
          className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/30"
        />

        <button
          onClick={handleCall}
          disabled={loading}
          className="w-full sm:w-auto rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black hover:bg-white/90 disabled:opacity-60 inline-flex items-center justify-center gap-2"
        >
          <Phone size={18} />
          {loading ? "Calling..." : "Get the AI to call me now"}
        </button>
      </div>

      <label className="mt-4 flex items-start gap-2 text-sm text-white/70 cursor-pointer">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-white/30 bg-white/10"
        />
        I consent to receive an automated call now from Aspire.
      </label>

      <div className="mt-5 flex items-start gap-2 text-sm text-white/70">
        <Sparkles size={16} className="mt-0.5 text-white/70" />
        <div>
          Human-sounding AI powered by ElevenLabs. Self-hosted for security and compliance.
        </div>
      </div>
    </section>
  );
}
