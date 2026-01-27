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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
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
  Server,
  Mic,
  Volume2,
  Brain,
  Globe,
  Calendar,
  Clock,
  CheckCircle,
  Info,
  ArrowRight,
  Percent,
} from "lucide-react";
import { useUser } from "@/context/UserContext";
import { useState } from "react";
import { supabase } from "@/supabaseClient";
import { useQuery } from "@tanstack/react-query";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import {
  USD_TO_AUD_RATE,
  usdToAud,
  formatCurrency,
  ELEVENLABS_PRICING,
  TWILIO_PRICING,
  DEEPGRAM_PRICING,
  OPENAI_PRICING,
  FLYIO_PRICING,
} from "@/lib/pricing";

// ============================================================================
// Types
// ============================================================================

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
  // Usage metrics
  voiceMinutes: number;
  chatSessions: number;
  inputTokens: number;
  outputTokens: number;
  // Costs
  elevenLabsCost: number;
  twilioCost: number;
  deepgramCost: number;
  openaiCost: number;
  totalApiCost: number;
  // Calculated fields
  overageInteractions: number;
  overageCost: number;
  totalBill: number;
  usagePercentage: number;
}

interface ServiceCost {
  service: string;
  description: string;
  costUSD: number;
  costAUD: number;
  usage: string;
  color: string;
  icon: string;
  isNativeCurrency: 'USD' | 'AUD';
}

interface BillingData {
  // Revenue & Profit
  totalRevenue: number;
  totalApiCosts: number;
  grossProfit: number;
  grossMargin: number;
  // Counts
  totalInteractions: number;
  totalVoiceMinutes: number;
  totalChatSessions: number;
  organizationCount: number;
  avgBillPerOrg: number;
  // Service breakdown
  serviceCosts: ServiceCost[];
  // Organizations
  organizations: OrganizationBilling[];
  // Exchange rate
  exchangeRate: number;
}

const INTERACTION_COLORS = {
  call_inbound: "#10B981",
  call_outbound: "#3B82F6",
  sms_inbound: "#8B5CF6",
  sms_outbound: "#F59E0B",
  chat_session: "#06B6D4",
};

