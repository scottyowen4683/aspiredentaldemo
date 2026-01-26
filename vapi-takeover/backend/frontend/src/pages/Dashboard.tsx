import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { supabase } from "@/supabaseClient";
import { useNavigate } from "react-router-dom";
import {
  MessageSquare,
  Bot,
  Flag,
  TrendingUp,
  Phone,
  Clock,
  ArrowRight,
  Users,
  Building2,
  BarChart3,
  Shield,
  Zap,
  CheckCircle,
  AlertTriangle,
  Activity,
  PlusCircle,
  Eye,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface DashboardStats {
  totalConversations: number;
  totalAssistants: number;
  flaggedItems: number;
  avgScore: number;
  totalOrganizations: number;
  totalUsers: number;
  voiceCallsToday: number;
  textConversationsToday: number;
}

interface RecentConversation {
  id: string;
  assistant_name: string;
  created_at: string;
  confidence_score: number | null;
  assistant_type: string;
}

export default function Dashboard() {
  const { user } = useUser();
  const navigate = useNavigate();
  const currentRole: "super_admin" | "org_admin" = user?.role === "super_admin" ? "super_admin" : "org_admin";

  // Fetch dashboard stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["dashboard-stats", user?.org_id, user?.role],
    queryFn: async (): Promise<DashboardStats> => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Build queries based on role
      let conversationsQuery = supabase.from("conversations").select("id, created_at, assistant_type", { count: "exact" });
      let assistantsQuery = supabase.from("assistants").select("id", { count: "exact" });
      let flaggedQuery = supabase.from("review_queue").select("id", { count: "exact" }).eq("reviewed", false);

      if (user?.role === "org_admin" && user?.org_id) {
        conversationsQuery = conversationsQuery.eq("org_id", user.org_id);
        assistantsQuery = assistantsQuery.eq("org_id", user.org_id);
        flaggedQuery = flaggedQuery.eq("org_id", user.org_id);
      }

      const [convResult, assistantsResult, flaggedResult] = await Promise.all([
        conversationsQuery,
        assistantsResult = assistantsQuery,
        flaggedQuery,
      ]);

      // Get today's conversations
      let todayQuery = supabase
        .from("conversations")
        .select("id, assistant_type")
        .gte("created_at", today.toISOString());

      if (user?.role === "org_admin" && user?.org_id) {
        todayQuery = todayQuery.eq("org_id", user.org_id);
      }
      const { data: todayConvs } = await todayQuery;

      // Get average score from recent conversations
      let scoresQuery = supabase
        .from("conversations")
        .select("confidence_score")
        .not("confidence_score", "is", null)
        .order("created_at", { ascending: false })
        .limit(100);

      if (user?.role === "org_admin" && user?.org_id) {
        scoresQuery = scoresQuery.eq("org_id", user.org_id);
      }
      const { data: scoresData } = await scoresQuery;

      const avgScore = scoresData && scoresData.length > 0
        ? Math.round(scoresData.reduce((sum, c) => sum + (c.confidence_score || 0), 0) / scoresData.length)
        : 0;

      // Get org and user counts for super admin
      let totalOrganizations = 0;
      let totalUsers = 0;
      if (user?.role === "super_admin") {
        const [orgsResult, usersResult] = await Promise.all([
          supabase.from("organizations").select("id", { count: "exact" }),
          supabase.from("users").select("id", { count: "exact" }),
        ]);
        totalOrganizations = orgsResult.count || 0;
        totalUsers = usersResult.count || 0;
      }

      const voiceCalls = todayConvs?.filter(c => c.assistant_type === "voice")?.length || 0;
      const textConvs = todayConvs?.filter(c => c.assistant_type === "chat" || c.assistant_type === "text")?.length || 0;

      return {
        totalConversations: convResult.count || 0,
        totalAssistants: assistantsResult.count || 0,
        flaggedItems: flaggedResult.count || 0,
        avgScore,
        totalOrganizations,
        totalUsers,
        voiceCallsToday: voiceCalls,
        textConversationsToday: textConvs,
      };
    },
    refetchInterval: 30000,
  });

  // Fetch recent conversations
  const { data: recentConversations = [], isLoading: conversationsLoading } = useQuery({
    queryKey: ["recent-conversations", user?.org_id, user?.role],
    queryFn: async (): Promise<RecentConversation[]> => {
      let query = supabase
        .from("conversations")
        .select(`
          id,
          created_at,
          confidence_score,
          assistant_type,
          assistants!inner(friendly_name)
        `)
        .order("created_at", { ascending: false })
        .limit(5);

      if (user?.role === "org_admin" && user?.org_id) {
        query = query.eq("org_id", user.org_id);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data || []).map((conv: any) => ({
        id: conv.id,
        assistant_name: conv.assistants?.friendly_name || "Unknown Assistant",
        created_at: conv.created_at,
        confidence_score: conv.confidence_score,
        assistant_type: conv.assistant_type || "voice",
      }));
    },
    refetchInterval: 30000,
  });

  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const getScoreColor = (score: number | null) => {
    if (!score) return "text-muted-foreground";
    if (score >= 90) return "text-green-600";
    if (score >= 70) return "text-blue-600";
    if (score >= 50) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <DashboardLayout userRole={currentRole} userName={user?.full_name || "User"}>
      <div className="space-y-8">
        {/* Welcome Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold">
              Welcome back, <span className="bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">{user?.full_name?.split(" ")[0] || "Admin"}</span>
            </h1>
            <p className="text-muted-foreground mt-2">
              {user?.role === "super_admin"
                ? "Here's an overview of your Aspire AI Platform"
                : "Here's an overview of your organization's AI performance"}
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => navigate("/analytics")}>
              <BarChart3 className="h-4 w-4 mr-2" />
              View Analytics
            </Button>
            <Button onClick={() => navigate("/assistants")}>
              <PlusCircle className="h-4 w-4 mr-2" />
              Create Assistant
            </Button>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="bg-gradient-to-br from-primary/10 to-purple-500/10 border-primary/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Conversations</p>
                  {statsLoading ? (
                    <Skeleton className="h-8 w-20 mt-1" />
                  ) : (
                    <p className="text-3xl font-bold">{stats?.totalConversations.toLocaleString()}</p>
                  )}
                </div>
                <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
                  <MessageSquare className="h-6 w-6 text-primary" />
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2 text-sm">
                <Badge variant="secondary" className="bg-green-500/10 text-green-600">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  Active
                </Badge>
                <span className="text-muted-foreground">All time</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border-blue-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Active Assistants</p>
                  {statsLoading ? (
                    <Skeleton className="h-8 w-12 mt-1" />
                  ) : (
                    <p className="text-3xl font-bold">{stats?.totalAssistants}</p>
                  )}
                </div>
                <div className="h-12 w-12 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <Bot className="h-6 w-6 text-blue-600" />
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Voice & Chat</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-emerald-500/10 to-green-500/10 border-emerald-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Avg. Quality Score</p>
                  {statsLoading ? (
                    <Skeleton className="h-8 w-16 mt-1" />
                  ) : (
                    <p className="text-3xl font-bold">{stats?.avgScore}%</p>
                  )}
                </div>
                <div className="h-12 w-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <Shield className="h-6 w-6 text-emerald-600" />
                </div>
              </div>
              <div className="mt-4">
                <Progress value={stats?.avgScore || 0} className="h-2" />
              </div>
            </CardContent>
          </Card>

          <Card className={`bg-gradient-to-br ${stats?.flaggedItems && stats.flaggedItems > 0 ? 'from-orange-500/10 to-red-500/10 border-orange-500/20' : 'from-green-500/10 to-emerald-500/10 border-green-500/20'}`}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Review Queue</p>
                  {statsLoading ? (
                    <Skeleton className="h-8 w-12 mt-1" />
                  ) : (
                    <p className="text-3xl font-bold">{stats?.flaggedItems}</p>
                  )}
                </div>
                <div className={`h-12 w-12 rounded-full flex items-center justify-center ${stats?.flaggedItems && stats.flaggedItems > 0 ? 'bg-orange-500/20' : 'bg-green-500/20'}`}>
                  {stats?.flaggedItems && stats.flaggedItems > 0 ? (
                    <Flag className="h-6 w-6 text-orange-600" />
                  ) : (
                    <CheckCircle className="h-6 w-6 text-green-600" />
                  )}
                </div>
              </div>
              <div className="mt-4">
                <Button variant="ghost" size="sm" className="p-0 h-auto" onClick={() => navigate("/review-queue")}>
                  <span className="text-sm">View queue</span>
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Today's Activity & Recent Conversations */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Today's Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Today's Activity
              </CardTitle>
              <CardDescription>Real-time conversation metrics</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-gradient-to-br from-blue-500/5 to-cyan-500/5 border border-blue-500/10">
                  <div className="flex items-center gap-2 mb-2">
                    <Phone className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium">Voice Calls</span>
                  </div>
                  {statsLoading ? (
                    <Skeleton className="h-8 w-12" />
                  ) : (
                    <p className="text-2xl font-bold">{stats?.voiceCallsToday || 0}</p>
                  )}
                </div>
                <div className="p-4 rounded-lg bg-gradient-to-br from-purple-500/5 to-pink-500/5 border border-purple-500/10">
                  <div className="flex items-center gap-2 mb-2">
                    <MessageSquare className="h-4 w-4 text-purple-600" />
                    <span className="text-sm font-medium">Text Chats</span>
                  </div>
                  {statsLoading ? (
                    <Skeleton className="h-8 w-12" />
                  ) : (
                    <p className="text-2xl font-bold">{stats?.textConversationsToday || 0}</p>
                  )}
                </div>
              </div>

              {user?.role === "super_admin" && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2 mb-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Organizations</span>
                    </div>
                    {statsLoading ? (
                      <Skeleton className="h-8 w-12" />
                    ) : (
                      <p className="text-2xl font-bold">{stats?.totalOrganizations || 0}</p>
                    )}
                  </div>
                  <div className="p-4 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Total Users</span>
                    </div>
                    {statsLoading ? (
                      <Skeleton className="h-8 w-12" />
                    ) : (
                      <p className="text-2xl font-bold">{stats?.totalUsers || 0}</p>
                    )}
                  </div>
                </div>
              )}

              <div className="pt-4 border-t">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Platform Status</span>
                  <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
                    <span className="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse" />
                    All Systems Operational
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Recent Conversations */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" />
                  Recent Conversations
                </CardTitle>
                <CardDescription>Latest AI interactions</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => navigate("/conversations")}>
                View all
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </CardHeader>
            <CardContent>
              {conversationsLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : recentConversations.length === 0 ? (
                <div className="text-center py-8">
                  <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No conversations yet</p>
                  <p className="text-sm text-muted-foreground">Start using your assistants to see conversations here</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentConversations.map((conv) => (
                    <div
                      key={conv.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => navigate(`/conversations/${conv.id}`)}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`h-10 w-10 rounded-full flex items-center justify-center ${conv.assistant_type === 'voice' ? 'bg-blue-500/10' : 'bg-purple-500/10'}`}>
                          {conv.assistant_type === "voice" ? (
                            <Phone className="h-5 w-5 text-blue-600" />
                          ) : (
                            <MessageSquare className="h-5 w-5 text-purple-600" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{conv.assistant_name}</p>
                          <p className="text-xs text-muted-foreground">{formatTimeAgo(conv.created_at)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {conv.confidence_score !== null ? (
                          <Badge variant="outline" className={getScoreColor(conv.confidence_score)}>
                            {conv.confidence_score}%
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            Pending
                          </Badge>
                        )}
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => navigate("/assistants")}>
                <Bot className="h-6 w-6" />
                <span>Manage Assistants</span>
              </Button>
              <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => navigate("/campaigns")}>
                <Phone className="h-6 w-6" />
                <span>Campaigns</span>
              </Button>
              <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => navigate("/knowledge-base")}>
                <Shield className="h-6 w-6" />
                <span>Knowledge Base</span>
              </Button>
              <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => navigate("/review-queue")}>
                <Flag className="h-6 w-6" />
                <span>Review Queue</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
