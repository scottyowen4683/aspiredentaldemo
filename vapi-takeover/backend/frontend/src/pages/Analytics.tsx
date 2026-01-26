import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  DollarSign,
  TrendingUp,
  Activity,
  Clock,
  Phone,
  MessageSquare,
  CheckCircle,
  AlertTriangle,
  Users,
  Target,
  BarChart3,
  PieChart,
  Calendar,
  HelpCircle,
  ArrowUp,
  ArrowDown,
  Minus,
  Shield,
  FileCheck,
  Flag,
  Eye,
  Scale,
  ClipboardCheck,
  Timer,
  Gauge,
  UserX,
  PhoneForwarded
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useUser } from "@/context/UserContext";
import { useState, useMemo } from "react";
import { supabase } from "@/supabaseClient";
import { LineChart, Line, AreaChart, Area, PieChart as RechartsPieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend } from 'recharts';
import { useQuery } from "@tanstack/react-query";
import {
  getAnalyticsMetrics,
  getTopQuestions,
  getSentimentData,
  getFeatureUsage,
  getScoreDistribution,
  getCallProfile,
  getTrendData,
  getOrganizations,
  getTopDeferralReasons,
  AnalyticsMetrics
} from "@/services/analyticsService";

export default function Analytics() {
  const { user } = useUser();
  const currentRole: "super_admin" | "org_admin" = user?.role === "super_admin" ? "super_admin" : "org_admin";
  
  const [selectedOrg, setSelectedOrg] = useState<string>("all");
  const [selectedPeriod, setSelectedPeriod] = useState<string>("30d");

  // Determine org ID for queries
  const queryOrgId = currentRole === "super_admin" 
    ? (selectedOrg === "all" ? undefined : selectedOrg)
    : user?.org_id;

  // Fetch organizations for super admin dropdown
  const { data: organizations = [], isLoading: orgsLoading, error: orgsError } = useQuery({
    queryKey: ["organizations"],
    queryFn: getOrganizations,
    enabled: currentRole === "super_admin"
  });

  // Fetch analytics metrics
  const { data: keyMetrics, isLoading: metricsLoading, error: metricsError } = useQuery({
    queryKey: ["analytics-metrics", queryOrgId, selectedPeriod],
    queryFn: () => getAnalyticsMetrics(queryOrgId, selectedPeriod),
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Fetch top questions
  const { data: topQuestions = [], isLoading: questionsLoading } = useQuery({
    queryKey: ["top-questions", queryOrgId, selectedPeriod],
    queryFn: () => getTopQuestions(queryOrgId, selectedPeriod),
    refetchInterval: 60000, // Refetch every minute
  });

  // Fetch sentiment data
  const { data: sentimentData = [], isLoading: sentimentLoading } = useQuery({
    queryKey: ["sentiment-data", queryOrgId, selectedPeriod],
    queryFn: () => getSentimentData(queryOrgId, selectedPeriod),
    refetchInterval: 60000,
  });

  // Fetch feature usage
  const { data: featureUsage = [], isLoading: featureLoading } = useQuery({
    queryKey: ["feature-usage", queryOrgId, selectedPeriod],
    queryFn: () => getFeatureUsage(queryOrgId, selectedPeriod),
    refetchInterval: 60000,
  });

  // Fetch score distribution
  const { data: scoreDistribution = [], isLoading: scoresLoading, error: scoresError } = useQuery({
    queryKey: ["score-distribution", queryOrgId, selectedPeriod],
    queryFn: () => getScoreDistribution(queryOrgId, selectedPeriod),
    refetchInterval: 60000,
  });

  // Debug logging for score distribution
  console.log("Score Distribution Debug:", {
    scoreDistribution,
    scoresLoading,
    scoresError,
    queryOrgId,
    selectedPeriod
  });

  // Debug logging for key metrics
  console.log("Key Metrics Debug:", {
    keyMetrics,
    metricsLoading,
    metricsError,
    queryOrgId,
    selectedPeriod
  });

  // Fetch call profile
  const { data: callProfile = [], isLoading: callProfileLoading } = useQuery({
    queryKey: ["call-profile", queryOrgId, selectedPeriod],
    queryFn: () => getCallProfile(queryOrgId, selectedPeriod),
    refetchInterval: 60000,
  });

  // Fetch trend data
  const { data: trendData = [], isLoading: trendLoading } = useQuery({
    queryKey: ["trend-data", queryOrgId, selectedPeriod],
    queryFn: () => getTrendData(queryOrgId, selectedPeriod),
    refetchInterval: 60000,
  });

  // Fetch governance metrics
  const { data: governanceMetrics, isLoading: governanceLoading } = useQuery({
    queryKey: ["governance-metrics", queryOrgId, selectedPeriod],
    queryFn: async () => {
      // Calculate date range
      const days = selectedPeriod === "7d" ? 7 : selectedPeriod === "90d" ? 90 : 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Fetch review queue stats
      let reviewQuery = supabase
        .from("review_queue")
        .select("id, reviewed, urgency, flag_reason, created_at");

      if (queryOrgId) {
        reviewQuery = reviewQuery.eq("org_id", queryOrgId);
      }
      reviewQuery = reviewQuery.gte("created_at", startDate.toISOString());

      const { data: reviewData, error: reviewError } = await reviewQuery;

      // Fetch scores for rubric compliance
      let scoresQuery = supabase
        .from("scores")
        .select("id, final_score, rubric_result, flags, created_at");

      scoresQuery = scoresQuery.gte("created_at", startDate.toISOString());

      const { data: scoresData, error: scoresError } = await scoresQuery;

      // Calculate governance metrics
      const totalReviewItems = reviewData?.length || 0;
      const pendingReviews = reviewData?.filter(r => !r.reviewed)?.length || 0;
      const completedReviews = reviewData?.filter(r => r.reviewed)?.length || 0;
      const urgentItems = reviewData?.filter(r => r.urgency === "high" || r.urgency === "critical")?.length || 0;

      // Flag reasons breakdown
      const flagReasons: Record<string, number> = {};
      reviewData?.forEach(item => {
        const reason = item.flag_reason || "Other";
        flagReasons[reason] = (flagReasons[reason] || 0) + 1;
      });

      // Score quality metrics
      const scores = scoresData?.map(s => s.final_score).filter(Boolean) || [];
      const excellentScores = scores.filter(s => s >= 90).length;
      const goodScores = scores.filter(s => s >= 80 && s < 90).length;
      const satisfactoryScores = scores.filter(s => s >= 70 && s < 80).length;
      const needsImprovement = scores.filter(s => s < 70).length;

      // Calculate compliance rate (percentage of conversations with acceptable scores)
      const complianceRate = scores.length > 0
        ? Math.round(((excellentScores + goodScores + satisfactoryScores) / scores.length) * 100)
        : 0;

      // Calculate review response time (mock data - would need actual timestamps)
      const avgReviewTime = completedReviews > 0 ? "2.4 hrs" : "N/A";

      return {
        totalReviewItems,
        pendingReviews,
        completedReviews,
        urgentItems,
        flagReasons,
        complianceRate,
        excellentScores,
        goodScores,
        satisfactoryScores,
        needsImprovement,
        totalScored: scores.length,
        avgReviewTime,
        reviewCompletionRate: totalReviewItems > 0
          ? Math.round((completedReviews / totalReviewItems) * 100)
          : 100,
      };
    },
    refetchInterval: 60000,
  });

  // Fetch top deferral reasons (why AI transfers to humans)
  const { data: deferralReasons = [], isLoading: deferralLoading } = useQuery({
    queryKey: ["deferral-reasons", queryOrgId, selectedPeriod],
    queryFn: () => getTopDeferralReasons(queryOrgId, selectedPeriod),
    refetchInterval: 60000,
  });

  // Loading and error states
  const isLoading = metricsLoading || questionsLoading || sentimentLoading || 
                   featureLoading || scoresLoading || callProfileLoading || trendLoading;

  // Default metrics for fallback
  const defaultMetrics = {
    totalCalls: 0,
    totalVoiceCalls: 0,
    totalTextCalls: 0,
    avgCallDuration: "0 min",
    avgVoiceCallDuration: "0 min",
    avgTextCallDuration: "0 min",
    aiResolutionRate: 0,
    escalationRate: 0,
    flaggedRate: 0,
    avgScore: 0,
    confidence: 0,
    totalTokens: 0,
    tokenCost: 0,
    moneySaved: 0,
    roi: 0,
    servicePlanCost: 0,
    organizationName: "Unknown"
  };

  const getTrendIcon = (trend: string) => {
    if (trend === "up") return <ArrowUp className="h-3 w-3 text-green-500" />;
    if (trend === "down") return <ArrowDown className="h-3 w-3 text-red-500" />;
    return <Minus className="h-3 w-3 text-gray-500" />;
  };

  // Use actual metrics or fallback to defaults
  const metrics = (keyMetrics || defaultMetrics) as AnalyticsMetrics & {
    servicePlanCost?: number;
    organizationName?: string;
  };

  return (
    <TooltipProvider>
      <DashboardLayout userRole={currentRole} userName={user?.full_name || "Unknown User"}>
        <div className="space-y-6">
          {/* Error Alert */}
          {(metricsError || orgsError) && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Failed to load analytics data. Please try refreshing the page.
                {orgsError && " Organization data could not be loaded."}
              </AlertDescription>
            </Alert>
          )}
          {/* Header with Organization Selector */}
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl md:text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                Analytics Dashboard
              </h1>
              <p className="text-sm md:text-base text-muted-foreground mt-2">
                {currentRole === "super_admin" ? "Platform-wide insights and performance metrics" : "Organization performance and ROI insights"}
              </p>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              {currentRole === "super_admin" && (
                <Select value={selectedOrg} onValueChange={setSelectedOrg} disabled={orgsLoading}>
                  <SelectTrigger className="w-full sm:w-[200px]">
                    <SelectValue placeholder={orgsLoading ? "Loading..." : "Select Organization"} />
                  </SelectTrigger>
                  <SelectContent>
                    {organizations && Array.isArray(organizations) && organizations.length > 0 ? organizations.map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.name}
                      </SelectItem>
                    )) : (
                      <SelectItem value="all">All Organizations</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              )}
              
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger className="w-full sm:w-[120px]">
                  <SelectValue placeholder="Period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">7 Days</SelectItem>
                  <SelectItem value="30d">30 Days</SelectItem>
                  <SelectItem value="90d">90 Days</SelectItem>
                </SelectContent>
              </Select>
              

            </div>
          </div>

          {/* Key Performance Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Conversations - Combined */}
            <Card className="bg-gradient-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Conversations</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {metricsLoading ? (
                  <Skeleton className="h-8 w-20" />
                ) : (
                  <div className="text-2xl font-bold">{(metrics.totalCalls ?? 0).toLocaleString()}</div>
                )}
                <p className="text-xs text-muted-foreground">
                  {selectedPeriod === "7d" ? "Last 7 days" : selectedPeriod === "90d" ? "Last 90 days" : "Last 30 days"}
                </p>
              </CardContent>
            </Card>

            {/* Voice Calls */}
            <Card className="bg-gradient-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Voice Calls</CardTitle>
                <Phone className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {metricsLoading ? (
                  <Skeleton className="h-8 w-20" />
                ) : (
                  <>
                    <div className="text-2xl font-bold">{(metrics.totalVoiceCalls ?? 0).toLocaleString()}</div>
                    <p className="text-xs text-muted-foreground">
                      Avg Duration: {metrics.avgVoiceCallDuration ?? "0 min"}
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Text Conversations */}
            <Card className="bg-gradient-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Text Conversations</CardTitle>
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {metricsLoading ? (
                  <Skeleton className="h-8 w-20" />
                ) : (
                  <div className="text-2xl font-bold">{(metrics.totalTextCalls ?? 0).toLocaleString()}</div>
                )}
                <p className="text-xs text-muted-foreground">
                  {selectedPeriod === "7d" ? "Last 7 days" : selectedPeriod === "90d" ? "Last 90 days" : "Last 30 days"}
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">AI Resolution Rate</CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {metricsLoading ? (
                  <Skeleton className="h-8 w-12" />
                ) : (
                  <div className="text-2xl font-bold">{metrics.aiResolutionRate ?? 0}%</div>
                )}
                <p className="text-xs text-muted-foreground">
                  Successfully resolved by AI
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Flagged Rate</CardTitle>
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {metricsLoading ? (
                  <Skeleton className="h-8 w-12" />
                ) : (
                  <div className="text-2xl font-bold">{metrics.flaggedRate ?? 0}%</div>
                )}
                <p className="text-xs text-muted-foreground">
                  Conversations requiring review
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Financial Metrics - Role Specific */}
          {currentRole === "super_admin" ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-gradient-subtle">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Service Plan Revenue</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {metricsLoading ? (
                    <Skeleton className="h-8 w-24" />
                  ) : (
                    <div className="text-2xl font-bold">${(metrics.servicePlanCost ?? 0).toFixed(2)}</div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Monthly service plan revenue
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-subtle">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Internal Processing Cost</CardTitle>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {metricsLoading ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    <div className="text-2xl font-bold">${(metrics.tokenCost ?? 0).toFixed(2)}</div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    GPT-4o + Whisper + Infrastructure
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-subtle">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Platform Margin</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {metricsLoading ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    <div className="text-2xl font-bold">
                      ${((metrics.servicePlanCost ?? 0) - (metrics.tokenCost ?? 0)).toFixed(2)}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Revenue minus operating costs
                  </p>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-gradient-subtle">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Service Investment</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {metricsLoading ? (
                    <Skeleton className="h-8 w-20" />
                  ) : (
                    <div className="text-2xl font-bold">${(metrics.servicePlanCost ?? 0).toFixed(2)}</div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Monthly service plan cost
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-subtle">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Money Saved</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {metricsLoading ? (
                    <Skeleton className="h-8 w-20" />
                  ) : (
                    <div className="text-2xl font-bold">${(metrics.moneySaved ?? 0).toLocaleString()}</div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Compared to human agents
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-subtle">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">ROI</CardTitle>
                  <Target className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {metricsLoading ? (
                    <Skeleton className="h-8 w-12" />
                  ) : (
                    <div className="text-2xl font-bold">{metrics.roi ?? 0}%</div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Return on investment
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Score Distribution */}
            <Card className="lg:col-span-1">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Score Distribution</CardTitle>
                  <Tooltip>
                    <TooltipTrigger>
                      <HelpCircle className="h-4 w-4 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>AI-evaluated performance score range across all conversations</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <CardDescription>Performance score breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                {scoresLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-4 w-12" />
                      </div>
                    ))}
                  </div>
                ) : scoresError ? (
                  <div className="flex items-center justify-center h-32 text-muted-foreground">
                    <div className="text-center">
                      <div className="text-sm text-red-500">Error loading score data</div>
                      <div className="text-xs mt-1">{scoresError.message}</div>
                    </div>
                  </div>
                ) : scoreDistribution && scoreDistribution.length > 0 ? (
                  <div className="space-y-3">
                    {scoreDistribution.map((item, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <div className="text-sm font-medium">{item.range}</div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <div className="text-xs text-muted-foreground w-8">{item.count}</div>
                          <Progress value={item.percentage} className="w-16" />
                          <div className="text-sm text-muted-foreground w-12">{item.percentage}%</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-32 text-muted-foreground">
                    <div className="text-center">
                      <div className="text-sm">No score data available</div>
                      <div className="text-xs mt-1">Start conversations to see score distribution</div>
                      <div className="text-xs mt-1 text-gray-400">
                        Debug: {scoreDistribution ? `Array length: ${scoreDistribution.length}` : 'null/undefined'}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Sentiment Breakdown */}
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-lg">Sentiment Analysis</CardTitle>
                <CardDescription>Customer sentiment distribution</CardDescription>
              </CardHeader>
              <CardContent>
                {sentimentLoading ? (
                  <div className="h-[200px] flex items-center justify-center">
                    <Skeleton className="h-32 w-32 rounded-full" />
                  </div>
                ) : (
                  <div className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsPieChart>
                        <Pie
                          data={sentimentData}
                          cx="50%"
                          cy="50%"
                          innerRadius={40}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {sentimentData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Legend />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Feature Usage */}
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-lg">Feature Usage</CardTitle>
                <CardDescription>Chat vs Voice distribution</CardDescription>
              </CardHeader>
              <CardContent>
                {featureLoading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <div key={i} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Skeleton className="h-4 w-24" />
                          <Skeleton className="h-4 w-12" />
                        </div>
                        <Skeleton className="h-2 w-full" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {featureUsage.map((feature, index) => (
                      <div key={index} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            {feature.name === "Voice Calls" ? (
                              <Phone className="h-4 w-4" style={{ color: feature.color }} />
                            ) : (
                              <MessageSquare className="h-4 w-4" style={{ color: feature.color }} />
                            )}
                            <span className="text-sm font-medium">{feature.name}</span>
                          </div>
                          <span className="text-sm text-muted-foreground">{feature.value.toLocaleString()}</span>
                        </div>
                        <Progress value={feature.percentage} className="h-2" />
                        <div className="text-xs text-muted-foreground">{feature.percentage}% of total</div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Top 10 Questions & Top 10 Deferral Rates */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top 10 Questions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Top 10 Questions ({selectedPeriod === "7d" ? "7 Days" : selectedPeriod === "90d" ? "90 Days" : "30 Days"})</CardTitle>
                <CardDescription>Most frequently asked questions and trends</CardDescription>
              </CardHeader>
              <CardContent>
                {questionsLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                        <div className="flex items-center space-x-3">
                          <Skeleton className="h-4 w-6" />
                          <div className="flex-1 space-y-1">
                            <Skeleton className="h-4 w-48" />
                            <Skeleton className="h-3 w-24" />
                          </div>
                        </div>
                        <Skeleton className="h-4 w-4" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {topQuestions.length > 0 ? (
                      topQuestions.map((item, index) => (
                        <div key={index} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                          <div className="flex items-center space-x-3">
                            <div className="text-sm font-bold text-muted-foreground">#{index + 1}</div>
                            <div className="flex-1">
                              <div className="text-sm font-medium">{item.question}</div>
                              <div className="text-xs text-muted-foreground">{item.count} occurrences</div>
                            </div>
                          </div>
                          <div className="flex items-center">
                            {getTrendIcon(item.trend)}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        No resident questions data available for the selected period
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top 10 Deferral Rates */}
            <Card className="border-orange-500/20">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <PhoneForwarded className="h-5 w-5 text-orange-500" />
                  <CardTitle className="text-lg">Top 10 Deferral Reasons ({selectedPeriod === "7d" ? "7 Days" : selectedPeriod === "90d" ? "90 Days" : "30 Days"})</CardTitle>
                </div>
                <CardDescription>Why AI transfers conversations to human agents</CardDescription>
              </CardHeader>
              <CardContent>
                {deferralLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                        <div className="flex items-center space-x-3">
                          <Skeleton className="h-4 w-6" />
                          <div className="flex-1 space-y-1">
                            <Skeleton className="h-4 w-48" />
                            <Skeleton className="h-3 w-32" />
                          </div>
                        </div>
                        <Skeleton className="h-6 w-12" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {deferralReasons.length > 0 ? (
                      deferralReasons.map((item, index) => (
                        <Tooltip key={index}>
                          <TooltipTrigger asChild>
                            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted/70 transition-colors cursor-help">
                              <div className="flex items-center space-x-3">
                                <div className="text-sm font-bold text-orange-500">#{index + 1}</div>
                                <div className="flex-1">
                                  <div className="text-sm font-medium">{item.reason}</div>
                                  <div className="text-xs text-muted-foreground">{item.count} occurrences</div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300">
                                  {item.percentage}%
                                </Badge>
                              </div>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="max-w-xs">
                            <p>{item.description}</p>
                          </TooltipContent>
                        </Tooltip>
                      ))
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                        <CheckCircle className="h-8 w-8 mb-2 text-green-500" />
                        <p className="text-sm font-medium">No Deferrals</p>
                        <p className="text-xs text-center">AI is successfully handling all conversations without escalation</p>
                      </div>
                    )}
                  </div>
                )}
                {deferralReasons.length > 0 && (
                  <div className="mt-4 p-3 bg-orange-50 dark:bg-orange-950/20 rounded-lg">
                    <div className="text-sm">
                      <strong>Insight:</strong> Understanding deferral patterns helps improve AI training and reduce human intervention costs.
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Call Profile */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Call Profile */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Call Profile - Business Hours</CardTitle>
                <CardDescription>
                  {metricsLoading ? (
                    "Loading call profile data..."
                  ) : (
                    <>
                      {metrics.totalCalls.toLocaleString()} calls, avg {metrics.avgCallDuration} per call
                      <br />
                      <strong>Peak:</strong> {callProfile.length > 0 ? 
                        callProfile.reduce((max, curr) => curr.calls > max.calls ? curr : max).hour : "N/A"}
                    </>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {callProfileLoading ? (
                  <div className="h-[200px] flex items-center justify-center">
                    <Skeleton className="h-full w-full" />
                  </div>
                ) : (
                  <div className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={callProfile}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="hour" />
                        <YAxis />
                        <Bar dataKey="calls" fill="#8B5CF6" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                  <div className="text-sm">
                    <strong>Insight:</strong> Busiest time is Tuesdays at 2 PM, primarily about order tracking and account issues.
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Additional Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Escalation Rate</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {metricsLoading ? (
                  <Skeleton className="h-8 w-12" />
                ) : (
                  <div className="text-2xl font-bold">{metrics.escalationRate}%</div>
                )}
                <p className="text-xs text-muted-foreground">
                  Calls passed to human agents
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Score</CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {metricsLoading ? (
                  <Skeleton className="h-8 w-12" />
                ) : (
                  <div className="text-2xl font-bold">{metrics.avgScore}%</div>
                )}
                <p className="text-xs text-muted-foreground">
                  Average conversation score
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Confidence Level</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {metricsLoading ? (
                  <Skeleton className="h-8 w-12" />
                ) : (
                  <div className="text-2xl font-bold">{metrics.confidence}%</div>
                )}
                <p className="text-xs text-muted-foreground">
                  AI confidence in responses
                </p>
              </CardContent>
            </Card>

            {currentRole === "super_admin" && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Internal Cost per Conversation</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {metricsLoading ? (
                    <Skeleton className="h-8 w-12" />
                  ) : (
                    <div className="text-2xl font-bold">
                      ${(() => {
                        const costPerConv = metrics.totalCalls > 0 && metrics.tokenCost > 0
                          ? metrics.tokenCost / metrics.totalCalls
                          : 0;
                        
                        // Show different precision based on cost size
                        if (costPerConv >= 1) {
                          return costPerConv.toFixed(2);
                        } else if (costPerConv >= 0.01) {
                          return costPerConv.toFixed(3);
                        } else if (costPerConv > 0) {
                          return costPerConv.toFixed(4);
                        } else {
                          return "0.000";
                        }
                      })()}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Internal processing cost per conversation
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Trend Analysis */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Performance Trends</CardTitle>
              <CardDescription>Score, confidence, and {currentRole === "super_admin" ? "token usage" : "cost efficiency"} over time</CardDescription>
            </CardHeader>
            <CardContent>
              {trendLoading ? (
                <div className="h-[300px] flex items-center justify-center">
                  <Skeleton className="h-full w-full" />
                </div>
              ) : (
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      {currentRole === "super_admin" && (
                        <YAxis yAxisId="right" orientation="right" />
                      )}
                      <Line 
                        type="monotone" 
                        dataKey="score" 
                        stroke="#8B5CF6" 
                        strokeWidth={2}
                        name="Score (%)"
                      />
                      <Line 
                        type="monotone" 
                        dataKey="confidence" 
                        stroke="#06B6D4" 
                        strokeWidth={2}
                        name="Confidence (%)"
                      />
                      {currentRole === "super_admin" && (
                        <Line 
                          type="monotone" 
                          dataKey="tokens" 
                          stroke="#EF4444" 
                          strokeWidth={2}
                          name="Tokens (K)"
                          yAxisId="right"
                        />
                      )}
                      <Legend />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Cost-to-Performance Analysis */}
          {currentRole === "super_admin" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Cost-to-Performance Analysis</CardTitle>
                <CardDescription>Relationship between spending and conversation quality</CardDescription>
              </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Internal Cost per High-Quality Conversation</span>
                    <span className="text-sm font-bold">
                      ${(() => {
                        const highQualityConversations = Math.round(metrics.totalCalls * (metrics.avgScore / 100));
                        return highQualityConversations > 0
                          ? ((metrics.tokenCost || 0) / highQualityConversations).toFixed(3)
                          : "0.000";
                      })()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Revenue vs Cost Ratio</span>
                    <span className="text-sm font-bold">
                      {(() => {
                        const ratio = (metrics.tokenCost || 0) > 0
                          ? ((metrics.servicePlanCost || 0) / (metrics.tokenCost || 1))
                          : 0;
                        return `${ratio.toFixed(1)}:1`;
                      })()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Platform Efficiency</span>
                    <Badge variant="default" className="bg-green-100 text-green-800">
                      {(() => {
                        const margin = ((metrics.servicePlanCost || 0) - (metrics.tokenCost || 0)) / (metrics.servicePlanCost || 1) * 100;
                        if (margin > 70) return "Excellent";
                        if (margin > 50) return "Good";
                        if (margin > 30) return "Fair";
                        return "Needs Improvement";
                      })()}
                    </Badge>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium mb-2">Financial Health Indicators</div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs">Service plan utilization</span>
                      <span className="text-xs font-medium">
                        {(() => {
                          const utilization = metrics.totalCalls > 0 ? Math.min(100, (metrics.totalCalls / 1000) * 100) : 0;
                          return `${utilization.toFixed(1)}%`;
                        })()}
                      </span>
                    </div>
                    <Progress value={(() => {
                      const utilization = metrics.totalCalls > 0 ? Math.min(100, (metrics.totalCalls / 1000) * 100) : 0;
                      return utilization;
                    })()} className="h-2" />

                    <div className="flex items-center justify-between">
                      <span className="text-xs">Profit margin</span>
                      <span className="text-xs font-medium">
                        {(() => {
                          const margin = ((metrics.servicePlanCost || 0) - (metrics.tokenCost || 0)) / (metrics.servicePlanCost || 1) * 100;
                          return `${Math.max(0, margin).toFixed(1)}%`;
                        })()}
                      </span>
                    </div>
                    <Progress value={(() => {
                      const margin = ((metrics.servicePlanCost || 0) - (metrics.tokenCost || 0)) / (metrics.servicePlanCost || 1) * 100;
                      return Math.max(0, Math.min(100, margin));
                    })()} className="h-2" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          )}

          {/* Governance & Compliance Section */}
          <Card className="border-2 border-primary/20">
            <CardHeader className="bg-gradient-to-r from-primary/5 to-primary/10">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Governance & Compliance Dashboard</CardTitle>
              </div>
              <CardDescription>
                Monitor quality assurance, compliance metrics, and review queue status
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              {governanceLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))}
                </div>
              ) : (
                <>
                  {/* Governance KPIs */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <Card className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-500/20">
                      <CardContent className="pt-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-muted-foreground">Compliance Rate</p>
                            <p className="text-2xl font-bold text-green-600">
                              {governanceMetrics?.complianceRate || 0}%
                            </p>
                          </div>
                          <div className="h-10 w-10 rounded-full bg-green-500/20 flex items-center justify-center">
                            <ClipboardCheck className="h-5 w-5 text-green-600" />
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          Conversations meeting quality standards
                        </p>
                      </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border-blue-500/20">
                      <CardContent className="pt-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-muted-foreground">Review Completion</p>
                            <p className="text-2xl font-bold text-blue-600">
                              {governanceMetrics?.reviewCompletionRate || 100}%
                            </p>
                          </div>
                          <div className="h-10 w-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                            <FileCheck className="h-5 w-5 text-blue-600" />
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          {governanceMetrics?.completedReviews || 0} of {governanceMetrics?.totalReviewItems || 0} reviews completed
                        </p>
                      </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-orange-500/10 to-amber-500/10 border-orange-500/20">
                      <CardContent className="pt-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-muted-foreground">Pending Reviews</p>
                            <p className="text-2xl font-bold text-orange-600">
                              {governanceMetrics?.pendingReviews || 0}
                            </p>
                          </div>
                          <div className="h-10 w-10 rounded-full bg-orange-500/20 flex items-center justify-center">
                            <Eye className="h-5 w-5 text-orange-600" />
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          Awaiting manual review
                        </p>
                      </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-red-500/10 to-rose-500/10 border-red-500/20">
                      <CardContent className="pt-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-muted-foreground">Urgent Items</p>
                            <p className="text-2xl font-bold text-red-600">
                              {governanceMetrics?.urgentItems || 0}
                            </p>
                          </div>
                          <div className="h-10 w-10 rounded-full bg-red-500/20 flex items-center justify-center">
                            <Flag className="h-5 w-5 text-red-600" />
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          High priority issues requiring attention
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Quality Score Breakdown and Flag Reasons */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Quality Score Distribution */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <Gauge className="h-4 w-4" />
                          Quality Score Distribution
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-green-500" />
                              <span className="text-sm">Excellent (90+)</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{governanceMetrics?.excellentScores || 0}</span>
                              <Progress
                                value={governanceMetrics?.totalScored ? ((governanceMetrics.excellentScores || 0) / governanceMetrics.totalScored) * 100 : 0}
                                className="w-20 h-2"
                              />
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-blue-500" />
                              <span className="text-sm">Good (80-89)</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{governanceMetrics?.goodScores || 0}</span>
                              <Progress
                                value={governanceMetrics?.totalScored ? ((governanceMetrics.goodScores || 0) / governanceMetrics.totalScored) * 100 : 0}
                                className="w-20 h-2"
                              />
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-yellow-500" />
                              <span className="text-sm">Satisfactory (70-79)</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{governanceMetrics?.satisfactoryScores || 0}</span>
                              <Progress
                                value={governanceMetrics?.totalScored ? ((governanceMetrics.satisfactoryScores || 0) / governanceMetrics.totalScored) * 100 : 0}
                                className="w-20 h-2"
                              />
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-red-500" />
                              <span className="text-sm">Needs Improvement (&lt;70)</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{governanceMetrics?.needsImprovement || 0}</span>
                              <Progress
                                value={governanceMetrics?.totalScored ? ((governanceMetrics.needsImprovement || 0) / governanceMetrics.totalScored) * 100 : 0}
                                className="w-20 h-2"
                              />
                            </div>
                          </div>
                        </div>
                        <div className="mt-4 pt-4 border-t">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Total Scored Conversations</span>
                            <span className="font-medium">{governanceMetrics?.totalScored || 0}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Flag Reasons Breakdown */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <Flag className="h-4 w-4" />
                          Flag Reasons Breakdown
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {governanceMetrics?.flagReasons && Object.keys(governanceMetrics.flagReasons).length > 0 ? (
                          <div className="space-y-3">
                            {Object.entries(governanceMetrics.flagReasons)
                              .sort((a, b) => b[1] - a[1])
                              .slice(0, 5)
                              .map(([reason, count], index) => (
                                <div key={index} className="flex items-center justify-between">
                                  <span className="text-sm truncate max-w-[200px]">{reason}</span>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="secondary">{count}</Badge>
                                    <Progress
                                      value={(count / (governanceMetrics.totalReviewItems || 1)) * 100}
                                      className="w-16 h-2"
                                    />
                                  </div>
                                </div>
                              ))}
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                            <CheckCircle className="h-8 w-8 mb-2 text-green-500" />
                            <p className="text-sm">No flagged items</p>
                            <p className="text-xs">All conversations within acceptable parameters</p>
                          </div>
                        )}
                        <div className="mt-4 pt-4 border-t">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Avg. Review Response Time</span>
                            <span className="font-medium">{governanceMetrics?.avgReviewTime || "N/A"}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Governance Insight */}
                  <div className="mt-6 p-4 bg-primary/5 rounded-lg border border-primary/10">
                    <div className="flex items-start gap-3">
                      <Scale className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <h4 className="font-medium text-sm">Governance Insight</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          {governanceMetrics?.complianceRate && governanceMetrics.complianceRate >= 90
                            ? "Excellent compliance rate! Your AI assistants are maintaining high quality standards across conversations."
                            : governanceMetrics?.complianceRate && governanceMetrics.complianceRate >= 70
                            ? "Good compliance rate. Consider reviewing flagged conversations to identify areas for prompt improvement."
                            : "Compliance rate needs attention. Review the flagged conversations and consider updating assistant prompts or knowledge bases."}
                          {governanceMetrics?.urgentItems && governanceMetrics.urgentItems > 0 &&
                            ` There are ${governanceMetrics.urgentItems} urgent items requiring immediate attention.`}
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    </TooltipProvider>
  );
}
