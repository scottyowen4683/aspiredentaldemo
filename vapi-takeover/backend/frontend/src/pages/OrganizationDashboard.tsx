/*
 * Organization Dashboard - CLIENT-FACING VIEW
 * 
 * This dashboard shows service plan value and ROI from the client's perspective.
 * All costs are based on the service plan they pay for, NOT internal AI costs.
 * 
 * Key Metrics:
 * - Cost per Conversation: Based on their monthly service fee / conversation volume
 * - Savings: Compared to baseline human cost per call (set during onboarding)
 * - ROI: (Total Savings / Service Plan Investment) * 100
 * 
 * Internal costs (LLM, TTS/STT, platform tokens) are hidden from this view.
 */

import React, { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { MetricsOverview } from "@/components/dashboard/MetricsOverview";
import { TrendsChart } from "@/components/dashboard/Charts";
import { useUser } from "@/context/UserContext";
import { useOrganizationMetrics } from "@/hooks/useOrganizationMetrics";
import { useAssistantPerformance, useCostAnalytics } from "@/hooks/useAssistantPerformance";
import { useClientCostMetrics } from "@/hooks/useClientCostMetrics";
import { useResidentQuestions } from "@/hooks/useResidentQuestions";
import { useOrganizationInfo } from "@/hooks/useOrganizationInfo";
import { supabase } from "@/supabaseClient";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  RefreshCw, 
  AlertTriangle, 
  TrendingUp,
  BarChart3,
  DollarSign,
  Zap,
  PiggyBank,
  MessageSquare,
  Settings,
  Clock
} from "lucide-react";

