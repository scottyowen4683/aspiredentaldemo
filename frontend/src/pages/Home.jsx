import React, { useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import {
  ShieldCheck,
  PhoneCall,
  MessageSquare,
  Zap,
  ArrowRight,
  CheckCircle2,
  Building2,
  Briefcase,
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
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-blue-600/20 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />

        <div className="relative">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs text-white/70">
            <ShieldCheck className="h-4 w-4" />
            Australian-first. Enterprise-grade. Built for real operations.
          </p>

          <h1 className="mt-6 text-4xl md:text-6xl font-semibold tracking-tight">
            AI Agents that answer, act,
            <span className="text-white/70"> and deliver outcomes.</span>
          </h1>

          <p className="mt-5 max-w-2xl text-base md:text-lg text-white/70 leading-relaxed">
            Aspire deploys voice and chat agents that resolve routine enquiries,
            capture intent, trigger workflows, and escalate cleanly — without
            turning your organisation into a science project.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/ai-receptionist"
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black hover:bg-white/90"
            >
              Hear the Voice Demo <ArrowRight className="h-4 w-4" />
            </Link>

            <Link
              to="/government"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white/90 hover:bg-white/10"
            >
              Government <Building2 className="h-4 w-4" />
            </Link>

            <Link
              to="/business"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white/90 hover:bg-white/10"
            >
              Business <Briefcase className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <Pill
              icon={<PhoneCall className="h-4 w-4" />}
              title="Voice Agents"
              text="Inbound + outbound calls with confident, human delivery."
            />
            <Pill
              icon={<MessageSquare className="h-4 w-4" />}
              title="Chat Agents"
              text="Web chat that answers instantly and escalates cleanly."
            />
            <Pill
              icon={<Zap className="h-4 w-4" />}
              title="Automations"
              text="Structured workflows that actually reduce workload."
            />
          </div>
        </div>
      </section>

      {/* FRAMEWORK */}
      <section className="grid gap-10 md:grid-cols-2 md:items-start">
        <div>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">
            ASPIRE™ Enterprise AI Framework
          </h2>
          <p className="mt-4 text-white/70 leading-relaxed">
            The framework behind every deployment — designed to keep your AI
            reliable, safe, and measurable.
          </p>

          <div className="mt-6 space-y-3">
            <Bullet text="Governance-first design (privacy, consent, escalation)." />
            <Bullet text="Knowledge precision: reduce hallucinations, increase trust." />
            <Bullet text="Workflow orchestrat
