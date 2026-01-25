import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DollarSign,
  TrendingUp,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  MessageSquare,
  MessageCircle,
  AlertTriangle,
  Building2,
  CreditCard,
  Receipt,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { useUser } from "@/context/UserContext";
import { useState } from "react";
import { supabase } from "@/supabaseClient";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend, PieChart, Pie, Cell, Tooltip } from 'recharts';

interface OrganizationBilling {
  id: string;
  name: string;
  flatRateFee: number;
  includedInteractions: number;
  overageRatePer1000: number;
  currentPeriodInteractions: number;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  monthlyServiceFee: number;
  status: string;
  // Calculated fields
  overageInteractions: number;
  overageCost: number;
  totalBill: number;
  usagePercentage: number;
}

interface InteractionBreakdown {
  type: string;
  label: string;
  count: number;
  cost: number;
  icon: string;
  color: string;
}

interface BillingPeriodData {
  totalRevenue: number;
  totalInteractions: number;
  totalOverages: number;
  organizationCount: number;
  avgBillPerOrg: number;
  organizations: OrganizationBilling[];
  interactionBreakdown: InteractionBreakdown[];
}

const INTERACTION_COLORS = {
  call_inbound: "#10B981",   // green
  call_outbound: "#3B82F6",  // blue
  sms_inbound: "#8B5CF6",    // purple
  sms_outbound: "#F59E0B",   // amber
  chat_session: "#06B6D4",   // cyan
};