export default function OrganizationDashboard() {
  const { user } = useUser();
  const { orgId } = useParams<{ orgId?: string }>();
  const navigate = useNavigate();

  // Determine which org_id to use
  const effectiveOrgId = orgId || user?.org_id || null;

  // Handle role-based access control and redirects
  useEffect(() => {
    if (!user) return; // Still loading user data

    // Org admins should access their own dashboard only
    if (user.role === "org_admin" && !effectiveOrgId) {
      console.log("Org admin without org_id, logging out");
      const logout = async () => {
        await supabase.auth.signOut();
        navigate("/auth", { replace: true });
      };
      logout();
      return;
    }

    // Super admins viewing specific org should use SuperAdminOrganizationDashboard
    if (user.role === "super_admin" && orgId) {
      navigate(`/admin/organization/${orgId}`, { replace: true });
      return;
    }

    // Super admin without orgId should go to organizations list
    if (user.role === "super_admin" && !effectiveOrgId) {
      console.log("Super admin without org_id, redirecting to organizations page");
      navigate("/organizations", { replace: true });
      return;
    }
  }, [user, effectiveOrgId, orgId, navigate]);

  // Show loading if user is not loaded yet
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Don't render anything if we're in the process of redirecting
  if ((user.role === "super_admin" && !effectiveOrgId) || 
      (user.role === "org_admin" && !effectiveOrgId) ||
      (user.role === "super_admin" && orgId)) {
    return null;
  }
  
  // Fetch real-time data using custom hooks with the effective org_id
  const { metrics, loading: metricsLoading, error: metricsError } = useOrganizationMetrics(effectiveOrgId);
  const { assistants, loading: assistantsLoading, error: assistantsError } = useAssistantPerformance(effectiveOrgId, 30);
  const { costData, totalCost, loading: costLoading, error: costError } = useCostAnalytics(effectiveOrgId, 30);
  
  // Get client-facing cost metrics
  const { plan: organizationPlan, metrics: clientMetrics, loading: clientLoading, error: clientError } = useClientCostMetrics(
    effectiveOrgId, 
    metrics?.conversationsThisMonth || 0
  );

  // Get organization info including service plan details
  const { organization: organizationInfo, loading: orgInfoLoading, error: orgInfoError } = useOrganizationInfo(effectiveOrgId);

  // Get top resident questions
  const { questions: residentQuestions, loading: questionsLoading, error: questionsError } = useResidentQuestions(
    effectiveOrgId,
    "30d",
    10
  );

  // Generate chart data from metrics - focusing on value delivered, not costs
  const chartData = costData?.map(day => ({
    date: day.date,
    conversations: day.conversationCount,
    avgScore: assistants.length > 0 
      ? assistants.reduce((sum, a) => sum + a.avgScore, 0) / assistants.length 
      : 0,
    estimatedSavings: clientMetrics ? day.conversationCount * clientMetrics.savingsPerConversation : 0
  })) || [];

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <DashboardLayout userRole="org_admin" userName={user?.full_name ?? user?.email ?? "Org Admin"}>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl md:text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">
              {organizationInfo?.name || 'Organization'} Dashboard
            </h1>
            <p className="text-sm md:text-base text-muted-foreground mt-2">
              Service plan performance and value delivered
              {organizationInfo?.service_plan_name && (
                <span className="ml-2 text-primary">• {organizationInfo.service_plan_name}</span>
              )}
            </p>
          </div>
          
          <div className="flex items-center space-x-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              className="flex items-center space-x-2"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Refresh</span>
            </Button>
          </div>
        </div>

        {/* Alerts - Show if there are critical issues */}
        {(metricsError || assistantsError || costError || clientError || questionsError || orgInfoError) && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Data Loading Issues</AlertTitle>
            <AlertDescription>
              Some dashboard data could not be loaded. Please check your connection and try refreshing the page.
              {clientError && <div className="mt-1 text-xs">Client metrics error: {clientError}</div>}
            </AlertDescription>
          </Alert>
        )}

        {/* Client-Facing Value Metrics */}
        <div className="grid gap-4 sm:gap-6 grid-cols-2 md:grid-cols-4">
          <Card className="shadow-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Service Plan</CardTitle>
              <Settings className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {organizationInfo?.service_plan_name || 'Default Plan'}
              </div>
              <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>
                  {organizationInfo?.coverage_hours === '24hr' ? '24hr' : '12hr'} coverage
                </span>
              </div>
              {organizationInfo?.time_zone && (
                <p className="text-xs text-muted-foreground mt-1">
                  {organizationInfo.time_zone}
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Service Plan Value</CardTitle>
              <DollarSign className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {clientLoading ? (
                  <div className="animate-pulse bg-muted h-8 w-16 rounded"></div>
                ) : (
                  `$${organizationPlan?.monthlyPlanCost?.toLocaleString() || '0'}`
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Monthly investment
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {(clientMetrics?.totalMonthlySavings || 0) >= 0 ? 'Monthly Savings' : 'Monthly Cost Difference'}
              </CardTitle>
              <PiggyBank className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${(clientMetrics?.totalMonthlySavings || 0) >= 0 ? 'text-success' : 'text-destructive'}`}>
                {clientLoading ? (
                  <div className="animate-pulse bg-muted h-8 w-20 rounded"></div>
                ) : (
                  `${(clientMetrics?.totalMonthlySavings || 0) >= 0 ? '+' : ''}$${clientMetrics?.totalMonthlySavings?.toLocaleString() || '0'}`
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Compared to human agents
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">ROI</CardTitle>
              <Zap className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${(clientMetrics?.roi || 0) >= 0 ? 'text-success' : 'text-destructive'}`}>
                {clientLoading ? (
                  <div className="animate-pulse bg-muted h-8 w-12 rounded"></div>
                ) : (
                  `${clientMetrics?.roi ? clientMetrics.roi.toFixed(0) : 0}%`
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Return on investment
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main Metrics Overview */}
        <MetricsOverview 
          metrics={metrics} 
          loading={metricsLoading} 
          error={metricsError} 
        />

        {/* Dashboard Tabs */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="overview" className="flex items-center space-x-2">
              <TrendingUp className="h-4 w-4" />
              <span>Overview</span>
            </TabsTrigger>
            <TabsTrigger value="value" className="flex items-center space-x-2">
              <BarChart3 className="h-4 w-4" />
              <span>Value & ROI</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Top 10 Resident Questions */}
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <MessageSquare className="mr-2 h-5 w-5" />
                  Top 10 Resident Questions
                </CardTitle>
                <CardDescription>Most frequently asked questions this month</CardDescription>
              </CardHeader>
              <CardContent>
                {questionsLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="h-12 bg-muted rounded animate-pulse" />
                    ))}
                  </div>
                  ) : questionsError ? (
                    <div className="text-center py-8">
                      <AlertTriangle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Unable to load questions data</p>
                    </div>
                  ) : residentQuestions.length === 0 ? (
                    <div className="text-center py-8">
                      <MessageSquare className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">No questions data available yet</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {residentQuestions.map((question, index) => (
                        <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-gradient-subtle hover:bg-muted/50 transition-colors">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2 mb-1">
                              <Badge variant="outline" className="text-xs">
                                #{index + 1}
                              </Badge>
                              <span className="text-sm font-medium text-foreground truncate">
                                {question.question}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2 flex-shrink-0">
                            <Badge variant="secondary" className="text-xs">
                              {question.count} times
                            </Badge>
                            {question.trend === "up" && (
                              <TrendingUp className="h-3 w-3 text-success" />
                            )}
                            {question.trend === "down" && (
                              <TrendingUp className="h-3 w-3 text-destructive rotate-180" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
          </TabsContent>

          <TabsContent value="value" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <TrendsChart
                data={chartData.map(day => ({ ...day, totalCost: day.estimatedSavings }))}
                loading={metricsLoading}
                error={metricsError}
                chartType="line"
                showCost={false}
                showScore={true}
                showConversations={true}
              />
              
              {/* Value Metrics Breakdown */}
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle>Value Delivered</CardTitle>
                  <CardDescription>Your AI investment impact</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Service Plan Investment</span>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm">${organizationPlan?.monthlyPlanCost?.toLocaleString() || '0'}</span>
                        <Badge variant="outline">Monthly</Badge>
                      </div>
                    </div>
                    <Progress value={100} className="h-2" />
                    
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Estimated Savings</span>
                      <div className="flex items-center space-x-2">
                        <span className={`text-sm ${(clientMetrics?.totalMonthlySavings || 0) >= 0 ? 'text-success' : 'text-destructive'}`}>
                          {(clientMetrics?.totalMonthlySavings || 0) >= 0 ? '+' : ''}${clientMetrics?.totalMonthlySavings?.toLocaleString() || '0'}
                        </span>
                        <Badge variant={`${(clientMetrics?.roi || 0) >= 0 ? 'secondary' : 'destructive'}`}>
                          {clientMetrics?.roi ? clientMetrics.roi.toFixed(0) : 0}% ROI
                        </Badge>
                      </div>
                    </div>
                    <Progress 
                      value={clientMetrics?.roi ? Math.min(Math.abs(clientMetrics.roi), 100) : 0} 
                      className={`h-2 ${(clientMetrics?.roi || 0) < 0 ? '[&>div]:bg-destructive' : ''}`} 
                    />
                    
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Cost Efficiency</span>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm">${clientMetrics?.costPerConversation ? clientMetrics.costPerConversation.toFixed(2) : '0.00'} per call</span>
                        <Badge variant="outline">vs ${organizationInfo?.baseline_human_cost_per_call || organizationPlan?.baselineHumanCostPerCall || 0}</Badge>
                      </div>
                    </div>
                    <Progress value={clientMetrics && (organizationInfo?.baseline_human_cost_per_call || organizationPlan?.baselineHumanCostPerCall) ? 
                      (clientMetrics.costPerConversation / (organizationInfo?.baseline_human_cost_per_call || organizationPlan?.baselineHumanCostPerCall || 1)) * 100 : 0} 
                      className="h-2" 
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
            
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle>Performance Summary</CardTitle>
                <CardDescription>Key insights and value delivered</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="p-4 rounded-lg bg-gradient-subtle">
                    <h4 className="font-semibold text-foreground mb-2">Top Performer</h4>
                    {assistants.length > 0 ? (
                      <div>
                        <p className="text-sm text-muted-foreground">
                          {assistants.sort((a, b) => b.avgScore - a.avgScore)[0]?.friendlyName || 'N/A'}
                        </p>
                        <p className="text-lg font-bold text-success">
                          {assistants.sort((a, b) => b.avgScore - a.avgScore)[0]?.avgScore || 0}% avg score
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No assistants available</p>
                    )}
                  </div>
                  
                  <div className="p-4 rounded-lg bg-gradient-subtle">
                    <h4 className="font-semibold text-foreground mb-2">Most Active</h4>
                    {assistants.length > 0 ? (
                      <div>
                        <p className="text-sm text-muted-foreground">
                          {assistants.sort((a, b) => b.totalConversations - a.totalConversations)[0]?.friendlyName || 'N/A'}
                        </p>
                        <p className="text-lg font-bold text-primary">
                          {assistants.sort((a, b) => b.totalConversations - a.totalConversations)[0]?.totalConversations || 0} conversations
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No assistants available</p>
                    )}
                  </div>
                  
                  <div className="p-4 rounded-lg bg-gradient-subtle">
                    <h4 className="font-semibold text-foreground mb-2">Monthly Value</h4>
                    <p className="text-sm text-muted-foreground">Total savings delivered</p>
                    <p className={`text-lg font-bold ${(clientMetrics?.totalMonthlySavings || 0) >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {(clientMetrics?.totalMonthlySavings || 0) >= 0 ? '+' : ''}${clientMetrics?.totalMonthlySavings?.toLocaleString() || '0'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

