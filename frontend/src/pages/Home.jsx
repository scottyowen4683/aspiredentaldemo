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
  Brain,
  BarChart3,
  Workflow,
  Cog,
} from "lucide-react";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Assets
const ASPIRE_LOGO =
  "https://raw.githubusercontent.com/scottyowen4683/Aspirereception/refs/heads/feature/ai-receptionist/frontend/aspire.png";

// Editable bits
const DEMO_NUMBER = "+61 7 4357 2749";
const BOOKING_URL = "https://calendly.com/scott-owen-aspire/ai-receptionist-demo";

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
            <a href="#smart" className="text-slate-700 hover:text-blue-600 font-medium">Smart Automations</a>
            <a href="#why-us" className="text-slate-700 hover:text-blue-600 font-medium">Why Aspire</a>
            <a href="#services" className="text-slate-700 hover:text-blue-600 font-medium">Capabilities</a>
            <a href="#advanced" className="text-slate-700 hover:text-blue-600 font-medium">Advanced</a>
            <a href="#demo" className="text-slate-700 hover:text-blue-600 font-medium">Demo</a>
            <a href="#pricing" className="text-slate-700 hover:text-blue-600 font-medium">Pricing</a>
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
                ["#smart", "Smart Automations"],
                ["#why-us", "Why Aspire"],
                ["#services", "Capabilities"],
                ["#advanced", "Advanced"],
                ["#demo", "Demo"],
                ["#pricing", "Pricing"],
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

      {/* HERO */}
      <section id="hero" className="pt-28 pb-16 bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="container mx-auto px-6 text-center max-w-5xl">
          <h1 className="text-5xl md:text-6xl font-bold mb-6 leading-tight">
            <span className="block text-slate-900">Productivity & Performance</span>
            <span className="block text-blue-600 mt-1">Your New Unfair Advantage</span>
          </h1>
          <p className="text-xl text-slate-700 mb-6 leading-relaxed max-w-3xl mx-auto">
            A warm, human-sounding AI that answers calls, messages, and emails — connects with your CRM,
            and automates quotes, bookings, and payments.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <a href={BOOKING_URL} className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 text-lg rounded-md">
              Book a 15-Minute Demo
            </a>
            <a
              href={`tel:${DEMO_NUMBER.replace(/\s/g, "")}`}
              className="border-2 border-slate-300 text-slate-800 hover:bg-white px-8 py-3 text-lg rounded-md flex items-center gap-2"
            >
              <Phone className="h-5 w-5" />
              Hear the AI: {DEMO_NUMBER}
            </a>
          </div>
          <p className="mt-4 text-slate-500">Australian-hosted. Secure. Seamlessly integrated.</p>
        </div>
      </section>

      {/* LAUNCH OFFER */}
      <section id="offer" className="pt-6 pb-4 bg-white">
        <div className="container mx-auto px-6">
          <div className="rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md px-4 md:px-6 py-3 flex flex-col md:flex-row items-center justify-between">
            <div className="text-center md:text-left">
              <p className="text-xs uppercase tracking-wider opacity-90">Launch Offer</p>
              <p className="text-base md:text-lg font-semibold">
                Setup Fee <span className="line-through opacity-90">$10,000</span> →{" "}
                <span className="bg-white/20 px-2 py-0.5 rounded-md">FREE — only 3 remaining</span>
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

      {/* LEADERSHIP SECTION */}
      <section id="about" className="py-14 bg-white">
        <div className="container mx-auto px-6 max-w-4xl text-center">
          <h2 className="text-3xl font-bold text-slate-900 mb-3">
            Business-Grade Automation. Enterprise Thinking.
          </h2>
          <div className="w-20 h-1 bg-blue-600 mx-auto mb-8" />
          <p className="text-lg text-slate-700 mb-4">
            Aspire isn’t just a tech provider — it’s leadership experience fused with AI innovation.
            Founded by a former CEO, we build intelligent systems that reduce workload, enhance customer experience,
            and integrate seamlessly with your existing tools.
          </p>
          <p className="text-lg text-slate-700">
            From councils to private enterprises, our automations scale with precision, compliance, and measurable ROI.
          </p>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="py-16 bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="container mx-auto px-6 max-w-6xl text-center">
          <h2 className="text-3xl font-bold text-slate-900 mb-2">How It Works</h2>
          <p className="text-slate-600 mb-12">Built for clarity, speed, and control — no friction, no wasted time.</p>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Step icon={<Phone />} title="1) AI Answers Instantly" text="Always on — phone, chat, or web, 24/7." />
            <Step icon={<HelpCircle />} title="2) Understands & Routes" text="Smart triage sends each query to the right place." />
            <Step icon={<Workflow />} title="3) Automates Tasks" text="Quotes, bookings, and follow-ups handled automatically." />
            <Step icon={<MessageSquare />} title="4) Notifies Your Team" text="Clear, concise summaries and alerts sent instantly." />
          </div>
        </div>
      </section>

      {/* SMART AUTOMATIONS */}
      <section id="smart" className="py-16 bg-white">
        <div className="container mx-auto px-6 max-w-6xl text-center">
          <h2 className="text-3xl font-bold text-slate-900 mb-2">Smart Automations</h2>
          <p className="text-slate-600 mb-10">
            Powered by n8n and native integrations — we connect your systems so work just happens.
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Feature icon={<DollarSign />} title="Instant Quotes" text="Send custom quotes via email or SMS automatically." />
            <Feature icon={<FileText />} title="Invoice Sync" text="Generate invoices directly into Xero or MYOB." />
            <Feature icon={<BarChart3 />} title="CRM Updates" text="Log new leads or support tickets into Salesforce or HubSpot." />
            <Feature icon={<Cog />} title="Workflow Magic" text="Automate onboarding, confirmations, and renewals — no code required." />
          </div>
        </div>
      </section>

      {/* WHY ASPIRE */}
      <section id="why-us" className="py-16 bg-gradient-to-br from-blue-50 to-slate-50">
        <div className="container mx-auto px-6 max-w-5xl">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-slate-900 mb-2">Why Aspire?</h2>
            <p className="text-slate-600">Leadership-level insight meets modern automation.</p>
          </div>
          <div className="grid md:grid-cols-2 gap-8">
            {[
              ["Led by Experience", "Founded by a CEO — we understand outcomes, risk, and people."],
              ["Human + AI", "Blending empathy and efficiency for real-world impact."],
              ["Rapid Deployment", "Configured and live within days — not months."],
              ["Scalable", "From startups to councils, our architecture grows with you."],
              ["Privacy & Compliance", "Australian-hosted and fully aligned with the Privacy Act."],
              ["Continuous Optimisation", "We review and refine your automation monthly for performance gains."],
            ].map(([title, desc], i) => (
              <Bullet key={i} title={title} desc={desc} />
            ))}
          </div>
        </div>
      </section>

      {/* ADVANCED */}
      <section id="advanced" className="py-16 bg-white">
        <div className="container mx-auto px-6 text-center max-w-6xl">
          <h2 className="text-3xl font-bold text-slate-900 mb-2">Advanced Capabilities</h2>
          <p className="text-slate-600 mb-8">Secure, integrated, and enterprise-ready.</p>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Feature icon={<ShieldCheck />} title="Data Security" text="TLS 1.2+, encrypted storage, Australian residency." />
            <Feature icon={<PlugZap />} title="Integrations" text="Salesforce, HubSpot, Xero, Stripe, and more." />
            <Feature icon={<MessageSquare />} title="Voice + Chat" text="Unified AI for calls, messages, and web chat." />
            <Feature icon={<FileText />} title="Full Transparency" text="Transcripts and summaries for QA and training." />
          </div>
        </div>
      </section>

      {/* DEMO */}
      <section id="demo" className="py-16 bg-gradient-to-br from-slate-50 to-white">
        <div className="container mx-auto px-6 max-w-6xl grid md:grid-cols-2 gap-10 items-center">
          <div>
            <h2 className="text-3xl font-bold text-slate-900 mb-3">Talk to the AI Assistant</h2>
            <p className="text-slate-700">
              Open the chat (bottom-right) or call the demo number below to experience the AI in action.
              Watch it respond, escalate, and resolve — just like a real team member.
            </p>
            <div className="mt-6 inline-flex items-center gap-2 text-slate-700">
              <MessageSquare className="h-5 w-5" />
              <span>Prefer voice? Call the AI: {DEMO_NUMBER}</span>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="py-16 bg-white">
        <div className="container mx-auto px-6 max-w-6xl text-center">
          <h2 className="text-3xl font-bold text-slate-900 mb-6">Simple Monthly Plans — No Lock-Ins</h2>
          <div className="grid md:grid-cols-3 gap-6 mt-8">
            <Package
              name="Starter"
              price="$1,500 / month"
              features={[
                "AI chat + call handling",
                "Basic workflows & FAQs",
                "Monthly reporting",
              ]}
            />
            <Package
              name="Growth"
              price="$3,000 / month"
              highlighted
              features={[
                "Everything in Starter",
                "Smart automations (CRM, invoicing)",
                "Priority support",
                "Monthly optimisation session",
              ]}
            />
            <Package
              name="Enterprise"
              price="POA"
              features={[
                "Custom workflow design",
                "Integration with ERP/CRM systems",
                "Dedicated manager",
                "Full SLA & compliance package",
              ]}
            />
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" className="py-20 bg-gradient-to-br from-slate-900 to-blue-900 text-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold mb-4">Ready to Transform Productivity?</h2>
            <p className="text-xl text-blue-100">
              Let’s automate your routine, accelerate delivery, and scale smarter.
            </p>
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
                  placeholder="Tell us about your business..."
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

      {/* FOOTER */}
      <footer className="bg-slate-900 text-slate-400 py-8 border-t border-slate-800">
        <div className="container mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <img src={ASPIRE_LOGO} alt="Aspire Executive Solutions" className="h-8 w-auto" />
            <span className="text-sm">© {new Date().getFullYear()} Aspire Executive Solutions. All rights reserved.</span>
          </div>
          <div className="flex gap-6">
            <a href="#offer" className="hover:text-white">Offer</a>
            <a href="#about" className="hover:text-white">Leadership</a>
            <a href="#smart" className="hover:text-white">Automations</a>
            <a href="#advanced" className="hover:text-white">Advanced</a>
            <a href="#demo" className="hover:text-white">Demo</a>
            <a href="#pricing" className="hover:text-white">Pricing</a>
            <a href="#contact" className="hover:text-white">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

/* SMALL COMPONENTS */
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

const Package = ({ name, price, features, highlighted }) => (
  <div className={`rounded-2xl p-6 ${highlighted ? "border border-blue-300 bg-blue-50" : "border border-slate-200 bg-white"}`}>
    <p className="text-sm font-semibold">{name}</p>
    <p className="mt-2 text-3xl font-extrabold">{price}</p>
    <ul className="mt-4 space-y-2 text-sm text-slate-700">
      {features.map((f) => (
        <li key={f}>• {f}</li>
      ))}
    </ul>
    <a href="#contact" className="mt-6 inline-block rounded-xl px-4 py-2 text-white font-semibold bg-blue-600 hover:bg-blue-700">
      Contact Us
    </a>
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
