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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Phone,
  MessageSquare,
  AlertTriangle,
  Building2,
  Receipt,
  Activity,
  Server,
  Mic,
  Volume2,
  Brain,
  Globe,
  Calendar,
  Info,
  Minus,
  MessageCircle,
} from "lucide-react";
import { useUser } from "@/context/UserContext";
import { useState } from "react";
import { supabase } from "@/supabaseClient";
import { useQuery } from "@tanstack/react-query";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import {
  USD_TO_AUD_RATE,
  usdToAud,
  VOICE_AI_COSTS_PER_MINUTE,
  POST_TRANSFER_COSTS_PER_MINUTE,
  CHAT_COSTS_PER_INTERACTION,
  SMS_COSTS_PER_MESSAGE,
  FIXED_MONTHLY_COSTS,
  ELEVENLABS_PRICING,
  ELEVENLABS_PLANS,
  calculateFullyLoadedVoiceCost,
  calculateUpgradeRecommendation,
  UNIT_COSTS_QUICK_REF,
} from "@/lib/pricing";

// ============================================================================
// Types
// ============================================================================

interface BillingData {
  // Usage counts
  voiceMinutes: number;
  aiMinutes: number;
  postTransferMinutes: number;
  transferredCalls: number;
  chatInteractions: number;
  smsMessages: number;
  phoneNumbers: number;

  // Variable costs (USD)
  voiceCostUSD: number;
  postTransferCostUSD: number;
  chatCostUSD: number;
  smsCostUSD: number;
  totalVariableCostUSD: number;

  // Fixed costs (USD)
  phoneNumberCostUSD: number;
  flyioCostUSD: number;
  elevenLabsFeeUSD: number;
  elevenLabsOverageUSD: number;
  totalFixedCostUSD: number;

  // Totals
  totalCostUSD: number;
  totalCostAUD: number;

  // Revenue & Profit
  totalRevenue: number;
  grossProfit: number;
  grossMargin: number;

  // ElevenLabs tracking
  ttsMinutesUsed: number;
  ttsMinutesIncluded: number;
  ttsUsagePercent: number;
  elevenLabsNeedsUpgrade: boolean;

  // Fully loaded cost
  fullyLoadedCostPerMinuteUSD: number;
  fullyLoadedCostPerMinuteAUD: number;

  // Organization data
  organizations: OrgBilling[];
  organizationCount: number;
}

interface OrgBilling {
  id: string;
  name: string;
  voiceMinutes: number;
  chatInteractions: number;
  smsMessages: number;
  totalCostAUD: number;
  monthlyFee: number;
  status: string;
}

const CHART_COLORS = {
  voice: "#8B5CF6",
  chat: "#3B82F6",
  sms: "#10B981",
  fixed: "#F59E0B",
};

// ============================================================================
// Component
// ============================================================================

