import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, Bot, Flag, TrendingUp, DollarSign, Clock } from "lucide-react";


const logo = '/aspire-logo.png';

export default function Dashboard() {
  // Mock data - will be replaced with real data from Supabase
  const stats = [
    {
      title: "Total Conversations",
      value: "2,847",
      description: "Last 30 days",
      icon: MessageSquare,
      trend: { value: 12.5, isPositive: true },
    },
    {
      title: "Active Assistants",
      value: "12",
      description: "Across all orgs",
      icon: Bot,
      variant: "success" as const,
    },
    {
      title: "Flagged for Review",
      value: "23",
      description: "Needs attention",
      icon: Flag,
      variant: "warning" as const,
    },
    {
      title: "Avg Confidence Score",
      value: "94.2%",
      description: "AI scoring accuracy",
      icon: TrendingUp,
      trend: { value: 3.2, isPositive: true },
    },
    {
      title: "Token Usage",
      value: "1.2M",
      description: "This month",
      icon: DollarSign,
    },
    {
      title: "Avg Processing Time",
      value: "2.4s",
      description: "Per conversation",
      icon: Clock,
      trend: { value: 8.1, isPositive: false },
    },
  ];

  const recentConversations = [
    {
      id: "1",
      assistant: "Sales Assistant",
      timestamp: "2 hours ago",
      score: 92,
      sentiment: "Positive",
      flagged: false,
    },
    {
      id: "2",
      assistant: "Support Bot",
      timestamp: "4 hours ago",
      score: 78,
      sentiment: "Neutral",
      flagged: true,
    },
    {
      id: "3",
      assistant: "Lead Qualifier",
      timestamp: "5 hours ago",
      score: 95,
      sentiment: "Positive",
      flagged: false,
    },
  ];

  return (
    <DashboardLayout userRole="super_admin" userName="Admin User">
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-4xl font-bold text-foreground bg-gradient-primary bg-clip-text text-transparent">
            Dashboard
          </h1>
          <p className="text-muted-foreground mt-2">
            Overview of your AI conversation scoring system
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {stats.map((stat) => (
            <StatsCard key={stat.title} {...stat} />
          ))}
        </div>

        {/* Recent Activity */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Recent Conversations</CardTitle>
              <CardDescription>Latest AI-scored conversations</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentConversations.map((conv) => (
                  <div
                    key={conv.id}
                    className="flex items-center justify-between p-4 rounded-lg bg-gradient-card hover:shadow-card transition-all"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-foreground">{conv.assistant}</p>
                      <p className="text-sm text-muted-foreground">{conv.timestamp}</p>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div className="text-right">
                        <p className="text-sm font-medium text-foreground">Score: {conv.score}%</p>
                        <p className="text-xs text-muted-foreground">{conv.sentiment}</p>
                      </div>
                      {conv.flagged && (
                        <div className="h-2 w-2 rounded-full bg-warning" title="Flagged for review" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>System Health</CardTitle>
              <CardDescription>Assistant performance metrics</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Uptime</span>
                    <span className="font-medium text-success">99.9%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-primary w-[99.9%]" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">API Response Time</span>
                    <span className="font-medium text-success">142ms</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-primary w-[85%]" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Success Rate</span>
                    <span className="font-medium text-success">98.7%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-primary w-[98.7%]" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
