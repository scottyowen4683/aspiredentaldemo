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
} from "lucide-react";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Assets
const ASPIRE_LOGO =
  "https://raw.githubusercontent.com/scottyowen4683/Aspirereception/refs/heads/feature/ai-receptionist/frontend/aspire.png";

// Editable bits
const DEMO_NUMBER = "+61 7 4357 2749"; // replace with live demo AI number
const BOOKING_URL =
  "https://calendly.com/scott-owen-aspire/ai-receptionist-demo";

const Home = () => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Chatbot loader (LeadConnector)
  useEffect(() => {
    const SCRIPT_ID = "leadconnector-chatbot";
    if (document.getElementById(SCRIPT_ID)) return;
    const s = document.createElement("script");
    s.id = SCRIPT_ID;
    s.src = "https://widgets.leadconnectorhq.com/loader.js";
    s.setAttribute(
      "data-resources-url",
      "https://widgets.leadconnectorhq.com/chat-widget/loader.js"
    );
    // Swap this for your dental widget id when ready
    s.setAttribute("data-widget-id", "68de330a0160d118b515f4b6");
    document.body.appendChild(s);
  }, []);

  const handleChange = (e) =>
    setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const response = await axios.post(`${API}/contact`, formData);
      if (response.data.status === "success") {
        toast.success("Message Sent!", {
          description: "We’ll get back to you within 24 hours.",
        });
        setFormData({ name: "", email: "", phone: "", message: "" });
      } else {
        toast.error("Error", { description: "Unexpected response from server." });
      }
    } catch (error) {
      console.error("Error submitting form:", error);
      toast.error("Error", {
        description:
          "Failed to send message. Please try again or email us directly.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="fixed top-0 w-full bg-white/95 backdrop-blur-sm border-b border-slate-200 z-50">
        <div className="container mx-auto px-6 py-4 flex justify-between items-center">
          {/* Logo */}
          <img
            src={ASPIRE_LOGO}
            alt="Aspire Executive Solutions"
            className="h-12 w-auto"
          />

          {/* Desktop nav */}
          <nav className="hidden md:flex gap-8 items-center">
            <a
              href="#about"
              className="text-slate-700 hover:text-blue-600 transition-colors font-medium"
            >
              About
            </a>
            <a
              href="#services"
              className="text-slate-700 hover:text-blue-600 transition-colors font-medium"
            >
              Services
            </a>
            <a
              href="#features"
              className="text-slate-700 hover:text-blue-600 transition-colors font-medium"
            >
              Solutions
            </a>
            <a
              href="#compliance"
              className="text-slate-700 hover:text-blue-600 transition-colors font-medium"
            >
              Compliance
            </a>
            <a
              href="#use-cases"
              className="text-slate-700 hover:text-blue-600 transition-colors font-medium"
            >
              Use Cases
            </a>
            <a
              href="#pricing"
              className="text-slate-700 hover:text-blue-600 transition-colors font-medium"
            >
              Pricing
            </a>
            <a
              href="#faq"
              className="text-slate-700 hover:text-blue-600 transition-colors font-medium"
            >
              FAQ
            </a>
            <a
              href="https://aspireexecutive.com.au"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-700 hover:text-blue-600 transition-colors font-medium flex items-center gap-1"
            >
              Executive Search <ExternalLink className="h-3 w-3" />
            </a>
            <a href="#contact">
              <button className="bg-blue-600 hover:bg-blue-700 text-white rounded-md px-4 py-2">
                Contact Us
              </button>
            </a>
          </nav>

          {/* Mobile hamburger */}
          <div className="md:hidden">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-slate-700 hover:text-blue-600 focus:outline-none"
            >
              <svg
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile dropdown menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-slate-200 shadow-sm">
            <div className="flex flex-col px-6 py-4 space-y-4">
              {[
                ["#about", "About"],
                ["#services", "Services"],
                ["#features", "Solutions"],
                ["#compliance", "Compliance"],
                ["#use-cases", "Use Cases"],
                ["#pricing", "Pricing"],
                ["#faq", "FAQ"],
              ].map(([href, label]) => (
                <a
                  key={href}
                  href={href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-slate-700 hover:text-blue-600 font-medium"
                >
                  {label}
                </a>
              ))}
              <a
                href="https://aspireexecutive.com.au"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMobileMenuOpen(false)}
                className="text-slate-700 hover:text-blue-600 font-medium"
              >
                Executive Search
              </a>
              <a
                href="#contact"
                onClick={() => setMobileMenuOpen(false)}
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-md px-4 py-2 text-center"
              >
                Contact Us
              </a>
            </div>
          </div>
        )}
      </header>

      {/* Hero (Dental) */}
      <section className="pt-32 pb-16 bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="container mx-auto px-6 text-center max-w-5xl">
          <h1 className="text-5xl md:text-6xl font-bold mb-6 leading-tight">
            <span className="block text-slate-900">Patients don’t wait.</span>
            <span className="block text-blue-600 mt-1">Your phone shouldn’t either.</span>
          </h1>
          <p className="text-xl text-slate-700 mb-8 leading-relaxed max-w-3xl mx-auto">
            Aspire’s AI Receptionist answers, qualifies, and books patients <strong>24/7</strong> —
            via phone & chat — so your front desk spends time on care, not call overflow.
            Australian-hosted, privacy aligned, and clinic branded.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <a
              href={BOOKING_URL}
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 text-lg rounded-md"
            >
              Book a Demo
            </a>
            <a
              href="#demo"
              className="border-2 border-blue-600 text-blue-600 hover:bg-blue-50 px-8 py-3 text-lg rounded-md"
            >
              See It in Action
            </a>
            <a
              href={`tel:${DEMO_NUMBER.replace(/\s/g, "")}`}
              className="border-2 border-slate-300 text-slate-800 hover:bg-white px-8 py-3 text-lg rounded-md flex items-center gap-2"
            >
              <Phone className="h-5 w-5" />
              Call the AI Demo: {DEMO_NUMBER}
            </a>
          </div>
          <p className="mt-4 text-slate-500">
            Works with HotDoc / HealthEngine via smart routing. No PMS access required.
          </p>
        </div>
      </section>

      {/* Optional Launch Offer for Dental */}
      <section className="py-6">
        <div className="container mx-auto px-6">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg px-6 md:px-10 py-6 flex flex-col md:flex-row items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-wider">Launch Offer</p>
              <p className="text-xl md:text-2xl font-bold mt-1">
                Setup Fee <span className="line-through opacity-80">$999</span> →{" "}
                <span className="bg-white/20 px-2 py-1 rounded-md">
                  FREE for the first 10 clinics
                </span>
              </p>
            </div>
            <a
              href="#contact"
              className="mt-4 md:mt-0 rounded-xl bg-white text-blue-700 font-semibold px-5 py-3 hover:bg-blue-50"
            >
              Claim Offer
            </a>
          </div>
        </div>
      </section>

      {/* About (Dental spin) */}
      <section id="about" className="py-16 bg-white">
        <div className="container mx-auto px-6 max-w-4xl">
          <div className="text-center mb-10">
            <h2 className="text-4xl font-bold text-slate-900 mb-4">
              Executive Leadership, Clinic-Grade Simplicity
            </h2>
            <div className="w-20 h-1 bg-blue-600 mx-auto" />
          </div>
          <p className="text-lg text-slate-700 mb-6">
            Aspire isn’t a generic chatbot vendor. We design AI customer service that
            actually helps humans — simpler, faster, better. Built by leaders who’ve
            run complex service operations, then engineered for busy clinics that need
            leverage without extra headcount.
          </p>
          <p className="text-lg text-slate-700 mb-6">
            We configure your assistant with your fees, services, and booking links so
            it answers common questions, qualifies callers, sends HotDoc/HealthEngine
            links, and routes urgent cases to your team in real time.
          </p>
        </div>
      </section>

      {/* Services — tuned to dental outcomes */}
      <section id="services" className="py-20 bg-gradient-to-br from-blue-50 to-slate-50">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-slate-900 mb-4">AI Reception for Dental</h2>
            <p className="text-xl text-slate-600">
              Convert missed calls into bookings. Reduce FTAs. Free your front desk.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Feature
              icon={<Clock />}
              title="Always On"
              text="Answer every call and chat 24/7 — after-hours, lunch breaks, and peak times."
            />
            <Feature
              icon={<DollarSign />}
              title="Protect Revenue"
              text="Every missed call risks a $500+ patient. Keep the books full with instant responses."
            />
            <Feature
              icon={<Zap />}
              title="Live in Days"
              text="We configure your FAQs, fees, and booking links. Go live with your branding in 24–48h."
            />
            <Feature
              icon={<Phone />}
              title="Overflow & Triage"
              text="Qualify new patients, reschedules, and emergencies; escalate urgent cases to staff."
            />
          </div>
        </div>
      </section>

      {/* Why Aspire */}
      <section id="why-us" className="py-20 bg-white">
        <div className="container mx-auto px-6 max-w-5xl">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-slate-900 mb-4">Why Aspire?</h2>
            <p className="text-xl text-slate-600">Premium onboarding. Real support. Measurable results.</p>
          </div>
          <div className="grid md:grid-cols-2 gap-8">
            {[
              ["Clinic-Branded Experience", "Your tone, services, and fees — presented consistently every time."],
              ["Australian-Hosted", "Data residency & encryption as standard. Practical, privacy-aligned setup."],
              ["Works With Your Tools", "Smart routing to HotDoc/HealthEngine; no PMS access required."],
              ["Executive-Level Support", "Hands-on setup, training, and monthly performance reviews."],
              ["Human + AI", "Live handoff to staff whenever needed; transcripts for quality assurance."],
              ["Scales With You", "Solo clinic or multi-location group — we’ll match your growth."],
            ].map(([title, desc], idx) => (
              <div key={idx} className="flex gap-4 items-start group">
                <div className="bg-blue-100 w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-blue-600 transition-colors">
                  <CheckCircle className="h-6 w-6 text-blue-600 group-hover:text-white transition-colors" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">{title}</h3>
                  <p className="text-slate-600">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Advanced Capabilities */}
      <section id="features" className="py-16 bg-gradient-to-br from-blue-50 to-slate-50">
        <div className="container mx-auto px-6 text-center max-w-6xl">
          <h2 className="text-4xl font-bold text-slate-900 mb-4">Advanced Capabilities</h2>
        </div>
        <div className="container mx-auto px-6 max-w-6xl grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Feature
            icon={<ShieldCheck />}
            title="Privacy Aligned"
            text="Privacy Act & APP-aligned handling. Minimal data collection by design."
          />
          <Feature
            icon={<PlugZap />}
            title="Smart Integrations"
            text="Booking links + structured notifications to staff. Optional Slack/Teams alerts."
          />
          <Feature
            icon={<MessageSquare />}
            title="Chat + Voice"
            text="One assistant across web chat and phone for a seamless patient journey."
          />
          <Feature
            icon={<FileText />}
            title="Transcripts & QA"
            text="Optional transcripts for audits, training, and continuous improvement."
          />
        </div>
      </section>

      {/* Demo */}
      <section id="demo" className="py-16 bg-white">
        <div className="container mx-auto px-6 max-w-6xl grid md:grid-cols-2 gap-10 items-center">
          <div>
            <h2 className="text-3xl font-bold text-slate-900 mb-3">
              Talk to our Virtual Dental Assistant
            </h2>
            <p className="text-slate-700">
              Open the chat widget (bottom-right) to try it in your browser. Or call our demo line to hear the voice agent in action.
            </p>
            <ul className="mt-4 space-y-2 text-slate-700">
              <li>• Answers whitening, Invisalign, check-up, fees & payment questions</li>
              <li>• Sends HotDoc/HealthEngine booking link by SMS/email</li>
              <li>• Captures new patient details & preferences</li>
              <li>• Escalates emergencies to staff in real time</li>
            </ul>
            <div className="mt-6 inline-flex items-center gap-2 text-slate-700">
              <MessageSquare className="h-5 w-5" />
              <span>Prefer voice? Call the AI demo: {DEMO_NUMBER}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Compliance */}
      <section id="compliance" className="py-16 bg-gradient-to-br from-slate-50 to-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <h2 className="text-3xl font-bold text-slate-900 mb-2">
            Privacy, Security & Compliance
          </h2>
          <div className="mt-8 grid md:grid-cols-3 gap-6">
            <Card title="Privacy Act 1988 (Cth)">
              APP-aligned. Minimal collection, clear consent, and auditable handling.
            </Card>
            <Card title="Australian Data Residency">
              Hosted in Australia with encryption in transit and at rest.
            </Card>
            <Card title="Scope of Data">
              We don’t handle clinical notes. We capture contact & booking context only.
            </Card>
          </div>
        </div>
      </section>

      {/* Use Cases — Dental */}
      <section id="use-cases" className="py-16 bg-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <h2 className="text-3xl font-bold text-slate-900 mb-2">
            Built for real dental workflows
          </h2>
          <div className="mt-8 grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              ["New Patient Enquiries", "Capture contact details, reason for visit, and send booking link instantly."],
              ["Emergencies & Triage", "Identify urgency and alert staff immediately with a concise summary."],
              ["Reschedules & Cancellations", "Offer next-best options and notify the front desk."],
              ["Whitening & Invisalign", "Answer service questions, pricing ranges, and suitability notes."],
              ["Fees & Payment Options", "Provide guided price ranges with your disclaimers and promos."],
              ["Insurance & Preferred Providers", "Answer 'Do you take X?' and send relevant links/forms."],
              ["Reminders & Recalls", "Optional automations to reduce FTAs and keep six-month recalls healthy."],
              ["After-Hours Handling", "24/7 coverage that books or collects details for first-thing follow-up."],
              ["Multi-Location Routing", "Brand per clinic and route to the right team every time."],
            ].map(([title, desc]) => (
              <div
                key={title}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-5"
              >
                <p className="font-semibold">{title}</p>
                <p className="text-sm text-slate-600 mt-1">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing — Dental */}
      <section id="pricing" className="py-16 bg-gradient-to-br from-blue-50 to-slate-50">
        <div className="container mx-auto px-6 max-w-6xl">
          <h2 className="text-3xl font-bold text-slate-900 mb-2">
            Pricing & Packages
          </h2>
        </div>
        <div className="container mx-auto px-6 max-w-6xl grid md:grid-cols-3 gap-6 mt-8">
          <Package
            name="Base Plan"
            price="$1,500 / month"
            highlighted
            features={[
              "Phone & chat AI receptionist",
              "Missed-call text-back",
              "Smart routing to HotDoc/HealthEngine",
              "Monthly performance report",
            ]}
          />
          <Package
            name="Popular Add-ons"
            price="Custom"
            features={[
              "Bilingual assistant (+$99/mo)",
              "Reminders & recalls (+$199/mo)",
              "Custom dashboard (+$299/mo)",
            ]}
          />
          <Package
            name="Guarantee"
            price="30-day ROI"
            features={[
              "Or you don’t pay",
              "Cancel any time after first month",
              "Hands-on onboarding included",
            ]}
          />
        </div>
      </section>

      {/* FAQ — Top 10 (Accordion) */}
      <FAQSection />

      {/* Contact */}
      <section
        id="contact"
        className="py-20 bg-gradient-to-br from-slate-900 to-blue-900 text-white"
      >
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold mb-4">
              Ready to Fill the Book Faster?
            </h2>
            <p className="text-xl text-blue-100">
              Simpler. Faster. Better. Let AI handle the routine while your team focuses on care.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-12">
            {/* Contact Info */}
            <div>
              <h3 className="text-2xl font-bold mb-6">Contact Information</h3>
              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="bg-blue-600 w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Mail className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-semibold mb-1">Email Us</p>
                    <a
                      href="mailto:scott@aspireexecutive.com.au"
                      className="text-blue-200 hover:text-white transition-colors"
                    >
                      scott@aspireexecutive.com.au
                    </a>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="bg-blue-600 w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0">
                    <MapPin className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-semibold mb-1">Location</p>
                    <p className="text-blue-200">Australia</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="bg-blue-600 w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0">
                    <ExternalLink className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-semibold mb-1">Executive Search Services</p>
                    <a
                      href="https://aspireexecutive.com.au"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-200 hover:text-white transition-colors"
                    >
                      aspireexecutive.com.au
                    </a>
                  </div>
                </div>
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
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-md px-4 py-3 font-medium"
                >
                  {isSubmitting ? "Sending..." : "Send Message"}
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-8 border-t border-slate-800">
        <div className="container mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <img
              src={ASPIRE_LOGO}
              alt="Aspire Executive Solutions"
              className="h-8 w-auto"
            />
            <span className="text-sm">
              © {new Date().getFullYear()} Aspire Executive Solutions. All
              rights reserved.
            </span>
          </div>
          <div className="flex gap-6">
            <a href="#about" className="hover:text-white">
              About
            </a>
            <a href="#services" className="hover:text-white">
              Services
            </a>
            <a href="#features" className="hover:text-white">
              Solutions
            </a>
            <a href="#compliance" className="hover:text-white">
              Compliance
            </a>
            <a href="#use-cases" className="hover:text-white">
              Use Cases
            </a>
            <a href="#pricing" className="hover:text-white">
              Pricing
            </a>
            <a href="#faq" className="hover:text-white">
              FAQ
            </a>
            <a
              href="https://aspireexecutive.com.au"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white"
            >
              Executive Search
            </a>
            <Link to="/privacy" className="hover:text-white">
              Privacy
            </Link>
            <Link to="/terms" className="hover:text-white">
              Terms
            </Link>
            <Link to="/accessibility" className="hover:text-white">
              Accessibility
            </Link>
            <a href="#contact" className="hover:text-white">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

/* ---------- FAQ Section (Accordion) ---------- */

const FAQSection = () => {
  const faqs = [
    {
      q: "Does this replace my receptionist?",
      a: "No. It handles overflow and after-hours so your team can focus on chair-side care and higher-value patient conversations.",
    },
    {
      q: "Can you integrate with HotDoc / HealthEngine?",
      a: "We smart-route to your booking profile and send links via SMS/email with the patient’s details. No direct PMS access is required.",
    },
    {
      q: "How fast can we go live?",
      a: "Most clinics go live in 24–48 hours once we have your logo, top FAQs, fee ranges, and booking links.",
    },
    {
      q: "What about emergencies?",
      a: "We triage and escalate urgent cases immediately to your team via alert. You can define the exact wording and thresholds.",
    },
    {
      q: "Can it discuss pricing?",
      a: "Yes. You control fee guidance and disclaimers, e.g., “from $X, subject to clinical assessment.”",
    },
    {
      q: "What data do you store?",
      a: "Contact and booking context only (name, phone, email, reason). We do not store clinical notes. Data is hosted in Australia.",
    },
    {
      q: "Does it support multiple locations?",
      a: "Yes. We can brand per clinic and route to the correct team, with shared reporting across the group.",
    },
    {
      q: "Can it reduce no-shows?",
      a: "Yes. Optional reminders/recalls and missed-call text-back automations help reduce FTAs and recover lost bookings.",
    },
    {
      q: "Is it bilingual?",
      a: "Optional add-on: English + one additional language (e.g., Mandarin or Arabic).",
    },
    {
      q: "What if a patient wants a human?",
      a: "The assistant offers a live handoff at any point and can capture a callback request with context for your front desk.",
    },
  ];
  const [open, setOpen] = useState(null);

  return (
    <section id="faq" className="py-16 bg-white">
      <div className="container mx-auto px-6 max-w-4xl">
        <h2 className="text-3xl font-bold text-slate-900 mb-6">FAQ — Dental Clinics</h2>
        <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl bg-white">
          {faqs.map((item, idx) => (
            <FAQItem
              key={idx}
              index={idx}
              isOpen={open === idx}
              onToggle={() => setOpen(open === idx ? null : idx)}
              question={item.q}
              answer={item.a}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

const FAQItem = ({ index, isOpen, onToggle, question, answer }) => (
  <div className="p-4 md:p-5">
    <button
      className="w-full flex items-center justify-between text-left"
      aria-expanded={isOpen}
      aria-controls={`faq-panel-${index}`}
      onClick={onToggle}
    >
      <span className="text-slate-900 font-semibold">{question}</span>
      <ChevronDown
        className={
          "h-5 w-5 text-slate-600 transition-transform " +
          (isOpen ? "rotate-180" : "")
        }
      />
    </button>
    <div
      id={`faq-panel-${index}`}
      className={
        "grid transition-all duration-200 ease-in-out " +
        (isOpen ? "grid-rows-[1fr] opacity-100 mt-2" : "grid-rows-[0fr] opacity-0")
      }
    >
      <div className="overflow-hidden">
        <p className="text-slate-600 mt-2">{answer}</p>
      </div>
    </div>
  </div>
);

/* ---------- Other helper components ---------- */

const Feature = ({ icon, title, text }) => (
  <div className="rounded-2xl border-2 border-slate-200 hover:border-blue-600 transition-all hover:shadow-xl group bg-white p-6">
    <div className="bg-blue-100 w-14 h-14 rounded-xl flex items-center justify-center mb-4 group-hover:bg-blue-600 transition-colors">
      {React.cloneElement(icon, {
        className: "h-7 w-7 text-blue-600 group-hover:text-white transition-colors",
      })}
    </div>
    <h3 className="text-xl font-bold text-slate-900 mb-2">{title}</h3>
    <p className="text-slate-600 text-sm">{text}</p>
  </div>
);

const Card = ({ title, children }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-6">
    <h3 className="text-lg font-semibold mb-2">{title}</h3>
    <p className="text-slate-600 text-sm">{children}</p>
  </div>
);

const Package = ({ name, price, features, highlighted }) => (
  <div
    className={
      "rounded-2xl p-6 " +
      (highlighted
        ? "border border-blue-300 bg-blue-50"
        : "border border-slate-200 bg-white")
    }
  >
    <p className="text-sm font-semibold">{name}</p>
    <p className="mt-2 text-3xl font-extrabold">{price}</p>
    <ul className="mt-4 space-y-2 text-sm text-slate-700">
      {features.map((f) => (
        <li key={f}>• {f}</li>
      ))}
    </ul>
    <a
      href="#contact"
      className={
        "mt-6 inline-block rounded-xl px-4 py-2 text-white font-semibold " +
        (highlighted ? "bg-blue-600 hover:bg-blue-700" : "bg-blue-600 hover:bg-blue-700")
      }
    >
      Contact Us Now
    </a>
  </div>
);

export default Home;