export default function Billing() {
  const { user } = useUser();
  const currentRole: "super_admin" | "org_admin" = user?.role === "super_admin" ? "super_admin" : "org_admin";

  const [selectedPeriod, setSelectedPeriod] = useState<string>("current");
  const [selectedOrg, setSelectedOrg] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<string>("overview");

  // Fetch billing data
  const { data: billingData, isLoading, error } = useQuery<BillingData>({
    queryKey: ["billing-data", selectedPeriod, selectedOrg, currentRole, user?.org_id],
    queryFn: async () => {
      // Get date range based on selected period
      const now = new Date();
      let startDate: Date;
      let endDate: Date = now;

      if (selectedPeriod === "current") {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      } else if (selectedPeriod === "last") {
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0);
      } else {
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 90);
      }

      // Fetch organizations
      let orgsQuery = supabase
        .from("organizations")
        .select("id, name, flat_rate_fee, active");

      if (currentRole === "org_admin" && user?.org_id) {
        orgsQuery = orgsQuery.eq("id", user.org_id);
      } else if (selectedOrg !== "all") {
        orgsQuery = orgsQuery.eq("id", selectedOrg);
      }

      const { data: orgsData } = await orgsQuery;

      // Fetch voice conversations ONLY (exclude chat sessions stored in conversations table)
      // Include channel='voice' OR channel IS NULL (backward compatibility for older records)
      let voiceQuery = supabase
        .from("conversations")
        .select("org_id, duration_seconds, ai_duration_seconds, post_transfer_seconds, escalation, channel")
        .or("channel.eq.voice,channel.is.null")  // Only count voice calls (or null for backward compat), not chat sessions
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString());

      if (currentRole === "org_admin" && user?.org_id) {
        voiceQuery = voiceQuery.eq("org_id", user.org_id);
      } else if (selectedOrg !== "all") {
        voiceQuery = voiceQuery.eq("org_id", selectedOrg);
      }

      const { data: voiceData, error: voiceError } = await voiceQuery;

      // Debug: log query details and raw results
      console.log('Billing: Voice query debug', {
        dateRange: { start: startDate.toISOString(), end: endDate.toISOString() },
        recordsReturned: voiceData?.length || 0,
        error: voiceError?.message || null,
        firstFewRecords: voiceData?.slice(0, 5).map(v => ({
          org_id: v.org_id,
          channel: v.channel,
          duration_seconds: v.duration_seconds,
          ai_duration_seconds: v.ai_duration_seconds
        }))
      });

      // Fetch chat conversations
      let chatQuery = supabase
        .from("chat_conversations")
        .select("assistant_id")
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString());

      const { data: chatData } = await chatQuery;

      // Fetch assistants to map chat to orgs
      const { data: assistants } = await supabase
        .from("assistants")
        .select("id, org_id, phone_number");

      const assistantToOrg: Record<string, string> = {};
      assistants?.forEach(a => {
        assistantToOrg[a.id] = a.org_id;
      });

      // Count phone numbers
      const phoneNumbers = assistants?.filter(a => a.phone_number).length || 0;

      // Calculate voice minutes by org (AI minutes vs post-transfer minutes)
      // MAX_CALL_DURATION: Cap at 60 minutes (3600 seconds) - any longer is likely bad data
      const MAX_CALL_SECONDS = 3600;
      const voiceByOrg: Record<string, number> = {};
      const postTransferByOrg: Record<string, number> = {};
      let totalVoiceMinutes = 0;
      let totalAiMinutes = 0;
      let totalPostTransferMinutes = 0;
      let totalTransferredCalls = 0;
      let skippedBadData = 0;

      voiceData?.forEach(conv => {
        // Skip conversations without org_id
        if (!conv.org_id) {
          return;
        }

        // Skip conversations with obviously bad data (null, 0, or > 1 hour)
        const rawDuration = conv.duration_seconds || 0;
        if (rawDuration <= 0 || rawDuration > MAX_CALL_SECONDS) {
          skippedBadData++;
          return; // Skip this conversation
        }

        // For transferred calls, use ai_duration_seconds for AI cost, post_transfer_seconds for post-transfer cost
        // For non-transferred calls, duration_seconds is all AI time
        // Cap all durations at MAX to prevent bad data
        const aiSeconds = Math.min(conv.ai_duration_seconds ?? rawDuration, MAX_CALL_SECONDS);
        const postTransferSeconds = Math.min(conv.post_transfer_seconds ?? 0, MAX_CALL_SECONDS);
        const totalSeconds = Math.min(rawDuration, MAX_CALL_SECONDS);

        const aiMinutes = aiSeconds / 60;
        const postTransferMinutes = postTransferSeconds / 60;
        const totalMinutes = totalSeconds / 60;

        // Track by org
        voiceByOrg[conv.org_id] = (voiceByOrg[conv.org_id] || 0) + aiMinutes;
        postTransferByOrg[conv.org_id] = (postTransferByOrg[conv.org_id] || 0) + postTransferMinutes;

        totalVoiceMinutes += totalMinutes;
        totalAiMinutes += aiMinutes;
        totalPostTransferMinutes += postTransferMinutes;

        if (conv.escalation) {
          totalTransferredCalls++;
        }
      });

      // Debug: log voice data summary
      console.log('Billing: Voice data summary', {
        totalRecords: voiceData?.length || 0,
        skippedBadData,
        totalVoiceMinutes: totalVoiceMinutes.toFixed(2),
        totalAiMinutes: totalAiMinutes.toFixed(2),
        orgsWithVoice: Object.keys(voiceByOrg).length
      });

      // Log if we skipped bad data (for debugging)
      if (skippedBadData > 0) {
        console.warn(`Billing: Skipped ${skippedBadData} conversations with bad duration data (null, 0, or > 60 min)`);
      }

      // Calculate chat interactions by org
      const chatByOrg: Record<string, number> = {};
      let totalChatInteractions = 0;
      chatData?.forEach(conv => {
        const orgId = assistantToOrg[conv.assistant_id];
        if (orgId) {
          // Filter by selected org if applicable
          if (currentRole === "org_admin" && user?.org_id && orgId !== user.org_id) return;
          if (selectedOrg !== "all" && orgId !== selectedOrg) return;
          chatByOrg[orgId] = (chatByOrg[orgId] || 0) + 1;
          totalChatInteractions++;
        }
      });

      // SMS - assume 0 for now (would need separate table)
      const totalSmsMessages = 0;

      // Calculate variable costs (USD)
      // Voice AI cost only applies to AI-handled minutes (not post-transfer human time)
      const voiceCostUSD = totalAiMinutes * VOICE_AI_COSTS_PER_MINUTE.total;
      // Post-transfer cost is only Twilio telephony (human handling, no AI costs)
      const postTransferCostUSD = totalPostTransferMinutes * POST_TRANSFER_COSTS_PER_MINUTE.total;
      const chatCostUSD = totalChatInteractions * CHAT_COSTS_PER_INTERACTION.total;
      const smsCostUSD = totalSmsMessages * SMS_COSTS_PER_MESSAGE.total;
      const totalVariableCostUSD = voiceCostUSD + postTransferCostUSD + chatCostUSD + smsCostUSD;

      // Calculate fixed costs (USD)
      const phoneNumberCostUSD = phoneNumbers * FIXED_MONTHLY_COSTS.twilioPhoneNumber;
      const flyioCostUSD = FIXED_MONTHLY_COSTS.flyioVmSydney;
      const elevenLabsFeeUSD = ELEVENLABS_PRICING.monthlyFeeUSD;

      // ElevenLabs overage - set to 0 here, real overage is fetched from ElevenLabs API separately
      // Voice minutes != TTS minutes (TTS is only ~35% of call time when AI speaks)
      const elevenLabsOverageUSD = 0;

      const totalFixedCostUSD = phoneNumberCostUSD + flyioCostUSD + elevenLabsFeeUSD;

      // Total costs
      const totalCostUSD = totalVariableCostUSD + totalFixedCostUSD;
      const totalCostAUD = usdToAud(totalCostUSD);

      // Revenue (sum of org flat rate fees)
      const totalRevenue = (orgsData || []).reduce((sum, org) => sum + (parseFloat(org.flat_rate_fee) || 0), 0);

      // Profit = Revenue - Total Costs
      const grossProfit = totalRevenue - totalCostAUD;
      const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

      // Fully loaded cost per minute
      const fullyLoaded = calculateFullyLoadedVoiceCost(totalVoiceMinutes, phoneNumbers);

      // Debug: log org and chat data
      console.log('Billing: Data summary', {
        organizations: orgsData?.length || 0,
        chatRecords: chatData?.length || 0,
        totalChatInteractions,
        voiceByOrgKeys: Object.keys(voiceByOrg),
        chatByOrgKeys: Object.keys(chatByOrg)
      });

      // Build org breakdown
      const organizations: OrgBilling[] = (orgsData || []).map(org => {
        const voiceMins = voiceByOrg[org.id] || 0;
        const chatCount = chatByOrg[org.id] || 0;
        const orgVoiceCost = voiceMins * VOICE_AI_COSTS_PER_MINUTE.total;
        const orgChatCost = chatCount * CHAT_COSTS_PER_INTERACTION.total;
        const orgTotalCostUSD = orgVoiceCost + orgChatCost;

        return {
          id: org.id,
          name: org.name || 'Unknown',
          voiceMinutes: voiceMins,
          chatInteractions: chatCount,
          smsMessages: 0,
          totalCostAUD: usdToAud(orgTotalCostUSD),
          monthlyFee: parseFloat(org.flat_rate_fee) || 0,
          status: org.active === false ? 'inactive' : 'active',
        };
      });

      return {
        voiceMinutes: totalVoiceMinutes,
        aiMinutes: totalAiMinutes,
        postTransferMinutes: totalPostTransferMinutes,
        transferredCalls: totalTransferredCalls,
        chatInteractions: totalChatInteractions,
        smsMessages: totalSmsMessages,
        phoneNumbers,
        voiceCostUSD,
        postTransferCostUSD,
        chatCostUSD,
        smsCostUSD,
        totalVariableCostUSD,
        phoneNumberCostUSD,
        flyioCostUSD,
        elevenLabsFeeUSD,
        elevenLabsOverageUSD,
        totalFixedCostUSD,
        totalCostUSD,
        totalCostAUD,
        totalRevenue,
        grossProfit,
        grossMargin,
        // TTS data - these are placeholder values, real data comes from ElevenLabs API
        ttsMinutesUsed: 0,
        ttsMinutesIncluded: ELEVENLABS_PRICING.ttsMinutesIncluded,
        ttsUsagePercent: 0,
        elevenLabsNeedsUpgrade: false,
        fullyLoadedCostPerMinuteUSD: fullyLoaded.usd,
        fullyLoadedCostPerMinuteAUD: fullyLoaded.aud,
        organizations,
        organizationCount: organizations.length,
      };
    },
    refetchInterval: 60000,
  });

  // Fetch organizations for dropdown
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

  // Fetch real ElevenLabs usage from API (super_admin only)
  const { data: elevenLabsUsage } = useQuery({
    queryKey: ["elevenlabs-usage"],
    queryFn: async () => {
      const response = await fetch("/api/admin/elevenlabs/usage");
      if (!response.ok) throw new Error("Failed to fetch ElevenLabs usage");
      const result = await response.json();
      return result.data;
    },
    enabled: currentRole === "super_admin",
    staleTime: 60000, // Cache for 1 minute
  });

  // Pie chart data
  const pieChartData = [
    { name: 'Voice AI', value: usdToAud(billingData?.voiceCostUSD || 0), color: CHART_COLORS.voice },
    { name: 'Chat', value: usdToAud(billingData?.chatCostUSD || 0), color: CHART_COLORS.chat },
    { name: 'Fixed Costs', value: usdToAud(billingData?.totalFixedCostUSD || 0), color: CHART_COLORS.fixed },
  ].filter(d => d.value > 0);

  const formatAUD = (amount: number) => `$${amount.toFixed(2)} AUD`;
  const formatUSD = (amount: number) => `$${amount.toFixed(4)} USD`;

  return (
    <DashboardLayout userRole={currentRole} userName={user?.full_name || "Unknown User"}>
      <div className="space-y-6">
        {/* Error Alert */}
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>Failed to load billing data. Please refresh.</AlertDescription>
          </Alert>
        )}

        {/* ElevenLabs Upgrade Alert - Uses real API data */}
        {currentRole === "super_admin" && elevenLabsUsage?.needsUpgrade && (
          <Alert className="bg-orange-500/10 border-orange-500/30">
            <AlertTriangle className="h-4 w-4 text-orange-500" />
            <AlertTitle className="text-orange-600">ElevenLabs Plan Alert</AlertTitle>
            <AlertDescription>
              TTS usage at <strong>{elevenLabsUsage.usagePercent.toFixed(0)}%</strong> of included {elevenLabsUsage.minutesIncluded} minutes
              ({elevenLabsUsage.minutesUsed.toFixed(1)} / {elevenLabsUsage.minutesIncluded} mins).
              Consider upgrading to Pro plan to avoid overage charges (${ELEVENLABS_PRICING.ttsOveragePerMinuteUSD}/min).
            </AlertDescription>
          </Alert>
        )}

        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl md:text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">
              Billing & Costs
            </h1>
            <p className="text-sm md:text-base text-muted-foreground mt-2">
              Platform costs and profitability (All amounts in AUD)
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
                    <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
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

        {/* Exchange Rate Notice */}
        <Alert className="bg-blue-500/10 border-blue-500/20">
          <Globe className="h-4 w-4 text-blue-500" />
          <AlertDescription className="text-sm">
            USD to AUD: <strong>{USD_TO_AUD_RATE.toFixed(2)}</strong> | All costs displayed in AUD
          </AlertDescription>
        </Alert>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Revenue */}
          <Card className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-500/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-8 w-24" /> : (
                <div className="text-2xl font-bold text-green-600">{formatAUD(billingData?.totalRevenue || 0)}</div>
              )}
              <p className="text-xs text-muted-foreground">Organization fees</p>
            </CardContent>
          </Card>

          {/* Total Costs - includes ElevenLabs overage when applicable */}
          <Card className="bg-gradient-to-br from-red-500/10 to-orange-500/10 border-red-500/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Costs</CardTitle>
              <TrendingDown className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-8 w-24" /> : (
                (() => {
                  // Calculate ElevenLabs overage cost when over included minutes
                  const elevenLabsOverageMinutes = elevenLabsUsage?.isOverLimit
                    ? Math.max(0, (elevenLabsUsage?.minutesUsed || 0) - (elevenLabsUsage?.minutesIncluded || 200))
                    : 0;
                  const elevenLabsOverageCostAUD = usdToAud(elevenLabsOverageMinutes * ELEVENLABS_PRICING.flashOveragePerMinuteUSD);
                  const totalWithOverage = (billingData?.totalCostAUD || 0) + elevenLabsOverageCostAUD;

                  return (
                    <div className="text-2xl font-bold text-red-600">
                      {formatAUD(totalWithOverage)}
                      {elevenLabsOverageMinutes > 0 && (
                        <span className="text-xs font-normal ml-1">(+overage)</span>
                      )}
                    </div>
                  );
                })()
              )}
              <p className="text-xs text-muted-foreground">Variable + Fixed{elevenLabsUsage?.isOverLimit ? ' + TTS Overage' : ''}</p>
            </CardContent>
          </Card>

          {/* Gross Profit - accounts for ElevenLabs overage */}
          <Card className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border-blue-500/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Gross Profit</CardTitle>
              <TrendingUp className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-8 w-24" /> : (
                (() => {
                  // Calculate ElevenLabs overage cost when over included minutes
                  const elevenLabsOverageMinutes = elevenLabsUsage?.isOverLimit
                    ? Math.max(0, (elevenLabsUsage?.minutesUsed || 0) - (elevenLabsUsage?.minutesIncluded || 200))
                    : 0;
                  const elevenLabsOverageCostAUD = usdToAud(elevenLabsOverageMinutes * ELEVENLABS_PRICING.flashOveragePerMinuteUSD);
                  const adjustedProfit = (billingData?.grossProfit || 0) - elevenLabsOverageCostAUD;
                  const revenue = billingData?.totalRevenue || 0;
                  const adjustedMargin = revenue > 0 ? (adjustedProfit / revenue) * 100 : 0;

                  return (
                    <>
                      <div className={`text-2xl font-bold ${adjustedProfit >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                        {formatAUD(adjustedProfit)}
                      </div>
                      <p className="text-xs text-muted-foreground">{adjustedMargin.toFixed(1)}% margin</p>
                    </>
                  );
                })()
              )}
            </CardContent>
          </Card>

          {/* Fully Loaded Cost */}
          <Card className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-purple-500/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Cost/AI Minute</CardTitle>
              <Activity className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-8 w-24" /> : (
                <div className="text-2xl font-bold text-purple-600">
                  ${(billingData?.fullyLoadedCostPerMinuteAUD || 0).toFixed(3)}
                </div>
              )}
              <p className="text-xs text-muted-foreground">Fully loaded (AUD)</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-4 lg:w-[500px]">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="breakdown">Cost Breakdown</TabsTrigger>
            <TabsTrigger value="rates">Unit Rates</TabsTrigger>
            <TabsTrigger value="organizations">Organizations</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Usage Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Usage This Period
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {isLoading ? (
                    <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                            <Phone className="h-5 w-5 text-purple-500" />
                          </div>
                          <div>
                            <p className="font-medium">Voice AI Minutes</p>
                            <p className="text-sm text-muted-foreground">${usdToAud(VOICE_AI_COSTS_PER_MINUTE.total).toFixed(3)}/min AUD</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold">{(billingData?.aiMinutes || 0).toFixed(1)}</p>
                          <p className="text-sm text-muted-foreground">{formatAUD(usdToAud(billingData?.voiceCostUSD || 0))}</p>
                        </div>
                      </div>

                      {/* Post-Transfer (Human Handoff) Minutes */}
                      {(billingData?.postTransferMinutes || 0) > 0 && (
                        <div className="flex items-center justify-between p-4 rounded-lg border bg-card border-orange-500/30">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-orange-500/10 flex items-center justify-center">
                              <Phone className="h-5 w-5 text-orange-500" />
                            </div>
                            <div>
                              <p className="font-medium">Human Transfer Minutes</p>
                              <p className="text-sm text-muted-foreground">
                                ${usdToAud(POST_TRANSFER_COSTS_PER_MINUTE.total).toFixed(3)}/min AUD • {billingData?.transferredCalls || 0} transfers
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-bold text-orange-600">{(billingData?.postTransferMinutes || 0).toFixed(1)}</p>
                            <p className="text-sm text-muted-foreground">{formatAUD(usdToAud(billingData?.postTransferCostUSD || 0))}</p>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                            <MessageSquare className="h-5 w-5 text-blue-500" />
                          </div>
                          <div>
                            <p className="font-medium">Chat Interactions</p>
                            <p className="text-sm text-muted-foreground">${usdToAud(CHAT_COSTS_PER_INTERACTION.total).toFixed(3)}/chat AUD</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold">{billingData?.chatInteractions || 0}</p>
                          <p className="text-sm text-muted-foreground">{formatAUD(usdToAud(billingData?.chatCostUSD || 0))}</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center">
                            <MessageCircle className="h-5 w-5 text-green-500" />
                          </div>
                          <div>
                            <p className="font-medium">SMS Messages</p>
                            <p className="text-sm text-muted-foreground">${usdToAud(SMS_COSTS_PER_MESSAGE.total).toFixed(3)}/SMS AUD</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold">{billingData?.smsMessages || 0}</p>
                          <p className="text-sm text-muted-foreground">{formatAUD(usdToAud(billingData?.smsCostUSD || 0))}</p>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Cost Distribution */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Receipt className="h-5 w-5" />
                    Cost Distribution (AUD)
                  </CardTitle>
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
                          <Tooltip formatter={(value: number) => [formatAUD(value), 'Cost']} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                      <div className="text-center">
                        <Receipt className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>No costs recorded yet</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* ElevenLabs Usage Tracking - Uses real API data */}
            {currentRole === "super_admin" && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Volume2 className="h-5 w-5" />
                    ElevenLabs TTS Usage ({elevenLabsUsage?.tier || 'Creator'} Plan - ${ELEVENLABS_PRICING.monthlyFeeUSD}/mo)
                  </CardTitle>
                  <CardDescription>
                    {elevenLabsUsage?.minutesIncluded || ELEVENLABS_PRICING.ttsMinutesIncluded} minutes included | Overage: ${ELEVENLABS_PRICING.ttsOveragePerMinuteUSD}/min
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">TTS Minutes Used (from ElevenLabs API)</span>
                      <span className={`text-sm font-bold ${
                        (elevenLabsUsage?.usagePercent || 0) >= 100 ? 'text-red-500' :
                        (elevenLabsUsage?.usagePercent || 0) >= 80 ? 'text-orange-500' : 'text-green-500'
                      }`}>
                        {(elevenLabsUsage?.minutesUsed || 0).toFixed(1)} / {elevenLabsUsage?.minutesIncluded || 100}
                      </span>
                    </div>
                    <Progress
                      value={Math.min(elevenLabsUsage?.usagePercent || 0, 100)}
                      className={`h-3 ${
                        (elevenLabsUsage?.usagePercent || 0) >= 100 ? '[&>div]:bg-red-500' :
                        (elevenLabsUsage?.usagePercent || 0) >= 80 ? '[&>div]:bg-orange-500' : ''
                      }`}
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{(elevenLabsUsage?.usagePercent || 0).toFixed(0)}% used</span>
                      {elevenLabsUsage?.isOverLimit && (
                        <span className="text-red-500">
                          Over limit - overage charges apply
                        </span>
                      )}
                    </div>
                    {elevenLabsUsage?.nextCharacterCountResetUnix && (
                      <div className="text-xs text-muted-foreground">
                        Resets: {new Date(elevenLabsUsage.nextCharacterCountResetUnix * 1000).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ElevenLabs Plan Comparison & Upgrade Recommendations */}
            {currentRole === "super_admin" && elevenLabsUsage && (
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    ElevenLabs Plan Comparison
                  </CardTitle>
                  <CardDescription>
                    Compare plans based on your current usage ({elevenLabsUsage.minutesUsed.toFixed(0)} flash minutes this period)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const currentTier = (elevenLabsUsage.tier || 'creator').toLowerCase();
                    const recommendation = calculateUpgradeRecommendation(currentTier, elevenLabsUsage.minutesUsed);

                    return (
                      <div className="space-y-4">
                        {/* Current Plan Cost */}
                        <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                          <div className="flex justify-between items-center">
                            <div>
                              <span className="font-medium">Current Plan: {recommendation.currentPlan.name}</span>
                              <p className="text-sm text-muted-foreground">
                                {recommendation.currentPlan.flashMinutesIncluded} flash mins included
                              </p>
                            </div>
                            <div className="text-right">
                              <span className="text-lg font-bold">{formatAUD(usdToAud(recommendation.currentCost))}</span>
                              <p className="text-xs text-muted-foreground">/month at current usage</p>
                            </div>
                          </div>
                        </div>

                        {/* Plan Comparison Table */}
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Plan</TableHead>
                              <TableHead className="text-right">Monthly Fee</TableHead>
                              <TableHead className="text-right">Flash Mins</TableHead>
                              <TableHead className="text-right">Overage Rate</TableHead>
                              <TableHead className="text-right">Total at Usage</TableHead>
                              <TableHead className="text-right">vs Current</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {Object.entries(ELEVENLABS_PLANS).map(([key, plan]) => {
                              const isCurrentPlan = key === currentTier;
                              const rec = recommendation.recommendations.find(r => r.planKey === key);
                              const totalCost = rec?.totalCost || recommendation.currentCost;
                              const savings = rec?.savings || 0;

                              return (
                                <TableRow key={key} className={isCurrentPlan ? 'bg-blue-500/5' : ''}>
                                  <TableCell className="font-medium">
                                    {plan.name}
                                    {isCurrentPlan && <Badge className="ml-2" variant="secondary">Current</Badge>}
                                    {rec?.recommended && savings > 0 && (
                                      <Badge className="ml-2 bg-green-500">Recommended</Badge>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right">{formatAUD(usdToAud(plan.monthlyFeeUSD))}</TableCell>
                                  <TableCell className="text-right">{plan.flashMinutesIncluded.toLocaleString()}</TableCell>
                                  <TableCell className="text-right">${plan.flashOveragePer1000USD}/min</TableCell>
                                  <TableCell className="text-right font-medium">{formatAUD(usdToAud(totalCost))}</TableCell>
                                  <TableCell className={`text-right font-bold ${
                                    isCurrentPlan ? '' : savings > 0 ? 'text-green-600' : savings < 0 ? 'text-red-500' : ''
                                  }`}>
                                    {isCurrentPlan ? '-' : savings > 0 ? `Save ${formatAUD(usdToAud(savings))}` : savings < 0 ? `+${formatAUD(usdToAud(Math.abs(savings)))}` : 'Same'}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>

                        {/* Best Recommendation Callout */}
                        {recommendation.recommendations.some(r => r.savings > 0) && (
                          <Alert className="bg-green-500/10 border-green-500/30">
                            <TrendingDown className="h-4 w-4 text-green-500" />
                            <AlertTitle className="text-green-600">Upgrade Opportunity</AlertTitle>
                            <AlertDescription>
                              {(() => {
                                const bestRec = recommendation.recommendations.find(r => r.savings > 0);
                                if (!bestRec) return null;
                                return (
                                  <>
                                    Upgrading to <strong>{bestRec.plan.name}</strong> would save you{' '}
                                    <strong>{formatAUD(usdToAud(bestRec.savings))}/month</strong> based on current usage.
                                    The plan costs {formatAUD(usdToAud(bestRec.additionalCost))} more per month but includes{' '}
                                    {bestRec.plan.flashMinutesIncluded.toLocaleString()} flash minutes with lower overage rates.
                                  </>
                                );
                              })()}
                            </AlertDescription>
                          </Alert>
                        )}

                        <p className="text-xs text-muted-foreground">
                          * Calculations based on Flash/Turbo model (eleven_flash_v2) which is used for voice calls.
                          Prices shown in AUD at {USD_TO_AUD_RATE} exchange rate.
                        </p>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Cost Breakdown Tab */}
          <TabsContent value="breakdown" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Variable Costs */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Variable Costs (Per Usage)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Usage</TableHead>
                        <TableHead className="text-right">Cost (AUD)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4 text-purple-500" />
                            Voice AI
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{(billingData?.aiMinutes || 0).toFixed(1)} min</TableCell>
                        <TableCell className="text-right">{formatAUD(usdToAud(billingData?.voiceCostUSD || 0))}</TableCell>
                      </TableRow>
                      {(billingData?.postTransferMinutes || 0) > 0 && (
                        <TableRow>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <Phone className="h-4 w-4 text-orange-500" />
                              Human Transfer
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{(billingData?.postTransferMinutes || 0).toFixed(1)} min</TableCell>
                          <TableCell className="text-right">{formatAUD(usdToAud(billingData?.postTransferCostUSD || 0))}</TableCell>
                        </TableRow>
                      )}
                      <TableRow>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <MessageSquare className="h-4 w-4 text-blue-500" />
                            Chat
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{billingData?.chatInteractions || 0} chats</TableCell>
                        <TableCell className="text-right">{formatAUD(usdToAud(billingData?.chatCostUSD || 0))}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <MessageCircle className="h-4 w-4 text-green-500" />
                            SMS
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{billingData?.smsMessages || 0} msgs</TableCell>
                        <TableCell className="text-right">{formatAUD(usdToAud(billingData?.smsCostUSD || 0))}</TableCell>
                      </TableRow>
                      <TableRow className="font-bold bg-muted/50">
                        <TableCell>Total Variable</TableCell>
                        <TableCell></TableCell>
                        <TableCell className="text-right">{formatAUD(usdToAud(billingData?.totalVariableCostUSD || 0))}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Fixed Costs */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Server className="h-5 w-5" />
                    Fixed Monthly Costs
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Service</TableHead>
                        <TableHead className="text-right">Details</TableHead>
                        <TableHead className="text-right">Cost (AUD)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4 text-rose-500" />
                            Phone Numbers
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{billingData?.phoneNumbers || 0} numbers</TableCell>
                        <TableCell className="text-right">{formatAUD(usdToAud(billingData?.phoneNumberCostUSD || 0))}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Server className="h-4 w-4 text-indigo-500" />
                            Fly.io VM
                          </div>
                        </TableCell>
                        <TableCell className="text-right">Sydney shared-cpu-1x</TableCell>
                        <TableCell className="text-right">{formatAUD(usdToAud(billingData?.flyioCostUSD || 0))}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Volume2 className="h-4 w-4 text-purple-500" />
                            ElevenLabs
                          </div>
                        </TableCell>
                        <TableCell className="text-right">Creator Plan</TableCell>
                        <TableCell className="text-right">{formatAUD(usdToAud(billingData?.elevenLabsFeeUSD || 0))}</TableCell>
                      </TableRow>
                      {elevenLabsUsage?.isOverLimit && (
                        <TableRow className="text-red-500">
                          <TableCell className="font-medium pl-8">
                            <Minus className="h-4 w-4 inline mr-2" />
                            TTS Overage
                          </TableCell>
                          <TableCell className="text-right">
                            {Math.max(0, (elevenLabsUsage?.minutesUsed || 0) - (elevenLabsUsage?.minutesIncluded || 100)).toFixed(1)} min
                          </TableCell>
                          <TableCell className="text-right">
                            {formatAUD(usdToAud(Math.max(0, (elevenLabsUsage?.minutesUsed || 0) - (elevenLabsUsage?.minutesIncluded || 100)) * ELEVENLABS_PRICING.ttsOveragePerMinuteUSD))}
                          </TableCell>
                        </TableRow>
                      )}
                      <TableRow className="font-bold bg-muted/50">
                        <TableCell>Total Fixed</TableCell>
                        <TableCell></TableCell>
                        <TableCell className="text-right">{formatAUD(usdToAud(billingData?.totalFixedCostUSD || 0))}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>

            {/* P&L Summary */}
            <Card className="bg-gradient-to-br from-slate-500/5 to-slate-500/10">
              <CardHeader>
                <CardTitle className="text-lg">Profit & Loss Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 bg-green-500/10 rounded-lg">
                    <span className="font-medium text-green-700">Revenue</span>
                    <span className="text-xl font-bold text-green-700">{formatAUD(billingData?.totalRevenue || 0)}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-red-500/10 rounded-lg">
                    <span className="font-medium text-red-700">Less: Variable Costs</span>
                    <span className="text-xl font-bold text-red-700">-{formatAUD(usdToAud(billingData?.totalVariableCostUSD || 0))}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-orange-500/10 rounded-lg">
                    <span className="font-medium text-orange-700">Less: Fixed Costs</span>
                    <span className="text-xl font-bold text-orange-700">-{formatAUD(usdToAud(billingData?.totalFixedCostUSD || 0))}</span>
                  </div>
                  <div className="border-t-2 pt-3">
                    <div className={`flex justify-between items-center p-3 rounded-lg ${
                      (billingData?.grossProfit || 0) >= 0 ? 'bg-blue-500/10' : 'bg-red-500/20'
                    }`}>
                      <span className="font-bold text-lg">Gross Profit</span>
                      <span className={`text-2xl font-bold ${
                        (billingData?.grossProfit || 0) >= 0 ? 'text-blue-700' : 'text-red-700'
                      }`}>
                        {formatAUD(billingData?.grossProfit || 0)}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Unit Rates Tab */}
          <TabsContent value="rates" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Info className="h-5 w-5" />
                  Unit Cost Reference (Itemized)
                </CardTitle>
                <CardDescription>
                  These are the variable costs per unit - fixed costs are shown separately
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Voice AI Breakdown */}
                  <div className="p-4 rounded-lg border bg-purple-500/5 border-purple-500/20">
                    <div className="flex items-center gap-2 mb-3">
                      <Phone className="h-5 w-5 text-purple-500" />
                      <h3 className="font-semibold">Voice AI Minute</h3>
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Twilio (voice)</span>
                        <span>${VOICE_AI_COSTS_PER_MINUTE.twilio.toFixed(4)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Deepgram (STT)</span>
                        <span>${VOICE_AI_COSTS_PER_MINUTE.deepgram.toFixed(4)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">OpenAI (GPT-mini)</span>
                        <span>${VOICE_AI_COSTS_PER_MINUTE.openai.toFixed(4)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Fly.io (compute)</span>
                        <span>${VOICE_AI_COSTS_PER_MINUTE.flyio.toFixed(4)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Supabase (DB)</span>
                        <span>${VOICE_AI_COSTS_PER_MINUTE.supabase.toFixed(4)}</span>
                      </div>
                      <div className="flex justify-between pt-2 border-t font-bold text-purple-600">
                        <span>Total USD</span>
                        <span>${VOICE_AI_COSTS_PER_MINUTE.total.toFixed(4)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-purple-600">
                        <span>Total AUD</span>
                        <span>${usdToAud(VOICE_AI_COSTS_PER_MINUTE.total).toFixed(4)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground pt-2 border-t">
                        ElevenLabs TTS is a fixed monthly cost (200 mins included)
                      </p>
                    </div>
                  </div>

                  {/* Chat Breakdown */}
                  <div className="p-4 rounded-lg border bg-blue-500/5 border-blue-500/20">
                    <div className="flex items-center gap-2 mb-3">
                      <MessageSquare className="h-5 w-5 text-blue-500" />
                      <h3 className="font-semibold">Chat Interaction</h3>
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">OpenAI (GPT-mini)</span>
                        <span>${CHAT_COSTS_PER_INTERACTION.openai.toFixed(4)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Fly.io (compute)</span>
                        <span>${CHAT_COSTS_PER_INTERACTION.flyio.toFixed(4)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Supabase (DB)</span>
                        <span>${CHAT_COSTS_PER_INTERACTION.supabase.toFixed(4)}</span>
                      </div>
                      <div className="flex justify-between pt-2 border-t font-bold text-blue-600">
                        <span>Total USD</span>
                        <span>${CHAT_COSTS_PER_INTERACTION.total.toFixed(4)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-blue-600">
                        <span>Total AUD</span>
                        <span>${usdToAud(CHAT_COSTS_PER_INTERACTION.total).toFixed(4)}</span>
                      </div>
                    </div>
                  </div>

                  {/* SMS Breakdown */}
                  <div className="p-4 rounded-lg border bg-green-500/5 border-green-500/20">
                    <div className="flex items-center gap-2 mb-3">
                      <MessageCircle className="h-5 w-5 text-green-500" />
                      <h3 className="font-semibold">SMS Message</h3>
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Twilio (SMS AU)</span>
                        <span>${SMS_COSTS_PER_MESSAGE.twilio.toFixed(4)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">OpenAI (GPT-mini)</span>
                        <span>${SMS_COSTS_PER_MESSAGE.openai.toFixed(4)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Fly.io (compute)</span>
                        <span>${SMS_COSTS_PER_MESSAGE.flyio.toFixed(4)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Supabase (DB)</span>
                        <span>${SMS_COSTS_PER_MESSAGE.supabase.toFixed(4)}</span>
                      </div>
                      <div className="flex justify-between pt-2 border-t font-bold text-green-600">
                        <span>Total USD</span>
                        <span>${SMS_COSTS_PER_MESSAGE.total.toFixed(4)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-green-600">
                        <span>Total AUD</span>
                        <span>${usdToAud(SMS_COSTS_PER_MESSAGE.total).toFixed(4)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Fixed Costs Summary */}
                <div className="mt-6 p-4 rounded-lg border bg-amber-500/5 border-amber-500/20">
                  <div className="flex items-center gap-2 mb-3">
                    <Calendar className="h-5 w-5 text-amber-500" />
                    <h3 className="font-semibold">Fixed Monthly Costs</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Phone Number</span>
                      <span className="font-medium">${FIXED_MONTHLY_COSTS.twilioPhoneNumber} USD (${usdToAud(FIXED_MONTHLY_COSTS.twilioPhoneNumber).toFixed(2)} AUD)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Fly.io VM</span>
                      <span className="font-medium">${FIXED_MONTHLY_COSTS.flyioVmSydney} USD (${usdToAud(FIXED_MONTHLY_COSTS.flyioVmSydney).toFixed(2)} AUD)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">ElevenLabs ({ELEVENLABS_PRICING.flashMinutesIncluded} flash mins)</span>
                      <span className="font-medium">${ELEVENLABS_PRICING.monthlyFeeUSD} USD (${usdToAud(ELEVENLABS_PRICING.monthlyFeeUSD).toFixed(2)} AUD)</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Organizations Tab */}
          <TabsContent value="organizations" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Organization Usage & Costs
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Organization</TableHead>
                        <TableHead className="text-right">Voice Min</TableHead>
                        <TableHead className="text-right">Chats</TableHead>
                        <TableHead className="text-right">Usage Cost</TableHead>
                        <TableHead className="text-right">Monthly Fee</TableHead>
                        <TableHead className="text-right">Margin</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {billingData?.organizations.map((org) => {
                        const margin = org.monthlyFee - org.totalCostAUD;
                        return (
                          <TableRow key={org.id}>
                            <TableCell className="font-medium">{org.name}</TableCell>
                            <TableCell className="text-right">{org.voiceMinutes.toFixed(1)}</TableCell>
                            <TableCell className="text-right">{org.chatInteractions}</TableCell>
                            <TableCell className="text-right text-red-600">{formatAUD(org.totalCostAUD)}</TableCell>
                            <TableCell className="text-right text-green-600">{formatAUD(org.monthlyFee)}</TableCell>
                            <TableCell className={`text-right font-bold ${margin >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                              {formatAUD(margin)}
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge className={org.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}>
                                {org.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {(!billingData?.organizations || billingData.organizations.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                            No organizations found
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <Card className="bg-muted/50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <h4 className="font-medium text-sm">Billing Notes</h4>
                <ul className="text-sm text-muted-foreground mt-1 space-y-1">
                  <li>Variable costs scale with usage (voice minutes, chat sessions, SMS) - excludes ElevenLabs TTS</li>
                  <li>Fixed costs include phone numbers, hosting, and ElevenLabs subscription ($22/mo)</li>
                  <li>ElevenLabs Creator plan includes {ELEVENLABS_PRICING.flashMinutesIncluded} flash TTS minutes; overage charged at ${ELEVENLABS_PRICING.flashOveragePerMinuteUSD}/min</li>
                  <li>Fully-loaded cost = Variable cost + (Fixed costs / Total AI minutes)</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
