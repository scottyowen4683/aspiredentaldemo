import React, { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import {
  Phone,
  PhoneCall,
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
  HelpCircle,
  BarChart3,
  Cog,
  Lock, // ⬅️ add this
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

 useEffect(() => {
  const SCRIPT_ID = "vapi-widget-script";
  if (!document.getElementById(SCRIPT_ID)) {
    const s = document.createElement("script");
    s.id = SCRIPT_ID;
    s.src = "https://unpkg.com/@vapi-ai/client-sdk-react/dist/embed/widget.umd.js";
    s.async = true;
    s.type = "text/javascript";
    document.body.appendChild(s);
  }
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
            <a href="#roi" className="text-slate-700 hover:text-blue-600 font-medium">ROI</a>
            <a href="#pricing" className="text-slate-700 hover:text-blue-600 font-medium">Pricing</a>
            <a href="#privacy" className="text-slate-700 hover:text-blue-600 font-medium">Privacy</a>
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
                ["#smart", "Smart Automations"],
                ["#why-us", "Why Aspire"],
                ["#services", "Capabilities"],
                ["#advanced", "Advanced"],
                ["#demo", "Demo"],
                ["#roi", "ROI"],
                ["#pricing", "Pricing"],
                ["#privacy", "Privacy"],
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

      {/* HERO */}
      <section id="hero" className="pt-28 pb-16 bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="container mx-auto px-6 text-center max-w-5xl">
          <h1 className="text-5xl md:text-6xl font-bold mb-6 leading-tight">
            <span className="block text-slate-900">Productivity & Performance</span>
            <span className="block text-blue-600 mt-1">Your New Unfair Advantage</span>
          </h1>
          <p className="text-xl text-slate-700 mb-6 leading-relaxed max-w-3xl mx-auto">
            A warm, human-sounding AI that answers calls, messages, and emails — connects with your CRM,
            and automates quotes, bookings, payments, <span className="font-semibold">and outbound callbacks/campaigns</span>.
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
          <p className="mt-4 text-slate-500">Inbound & Outbound • Australian-hosted • Secure • Seamlessly integrated</p>
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

      {/* LEADERSHIP */}
      <section id="about" className="py-14 bg-white">
        <div className="container mx-auto px-6 max-w-4xl text-center">
          <h2 className="text-3xl font-bold text-slate-900 mb-3">
            Business-Grade Automation. Enterprise Thinking.
          </h2>
        </div>
        <div className="container mx-auto px-6 max-w-4xl text-center">
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
            <Step icon={<Zap />} title="3) Automates Tasks" text="Quotes, bookings, follow-ups, and outbound callbacks/campaigns." />
            <Step icon={<MessageSquare />} title="4) Notifies Your Team" text="Clear, concise summaries and alerts sent instantly." />
          </div>
        </div>
      </section>

      {/* SMART AUTOMATIONS (n8n power) */}
      <section id="smart" className="py-16 bg-white">
        <div className="container mx-auto px-6 max-w-6xl text-center">
          <h2 className="text-3xl font-bold text-slate-900 mb-2">Smart Automations</h2>
        </div>
        <div className="container mx-auto px-6 max-w-6xl text-center">
          <p className="text-slate-600 mb-10">
            Powered by n8n and native integrations — we connect your systems so work just happens.
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Feature icon={<DollarSign />} title="Instant Quotes" text="Send custom quotes via email or SMS automatically." />
            <Feature icon={<FileText />} title="Invoice Sync" text="Generate invoices directly into Xero or MYOB; accept payments via Stripe." />
            <Feature icon={<BarChart3 />} title="CRM Updates" text="Log and enrich leads in Salesforce or HubSpot automatically." />
            <Feature icon={<PhoneCall />} title="Outbound AI Calls" text="Automatic callbacks & campaigns for missed calls, quotes, and reactivation." />
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
        </div>
        <div className="container mx-auto px-6 max-w-5xl">
          <div className="grid md:grid-cols-2 gap-8">
            {[
              ["Led by Experience", "Founded by a CEO — we understand outcomes, risk, and people."],
              ["Human + AI", "Blending empathy and efficiency for real-world impact."],
              ["Rapid Deployment", "Configured and live within days — not months."],
              ["Scalable", "From startups to councils, our architecture grows with you."],
              ["Privacy & Compliance", "Australian-hosted and aligned with the Privacy Act 1988."],
              ["Continuous Optimisation", "Monthly reviews to lift conversion, speed, and satisfaction."],
            ].map(([title, desc], i) => (
              <Bullet key={i} title={title} desc={desc} />
            ))}
          </div>
        </div>
      </section>

      {/* CAPABILITIES */}
      <section id="services" className="py-16 bg-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-slate-900 mb-2">Capabilities</h2>
            <p className="text-slate-600">What Aspire handles end-to-end for any business.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Feature icon={<Clock />} title="24/7 Coverage" text="Never miss a customer — after-hours and peak times covered." />
            <Feature icon={<DollarSign />} title="Revenue Protection" text="Recover missed calls & reduce no-shows with reminders." />
            <Feature icon={<Zap />} title="Live in Days" text="Scripts, FAQs, links and workflows configured fast." />
            <Feature icon={<ShieldCheck />} title="Privacy & Residency" text="Privacy Act aligned. Australian hosting by default." />
            <Feature icon={<PlugZap />} title="Integrations" text="Salesforce, HubSpot, Xero, Stripe — and more." />
            <Feature icon={<FileText />} title="Transcripts on Request" text="Optional transcripts for QA, training, and audits." />
            <Feature icon={<Calendar />} title="Smart Scheduling" text="Book and reschedule across your team calendar." />
            <Feature icon={<PhoneCall />} title="AI Outbound Calls" text="Callback missed leads & run reactivation campaigns automatically." />
          </div>
        </div>
      </section>

      {/* ADVANCED */}
      <section id="advanced" className="py-16 bg-white">
        <div className="container mx-auto px-6 text-center max-w-6xl">
          <h2 className="text-3xl font-bold text-slate-900 mb-2">Advanced Capabilities</h2>
        </div>
        <div className="container mx-auto px-6 text-center max-w-6xl">
          <p className="text-slate-600 mb-8">Secure, integrated, and enterprise-ready.</p>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Feature icon={<ShieldCheck />} title="Data Security" text="TLS 1.2+, encrypted storage, Australian residency." />
            <Feature icon={<PlugZap />} title="Deep Integrations" text="Salesforce, HubSpot, Xero, Stripe — plus custom API hooks." />
            <Feature icon={<MessageSquare />} title="Omni-Channel" text="Voice, SMS, email, and chat — one system of action." />
            <Feature icon={<FileText />} title="Full Transparency" text="Summaries and auditing for quality and governance." />
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

      {/* ROI */}
      <section id="roi" className="py-12 bg-gradient-to-r from-blue-600 to-indigo-600">
        <div className="container mx-auto px-6 max-w-6xl text-white">
          <div className="rounded-2xl border border-white/30 p-6 md:p-8">
            <div className="grid md:grid-cols-3 gap-6 items-center">
              <ROIStat value="+20%" label="more new enquiries captured" />
              <ROIStat value="100%" label="of after-hours calls answered" />
              <ROIStat value="50%" label="less time on repetitive tasks" />
            </div>
            <p className="mt-4 text-blue-100 text-sm">
              Results depend on volume and configuration. We review performance monthly and tune your workflows.
            </p>
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
                "AI chat + call handling (inbound & outbound)",
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
                "Smart automations (CRM, invoicing, outbound)",
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

     
<section id="privacy" className="py-16 bg-gradient-to-br from-blue-50 to-slate-50">
  <div className="container mx-auto px-6 max-w-6xl">
    <h2 className="text-3xl font-bold text-slate-900 mb-2">Privacy — By Design</h2>
    <p className="text-slate-600">
      Aspire.AI is built with privacy-first principles and clear consent. We minimise the data we handle and give you control.
    </p>

    {/* Compliance badges */}
    <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
      <Badge
        icon={<ShieldCheck className="h-5 w-5" />}
        label="Privacy Act 1988 (APPs)"
      />
      <Badge
        icon={<MapPin className="h-5 w-5" />}
        label="Australian Data Residency"
      />
      <Badge
        icon={<Lock className="h-5 w-5" />}
        label="Encryption in Transit & at Rest"
      />
    </div>

    {/* Details grid */}
    <div className="mt-10 grid md:grid-cols-2 lg:grid-cols-3 gap-6">
      <Card title="Australian Data Residency">
        Default hosting in Australia with encryption in transit and at rest.
      </Card>
      <Card title="Consent & Recording">
        Customisable call/chat consent notices. Transcripts are optional and can be disabled.
      </Card>
      <Card title="Data Minimisation">
        Only captures contact and enquiry context required to complete the task.
      </Card>
      <Card title="Retention & Deletion">
        Configurable retention windows and deletion on request. Per-client policies supported.
      </Card>
      <Card title="Access Controls">
        Role-based access (RBAC) and audit trails for changes and access.
      </Card>
      <Card title="Compliance Ready">
        Privacy Act 1988 aligned. DPA and SLAs available for Enterprise.
      </Card>
    </div>
  </div>
</section>


      {/* FAQ */}
      <FAQSection />

      {/* CONTACT (structure retained) */}
      <section id="contact" className="py-20 bg-gradient-to-br from-slate-900 to-blue-900 text-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold mb-4">Ready to Transform Productivity?</h2>
            <p className="text-xl text-blue-100">We’ll configure your assistant, automations, and integrations — and go live in days.</p>
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
            <a href="#how" className="hover:text-white">How it works</a>
            <a href="#smart" className="hover:text-white">Automations</a>
            <a href="#why-us" className="hover:text-white">Why Aspire</a>
            <a href="#services" className="hover:text-white">Capabilities</a>
            <a href="#advanced" className="hover:text-white">Advanced</a>
            <a href="#demo" className="hover:text-white">Demo</a>
            <a href="#roi" className="hover:text-white">ROI</a>
            <a href="#pricing" className="hover:text-white">Pricing</a>
            <a href="#privacy" className="hover:text-white">Privacy</a>
            <a href="#faq" className="hover:text-white">FAQ</a>
            <a href="#contact" className="hover:text-white">Contact</a>
            <Link to="/privacy" className="hover:text-white">Privacy Policy</Link>
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
/* --- Small component: add near your other small components --- */
const Badge = ({ icon, label }) => (
  <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
    <div className="rounded-lg bg-blue-100 p-2 text-blue-700">{icon}</div>
    <span className="text-sm font-medium text-slate-800">{label}</span>
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
      q: "Do I need to change my existing systems?",
      a: "No. Aspire.AI connects to your current tools. We can sync with Salesforce or HubSpot for CRM, Xero/Stripe for billing, and keep your website and calendars as they are.",
    },
    {
      q: "How fast can this be live?",
      a: "Most businesses launch within days. We use approved scripts, your brand voice, and a simple go-live checklist.",
    },
    {
      q: "Is this secure and compliant?",
      a: "Yes. Data is hosted in Australia by default, encrypted in transit and at rest, and aligned with the Privacy Act 1988. Transcripts are optional and configurable.",
    },
    {
      q: "Can it send quotes, invoices, and outbound calls automatically?",
      a: "Yes. We can auto-generate quotes after a call or form, raise invoices in Xero or MYOB with Stripe payment links, and trigger outbound callbacks or campaigns for missed calls, quotes, and reactivation.",
    },
    {
      q: "What if we need a human handoff?",
      a: "Your team can be alerted instantly via SMS or email with a concise summary and next actions. Complex or sensitive conversations can be routed to people immediately.",
    },
  ];
  const [open, setOpen] = useState(null);
  return (
    <section id="faq" className="py-16 bg-white">
      <div className="container mx-auto px-6 max-w-4xl">
        <h2 className="text-3xl font-bold text-slate-900 mb-6">FAQ — Getting Started</h2>
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
