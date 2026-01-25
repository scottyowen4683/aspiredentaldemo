import React from 'react';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { 
  MessageSquare, 
  Bot, 
  Flag, 
  TrendingUp, 
  DollarSign, 
  Clock,
  AlertTriangle,
  CheckCircle
} from 'lucide-react';
import { OrganizationMetrics } from '@/hooks/useOrganizationMetrics';
import { Skeleton } from '@/components/ui/skeleton';

interface MetricsOverviewProps {
  metrics: OrganizationMetrics | null;
  loading: boolean;
  error: string | null;
}

export const MetricsOverview: React.FC<MetricsOverviewProps> = ({ 
  metrics, 
  loading, 
  error 
}) => {
  if (loading) {
    return (
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-8 bg-destructive/10 rounded-lg border border-destructive/20">
        <div className="text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-destructive mb-2" />
          <h3 className="font-semibold text-destructive">Failed to load metrics</h3>
          <p className="text-sm text-muted-foreground mt-1">{error}</p>
        </div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="flex items-center justify-center p-8 bg-muted/50 rounded-lg border border-border">
        <div className="text-center">
          <MessageSquare className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
          <h3 className="font-semibold text-muted-foreground">No data available</h3>
          <p className="text-sm text-muted-foreground mt-1">Start by adding assistants and conversations</p>
        </div>
      </div>
    );
  }

  // Helper function to get variant safely
  const getScoreVariant = (score: number): "success" | "warning" | "destructive" => {
    if (score >= 85) return "success";
    if (score >= 70) return "warning";
    return "destructive";
  };

  const getResponseTimeVariant = (time: number): "success" | "warning" | "destructive" => {
    if (time <= 300) return "success";
    if (time <= 600) return "warning";
    return "destructive";
  };

  const stats = [
    {
      title: "Total Conversations",
      value: metrics.totalConversations.toLocaleString(),
      description: "All time",
      icon: MessageSquare,
      variant: "default" as const
    },
    {
      title: "This Month",
      value: metrics.conversationsThisMonth.toLocaleString(),
      description: `${metrics.conversationsGrowth >= 0 ? '+' : ''}${metrics.conversationsGrowth}% from last month`,
      icon: TrendingUp,
      variant: metrics.conversationsGrowth >= 0 ? "success" as const : "destructive" as const,
      trend: {
        value: Math.abs(metrics.conversationsGrowth),
        isPositive: metrics.conversationsGrowth >= 0
      }
    },
    {
      title: "Active Assistants",
      value: metrics.activeAssistants.toString(),
      description: "Auto-scoring enabled",
      icon: Bot,
      variant: metrics.activeAssistants > 0 ? "success" as const : "warning" as const
    },
    {
      title: "Average Score",
      value: `${metrics.avgScore}%`,
      description: "Conversation quality",
      icon: CheckCircle,
      variant: getScoreVariant(metrics.avgScore)
    },
    {
      title: "Flagged for Review",
      value: metrics.flaggedConversations.toString(),
      description: "Needs attention",
      icon: Flag,
      variant: metrics.flaggedConversations === 0 ? "success" as const : "warning" as const
    },
    {
      title: "Avg Response Time",
      value: `${metrics.avgResponseTime}s`,
      description: "Call duration",
      icon: Clock,
      variant: getResponseTimeVariant(metrics.avgResponseTime)
    }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Organization Metrics</h2>
        <p className="text-muted-foreground">Key performance indicators for your organization</p>
      </div>
      
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => (
          <StatsCard key={stat.title} {...stat} />
        ))}
      </div>
    </div>
  );
};