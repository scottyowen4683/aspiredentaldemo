import React, { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { MetricsOverview } from "@/components/dashboard/MetricsOverview";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { AssistantPerformance } from "@/components/dashboard/AssistantPerformance";
import { CostTracker } from "@/components/dashboard/CostTracker";
import { TrendsChart, CostBreakdownChart } from "@/components/dashboard/Charts";
import { useUser } from "@/context/UserContext";
import { useOrganizationMetrics, useRecentActivity } from "@/hooks/useOrganizationMetrics";
import { useAssistantPerformance, useCostAnalytics } from "@/hooks/useAssistantPerformance";
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
  Users,
  DollarSign,
  Cpu,
  Server,
  Zap,
  Clock
} from "lucide-react";

export default function SuperAdminOrganizationDashboard() {
  const { user } = useUser();
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();

  // Handle role-based access control
  useEffect(() => {
    if (!user) return;

    // Only super_admin can access this page
    if (user.role !== "super_admin") {
      navigate("/dashboard", { replace: true });
      return;
    }

    // orgId is required for this page
    if (!orgId) {
      navigate("/organizations", { replace: true });
      return;
    }
  }, [user, orgId, navigate]);

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

  // Don't render if not super admin or no orgId
  if (user.role !== "super_admin" || !orgId) {
    return null;
  }
  
  // Fetch real-time data using custom hooks
  const { metrics, loading: metricsLoading, error: metricsError } = useOrganizationMetrics(orgId);
  const { activities, loading: activitiesLoading, error: activitiesError } = useRecentActivity(orgId, 10);
  const { assistants, loading: assistantsLoading, error: assistantsError } = useAssistantPerformance(orgId, 30);
  const { costData, totalCost, loading: costLoading, error: costError } = useCostAnalytics(orgId, 30);

  // Generate chart data from metrics
  const chartData = costData?.map(day => ({
    date: day.date,
    conversations: day.conversationCount,
    avgScore: assistants.length > 0 
      ? assistants.reduce((sum, a) => sum + a.avgScore, 0) / assistants.length 
      : 0,
    totalCost: day.totalCost
  })) || [];

  // Calculate detailed cost breakdown for internal analysis
  const detailedCostBreakdown = costData?.length > 0 ? {
    llm: costData.reduce((sum, day) => sum + day.llmCost, 0),
    ttsStC: costData.reduce((sum, day) => sum + day.ttsStCost, 0),
    platform: costData.reduce((sum, day) => sum + (day.platformCost || 0), 0),
    other: costData.reduce((sum, day) => sum + (day.totalCost - day.llmCost - day.ttsStCost - (day.platformCost || 0)), 0)
  } : { llm: 0, ttsStC: 0, platform: 0, other: 0 };

  const costBreakdownPercentages = totalCost > 0 ? {
    llm: Math.round((detailedCostBreakdown.llm / totalCost) * 100),
    ttsStC: Math.round((detailedCostBreakdown.ttsStC / totalCost) * 100),
    platform: Math.round((detailedCostBreakdown.platform / totalCost) * 100),
    other: Math.round((detailedCostBreakdown.other / totalCost) * 100)
  } : { llm: 0, ttsStC: 0, platform: 0, other: 0 };

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <DashboardLayout userRole="super_admin" userName={user?.full_name ?? user?.email ?? "Super Admin"}>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">
              Internal Organization Analytics
            </h1>
            <p className="text-muted-foreground mt-2">
              Detailed cost analysis and technical metrics for organization: {orgId.slice(0, 8)}...
            </p>
          </div>
          
          <div className="flex items-center space-x-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/organizations")}
              className="flex items-center space-x-2"
            >
              <span>← Back to Organizations</span>
            </Button>
            
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

        {/* Alerts */}
        {(metricsError || activitiesError || assistantsError || costError) && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Data Loading Issues</AlertTitle>
            <AlertDescription>
              Some dashboard data could not be loaded. Please check your connection and try refreshing the page.
            </AlertDescription>
          </Alert>
        )}

        {/* Main Metrics Overview */}
        <MetricsOverview 
          metrics={metrics} 
          loading={metricsLoading} 
          error={metricsError} 
        />

        {/* Internal Cost Analysis */}
        <div className="grid gap-6 md:grid-cols-4">
          <Card className="shadow-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">LLM Costs</CardTitle>
              <Cpu className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${detailedCostBreakdown.llm.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">
                {costBreakdownPercentages.llm}% of total spend
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">TTS/STT Costs</CardTitle>
              <Zap className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${detailedCostBreakdown.ttsStC.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">
                {costBreakdownPercentages.ttsStC}% of total spend
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Platform Costs</CardTitle>
              <Server className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${detailedCostBreakdown.platform.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">
                {costBreakdownPercentages.platform}% of total spend
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total API Spend</CardTitle>
              <DollarSign className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${totalCost.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">
                This month
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Dashboard Tabs */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview" className="flex items-center space-x-2">
              <TrendingUp className="h-4 w-4" />
              <span>Overview</span>
            </TabsTrigger>
            <TabsTrigger value="assistants" className="flex items-center space-x-2">
              <Users className="h-4 w-4" />
              <span>Assistants</span>
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center space-x-2">
              <BarChart3 className="h-4 w-4" />
              <span>Analytics</span>
            </TabsTrigger>
            <TabsTrigger value="costs" className="flex items-center space-x-2">
              <DollarSign className="h-4 w-4" />
              <span>Internal Costs</span>
            </TabsTrigger>
            <TabsTrigger value="technical" className="flex items-center space-x-2">
              <Server className="h-4 w-4" />
              <span>Technical</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <ActivityFeed 
              activities={activities} 
              loading={activitiesLoading} 
              error={activitiesError} 
            />
          </TabsContent>

          <TabsContent value="assistants" className="space-y-6">
            <AssistantPerformance
              assistants={assistants}
              loading={assistantsLoading}
              error={assistantsError}
            />
          </TabsContent>

          <TabsContent value="analytics" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <TrendsChart
                data={chartData}
                loading={metricsLoading}
                error={metricsError}
                chartType="line"
                showCost={true}
                showScore={true}
                showConversations={true}
              />
              
              <CostBreakdownChart
                data={costBreakdownPercentages}
                loading={costLoading}
              />
            </div>
            
            {/* Detailed Performance Analysis */}
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle>Performance & Profitability Analysis</CardTitle>
                <CardDescription>Internal metrics for cost optimization</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="p-4 rounded-lg bg-gradient-subtle">
                    <h4 className="font-semibold text-foreground mb-2">Cost Efficiency</h4>
                    <p className="text-sm text-muted-foreground">Cost per conversation</p>
                    <p className="text-lg font-bold text-primary">
                      ${metrics?.totalConversations ? (totalCost / metrics.totalConversations).toFixed(3) : '0.00'}
                    </p>
                  </div>
                  
                  <div className="p-4 rounded-lg bg-gradient-subtle">
                    <h4 className="font-semibold text-foreground mb-2">Token Efficiency</h4>
                    <p className="text-sm text-muted-foreground">Avg cost per conversation</p>
                    <p className="text-lg font-bold text-success">
                      ${metrics?.totalConversations ? (detailedCostBreakdown.llm / metrics.totalConversations).toFixed(3) : '0.00'}
                    </p>
                  </div>
                  
                  <div className="p-4 rounded-lg bg-gradient-subtle">
                    <h4 className="font-semibold text-foreground mb-2">Monthly Burn Rate</h4>
                    <p className="text-sm text-muted-foreground">API spend trend</p>
                    <p className="text-lg font-bold text-warning">
                      ${totalCost.toFixed(2)}/month
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="costs" className="space-y-6">
            <CostTracker
              costData={costData}
              totalCost={totalCost}
              loading={costLoading}
              error={costError}
              costLimit={1000}
            />
            
            {/* Detailed Cost Breakdown */}
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle>Detailed API Cost Analysis</CardTitle>
                <CardDescription>Breakdown of all service costs</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">LLM (GPT-4o) Usage</span>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm">${detailedCostBreakdown.llm.toFixed(2)}</span>
                      <Badge variant="outline">{costBreakdownPercentages.llm}%</Badge>
                    </div>
                  </div>
                  <Progress value={costBreakdownPercentages.llm} className="h-2" />
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">TTS/STT Services</span>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm">${detailedCostBreakdown.ttsStC.toFixed(2)}</span>
                      <Badge variant="outline">{costBreakdownPercentages.ttsStC}%</Badge>
                    </div>
                  </div>
                  <Progress value={costBreakdownPercentages.ttsStC} className="h-2" />
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Platform Services</span>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm">${detailedCostBreakdown.platform.toFixed(2)}</span>
                      <Badge variant="outline">{costBreakdownPercentages.platform}%</Badge>
                    </div>
                  </div>
                  <Progress value={costBreakdownPercentages.platform} className="h-2" />
                  
                  {detailedCostBreakdown.other > 0 && (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Other Services</span>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm">${detailedCostBreakdown.other.toFixed(2)}</span>
                          <Badge variant="outline">{costBreakdownPercentages.other}%</Badge>
                        </div>
                      </div>
                      <Progress value={costBreakdownPercentages.other} className="h-2" />
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="technical" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Clock className="mr-2 h-5 w-5" />
                    Performance Metrics
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Avg Response Time</span>
                      <span className="font-medium">{metrics?.avgResponseTime || 0}s</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Conversation Score</span>
                      <span className="font-medium">{metrics?.avgScore || 0}%</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Total Conversations</span>
                      <span className="font-medium">{metrics?.totalConversations?.toLocaleString() || 0}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Monthly Cost</span>
                      <span className="font-medium">${metrics?.totalCostThisMonth || 0}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Server className="mr-2 h-5 w-5" />
                    System Health
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Active Assistants</span>
                      <Badge variant="outline">{assistants.filter(a => !a.pauseAutoScore).length}</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Flagged Rate</span>
                      <Badge variant={metrics?.flaggedConversations > 10 ? "destructive" : "outline"}>
                        {metrics?.flaggedConversations || 0}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Flagged Conversations</span>
                      <Badge variant={metrics?.flaggedConversations > 10 ? "secondary" : "outline"}>
                        {metrics?.flaggedConversations || 0}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}