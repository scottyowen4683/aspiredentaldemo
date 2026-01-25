import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MessageSquare, Bot, BarChart3, Shield } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-subtle">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16">
        <div className="flex flex-col items-center justify-center text-center space-y-8">
          {/* Logo */}
          <div className="flex items-center space-x-3">
            <div className="h-16 w-16 rounded-2xl bg-gradient-primary shadow-glow" />
            <span className="text-5xl font-bold text-foreground">Aspire</span>
          </div>

          {/* Headline */}
          <div className="max-w-3xl space-y-4">
            <h1 className="text-6xl font-bold text-foreground">
              AI-Powered{" "}
              <span className="bg-gradient-primary bg-clip-text text-transparent">
                Conversation Scoring
              </span>
            </h1>
            <p className="text-xl text-muted-foreground">
              Automatically analyze, score, and improve your AI assistant conversations with
              advanced GPT-4o powered insights and sentiment analysis.
            </p>
          </div>

          {/* CTA Buttons */}
          <div className="flex space-x-4">
            <Button size="lg" onClick={() => navigate("/auth")} className="shadow-elegant">
              Get Started
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate("/dashboard")}>
              View Demo Dashboard
            </Button>
          </div>

          {/* Features Grid */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 w-full max-w-6xl mt-16">
            <div className="bg-card p-6 rounded-xl shadow-card hover:shadow-elegant transition-all">
              <MessageSquare className="h-10 w-10 text-primary mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Real-time Scoring
              </h3>
              <p className="text-sm text-muted-foreground">
                Automatically score conversations as they happen with AI-powered analysis
              </p>
            </div>

            <div className="bg-card p-6 rounded-xl shadow-card hover:shadow-elegant transition-all">
              <Bot className="h-10 w-10 text-accent mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Multi-Provider Support
              </h3>
              <p className="text-sm text-muted-foreground">
                Integrate with Vapi, GHL, and other leading AI assistant platforms
              </p>
            </div>

            <div className="bg-card p-6 rounded-xl shadow-card hover:shadow-elegant transition-all">
              <BarChart3 className="h-10 w-10 text-success mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Advanced Analytics
              </h3>
              <p className="text-sm text-muted-foreground">
                Track performance, sentiment trends, and cost metrics across all conversations
              </p>
            </div>

            <div className="bg-card p-6 rounded-xl shadow-card hover:shadow-elegant transition-all">
              <Shield className="h-10 w-10 text-warning mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Secure & Compliant
              </h3>
              <p className="text-sm text-muted-foreground">
                AU data residency, RBAC, and enterprise-grade security built-in
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