const SERVICE_COLORS = {
  elevenlabs: "#8B5CF6",
  twilio: "#F43F5E",
  deepgram: "#10B981",
  openai: "#3B82F6",
  flyio: "#6366F1",
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
          active
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

      // Fetch conversations with cost data
      let convQuery = supabase
        .from("conversations")
        .select(`
          org_id,
          channel,
          duration_seconds,
          tokens_in,
          tokens_out,
          whisper_cost,
          gpt_cost,
          elevenlabs_cost,
          twilio_cost,
          total_cost
        `)
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString());

      if (currentRole === "org_admin" && user?.org_id) {
        convQuery = convQuery.eq("org_id", user.org_id);
      } else if (selectedOrg !== "all") {
        convQuery = convQuery.eq("org_id", selectedOrg);
      }

      const { data: convData } = await convQuery;

      // Fetch phone number counts per org
      const { data: assistantsData } = await supabase
        .from("assistants")
        .select("org_id, phone_number")
        .not("phone_number", "is", null);

      const phoneCountByOrg: Record<string, number> = {};
      assistantsData?.forEach((a) => {
        phoneCountByOrg[a.org_id] = (phoneCountByOrg[a.org_id] || 0) + 1;
      });

      // Aggregate usage by org
      const usageByOrg: Record<string, {
        voiceMinutes: number;
        chatSessions: number;
        inputTokens: number;
        outputTokens: number;
        dbElevenLabs: number;
        dbTwilio: number;
        dbWhisper: number;
        dbGpt: number;
        dbTotal: number;
      }> = {};

      convData?.forEach((conv) => {
        if (!usageByOrg[conv.org_id]) {
          usageByOrg[conv.org_id] = {
            voiceMinutes: 0,
            chatSessions: 0,
            inputTokens: 0,
            outputTokens: 0,
            dbElevenLabs: 0,
            dbTwilio: 0,
            dbWhisper: 0,
            dbGpt: 0,
            dbTotal: 0,
          };
        }

        const usage = usageByOrg[conv.org_id];
        if (conv.channel === 'voice') {
          usage.voiceMinutes += (conv.duration_seconds || 0) / 60;
        } else {
          usage.chatSessions++;
        }
        usage.inputTokens += conv.tokens_in || 0;
        usage.outputTokens += conv.tokens_out || 0;
        usage.dbElevenLabs += parseFloat(conv.elevenlabs_cost) || 0;
        usage.dbTwilio += parseFloat(conv.twilio_cost) || 0;
        usage.dbWhisper += parseFloat(conv.whisper_cost) || 0;
        usage.dbGpt += parseFloat(conv.gpt_cost) || 0;
        usage.dbTotal += parseFloat(conv.total_cost) || 0;
      });

      // Calculate costs for each organization
      const organizations: OrganizationBilling[] = (orgsData || []).map(org => {
        const flatRateFee = parseFloat(org.flat_rate_fee) || 0;
        const includedInteractions = org.included_interactions || 5000;
        const overageRatePer1000 = parseFloat(org.overage_rate_per_1000) || 0;
        const currentInteractions = org.current_period_interactions || 0;
        const monthlyServiceFee = flatRateFee;

        // Get usage data
        const usage = usageByOrg[org.id] || {
          voiceMinutes: 0,
          chatSessions: 0,
          inputTokens: 0,
          outputTokens: 0,
          dbElevenLabs: 0,
          dbTwilio: 0,
          dbWhisper: 0,
          dbGpt: 0,
          dbTotal: 0,
        };
        const phoneCount = phoneCountByOrg[org.id] || 0;

        // Calculate API costs based on actual usage and pricing
        // ElevenLabs TTS
        const elevenLabsOverage = Math.max(0, usage.voiceMinutes - ELEVENLABS_PRICING.ttsMinutesIncluded);
        const elevenLabsCostUSD = elevenLabsOverage * ELEVENLABS_PRICING.ttsOveragePerMinuteUSD;
        const elevenLabsCost = usdToAud(elevenLabsCostUSD);

        // Twilio - calls + phone numbers
        const twilioCallCostUSD =
          (usage.voiceMinutes * 0.7 * TWILIO_PRICING.localCallsReceiveUSD) +
          (usage.voiceMinutes * 0.3 * TWILIO_PRICING.localCallsMakeUSD);
        const twilioNumberCostUSD = phoneCount * TWILIO_PRICING.localNumberMonthlyUSD;
        const twilioCost = usdToAud(twilioCallCostUSD + twilioNumberCostUSD);

        // Deepgram STT
        const deepgramCostUSD = usage.voiceMinutes * DEEPGRAM_PRICING.nova2PerMinuteUSD;
        const deepgramCost = usdToAud(deepgramCostUSD);

        // OpenAI LLM + Whisper
        const openaiLlmCostUSD =
          (usage.inputTokens / 1000) * OPENAI_PRICING.gpt4oMiniInputPer1kTokensUSD +
          (usage.outputTokens / 1000) * OPENAI_PRICING.gpt4oMiniOutputPer1kTokensUSD;
        const openaiWhisperCostUSD = usage.voiceMinutes * OPENAI_PRICING.whisperPerMinuteUSD;
        const openaiCost = usdToAud(openaiLlmCostUSD + openaiWhisperCostUSD);

        const totalApiCost = elevenLabsCost + twilioCost + deepgramCost + openaiCost;

        // Calculate plan billing
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
          status: org.active === false ? 'inactive' : 'active',
          voiceMinutes: usage.voiceMinutes,
          chatSessions: usage.chatSessions,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          elevenLabsCost,
          twilioCost,
          deepgramCost,
          openaiCost,
          totalApiCost,
          overageInteractions,
          overageCost,
          totalBill,
          usagePercentage,
        };
      });

      // Calculate platform-wide totals
      const totalRevenue = organizations.reduce((sum, org) => sum + org.totalBill, 0);
      const totalApiCosts = organizations.reduce((sum, org) => sum + org.totalApiCost, 0);
      const totalVoiceMinutes = organizations.reduce((sum, org) => sum + org.voiceMinutes, 0);
      const totalChatSessions = organizations.reduce((sum, org) => sum + org.chatSessions, 0);
      const totalInputTokens = organizations.reduce((sum, org) => sum + org.inputTokens, 0);
      const totalOutputTokens = organizations.reduce((sum, org) => sum + org.outputTokens, 0);
      const totalPhoneNumbers = Object.values(phoneCountByOrg).reduce((sum, count) => sum + count, 0);

      // Add Fly.io cost (shared infrastructure)
      const flyioCostAUD = FLYIO_PRICING.sharedCpu1x1gb;
      const totalApiCostsWithFlyio = totalApiCosts + flyioCostAUD;

      // Calculate service breakdown
      const totalElevenLabsUSD = organizations.reduce((sum, org) => {
        const overage = Math.max(0, org.voiceMinutes - ELEVENLABS_PRICING.ttsMinutesIncluded);
        return sum + (overage * ELEVENLABS_PRICING.ttsOveragePerMinuteUSD);
      }, 0);

      const totalTwilioCallsUSD = organizations.reduce((sum, org) => {
        return sum + (org.voiceMinutes * 0.7 * TWILIO_PRICING.localCallsReceiveUSD) +
          (org.voiceMinutes * 0.3 * TWILIO_PRICING.localCallsMakeUSD);
      }, 0);
      const totalTwilioNumbersUSD = totalPhoneNumbers * TWILIO_PRICING.localNumberMonthlyUSD;
      const totalTwilioUSD = totalTwilioCallsUSD + totalTwilioNumbersUSD;

      const totalDeepgramUSD = totalVoiceMinutes * DEEPGRAM_PRICING.nova2PerMinuteUSD;

      const totalOpenAIUSD =
        (totalInputTokens / 1000) * OPENAI_PRICING.gpt4oMiniInputPer1kTokensUSD +
        (totalOutputTokens / 1000) * OPENAI_PRICING.gpt4oMiniOutputPer1kTokensUSD +
        totalVoiceMinutes * OPENAI_PRICING.whisperPerMinuteUSD;

      const serviceCosts: ServiceCost[] = [
        {
          service: 'ElevenLabs',
          description: 'Text-to-Speech (Creator Plan)',
          costUSD: totalElevenLabsUSD,
          costAUD: usdToAud(totalElevenLabsUSD),
          usage: `${totalVoiceMinutes.toFixed(1)} voice minutes`,
          color: SERVICE_COLORS.elevenlabs,
          icon: 'Volume2',
          isNativeCurrency: 'USD',
        },
        {
          service: 'Twilio',
          description: 'Voice calls & phone numbers',
          costUSD: totalTwilioUSD,
          costAUD: usdToAud(totalTwilioUSD),
          usage: `${totalVoiceMinutes.toFixed(1)} call mins, ${totalPhoneNumbers} numbers`,
          color: SERVICE_COLORS.twilio,
          icon: 'Phone',
          isNativeCurrency: 'USD',
        },
        {
          service: 'Deepgram',
          description: 'Speech-to-Text (Nova-2)',
          costUSD: totalDeepgramUSD,
          costAUD: usdToAud(totalDeepgramUSD),
          usage: `${totalVoiceMinutes.toFixed(1)} minutes transcribed`,
          color: SERVICE_COLORS.deepgram,
          icon: 'Mic',
          isNativeCurrency: 'USD',
        },
        {
          service: 'OpenAI',
          description: 'GPT-4o-mini + Whisper',
          costUSD: totalOpenAIUSD,
          costAUD: usdToAud(totalOpenAIUSD),
          usage: `${((totalInputTokens + totalOutputTokens) / 1000).toFixed(1)}k tokens`,
          color: SERVICE_COLORS.openai,
          icon: 'Brain',
          isNativeCurrency: 'USD',
        },
        {
          service: 'Fly.io',
          description: 'Server hosting (Sydney)',
          costUSD: flyioCostAUD / USD_TO_AUD_RATE,
          costAUD: flyioCostAUD,
          usage: 'shared-cpu-1x 1GB',
          color: SERVICE_COLORS.flyio,
          icon: 'Server',
          isNativeCurrency: 'AUD',
        },
      ];

      const grossProfit = totalRevenue - totalApiCostsWithFlyio;
      const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

      return {
        totalRevenue,
        totalApiCosts: totalApiCostsWithFlyio,
        grossProfit,
        grossMargin,
        totalInteractions: totalVoiceMinutes + totalChatSessions,
        totalVoiceMinutes,
        totalChatSessions,
        organizationCount: organizations.length,
        avgBillPerOrg: organizations.length > 0 ? totalRevenue / organizations.length : 0,
        serviceCosts,
        organizations,
        exchangeRate: USD_TO_AUD_RATE,
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

  const getServiceIcon = (iconName: string) => {
    switch (iconName) {
      case 'Volume2': return <Volume2 className="h-5 w-5" />;
      case 'Phone': return <Phone className="h-5 w-5" />;
      case 'Mic': return <Mic className="h-5 w-5" />;
      case 'Brain': return <Brain className="h-5 w-5" />;
      case 'Server': return <Server className="h-5 w-5" />;
      default: return <Activity className="h-5 w-5" />;
    }
  };

  const pieChartData = billingData?.serviceCosts
    .filter(s => s.costAUD > 0)
    .map(s => ({
      name: s.service,
      value: s.costAUD,
      color: s.color,
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
              Billing & Costs
            </h1>
            <p className="text-sm md:text-base text-muted-foreground mt-2">
              {currentRole === "super_admin"
                ? "Platform costs, revenue, and organization billing"
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

        {/* Exchange Rate Notice */}
        <Alert className="bg-blue-500/10 border-blue-500/20">
          <Globe className="h-4 w-4 text-blue-500" />
          <AlertDescription className="text-sm">
            All costs displayed in AUD. USD to AUD exchange rate: <strong>{billingData?.exchangeRate.toFixed(2) || USD_TO_AUD_RATE.toFixed(2)}</strong>
          </AlertDescription>
        </Alert>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Revenue */}
          <Card className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-500/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {currentRole === "super_admin" ? "Total Revenue" : "Your Bill"}
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
                AUD - {selectedPeriod === "current" ? "This period" : selectedPeriod === "last" ? "Last period" : "90 days"}
              </p>
            </CardContent>
          </Card>

          {/* API Costs (Super Admin only) */}
          {currentRole === "super_admin" && (
            <Card className="bg-gradient-to-br from-red-500/10 to-orange-500/10 border-red-500/20">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">API Costs</CardTitle>
                <TrendingDown className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <div className="text-2xl font-bold text-red-600">
                    ${(billingData?.totalApiCosts || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  AUD - All services combined
                </p>
              </CardContent>
            </Card>
          )}

          {/* Gross Profit / Usage */}
          {currentRole === "super_admin" ? (
            <Card className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border-blue-500/20">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Gross Profit</CardTitle>
                <TrendingUp className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <div className={`text-2xl font-bold ${(billingData?.grossProfit || 0) >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                    ${(billingData?.grossProfit || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  {(billingData?.grossMargin || 0).toFixed(1)}% margin
                </p>
              </CardContent>
            </Card>
          ) : (
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
                  Calls and chat sessions
                </p>
              </CardContent>
            </Card>
          )}

          {/* Organizations / Usage */}
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
                <Badge className="bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300">
                  Active
                </Badge>
                <p className="text-xs text-muted-foreground mt-2">
                  Enterprise Plan
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-3 lg:w-[400px]">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="services">Service Costs</TabsTrigger>
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
                    Usage Summary
                  </CardTitle>
                  <CardDescription>
                    Platform-wide usage metrics
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="space-y-4">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-12 w-full" />
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center">
                            <Phone className="h-5 w-5 text-green-500" />
                          </div>
                          <div>
                            <p className="font-medium">Voice Minutes</p>
                            <p className="text-sm text-muted-foreground">Total call duration</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold">{(billingData?.totalVoiceMinutes || 0).toFixed(1)}</p>
                          <p className="text-xs text-muted-foreground">minutes</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                            <MessageSquare className="h-5 w-5 text-blue-500" />
                          </div>
                          <div>
                            <p className="font-medium">Chat Sessions</p>
                            <p className="text-sm text-muted-foreground">Text conversations</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold">{billingData?.totalChatSessions || 0}</p>
                          <p className="text-xs text-muted-foreground">sessions</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                            <Brain className="h-5 w-5 text-purple-500" />
                          </div>
                          <div>
                            <p className="font-medium">LLM Tokens</p>
                            <p className="text-sm text-muted-foreground">Input + Output</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold">
                            {(((billingData?.organizations || []).reduce((sum, o) => sum + o.inputTokens + o.outputTokens, 0)) / 1000).toFixed(1)}k
                          </p>
                          <p className="text-xs text-muted-foreground">tokens</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                            <Building2 className="h-5 w-5 text-amber-500" />
                          </div>
                          <div>
                            <p className="font-medium">Active Organizations</p>
                            <p className="text-sm text-muted-foreground">With interactions</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold">{billingData?.organizationCount || 0}</p>
                          <p className="text-xs text-muted-foreground">orgs</p>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Cost Distribution Pie Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Receipt className="h-5 w-5" />
                    Cost Distribution
                  </CardTitle>
                  <CardDescription>
                    API costs by service (AUD)
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
                            formatter={(value: number) => [`$${value.toFixed(2)} AUD`, 'Cost']}
                          />
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
          </TabsContent>

          {/* Services Tab */}
          <TabsContent value="services" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Server className="h-5 w-5" />
                  Service Cost Breakdown
                </CardTitle>
                <CardDescription>
                  Detailed costs for each external service
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-24 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {billingData?.serviceCosts.map((service, index) => (
                      <div
                        key={index}
                        className="p-4 rounded-lg border"
                        style={{ borderLeftWidth: '4px', borderLeftColor: service.color }}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-4">
                            <div
                              className="h-12 w-12 rounded-lg flex items-center justify-center"
                              style={{ backgroundColor: `${service.color}20` }}
                            >
                              {getServiceIcon(service.icon)}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="font-semibold text-lg">{service.service}</h3>
                                <Badge variant="outline" className="text-xs">
                                  {service.isNativeCurrency}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">{service.description}</p>
                              <p className="text-xs text-muted-foreground mt-1">{service.usage}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-bold">${service.costAUD.toFixed(2)}</p>
                            <p className="text-xs text-muted-foreground">AUD</p>
                            {service.isNativeCurrency === 'USD' && (
                              <p className="text-xs text-muted-foreground">
                                (${service.costUSD.toFixed(2)} USD)
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* Total */}
                    <div className="p-4 rounded-lg bg-muted/50 border-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold text-lg">Total API Costs</h3>
                          <p className="text-sm text-muted-foreground">All services combined</p>
                        </div>
                        <div className="text-right">
                          <p className="text-3xl font-bold">${(billingData?.totalApiCosts || 0).toFixed(2)}</p>
                          <p className="text-sm text-muted-foreground">AUD</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Pricing Reference */}
            <Card className="bg-muted/30">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Info className="h-5 w-5" />
                  Current Pricing Rates
                </CardTitle>
                <CardDescription>
                  Reference rates used for cost calculations
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                  <div className="p-3 rounded-lg bg-background">
                    <h4 className="font-medium text-purple-600 mb-2">ElevenLabs</h4>
                    <ul className="space-y-1 text-muted-foreground">
                      <li>{ELEVENLABS_PRICING.ttsMinutesIncluded} mins included</li>
                      <li>${ELEVENLABS_PRICING.ttsOveragePerMinuteUSD}/min overage</li>
                      <li>(${(ELEVENLABS_PRICING.ttsOveragePerMinuteUSD * USD_TO_AUD_RATE).toFixed(2)} AUD)</li>
                    </ul>
                  </div>
                  <div className="p-3 rounded-lg bg-background">
                    <h4 className="font-medium text-rose-600 mb-2">Twilio</h4>
                    <ul className="space-y-1 text-muted-foreground">
                      <li>Local receive: ${TWILIO_PRICING.localCallsReceiveUSD}/min</li>
                      <li>Local make: ${TWILIO_PRICING.localCallsMakeUSD}/min</li>
                      <li>Number: ${TWILIO_PRICING.localNumberMonthlyUSD}/mo</li>
                    </ul>
                  </div>
                  <div className="p-3 rounded-lg bg-background">
                    <h4 className="font-medium text-green-600 mb-2">Deepgram</h4>
                    <ul className="space-y-1 text-muted-foreground">
                      <li>Nova-2: ${DEEPGRAM_PRICING.nova2PerMinuteUSD.toFixed(4)}/min</li>
                      <li>(${(DEEPGRAM_PRICING.nova2PerMinuteUSD * USD_TO_AUD_RATE).toFixed(4)} AUD)</li>
                    </ul>
                  </div>
                  <div className="p-3 rounded-lg bg-background">
                    <h4 className="font-medium text-blue-600 mb-2">OpenAI</h4>
                    <ul className="space-y-1 text-muted-foreground">
                      <li>GPT-4o-mini: ${OPENAI_PRICING.gpt4oMiniInputPer1kTokensUSD}/1k in</li>
                      <li>GPT-4o-mini: ${OPENAI_PRICING.gpt4oMiniOutputPer1kTokensUSD}/1k out</li>
                      <li>Whisper: ${OPENAI_PRICING.whisperPerMinuteUSD}/min</li>
                    </ul>
                  </div>
                  <div className="p-3 rounded-lg bg-background">
                    <h4 className="font-medium text-indigo-600 mb-2">Fly.io (AUD)</h4>
                    <ul className="space-y-1 text-muted-foreground">
                      <li>1x CPU, 1GB: ${FLYIO_PRICING.sharedCpu1x1gb}/mo</li>
                      <li>Sydney region</li>
                    </ul>
                  </div>
                  <div className="p-3 rounded-lg bg-background">
                    <h4 className="font-medium text-amber-600 mb-2">Exchange Rate</h4>
                    <ul className="space-y-1 text-muted-foreground">
                      <li>1 USD = {USD_TO_AUD_RATE.toFixed(2)} AUD</li>
                    </ul>
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
                  Organization Billing
                </CardTitle>
                <CardDescription>
                  Billing details for each organization
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
                          <TableHead className="text-right">Plan Fee</TableHead>
                          <TableHead className="text-right">Voice Mins</TableHead>
                          <TableHead className="text-right">API Cost</TableHead>
                          <TableHead className="text-center">Usage</TableHead>
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
                              {org.voiceMinutes.toFixed(1)}
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="text-muted-foreground">
                                ${org.totalApiCost.toFixed(2)}
                              </span>
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
                            <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
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

            {/* Profit Summary (Super Admin) */}
            {currentRole === "super_admin" && billingData && (
              <Card className="bg-gradient-to-br from-green-500/5 to-emerald-500/5 border-green-500/20">
                <CardContent className="pt-6">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="text-center p-4">
                      <p className="text-sm text-muted-foreground">Total Revenue</p>
                      <p className="text-2xl font-bold text-green-600">
                        ${billingData.totalRevenue.toFixed(2)}
                      </p>
                    </div>
                    <div className="text-center p-4">
                      <p className="text-sm text-muted-foreground">Total API Costs</p>
                      <p className="text-2xl font-bold text-red-600">
                        ${billingData.totalApiCosts.toFixed(2)}
                      </p>
                    </div>
                    <div className="text-center p-4">
                      <p className="text-sm text-muted-foreground">Gross Profit</p>
                      <p className={`text-2xl font-bold ${billingData.grossProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ${billingData.grossProfit.toFixed(2)}
                      </p>
                    </div>
                    <div className="text-center p-4">
                      <p className="text-sm text-muted-foreground">Gross Margin</p>
                      <p className={`text-2xl font-bold ${billingData.grossMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {billingData.grossMargin.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Billing Period Info */}
        <Card className="bg-muted/50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <h4 className="font-medium text-sm">Billing Information</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  {selectedPeriod === "current"
                    ? "Current billing period. Bills are generated monthly on the 1st."
                    : selectedPeriod === "last"
                    ? "Last billing period. This period has been closed."
                    : "Aggregated data for the last 90 days."}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  All costs are displayed in AUD. Service costs are calculated from actual usage data using current pricing rates.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