export default function Billing() {
  const { user } = useUser();
  const currentRole: "super_admin" | "org_admin" = user?.role === "super_admin" ? "super_admin" : "org_admin";

  const [selectedPeriod, setSelectedPeriod] = useState<string>("current");
  const [selectedOrg, setSelectedOrg] = useState<string>("all");

  // Fetch billing data
  const { data: billingData, isLoading, error } = useQuery<BillingPeriodData>({
    queryKey: ["billing-data", selectedPeriod, selectedOrg, currentRole, user?.org_id],
    queryFn: async () => {
      // Get date range based on selected period
      const now = new Date();
      let startDate: Date;
      let endDate: Date = now;

      if (selectedPeriod === "current") {
        // Current billing period (this month)
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      } else if (selectedPeriod === "last") {
        // Last billing period (last month)
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0);
      } else {
        // Last 90 days
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 90);
      }

      // Fetch organizations with billing info
      let orgsQuery = supabase
        .from("organizations")
        .select(`
          id,
          name,
          flat_rate_fee,
          included_interactions,
          overage_rate_per_1000,
          current_period_interactions,
          current_period_start,
          current_period_end,
          monthly_service_fee,
          status
        `);

      if (currentRole === "org_admin" && user?.org_id) {
        orgsQuery = orgsQuery.eq("id", user.org_id);
      } else if (selectedOrg !== "all") {
        orgsQuery = orgsQuery.eq("id", selectedOrg);
      }

      const { data: orgsData, error: orgsError } = await orgsQuery;

      if (orgsError) {
        console.error("Error fetching organizations:", orgsError);
        throw orgsError;
      }

      // Fetch interaction logs for the period
      let interactionsQuery = supabase
        .from("interaction_logs")
        .select("org_id, interaction_type, cost, duration_seconds, message_count")
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString());

      if (currentRole === "org_admin" && user?.org_id) {
        interactionsQuery = interactionsQuery.eq("org_id", user.org_id);
      } else if (selectedOrg !== "all") {
        interactionsQuery = interactionsQuery.eq("org_id", selectedOrg);
      }

      const { data: interactionsData, error: interactionsError } = await interactionsQuery;

      // If interaction_logs table doesn't exist or is empty, fall back to conversations
      let fallbackInteractions: { type: string; count: number; cost: number }[] = [];

      if (interactionsError || !interactionsData || interactionsData.length === 0) {
        // Fallback: Get interaction counts from conversations table
        let convQuery = supabase
          .from("conversations")
          .select("org_id, is_voice, total_cost, channel")
          .gte("created_at", startDate.toISOString())
          .lte("created_at", endDate.toISOString());

        if (currentRole === "org_admin" && user?.org_id) {
          convQuery = convQuery.eq("org_id", user.org_id);
        } else if (selectedOrg !== "all") {
          convQuery = convQuery.eq("org_id", selectedOrg);
        }

        const { data: convData } = await convQuery;

        if (convData && convData.length > 0) {
          const voiceCount = convData.filter(c => c.is_voice === true || c.channel === 'voice').length;
          const chatCount = convData.filter(c => c.is_voice === false || c.channel === 'chat').length;
          const totalCost = convData.reduce((sum, c) => sum + (parseFloat(c.total_cost) || 0), 0);

          fallbackInteractions = [
            { type: 'call_inbound', count: Math.round(voiceCount * 0.7), cost: totalCost * 0.4 },
            { type: 'call_outbound', count: Math.round(voiceCount * 0.3), cost: totalCost * 0.3 },
            { type: 'chat_session', count: chatCount, cost: totalCost * 0.3 },
          ];
        }
      }

      // Process interaction breakdown
      const interactionCounts: Record<string, { count: number; cost: number }> = {
        call_inbound: { count: 0, cost: 0 },
        call_outbound: { count: 0, cost: 0 },
        sms_inbound: { count: 0, cost: 0 },
        sms_outbound: { count: 0, cost: 0 },
        chat_session: { count: 0, cost: 0 },
      };

      if (interactionsData && interactionsData.length > 0) {
        interactionsData.forEach(interaction => {
          const type = interaction.interaction_type;
          if (interactionCounts[type]) {
            interactionCounts[type].count++;
            interactionCounts[type].cost += parseFloat(interaction.cost) || 0;
          }
        });
      } else if (fallbackInteractions.length > 0) {
        fallbackInteractions.forEach(fb => {
          if (interactionCounts[fb.type]) {
            interactionCounts[fb.type].count = fb.count;
            interactionCounts[fb.type].cost = fb.cost;
          }
        });
      }

      const interactionBreakdown: InteractionBreakdown[] = [
        { type: 'call_inbound', label: 'Inbound Calls', count: interactionCounts.call_inbound.count, cost: interactionCounts.call_inbound.cost, icon: 'PhoneIncoming', color: INTERACTION_COLORS.call_inbound },
        { type: 'call_outbound', label: 'Outbound Calls', count: interactionCounts.call_outbound.count, cost: interactionCounts.call_outbound.cost, icon: 'PhoneOutgoing', color: INTERACTION_COLORS.call_outbound },
        { type: 'sms_inbound', label: 'SMS Inbound', count: interactionCounts.sms_inbound.count, cost: interactionCounts.sms_inbound.cost, icon: 'MessageCircle', color: INTERACTION_COLORS.sms_inbound },
        { type: 'sms_outbound', label: 'SMS Outbound', count: interactionCounts.sms_outbound.count, cost: interactionCounts.sms_outbound.cost, icon: 'MessageSquare', color: INTERACTION_COLORS.sms_outbound },
        { type: 'chat_session', label: 'Chat Sessions', count: interactionCounts.chat_session.count, cost: interactionCounts.chat_session.cost, icon: 'MessageSquare', color: INTERACTION_COLORS.chat_session },
      ];

      // Process organization billing
      const organizations: OrganizationBilling[] = (orgsData || []).map(org => {
        const flatRateFee = parseFloat(org.flat_rate_fee) || 500;
        const includedInteractions = org.included_interactions || 5000;
        const overageRatePer1000 = parseFloat(org.overage_rate_per_1000) || 50;
        const currentInteractions = org.current_period_interactions || 0;
        const monthlyServiceFee = parseFloat(org.monthly_service_fee) || flatRateFee;

        // Calculate overages
        const overageInteractions = Math.max(0, currentInteractions - includedInteractions);
        const overageCost = (overageInteractions / 1000) * overageRatePer1000;
        const totalBill = monthlyServiceFee + overageCost;
        const usagePercentage = includedInteractions > 0
          ? Math.min(100, (currentInteractions / includedInteractions) * 100)
          : 0;

        return {
          id: org.id,
          name: org.name || 'Unknown Organization',
          flatRateFee,
          includedInteractions,
          overageRatePer1000,
          currentPeriodInteractions: currentInteractions,
          currentPeriodStart: org.current_period_start,
          currentPeriodEnd: org.current_period_end,
          monthlyServiceFee,
          status: org.status || 'active',
          overageInteractions,
          overageCost,
          totalBill,
          usagePercentage,
        };
      });

      // Calculate totals
      const totalRevenue = organizations.reduce((sum, org) => sum + org.totalBill, 0);
      const totalInteractions = Object.values(interactionCounts).reduce((sum, ic) => sum + ic.count, 0);
      const totalOverages = organizations.reduce((sum, org) => sum + org.overageCost, 0);
      const organizationCount = organizations.length;
      const avgBillPerOrg = organizationCount > 0 ? totalRevenue / organizationCount : 0;

      return {
        totalRevenue,
        totalInteractions,
        totalOverages,
        organizationCount,
        avgBillPerOrg,
        organizations,
        interactionBreakdown,
      };
    },
    refetchInterval: 60000,
  });

  // Fetch organizations for dropdown (super admin only)
  const { data: orgsList = [] } = useQuery({
    queryKey: ["billing-orgs-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name")
        .order("name");

      if (error) throw error;
      return data || [];
    },
    enabled: currentRole === "super_admin",
  });

  const getInteractionIcon = (type: string) => {
    switch (type) {
      case 'call_inbound': return <PhoneIncoming className="h-4 w-4" />;
      case 'call_outbound': return <PhoneOutgoing className="h-4 w-4" />;
      case 'sms_inbound': return <MessageCircle className="h-4 w-4" />;
      case 'sms_outbound': return <MessageSquare className="h-4 w-4" />;
      case 'chat_session': return <MessageSquare className="h-4 w-4" />;
      default: return <Activity className="h-4 w-4" />;
    }
  };

  const pieChartData = billingData?.interactionBreakdown
    .filter(i => i.count > 0)
    .map(i => ({
      name: i.label,
      value: i.count,
      color: i.color,
    })) || [];

  return (
    <DashboardLayout userRole={currentRole} userName={user?.full_name || "Unknown User"}>
      <div className="space-y-6">
        {/* Error Alert */}
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Failed to load billing data. Please try refreshing the page.
            </AlertDescription>
          </Alert>
        )}

        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl md:text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">
              Billing & Usage
            </h1>
            <p className="text-sm md:text-base text-muted-foreground mt-2">
              {currentRole === "super_admin"
                ? "Platform-wide billing overview and organization charges"
                : "Your organization's billing and usage details"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {currentRole === "super_admin" && (
              <Select value={selectedOrg} onValueChange={setSelectedOrg}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="Select Organization" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Organizations</SelectItem>
                  {orgsList.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="Period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current">Current Period</SelectItem>
                <SelectItem value="last">Last Period</SelectItem>
                <SelectItem value="90d">Last 90 Days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Key Billing Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-500/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {currentRole === "super_admin" ? "Total Revenue" : "Current Bill"}
              </CardTitle>
              <DollarSign className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-2xl font-bold text-green-600">
                  ${(billingData?.totalRevenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {selectedPeriod === "current" ? "This billing period" : selectedPeriod === "last" ? "Last billing period" : "Last 90 days"}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border-blue-500/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Interactions</CardTitle>
              <Activity className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold text-blue-600">
                  {(billingData?.totalInteractions || 0).toLocaleString()}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Calls, SMS, and chat sessions
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-orange-500/10 to-amber-500/10 border-orange-500/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Overage Charges</CardTitle>
              <TrendingUp className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold text-orange-600">
                  ${(billingData?.totalOverages || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Beyond included interactions
              </p>
            </CardContent>
          </Card>

          {currentRole === "super_admin" ? (
            <Card className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-purple-500/20">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Organizations</CardTitle>
                <Building2 className="h-4 w-4 text-purple-500" />
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-12" />
                ) : (
                  <div className="text-2xl font-bold text-purple-600">
                    {billingData?.organizationCount || 0}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Avg: ${(billingData?.avgBillPerOrg || 0).toFixed(2)}/org
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-purple-500/20">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Plan Status</CardTitle>
                <CreditCard className="h-4 w-4 text-purple-500" />
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-20" />
                ) : (
                  <div className="flex items-center gap-2">
                    <Badge className="bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300">
                      Active
                    </Badge>
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  Enterprise Plan
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Interaction Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Interaction Type Cards */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Phone className="h-5 w-5" />
                Interaction Breakdown
              </CardTitle>
              <CardDescription>
                All interactions by type (calls, SMS, chat)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {billingData?.interactionBreakdown.map((interaction, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-4 rounded-lg border"
                      style={{ borderLeftWidth: '4px', borderLeftColor: interaction.color }}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="h-10 w-10 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: `${interaction.color}20` }}
                        >
                          {getInteractionIcon(interaction.type)}
                        </div>
                        <div>
                          <p className="font-medium">{interaction.label}</p>
                          <p className="text-sm text-muted-foreground">
                            {interaction.count.toLocaleString()} interactions
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">${interaction.cost.toFixed(2)}</p>
                        <p className="text-xs text-muted-foreground">
                          ${interaction.count > 0 ? (interaction.cost / interaction.count).toFixed(3) : '0.000'}/each
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Interaction Distribution Pie Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Interaction Distribution</CardTitle>
              <CardDescription>
                Visual breakdown of interaction types
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-[300px] flex items-center justify-center">
                  <Skeleton className="h-48 w-48 rounded-full" />
                </div>
              ) : pieChartData.length > 0 ? (
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {pieChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number) => [value.toLocaleString(), 'Count']}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <Activity className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No interactions recorded yet</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Organization Billing Table (Super Admin) or Single Org Details */}
        {currentRole === "super_admin" && selectedOrg === "all" ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                Organization Billing Summary
              </CardTitle>
              <CardDescription>
                Billing breakdown by organization
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Organization</TableHead>
                        <TableHead className="text-right">Plan Cost</TableHead>
                        <TableHead className="text-right">Included</TableHead>
                        <TableHead className="text-right">Used</TableHead>
                        <TableHead className="text-center">Usage</TableHead>
                        <TableHead className="text-right">Overage</TableHead>
                        <TableHead className="text-right">Total Bill</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {billingData?.organizations.map((org) => (
                        <TableRow key={org.id}>
                          <TableCell className="font-medium">{org.name}</TableCell>
                          <TableCell className="text-right">
                            ${org.monthlyServiceFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-right">
                            {org.includedInteractions.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            {org.currentPeriodInteractions.toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress
                                value={org.usagePercentage}
                                className="w-16 h-2"
                              />
                              <span className={`text-xs ${
                                org.usagePercentage >= 100 ? 'text-red-500' :
                                org.usagePercentage >= 80 ? 'text-orange-500' :
                                'text-green-500'
                              }`}>
                                {org.usagePercentage.toFixed(0)}%
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            {org.overageCost > 0 ? (
                              <span className="text-orange-600">
                                +${org.overageCost.toFixed(2)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">$0.00</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-bold">
                            ${org.totalBill.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-center">
                            {org.status === 'active' ? (
                              <Badge className="bg-green-100 text-green-700">Active</Badge>
                            ) : (
                              <Badge variant="secondary">{org.status}</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      {(!billingData?.organizations || billingData.organizations.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                            No organizations found
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          /* Single Organization Detailed View */
          billingData?.organizations[0] && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Plan Details - {billingData.organizations[0].name}
                </CardTitle>
                <CardDescription>
                  Your current billing plan and usage
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Plan Information */}
                  <div className="space-y-4">
                    <h3 className="font-semibold flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      Plan Information
                    </h3>
                    <div className="space-y-3 pl-6">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Monthly Fee</span>
                        <span className="font-medium">
                          ${billingData.organizations[0].monthlyServiceFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Included Interactions</span>
                        <span className="font-medium">
                          {billingData.organizations[0].includedInteractions.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Overage Rate</span>
                        <span className="font-medium">
                          ${billingData.organizations[0].overageRatePer1000}/1,000
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Plan Status</span>
                        <Badge className="bg-green-100 text-green-700">
                          {billingData.organizations[0].status}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Current Usage */}
                  <div className="space-y-4">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Activity className="h-4 w-4 text-blue-500" />
                      Current Period Usage
                    </h3>
                    <div className="space-y-3 pl-6">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Interactions Used</span>
                        <span className="font-medium">
                          {billingData.organizations[0].currentPeriodInteractions.toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-muted-foreground">Usage</span>
                          <span className={`font-medium ${
                            billingData.organizations[0].usagePercentage >= 100 ? 'text-red-500' :
                            billingData.organizations[0].usagePercentage >= 80 ? 'text-orange-500' :
                            'text-green-500'
                          }`}>
                            {billingData.organizations[0].usagePercentage.toFixed(1)}%
                          </span>
                        </div>
                        <Progress
                          value={Math.min(100, billingData.organizations[0].usagePercentage)}
                          className="h-3"
                        />
                      </div>
                      {billingData.organizations[0].overageInteractions > 0 && (
                        <div className="flex justify-between text-orange-600">
                          <span>Overage Interactions</span>
                          <span className="font-medium">
                            +{billingData.organizations[0].overageInteractions.toLocaleString()}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between text-lg font-bold pt-2 border-t">
                        <span>Total Bill</span>
                        <span className="text-green-600">
                          ${billingData.organizations[0].totalBill.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        )}

        {/* Billing Period Info */}
        <Card className="bg-muted/50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <h4 className="font-medium text-sm">Billing Period Information</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  {selectedPeriod === "current"
                    ? "Showing current billing period data. Bills are generated monthly on the 1st."
                    : selectedPeriod === "last"
                    ? "Showing last billing period data. This period has been closed and invoiced."
                    : "Showing aggregated data for the last 90 days across all billing periods."}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Interaction tracking includes all AI-handled calls (inbound/outbound), SMS messages, and chat sessions.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
