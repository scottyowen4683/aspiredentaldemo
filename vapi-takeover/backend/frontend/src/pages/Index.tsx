import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MessageSquare, Bot, BarChart3, Shield, Phone, Brain, FileText, Users, Zap, CheckCircle } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16">
        <div className="flex flex-col items-center justify-center text-center space-y-8">
          {/* Logo */}
          <div className="flex items-center space-x-3">
            <img src="/aspire.png" alt="Aspire Logo" className="h-16" />
          </div>

          {/* Headline */}
          <div className="max-w-4xl space-y-6">
            <h1 className="text-5xl md:text-7xl font-bold text-white">
              Enterprise{" "}
              <span className="bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 bg-clip-text text-transparent">
                AI Platform
              </span>
            </h1>
            <p className="text-xl md:text-2xl text-slate-300 max-w-3xl mx-auto">
              Government-grade AI assistants with advanced conversation scoring,
              compliance monitoring, and enterprise analytics. Built for organizations
              that demand excellence.
            </p>
          </div>

          {/* Trust Indicators */}
          <div className="flex flex-wrap justify-center gap-6 text-slate-400 text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              <span>SOC 2 Compliant</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              <span>AU Data Residency</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              <span>24/7 Enterprise Support</span>
            </div>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 pt-4">
            <Button
              size="lg"
              onClick={() => navigate("/auth")}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-8 py-6 text-lg shadow-2xl shadow-blue-500/25"
            >
              Access Platform
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => navigate("/auth")}
              className="border-slate-600 text-slate-200 hover:bg-slate-800 px-8 py-6 text-lg"
            >
              Request Demo
            </Button>
          </div>

          {/* Features Grid */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 w-full max-w-7xl mt-20">
            <div className="bg-slate-800/50 backdrop-blur-sm p-6 rounded-2xl border border-slate-700 hover:border-blue-500/50 transition-all group">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Phone className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                Voice AI Assistants
              </h3>
              <p className="text-sm text-slate-400">
                Handle inbound and outbound calls with human-like AI voices powered by ElevenLabs
              </p>
            </div>

            <div className="bg-slate-800/50 backdrop-blur-sm p-6 rounded-2xl border border-slate-700 hover:border-purple-500/50 transition-all group">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Brain className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                Governance Scoring
              </h3>
              <p className="text-sm text-slate-400">
                5-dimension rubric scoring for compliance, accuracy, and service quality
              </p>
            </div>

            <div className="bg-slate-800/50 backdrop-blur-sm p-6 rounded-2xl border border-slate-700 hover:border-emerald-500/50 transition-all group">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <BarChart3 className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                Enterprise Analytics
              </h3>
              <p className="text-sm text-slate-400">
                Real-time dashboards with cost tracking, sentiment analysis, and ROI metrics
              </p>
            </div>

            <div className="bg-slate-800/50 backdrop-blur-sm p-6 rounded-2xl border border-slate-700 hover:border-orange-500/50 transition-all group">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Shield className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                Enterprise Security
              </h3>
              <p className="text-sm text-slate-400">
                Role-based access, MFA enforcement, audit logging, and data encryption
              </p>
            </div>
          </div>

          {/* Additional Features */}
          <div className="grid gap-4 md:grid-cols-3 w-full max-w-5xl mt-12">
            <div className="flex items-center gap-3 bg-slate-800/30 rounded-xl p-4 border border-slate-700/50">
              <FileText className="h-5 w-5 text-blue-400" />
              <span className="text-slate-300 text-sm">Knowledge Base Integration</span>
            </div>
            <div className="flex items-center gap-3 bg-slate-800/30 rounded-xl p-4 border border-slate-700/50">
              <Users className="h-5 w-5 text-purple-400" />
              <span className="text-slate-300 text-sm">Multi-tenant Organization Management</span>
            </div>
            <div className="flex items-center gap-3 bg-slate-800/30 rounded-xl p-4 border border-slate-700/50">
              <Zap className="h-5 w-5 text-yellow-400" />
              <span className="text-slate-300 text-sm">Outbound Campaign Automation</span>
            </div>
          </div>

          {/* Bottom CTA */}
          <div className="mt-16 text-center">
            <p className="text-slate-500 text-sm mb-4">
              Trusted by government agencies and enterprise organizations
            </p>
            <div className="flex justify-center gap-8 opacity-50">
              {/* Placeholder for client logos */}
              <div className="h-8 w-24 bg-slate-700 rounded" />
              <div className="h-8 w-24 bg-slate-700 rounded" />
              <div className="h-8 w-24 bg-slate-700 rounded" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
