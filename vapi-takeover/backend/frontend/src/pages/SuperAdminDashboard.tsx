import React, { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  MessageSquare, 
  Bot, 
  Flag, 
  TrendingUp, 
  DollarSign, 
  Clock,
  Building,
  Users,
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Eye,
  BarChart3,
  Server,
  Zap,
  Globe,
  Settings,
  ArrowUp,
  ArrowDown,
  Minus
} from "lucide-react";
import { useUser } from "@/context/UserContext";
import { useSuperAdminMetrics, useOrganizationSummaries, useSuperAdminRecentActivity } from "@/hooks/useSuperAdminMetrics";
import { useNavigate } from "react-router-dom";

export default function SuperAdminDashboard() {
  const { user } = useUser();
  const navigate = useNavigate();
  const [refreshing, setRefreshing] = useState(false);

  // Fetch real-time data
  const { data: metrics, isLoading: metricsLoading, error: metricsError, refetch: refetchMetrics } = useSuperAdminMetrics();
  const { data: organizations, isLoading: orgsLoading, error: orgsError, refetch: refetchOrgs } = useOrganizationSummaries();
  const { data: recentActivities, isLoading: activitiesLoading, error: activitiesError, refetch: refetchActivities } = useSuperAdminRecentActivity(10);

  // Handle refresh all data
  const handleRefreshAll = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refetchMetrics(),
        refetchOrgs(),
        refetchActivities()
      ]);
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setRefreshing(false);
    }
  };

  // Helper functions
  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return num.toString();
  };

  const getTrendIcon = (value: number) => {
    if (value > 0) return <ArrowUp className="h-3 w-3 text-green-500" />;
    if (value < 0) return <ArrowDown className="h-3 w-3 text-red-500" />;
    return <Minus className="h-3 w-3 text-gray-500" />;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'inactive': return <XCircle className="h-4 w-4 text-gray-500" />;
      case 'suspended': return <AlertTriangle className="h-4 w-4 text-red-500" />;
      default: return <CheckCircle className="h-4 w-4 text-green-500" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'error': return 'text-red-600';
      case 'warning': return 'text-yellow-600';
      case 'success': return 'text-green-600';
      default: return 'text-blue-600';
    }
  };

  // Stats configuration
  const stats = metrics ? [
    {
      title: "Total Organizations",
      value: formatNumber(metrics.totalOrganizations),
      description: `+${metrics.newOrganizations30d} this month`,
      icon: Building,
      trend: { value: metrics.newOrganizations30d, isPositive: metrics.newOrganizations30d > 0 },
    },
    {
      title: "Total Users",
      value: formatNumber(metrics.totalUsers),
      description: `+${metrics.userGrowth30d} this month`,
      icon: Users,
      trend: { value: metrics.userGrowth30d, isPositive: metrics.userGrowth30d > 0 },
    },
    {
      title: "Total Conversations",
      value: formatNumber(metrics.totalConversations),
      description: `+${formatNumber(metrics.conversationGrowth30d)} this month`,
      icon: MessageSquare,
      trend: { value: metrics.conversationGrowth30d, isPositive: metrics.conversationGrowth30d > 0 },
    },
    {
      title: "Active Assistants",
      value: `${metrics.activeAssistants}/${metrics.totalAssistants}`,
      description: "Auto-scoring enabled",
      icon: Bot,
      variant: "success" as const,
    },
    {
      title: "Avg Confidence Score",
      value: `${metrics.avgConfidenceScore}%`,
      description: "Platform-wide accuracy",
      icon: TrendingUp,
      variant: metrics.avgConfidenceScore >= 80 ? "success" as const : "warning" as const,
    },
    {
      title: "Flagged Conversations",
      value: formatNumber(metrics.totalFlaggedConversations),
      description: "Require human review",
      icon: Flag,
      variant: "warning" as const,
    },
    {
      title: "Monthly Token Usage",
      value: formatNumber(metrics.totalTokensUsed),
      description: `$${metrics.totalCostThisMonth.toFixed(2)} cost`,
      icon: DollarSign,
    },
    {
      title: "Platform Uptime",
      value: `${metrics.platformUptime}%`,
      description: `${metrics.avgProcessingTime}s avg response`,
      icon: Server,
      variant: "success" as const,
    },
  ] : [];

  return (
    <DashboardLayout userRole="super_admin" userName={user?.full_name ?? user?.email ?? "Super Admin"}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl md:text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">
              Super Admin Dashboard
            </h1>
            <p className="text-sm md:text-base text-muted-foreground mt-2">
              Platform-wide oversight and management
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button 
              onClick={handleRefreshAll}
              disabled={refreshing}
              variant="outline"
              className="flex items-center space-x-2 flex-1 sm:flex-none"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Refresh All</span>
            </Button>
            <Button onClick={() => navigate('/analytics')} className="flex-1 sm:flex-none">
              <BarChart3 className="mr-2 h-4 w-4" />
              Analytics
            </Button>
          </div>
        </div>

        {/* Error Alerts */}
        {(metricsError || orgsError || activitiesError) && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Data Loading Issues</AlertTitle>
            <AlertDescription>
              Some dashboard data could not be loaded. Please check your connection and try refreshing.
            </AlertDescription>
          </Alert>
        )}

        {/* Key Metrics Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <StatsCard key={stat.title} {...stat} />
          ))}
        </div>

        {/* Dashboard Tabs */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview" className="flex items-center space-x-2">
              <Globe className="h-4 w-4" />
              <span>Overview</span>
            </TabsTrigger>
            <TabsTrigger value="organizations" className="flex items-center space-x-2">
              <Building className="h-4 w-4" />
              <span>Organizations</span>
            </TabsTrigger>
            <TabsTrigger value="system" className="flex items-center space-x-2">
              <Server className="h-4 w-4" />
              <span>System Health</span>
            </TabsTrigger>
            <TabsTrigger value="activity" className="flex items-center space-x-2">
              <Activity className="h-4 w-4" />
              <span>Recent Activity</span>
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Platform Statistics */}
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Zap className="mr-2 h-5 w-5" />
                    Platform Statistics
                  </CardTitle>
                  <CardDescription>Key performance indicators</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!metricsLoading && metrics ? (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Review Queue Size</span>
                        <Badge variant={metrics.reviewQueueSize > 50 ? "destructive" : "outline"}>
                          {metrics.reviewQueueSize}
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Error Rate</span>
                        <Badge variant={metrics.errorRate > 1 ? "destructive" : "default"}>
                          {metrics.errorRate}%
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Minutes Processed</span>
                        <span className="font-medium">{formatNumber(metrics.totalMinutesProcessed)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Monthly Cost</span>
                        <span className="font-medium">${metrics.totalCostThisMonth.toFixed(2)}</span>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-2">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-6 bg-muted rounded animate-pulse" />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Top Organizations */}
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Building className="mr-2 h-5 w-5" />
                    Top Organizations
                  </CardTitle>
                  <CardDescription>By conversation volume</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[300px]">
                    <div className="space-y-3">
                      {!orgsLoading && organizations ? (
                        organizations
                          .sort((a, b) => b.totalConversations - a.totalConversations)
                          .slice(0, 10)
                          .map((org, index) => (
                            <div key={org.id} className="flex items-center justify-between p-3 rounded-lg bg-gradient-card">
                              <div className="flex items-center space-x-3">
                                <Badge variant="outline" className="text-xs">{index + 1}</Badge>
                                <div>
                                  <p className="font-medium text-sm">{org.name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {org.totalConversations} conversations • {org.userCount} users
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Badge variant={org.avgScore >= 80 ? "default" : "secondary"} className="text-xs">
                                  {org.avgScore}%
                                </Badge>
                                <Button 
                                  size="sm" 
                                  variant="ghost"
                                  onClick={() => navigate(`/organization-dashboard/${org.id}`)}
                                >
                                  <Eye className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          ))
                      ) : (
                        <div className="space-y-3">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="h-16 bg-muted rounded animate-pulse" />
                          ))}
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Organizations Tab */}
          <TabsContent value="organizations" className="space-y-6">
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle>Organization Management</CardTitle>
                <CardDescription>All organizations in the platform</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <div className="space-y-4">
                    {!orgsLoading && organizations ? (
                      organizations.map((org) => (
                        <div key={org.id} className="flex items-center justify-between p-4 border rounded-lg bg-gradient-card">
                          <div className="flex items-center space-x-4">
                            {getStatusIcon(org.status)}
                            <div>
                              <h3 className="font-medium">{org.name}</h3>
                              <p className="text-sm text-muted-foreground">
                                Created {new Date(org.created_at).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-6">
                            <div className="text-center">
                              <div className="text-lg font-bold">{org.totalConversations}</div>
                              <div className="text-xs text-muted-foreground">Conversations</div>
                            </div>
                            <div className="text-center">
                              <div className="text-lg font-bold">{org.assistantCount}</div>
                              <div className="text-xs text-muted-foreground">Assistants</div>
                            </div>
                            <div className="text-center">
                              <div className="text-lg font-bold">${org.totalCost.toFixed(0)}</div>
                              <div className="text-xs text-muted-foreground">Total Cost</div>
                            </div>
                            <div className="text-center">
                              <Badge variant={org.avgScore >= 80 ? "default" : "secondary"}>
                                {org.avgScore}%
                              </Badge>
                              <div className="text-xs text-muted-foreground">Avg Score</div>
                            </div>
                            <div className="flex space-x-2">
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => navigate(`/organization-dashboard/${org.id}`)}
                              >
                                <Eye className="h-3 w-3" />
                              </Button>
                              {/* <Button size="sm" variant="outline">
                                <Settings className="h-3 w-3" />
                              </Button> */}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="space-y-4">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <div key={i} className="h-20 bg-muted rounded animate-pulse" />
                        ))}
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* System Health Tab */}
          <TabsContent value="system" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Server className="mr-2 h-5 w-5" />
                    System Performance
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {metrics && (
                    <>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Platform Uptime</span>
                          <span className="font-medium text-success">{metrics.platformUptime}%</span>
                        </div>
                        <Progress value={metrics.platformUptime} className="h-2" />
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Average Response Time</span>
                          <span className="font-medium">{metrics.avgProcessingTime}s</span>
                        </div>
                        <Progress value={85} className="h-2" />
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Success Rate</span>
                          <span className="font-medium text-success">{(100 - metrics.errorRate).toFixed(1)}%</span>
                        </div>
                        <Progress value={100 - metrics.errorRate} className="h-2" />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Activity className="mr-2 h-5 w-5" />
                    Resource Usage
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {metrics && (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Active Assistants</span>
                        <div className="text-right">
                          <div className="font-medium">{metrics.activeAssistants}</div>
                          <div className="text-xs text-muted-foreground">of {metrics.totalAssistants}</div>
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Review Queue</span>
                        <Badge variant={metrics.reviewQueueSize > 50 ? "destructive" : "outline"}>
                          {metrics.reviewQueueSize}
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Monthly Tokens</span>
                        <span className="font-medium">{formatNumber(metrics.totalTokensUsed)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Monthly Cost</span>
                        <span className="font-medium">${metrics.totalCostThisMonth.toFixed(2)}</span>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Recent Activity Tab */}
          <TabsContent value="activity" className="space-y-6">
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Activity className="mr-2 h-5 w-5" />
                  Platform Activity
                </CardTitle>
                <CardDescription>Recent system events and user actions</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <div className="space-y-4">
                    {!activitiesLoading && recentActivities ? (
                      recentActivities.map((activity) => (
                        <div key={activity.id} className="flex items-start space-x-4 p-3 rounded-lg bg-gradient-card">
                          <div className={`mt-1 h-2 w-2 rounded-full ${getSeverityColor(activity.severity)} bg-current`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2 mb-1">
                              <span className="text-sm font-medium">{activity.action}</span>
                              <Badge variant="outline" className="text-xs">{activity.org_name}</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {(() => {
                                if (typeof activity.details === 'string') {
                                  return activity.details;
                                }
                                if (activity.details && typeof activity.details === 'object') {
                                  try {
                                    // Handle specific object structures
                                    const obj = activity.details as any;
                                    if (obj.errors !== undefined || obj.failed !== undefined || obj.processed !== undefined) {
                                      const parts = [];
                                      if (obj.successful !== undefined) parts.push(`successful: ${obj.successful}`);
                                      if (obj.failed !== undefined) parts.push(`failed: ${obj.failed}`);
                                      if (obj.processed !== undefined) parts.push(`processed: ${obj.processed}`);
                                      if (obj.errors !== undefined) parts.push(`errors: ${obj.errors}`);
                                      if (obj.total_found !== undefined) parts.push(`total: ${obj.total_found}`);
                                      return `Operation result: ${parts.join(', ')}`;
                                    }
                                    return `Details: ${Object.entries(obj).map(([key, value]) => `${key}: ${String(value)}`).join(', ')}`;
                                  } catch (e) {
                                    return 'Invalid details format';
                                  }
                                }
                                return 'No details available';
                              })()}
                            </p>
                            <div className="flex items-center space-x-2 mt-2 text-xs text-muted-foreground">
                              <span>{activity.user_name}</span>
                              <span>•</span>
                              <span>{new Date(activity.created_at).toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="space-y-4">
                        {Array.from({ length: 8 }).map((_, i) => (
                          <div key={i} className="h-16 bg-muted rounded animate-pulse" />
                        ))}
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
