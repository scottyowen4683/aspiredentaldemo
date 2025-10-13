import React, { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import {
  Phone,
  Clock,
  DollarSign,
  Zap,
  CheckCircle,
  Mail,
  MapPin,
  ExternalLink,
  ShieldCheck,
  PlugZap,
  MessageSquare,
  FileText,
  ChevronDown,
  Calendar,
  Users,
  HelpCircle,
  AlertTriangle,
  Heart,
  Smile,
} from "lucide-react";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Assets
const ASPIRE_LOGO =
  "https://raw.githubusercontent.com/scottyowen4683/Aspirereception/refs/heads/feature/ai-receptionist/frontend/aspire.png";

// Editable bits
const DEMO_NUMBER = "+61 7 4357 2749";
const BOOKING_URL = "https://calendly.com/scott-owen-aspire/ai-receptionist-demo";
const HOTDOC_LINK = ""; // e.g. "https://www.hotdoc.com.au/medical-centres/clinic-name/book"

const Home = () => {
  const [formData, setFormData] = useState({ name: "", email: "", phone: "", message: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // LeadConnector chat widget
  useEffect(() => {
    const SCRIPT_ID = "leadconnector-chatbot";
    if (document.getElementById(SCRIPT_ID)) return;
    const s = document.createElement("script");
    s.id = SCRIPT_ID;
    s.src = "https://widgets.leadconnectorhq.com/loader.js";
    s.setAttribute("data-resources-url", "https://widgets.leadconnectorhq.com/chat-widget/loader.js");
    s.setAttribute("data-widget-id", "68eca49ec056983a7d3dbdbb");
    document.body.appendChild(s);
  }, []);

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await axios.post(`${API}/contact`, formData);
      if (res.data.status === "success") {
        toast.success("Message Sent!", { description: "We’ll get back to you within 24 hours." });
        setFormData({ name: "", email: "", phone: "", message: "" });
      } else {
        toast.error("Error", { description: "Unexpected response from server." });
      }
    } catch (err) {
      console.error(err);
      toast.error("Error", { description: "Failed to send message. Please try again or email us." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="fixed top-0 w-full bg-white/95 backdrop-blur-sm border-b border-slate-200 z-50">
        <div className="container mx-auto px-6 py-4 flex justify-between items-center">
          <img src={ASPIRE_LOGO} alt="Aspire Executive Solutions" className="h-12 w-auto" />
          <nav className="hidden md:flex gap-8 items-center">
            <a href="#offer" className="text-slate-700 hover:text-blue-600 font-medium">Offer</a>
            <a href="#about" className="text-slate-700 hover:text-blue-600 font-medium">Leadership</a>
            <a href="#how" className="text-slate-700 hover:text-blue-600 font-medium">How it works</a>
            <a href="#why-us" className="text-slate-700 hover:text-blue-600 font-medium">Why Aspire</a>
            <a href="#workflows" className="text-slate-700 hover:text-blue-600 font-medium">Dental Workflows</a>
            <a href="#services" className="text-slate-700 hover:text-blue-600 font-medium">Capabilities</a>
            <a href="#advanced" className="text-slate-700 hover:text-blue-600 font-medium">Advanced</a>
            <a href="#demo" className="text-slate-700 hover:text-blue-600 font-medium">Demo</a>
            <a href="#roi" className="text-slate-700 hover:text-blue-600 font-medium">ROI</a>
            <a href="#pricing" className="text-slate-700 hover:text-blue-600 font-medium">Pricing</a>
            <a href="#faq" className="text-slate-700 hover:text-blue-600 font-medium">FAQ</a>
            <a href="#contact" className="text-slate-700 hover:text-blue-600 font-medium">Contact</a>
          </nav>
          {/* Mobile */}
          <div className="md:hidden">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-slate-700 hover:text-blue-600 focus:outline-none"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-slate-200 shadow-sm">
            <div className="flex flex-col px-6 py-4 space-y-4">
              {[
                ["#offer", "Offer"],
                ["#about", "Leadership"],
                ["#how", "How it works"],
                ["#why-us", "Why Aspire"],
                ["#workflows", "Dental Workflows"],
                ["#services", "Capabilities"],
                ["#advanced", "Advanced"],
                ["#demo", "Demo"],
                ["#roi", "ROI"],
                ["#pricing", "Pricing"],
                ["#faq", "FAQ"],
                ["#contact", "Contact"],
              ].map(([href, label]) => (
                <a key={href} href={href} onClick={() => setMobileMenuOpen(false)} className="text-slate-700 hover:text-blue-600 font-medium">
                  {label}
                </a>
              ))}
            </div>
          </div>
        )}
      </header>
/* 1.5) Hero — Dental (single CTA area) */
<section id="hero" className="pt-10 pb-16 bg-gradient-to-br from-slate-50 to-blue-50">
  <div className="container mx-auto px-6 text-center max-w-5xl">
    <h1 className="text-5xl md:text-6xl font-bold mb-6 leading-tight">
      <span className="block text-slate-900">Every call answered.</span>
      <span className="block text-blue-600 mt-1">Every patient booked. 24/7.</span>
    </h1>
    <p className="text-xl text-slate-700 mb-6 leading-relaxed max-w-3xl mx-auto">
      A warm, human-sounding AI receptionist that handles calls, questions, and bookings
      through your existing HotDoc or HealthEngine—no new software, no missed patients.
    </p>

    {/* Single CTA area (kept: demo + hear the AI) */}
    <div className="flex gap-4 justify-center flex-wrap">
      <a
        href={BOOKING_URL}
        className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 text-lg rounded-md"
      >
        Book a 15-minute demo
      </a>
      <a
        href={`tel:${DEMO_NUMBER.replace(/\s/g, "")}`}
        className="border-2 border-slate-300 text-slate-800 hover:bg-white px-8 py-3 text-lg rounded-md flex items-center gap-2"
      >
        <Phone className="h-5 w-5" />
        Hear the AI: {DEMO_NUMBER}
      </a>
    </div>

    <p className="mt-4 text-slate-500">
      Works with HotDoc / HealthEngine. Australian-hosted. Privacy aligned.
    </p>
  </div>
</section>


   
<section id="offer" className="pt-28 pb-4 bg-white">
  <div className="container mx-auto px-6">
    <div className="rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md px-4 md:px-6 py-3 flex flex-col md:flex-row items-center justify-between">
      <div className="text-center md:text-left">
        <p className="text-xs uppercase tracking-wider opacity-90">Launch Offer</p>
        <p className="text-base md:text-lg font-semibold">
          Setup Fee <span className="line-through opacity-90">$5,000</span> →{" "}
          <span className="bg-white/20 px-2 py-0.5 rounded-md">FREE for the first 3 dental clinics</span>
        </p>
      </div>
      <a
        href={BOOKING_URL}
        className="mt-3 md:mt-0 inline-flex items-center justify-center rounded-lg bg-white text-blue-700 font-semibold px-4 py-2 hover:bg-blue-50"
      >
        Claim Offer
      </a>
    </div>
  </div>
</section>


      {/* 2) Executive Leadership, Clinic-grade Simplicity */}
      <section id="about" className="py-14 bg-white">
        <div className="container mx-auto px-6 max-w-4xl">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-slate-900 mb-3">Executive Leadership, Clinic-grade Simplicity</h2>
            <div className="w-20 h-1 bg-blue-600 mx-auto" />
          </div>
          <p className="text-lg text-slate-700 mb-4">
            Aspire isn’t another chatbot vendor. We’re operators who build workflows that fit the way dental teams
            actually work—calls, FAQs, bookings, changes, emergencies and reminders—without touching your PMS.
          </p>
          <p className="text-lg text-slate-700">
            Secure Australian hosting, scripts you approve, and a patient journey that feels human from hello to confirmation.
            Value fast, zero disruption, full control over tone and escalation.
          </p>
        </div>
      </section>

      {/* 3) How it works */}
      <section id="how" className="py-16 bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 mb-2">How it works</h2>
            <p className="text-slate-600">Clear, simple patient journey—no voicemail, no friction.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Step icon={<Phone />} title="1) Answers instantly" text="AI picks up every call or chat in your tone—24/7." />
            <Step icon={<HelpCircle />} title="2) Understands intent" text="Books, changes, FAQs, or emergencies—triaged in seconds." />
            <Step icon={<Calendar />} title="3) Books or sends link" text="Confirms a time or texts your HotDoc link for live availability." />
            <Step icon={<MessageSquare />} title="4) Confirms & notifies" text="SMS to the patient; concise summary to your team." />
          </div>
        </div>
      </section>

      {/* 4) Why Aspire */}
      <section id="why-us" className="py-16 bg-white">
        <div className="container mx-auto px-6 max-w-5xl">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-slate-900 mb-2">Why Aspire?</h2>
            <p className="text-slate-600">Operational experience meets intelligent automation.</p>
          </div>
          <div className="grid md:grid-cols-2 gap-8">
            {[
              ["Clinic-first design", "Built around dental workflows. No software migration."],
              ["Local & accountable", "Australian-hosted, privacy-aligned, with human support."],
              ["Seamless handoff", "Works with HotDoc/HealthEngine via link or staff confirmation."],
              ["Scales with you", "Single chair or multi-site group—brand and routing per clinic."],
              ["Executive onboarding", "Clear scripts, emergency protocols, and ROI reporting from day one."],
              ["Human + AI", "AI handles the volume; your team handles complex or sensitive cases."],
            ].map(([title, desc], i) => (
              <Bullet key={i} title={title} desc={desc} />
            ))}
          </div>
        </div>
      </section>

      {/* 5) Real Dental Workflows (restored) */}
      <section id="workflows" className="py-16 bg-gradient-to-br from-blue-50 to-slate-50">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-slate-900 mb-2">Real Dental Workflows</h2>
            <p className="text-slate-600">Configured to your fee schedule, services, and protocols.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Workflow title="New Patient Exam & Clean" icon={<Heart />} text="Collects details, sends HotDoc link or books into dedicated slots. SMS confirmation + reminders." />
            <Workflow title="Emergency Toothache" icon={<AlertTriangle />} text="Triage questions, books emergency buffer, notifies staff instantly (SMS/email)." />
            <Workflow title="Whitening & Cosmetic" icon={<Smile />} text="Explains options, pricing ranges, books consults, follow-ups and pre-visit info." />
            <Workflow title="Orthodontic/Invisalign Consult" icon={<Smile />} text="Qualifying questions, books consult, sends intake form link." />
            <Workflow title="Kids Dentistry" icon={<Users />} text="Family bookings, multiple patients in one flow, reminders for recalls." />
            <Workflow title="Reschedule / Cancel" icon={<Calendar />} text="Sends HotDoc manage link or captures request and alerts reception to confirm." />
          </div>
        </div>
      </section>

      {/* 6) Capabilities */}
      <section id="services" className="py-16 bg-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-slate-900 mb-2">Capabilities</h2>
            <p className="text-slate-600">What Aspire handles end-to-end.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Feature icon={<Clock />} title="24/7 Coverage" text="Never miss a patient—after-hours and peak times covered." />
            <Feature icon={<DollarSign />} title="Revenue Protection" text="Recover missed calls & reduce FTAs with reminders." />
            <Feature icon={<Zap />} title="Live in Days" text="Clinic scripts, fees, FAQs and booking links configured fast." />
            <Feature icon={<Users />} title="Multi-location Ready" text="Brand per clinic, smart routing, unified reporting." />
            <Feature icon={<ShieldCheck />} title="Privacy & Residency" text="Privacy Act aligned. Australian hosting by default." />
            <Feature icon={<PlugZap />} title="Works With Your Stack" text="HotDoc/HealthEngine handoff. No PMS access required." />
            <Feature icon={<FileText />} title="Transcripts on Request" text="Optional transcripts for QA, training, and audits." />
            <Feature icon={<AlertTriangle />} title="Emergency Triage" text="Immediate escalation to staff per your protocol." />
          </div>
        </div>
      </section>

      {/* 7) Advanced Capabilities */}
      <section id="advanced" className="py-16 bg-gradient-to-br from-slate-50 to-white">
        <div className="container mx-auto px-6 text-center max-w-6xl">
          <h2 className="text-3xl font-bold text-slate-900 mb-2">Advanced Capabilities</h2>
          <p className="text-slate-600 mb-8">Under the hood: performance, security, and integration patterns.</p>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Feature icon={<ShieldCheck />} title="Data Compliance" text="Privacy Act 1988 & APP aligned. AU data residency. Encryption in transit & at rest." />
            <Feature icon={<PlugZap />} title="Seamless Handoff" text="Works with HotDoc/HealthEngine or dedicated clinic calendars. No migration required." />
            <Feature icon={<MessageSquare />} title="Voice & Chat" text="Natural voice for phone; web chat for FAQs and booking handoffs." />
            <Feature icon={<FileText />} title="Full Auditing" text="Optional call/chat transcripts and summaries for QA and training." />
          </div>
        </div>
      </section>

      {/* 8) Talk to our Virtual Receptionist */}
      <section id="demo" className="py-16 bg-white">
        <div className="container mx-auto px-6 max-w-6xl grid md:grid-cols-2 gap-10 items-center">
          <div>
            <h2 className="text-3xl font-bold text-slate-900 mb-3">Talk to our Virtual Receptionist</h2>
            <p className="text-slate-700">
              Open the chat (bottom-right) or call our demo number to hear the AI in action.
              It can answer fees, insurance questions, emergencies, and send a HotDoc link for real-time booking.
            </p>
            <ul className="mt-4 space-y-2 text-slate-700">
              <li>• New bookings, changes & cancellations</li>
              <li>• Instant SMS with your booking link</li>
              <li>• Optional real-time booking into a dedicated clinic calendar</li>
              <li>• Staff notifications and daily summary</li>
            </ul>
            <div className="mt-6 inline-flex items-center gap-2 text-slate-700">
              <MessageSquare className="h-5 w-5" />
              <span>Prefer voice? Call the AI: {DEMO_NUMBER}</span>
            </div>
          </div>
        </div>
      </section>

      {/* 9) ROI */}
      <section id="roi" className="py-12 bg-gradient-to-r from-blue-600 to-indigo-600">
        <div className="container mx-auto px-6 max-w-6xl text-white">
          <div className="rounded-2xl border border-white/30 p-6 md:p-8">
            <div className="grid md:grid-cols-3 gap-6 items-center">
              <ROIStat value="+20%" label="more new-patient bookings captured" />
              <ROIStat value="100%" label="of after-hours calls answered" />
              <ROIStat value="50%" label="less time on repetitive calls" />
            </div>
            <p className="mt-4 text-blue-100 text-sm">
              Results depend on call volume and configuration. We review performance monthly and tune your workflows.
            </p>
          </div>
        </div>
      </section>

      {/* 10) Pricing */}
      <section id="pricing" className="py-16 bg-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <h2 className="text-3xl font-bold text-slate-900 mb-2">Simple monthly plans — no lock-ins</h2>
          <div className="grid md:grid-cols-2 gap-6 mt-8">
            <Package
              name="Standard"
              price="$1,200 / month"
              features={[
                "Chat + overflow call handling",
                "HotDoc/HealthEngine handoff via SMS",
                "Reminders & basic recalls",
                "Monthly performance snapshot",
              ]}
            />
            <Package
              name="Full AI Reception"
              price="$2,000 / month"
              highlighted
              features={[
                "24/7 voice + chat AI receptionist",
                "Instant SMS + optional real-time booking layer",
                "Emergency triage + staff alerts",
                "Monthly optimisation & priority support",
              ]}
            />
          </div>
        </div>
      </section>

      {/* 11) FAQ */}
      <FAQSection />

      {/* 12) Compliance */}
      <section id="compliance" className="py-16 bg-gradient-to-br from-blue-50 to-slate-50">
        <div className="container mx-auto px-6 max-w-6xl">
          <h2 className="text-3xl font-bold text-slate-900 mb-2">Privacy, Security & Compliance</h2>
          <div className="mt-8 grid md:grid-cols-3 gap-6">
            <Card title="Privacy Act 1988 (Cth)">APP-aligned handling. Minimal collection by design.</Card>
            <Card title="Australian Data Residency">Hosted in Australia with encryption in transit and at rest.</Card>
            <Card title="Scope of Data">Contact & booking context only; no clinical notes stored by Aspire.</Card>
          </div>
        </div>
      </section>

      {/* 13) Contact */}
      <section id="contact" className="py-20 bg-gradient-to-br from-slate-900 to-blue-900 text-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold mb-4">Ready to stop missing patients?</h2>
            <p className="text-xl text-blue-100">We’ll configure your receptionist, SMS flows, and booking links — then go live in days.</p>
          </div>
          <div className="grid md:grid-cols-2 gap-12">
            {/* Contact Info */}
            <div>
              <h3 className="text-2xl font-bold mb-6">Contact Information</h3>
              <div className="space-y-6">
                <Info icon={<Mail className="h-6 w-6" />} title="Email Us">
                  <a href="mailto:scott@aspireexecutive.com.au" className="text-blue-200 hover:text-white transition-colors">
                    scott@aspireexecutive.com.au
                  </a>
                </Info>
                <Info icon={<MapPin className="h-6 w-6" />} title="Location">Australia</Info>
                <Info icon={<ExternalLink className="h-6 w-6" />} title="Executive Search Services">
                  <a href="https://aspireexecutive.com.au" target="_blank" rel="noopener noreferrer" className="text-blue-200 hover:text-white transition-colors">
                    aspireexecutive.com.au
                  </a>
                </Info>
              </div>
            </div>
            {/* Contact Form */}
            <div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <input
                  name="name"
                  placeholder="Your Name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  className="w-full bg-white/10 border border-white/20 rounded-md px-3 py-2 text-white placeholder:text-blue-200"
                />
                <input
                  name="email"
                  type="email"
                  placeholder="Your Email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className="w-full bg-white/10 border border-white/20 rounded-md px-3 py-2 text-white placeholder:text-blue-200"
                />
                <input
                  name="phone"
                  type="tel"
                  placeholder="Phone Number"
                  value={formData.phone}
                  onChange={handleChange}
                  className="w-full bg-white/10 border border-white/20 rounded-md px-3 py-2 text-white placeholder:text-blue-200"
                />
                <textarea
                  name="message"
                  placeholder="Tell us about your clinic…"
                  value={formData.message}
                  onChange={handleChange}
                  required
                  rows={4}
                  className="w-full bg-white/10 border border-white/20 rounded-md px-3 py-2 text-white placeholder:text-blue-200"
                />
                <button type="submit" disabled={isSubmitting} className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-md px-4 py-3 font-medium">
                  {isSubmitting ? "Sending..." : "Send Message"}
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* 14) Footer */}
      <footer className="bg-slate-900 text-slate-400 py-8 border-t border-slate-800">
        <div className="container mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <img src={ASPIRE_LOGO} alt="Aspire Executive Solutions" className="h-8 w-auto" />
            <span className="text-sm">© {new Date().getFullYear()} Aspire Executive Solutions. All rights reserved.</span>
          </div>
          <div className="flex gap-6">
            <a href="#offer" className="hover:text-white">Offer</a>
            <a href="#about" className="hover:text-white">Leadership</a>
            <a href="#how" className="hover:text-white">How it works</a>
            <a href="#why-us" className="hover:text-white">Why Aspire</a>
            <a href="#workflows" className="hover:text-white">Dental Workflows</a>
            <a href="#services" className="hover:text-white">Capabilities</a>
            <a href="#advanced" className="hover:text-white">Advanced</a>
            <a href="#demo" className="hover:text-white">Demo</a>
            <a href="#roi" className="hover:text-white">ROI</a>
            <a href="#pricing" className="hover:text-white">Pricing</a>
            <a href="#faq" className="hover:text-white">FAQ</a>
            <a href="#contact" className="hover:text-white">Contact</a>
            <Link to="/privacy" className="hover:text-white">Privacy</Link>
            <Link to="/terms" className="hover:text-white">Terms</Link>
            <Link to="/accessibility" className="hover:text-white">Accessibility</Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

/* ---------- Small components ---------- */

const Step = ({ icon, title, text }) => (
  <div className="rounded-2xl border-2 border-slate-200 hover:border-blue-600 transition-all hover:shadow-xl group bg-white p-6">
    <div className="bg-blue-100 w-14 h-14 rounded-xl flex items-center justify-center mb-4 group-hover:bg-blue-600 transition-colors">
      {React.cloneElement(icon, { className: "h-7 w-7 text-blue-600 group-hover:text-white transition-colors" })}
    </div>
    <h3 className="text-lg font-bold text-slate-900 mb-1">{title}</h3>
    <p className="text-slate-600 text-sm">{text}</p>
  </div>
);

const Feature = ({ icon, title, text }) => (
  <div className="rounded-2xl border-2 border-slate-200 hover:border-blue-600 transition-all hover:shadow-xl group bg-white p-6">
    <div className="bg-blue-100 w-14 h-14 rounded-xl flex items-center justify-center mb-4 group-hover:bg-blue-600 transition-colors">
      {React.cloneElement(icon, { className: "h-7 w-7 text-blue-600 group-hover:text-white transition-colors" })}
    </div>
    <h3 className="text-xl font-bold text-slate-900 mb-2">{title}</h3>
    <p className="text-slate-600 text-sm">{text}</p>
  </div>
);

const Card = ({ title, children }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-6">
    <h3 className="text-lg font-semibold mb-2">{title}</h3>
    <p className="text-slate-600 text-sm">{children}</p>
  </div>
);

const ROIStat = ({ value, label }) => (
  <div className="text-center">
    <p className="text-4xl md:text-5xl font-extrabold">{value}</p>
    <p className="text-blue-100">{label}</p>
  </div>
);

const Package = ({ name, price, features, highlighted }) => (
  <div className={"rounded-2xl p-6 " + (highlighted ? "border border-blue-300 bg-blue-50" : "border border-slate-200 bg-white")}>
    <p className="text-sm font-semibold">{name}</p>
    <p className="mt-2 text-3xl font-extrabold">{price}</p>
    <ul className="mt-4 space-y-2 text-sm text-slate-700">
      {features.map((f) => <li key={f}>• {f}</li>)}
    </ul>
    <a href="#contact" className={"mt-6 inline-block rounded-xl px-4 py-2 text-white font-semibold " + (highlighted ? "bg-blue-600 hover:bg-blue-700" : "bg-blue-600 hover:bg-blue-700")}>
      Contact Us
    </a>
  </div>
);

const FAQSection = () => {
  const faqs = [
    {
      q: "We already use HotDoc — do we still need this?",
      a: "Yes. HotDoc is your booking portal; Aspire is your 24/7 front desk. We answer every call, triage emergencies, handle FAQs, and send your HotDoc link so patients choose exact times from your live calendar.",
    },
    {
      q: "Can patients change or cancel existing bookings?",
      a: "Absolutely. If you use HotDoc, we text your booking page so they can manage their appointment instantly under “Manage My Bookings.” If you don’t, we capture the request and notify staff to confirm the new time.",
    },
    {
      q: "What if the day is fully booked?",
      a: "We never guess. If no same-day capacity remains, the assistant offers the next available times, adds the patient to a waitlist on request, and alerts your team about urgent cases.",
    },
    {
      q: "Do you integrate with our PMS?",
      a: "We integrate around your PMS for speed and safety. We hand off bookings to HotDoc/HealthEngine (or a dedicated clinic calendar) and notify staff automatically. For cloud PMS with APIs (e.g., Core Practice), we can add deeper links later.",
    },
    {
      q: "Is the voice natural and on-brand?",
      a: "Yes. You approve greeting, tone, FAQs and emergency wording. The voice is warm and human-sounding, and you can change scripts any time.",
    },
    {
      q: "Where is data stored?",
      a: "In Australia by default. We store contact and booking context only—no clinical notes. Transcripts are optional for QA and training.",
    },
  ];
  const [open, setOpen] = useState(null);
  return (
    <section id="faq" className="py-16 bg-white">
      <div className="container mx-auto px-6 max-w-4xl">
        <h2 className="text-3xl font-bold text-slate-900 mb-6">FAQ — Dental Clinics</h2>
        <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl bg-white">
          {faqs.map((item, idx) => (
            <FAQItem key={idx} index={idx} isOpen={open === idx} onToggle={() => setOpen(open === idx ? null : idx)} question={item.q} answer={item.a} />
          ))}
        </div>
      </div>
    </section>
  );
};

const FAQItem = ({ index, isOpen, onToggle, question, answer }) => (
  <div className="p-4 md:p-5">
    <button className="w-full flex items-center justify-between text-left" aria-expanded={isOpen} aria-controls={`faq-panel-${index}`} onClick={onToggle}>
      <span className="text-slate-900 font-semibold">{question}</span>
      <ChevronDown className={"h-5 w-5 text-slate-600 transition-transform " + (isOpen ? "rotate-180" : "")} />
    </button>
    <div
      id={`faq-panel-${index}`}
      className={"grid transition-all duration-200 ease-in-out " + (isOpen ? "grid-rows-[1fr] opacity-100 mt-2" : "grid-rows-[0fr] opacity-0")}
    >
      <div className="overflow-hidden">
        <p className="text-slate-600 mt-2">{answer}</p>
      </div>
    </div>
  </div>
);

const Bullet = ({ title, desc }) => (
  <div className="flex gap-4 items-start group">
    <div className="bg-blue-100 w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-blue-600 transition-colors">
      <CheckCircle className="h-6 w-6 text-blue-600 group-hover:text-white transition-colors" />
    </div>
    <div>
      <h3 className="text-xl font-bold text-slate-900 mb-2">{title}</h3>
      <p className="text-slate-600">{desc}</p>
    </div>
  </div>
);

const Workflow = ({ title, text, icon }) => (
  <div className="rounded-2xl border-2 border-slate-200 hover:border-blue-600 transition-all hover:shadow-xl group bg-white p-6">
    <div className="bg-blue-100 w-14 h-14 rounded-xl flex items-center justify-center mb-4 group-hover:bg-blue-600 transition-colors">
      {React.cloneElement(icon, { className: "h-7 w-7 text-blue-600 group-hover:text-white transition-colors" })}
    </div>
    <h3 className="text-lg font-bold text-slate-900 mb-1">{title}</h3>
    <p className="text-slate-600 text-sm">{text}</p>
  </div>
);

const Info = ({ icon, title, children }) => (
  <div className="flex items-start gap-4">
    <div className="bg-blue-600 w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0">
      {icon}
    </div>
    <div>
      <p className="font-semibold mb-1">{title}</p>
      <div className="text-blue-200">{children}</div>
    </div>
  </div>
);

export default Home;
