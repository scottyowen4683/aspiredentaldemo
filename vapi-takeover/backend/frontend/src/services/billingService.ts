/**
 * Billing Service
 * Fetches usage data and calculates costs based on actual service usage
 */

import { supabase } from "@/supabaseClient";
import {
  USD_TO_AUD_RATE,
  usdToAud,
  ELEVENLABS_PRICING,
  TWILIO_PRICING,
  DEEPGRAM_PRICING,
  OPENAI_PRICING,
  FLYIO_PRICING,
  calculateMonthlyPlatformCosts,
  ServiceCostBreakdown,
} from "@/lib/pricing";

// ============================================================================
// Types
// ============================================================================

export interface UsagePeriod {
  startDate: Date;
  endDate: Date;
}

export interface ServiceUsage {
  // Voice minutes
  totalVoiceMinutes: number;
  inboundVoiceMinutes: number;
  outboundVoiceMinutes: number;
  // Chat sessions
  totalChatSessions: number;
  totalChatMessages: number;
  // Tokens
  totalInputTokens: number;
  totalOutputTokens: number;
  // From database cost columns
  dbWhisperCost: number;
  dbGptCost: number;
  dbElevenLabsCost: number;
  dbTwilioCost: number;
  dbTotalCost: number;
}

export interface DetailedCostBreakdown {
  // Service-level costs (calculated from pricing)
  elevenLabs: {
    ttsMinutes: number;
    costUSD: number;
    costAUD: number;
  };
  twilio: {
    callMinutes: number;
    inboundMinutes: number;
    outboundMinutes: number;
    phoneNumberCount: number;
    callCostUSD: number;
    numberCostUSD: number;
    totalCostUSD: number;
    totalCostAUD: number;
  };
  deepgram: {
    sttMinutes: number;
    costUSD: number;
    costAUD: number;
  };
  openai: {
    inputTokens: number;
    outputTokens: number;
    whisperMinutes: number;
    llmCostUSD: number;
    whisperCostUSD: number;
    totalCostUSD: number;
    totalCostAUD: number;
  };
  flyio: {
    vmType: string;
    storageCostAUD: number;
    vmCostAUD: number;
    totalCostAUD: number;
  };
  // Totals
  totalCostUSD: number;
  totalCostAUD: number;
  // Raw database costs (for comparison)
  databaseRecordedCosts: {
    whisper: number;
    gpt: number;
    elevenlabs: number;
    twilio: number;
    total: number;
  };
}

export interface OrganizationBillingDetails {
  orgId: string;
  orgName: string;
  period: UsagePeriod;
  usage: ServiceUsage;
  costs: DetailedCostBreakdown;
  // Plan details
  flatRateFee: number;
  includedInteractions: number;
  currentInteractions: number;
  overageRate: number;
  // Calculated billing
  planCost: number;
  overageCost: number;
  apiCosts: number;
  totalBill: number;
}

export interface PlatformBillingSummary {
  period: UsagePeriod;
  // Aggregated usage across all orgs
  totalVoiceMinutes: number;
  totalChatSessions: number;
  totalConversations: number;
  // Costs by service (platform-wide)
  serviceBreakdown: ServiceCostBreakdown[];
  // Totals
  totalApiCostUSD: number;
  totalApiCostAUD: number;
  totalRevenue: number;
  grossMargin: number;
  // Organizations
  organizations: OrganizationBillingDetails[];
}

// ============================================================================
// Usage Fetching Functions
// ============================================================================

/**
 * Get date range for billing period
 */
export function getBillingPeriod(period: 'current' | 'last' | '90d'): UsagePeriod {
  const now = new Date();

  if (period === 'current') {
    return {
      startDate: new Date(now.getFullYear(), now.getMonth(), 1),
      endDate: now,
    };
  } else if (period === 'last') {
    return {
      startDate: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      endDate: new Date(now.getFullYear(), now.getMonth(), 0),
    };
  } else {
    const start = new Date();
    start.setDate(start.getDate() - 90);
    return {
      startDate: start,
      endDate: now,
    };
  }
}

/**
 * Fetch usage data for an organization
 */
export async function fetchOrganizationUsage(
  orgId: string,
  period: UsagePeriod
): Promise<ServiceUsage> {
  // Fetch conversations with cost data
  const { data: conversations, error } = await supabase
    .from("conversations")
    .select(`
      id,
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
    .eq("org_id", orgId)
    .gte("created_at", period.startDate.toISOString())
    .lte("created_at", period.endDate.toISOString());

  if (error) {
    console.error("Error fetching conversations:", error);
    throw error;
  }

  // Aggregate usage
  const usage: ServiceUsage = {
    totalVoiceMinutes: 0,
    inboundVoiceMinutes: 0,
    outboundVoiceMinutes: 0,
    totalChatSessions: 0,
    totalChatMessages: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    dbWhisperCost: 0,
    dbGptCost: 0,
    dbElevenLabsCost: 0,
    dbTwilioCost: 0,
    dbTotalCost: 0,
  };

  if (conversations) {
    conversations.forEach((conv) => {
      // Voice vs Chat
      if (conv.channel === 'voice') {
        const minutes = (conv.duration_seconds || 0) / 60;
        usage.totalVoiceMinutes += minutes;
        // Assume 70% inbound, 30% outbound for now (could be improved with more data)
        usage.inboundVoiceMinutes += minutes * 0.7;
        usage.outboundVoiceMinutes += minutes * 0.3;
      } else {
        usage.totalChatSessions++;
      }

      // Tokens
      usage.totalInputTokens += conv.tokens_in || 0;
      usage.totalOutputTokens += conv.tokens_out || 0;

      // Database costs
      usage.dbWhisperCost += parseFloat(conv.whisper_cost) || 0;
      usage.dbGptCost += parseFloat(conv.gpt_cost) || 0;
      usage.dbElevenLabsCost += parseFloat(conv.elevenlabs_cost) || 0;
      usage.dbTwilioCost += parseFloat(conv.twilio_cost) || 0;
      usage.dbTotalCost += parseFloat(conv.total_cost) || 0;
    });
  }

  return usage;
}

/**
 * Fetch phone number count for an organization
 */
export async function fetchPhoneNumberCount(orgId: string): Promise<number> {
  const { count, error } = await supabase
    .from("assistants")
    .select("phone_number", { count: 'exact', head: true })
    .eq("org_id", orgId)
    .not("phone_number", "is", null);

  if (error) {
    console.error("Error fetching phone numbers:", error);
    return 0;
  }

  return count || 0;
}

// ============================================================================
// Cost Calculation Functions
// ============================================================================

/**
 * Calculate detailed costs from usage data
 */
export function calculateDetailedCosts(
  usage: ServiceUsage,
  phoneNumberCount: number
): DetailedCostBreakdown {
  // ElevenLabs (TTS for voice)
  const elevenLabsTtsMinutes = usage.totalVoiceMinutes;
  const elevenLabsOverage = Math.max(0, elevenLabsTtsMinutes - ELEVENLABS_PRICING.ttsMinutesIncluded);
  const elevenLabsCostUSD = elevenLabsOverage * ELEVENLABS_PRICING.ttsOveragePerMinuteUSD;

  // Twilio (calls)
  const twilioInboundCostUSD = usage.inboundVoiceMinutes * TWILIO_PRICING.localCallsReceiveUSD;
  const twilioOutboundCostUSD = usage.outboundVoiceMinutes * TWILIO_PRICING.localCallsMakeUSD;
  const twilioCallCostUSD = twilioInboundCostUSD + twilioOutboundCostUSD;
  const twilioNumberCostUSD = phoneNumberCount * TWILIO_PRICING.localNumberMonthlyUSD;

  // Deepgram (STT) - assuming Deepgram is used for STT instead of Whisper in some cases
  // For now, we'll use the Whisper minutes as STT minutes
  const deepgramMinutes = usage.totalVoiceMinutes;
  const deepgramCostUSD = deepgramMinutes * DEEPGRAM_PRICING.nova2PerMinuteUSD;

  // OpenAI (LLM + Whisper)
  const openaiLlmCostUSD =
    (usage.totalInputTokens / 1000) * OPENAI_PRICING.gpt4oMiniInputPer1kTokensUSD +
    (usage.totalOutputTokens / 1000) * OPENAI_PRICING.gpt4oMiniOutputPer1kTokensUSD;
  const openaiWhisperCostUSD = usage.totalVoiceMinutes * OPENAI_PRICING.whisperPerMinuteUSD;

  // Fly.io (base server cost - shared across orgs, so prorate by usage)
  // For now, assume a base cost that's divided among all usage
  const flyioBaseCostAUD = FLYIO_PRICING.sharedCpu1x1gb;

  // Calculate totals
  const totalCostUSD =
    elevenLabsCostUSD +
    twilioCallCostUSD +
    twilioNumberCostUSD +
    deepgramCostUSD +
    openaiLlmCostUSD +
    openaiWhisperCostUSD;

  return {
    elevenLabs: {
      ttsMinutes: elevenLabsTtsMinutes,
      costUSD: elevenLabsCostUSD,
      costAUD: usdToAud(elevenLabsCostUSD),
    },
    twilio: {
      callMinutes: usage.totalVoiceMinutes,
      inboundMinutes: usage.inboundVoiceMinutes,
      outboundMinutes: usage.outboundVoiceMinutes,
      phoneNumberCount,
      callCostUSD: twilioCallCostUSD,
      numberCostUSD: twilioNumberCostUSD,
      totalCostUSD: twilioCallCostUSD + twilioNumberCostUSD,
      totalCostAUD: usdToAud(twilioCallCostUSD + twilioNumberCostUSD),
    },
    deepgram: {
      sttMinutes: deepgramMinutes,
      costUSD: deepgramCostUSD,
      costAUD: usdToAud(deepgramCostUSD),
    },
    openai: {
      inputTokens: usage.totalInputTokens,
      outputTokens: usage.totalOutputTokens,
      whisperMinutes: usage.totalVoiceMinutes,
      llmCostUSD: openaiLlmCostUSD,
      whisperCostUSD: openaiWhisperCostUSD,
      totalCostUSD: openaiLlmCostUSD + openaiWhisperCostUSD,
      totalCostAUD: usdToAud(openaiLlmCostUSD + openaiWhisperCostUSD),
    },
    flyio: {
      vmType: 'shared-cpu-1x-1gb',
      storageCostAUD: 0,
      vmCostAUD: flyioBaseCostAUD,
      totalCostAUD: flyioBaseCostAUD,
    },
    totalCostUSD,
    totalCostAUD: usdToAud(totalCostUSD) + flyioBaseCostAUD,
    databaseRecordedCosts: {
      whisper: usage.dbWhisperCost,
      gpt: usage.dbGptCost,
      elevenlabs: usage.dbElevenLabsCost,
      twilio: usage.dbTwilioCost,
      total: usage.dbTotalCost,
    },
  };
}

// ============================================================================
// Main Billing Functions
// ============================================================================

/**
 * Get billing details for a single organization
 */
export async function getOrganizationBilling(
  orgId: string,
  period: 'current' | 'last' | '90d' = 'current'
): Promise<OrganizationBillingDetails | null> {
  const billingPeriod = getBillingPeriod(period);

  // Fetch organization details
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select(`
      id,
      name,
      flat_rate_fee,
      included_interactions,
      overage_rate_per_1000,
      current_period_interactions
    `)
    .eq("id", orgId)
    .single();

  if (orgError || !org) {
    console.error("Error fetching organization:", orgError);
    return null;
  }

  // Fetch usage
  const usage = await fetchOrganizationUsage(orgId, billingPeriod);
  const phoneCount = await fetchPhoneNumberCount(orgId);

  // Calculate costs
  const costs = calculateDetailedCosts(usage, phoneCount);

  // Calculate plan billing
  const flatRateFee = parseFloat(org.flat_rate_fee) || 0;
  const includedInteractions = org.included_interactions || 5000;
  const currentInteractions = org.current_period_interactions || 0;
  const overageRate = parseFloat(org.overage_rate_per_1000) || 0;

  const overageInteractions = Math.max(0, currentInteractions - includedInteractions);
  const overageCost = (overageInteractions / 1000) * overageRate;
  const planCost = flatRateFee + overageCost;

  return {
    orgId: org.id,
    orgName: org.name,
    period: billingPeriod,
    usage,
    costs,
    flatRateFee,
    includedInteractions,
    currentInteractions,
    overageRate,
    planCost,
    overageCost,
    apiCosts: costs.totalCostAUD,
    totalBill: planCost, // Client sees plan cost, not API costs
  };
}

/**
 * Get platform-wide billing summary (super admin only)
 */
export async function getPlatformBillingSummary(
  period: 'current' | 'last' | '90d' = 'current'
): Promise<PlatformBillingSummary> {
  const billingPeriod = getBillingPeriod(period);

  // Fetch all organizations
  const { data: orgs, error: orgsError } = await supabase
    .from("organizations")
    .select(`
      id,
      name,
      flat_rate_fee,
      included_interactions,
      overage_rate_per_1000,
      current_period_interactions,
      active
    `)
    .eq("active", true);

  if (orgsError) {
    console.error("Error fetching organizations:", orgsError);
    throw orgsError;
  }

  // Aggregate data
  const organizations: OrganizationBillingDetails[] = [];
  let totalVoiceMinutes = 0;
  let totalChatSessions = 0;
  let totalApiCostUSD = 0;
  let totalRevenue = 0;

  // Aggregate service costs
  let totalElevenLabsUSD = 0;
  let totalTwilioUSD = 0;
  let totalDeepgramUSD = 0;
  let totalOpenAIUSD = 0;

  for (const org of orgs || []) {
    const billing = await getOrganizationBilling(org.id, period);
    if (billing) {
      organizations.push(billing);
      totalVoiceMinutes += billing.usage.totalVoiceMinutes;
      totalChatSessions += billing.usage.totalChatSessions;
      totalApiCostUSD += billing.costs.totalCostUSD;
      totalRevenue += billing.planCost;

      totalElevenLabsUSD += billing.costs.elevenLabs.costUSD;
      totalTwilioUSD += billing.costs.twilio.totalCostUSD;
      totalDeepgramUSD += billing.costs.deepgram.costUSD;
      totalOpenAIUSD += billing.costs.openai.totalCostUSD;
    }
  }

  // Add Fly.io cost (shared infrastructure)
  const flyioCostAUD = FLYIO_PRICING.sharedCpu1x1gb;

  // Build service breakdown
  const serviceBreakdown: ServiceCostBreakdown[] = [
    {
      service: 'ElevenLabs (TTS)',
      costUSD: totalElevenLabsUSD,
      costAUD: usdToAud(totalElevenLabsUSD),
      details: `${totalVoiceMinutes.toFixed(1)} minutes TTS`,
      isNativeCurrency: 'USD',
    },
    {
      service: 'Twilio (Calls & Numbers)',
      costUSD: totalTwilioUSD,
      costAUD: usdToAud(totalTwilioUSD),
      details: `${totalVoiceMinutes.toFixed(1)} call minutes`,
      isNativeCurrency: 'USD',
    },
    {
      service: 'Deepgram (STT)',
      costUSD: totalDeepgramUSD,
      costAUD: usdToAud(totalDeepgramUSD),
      details: `${totalVoiceMinutes.toFixed(1)} minutes transcribed`,
      isNativeCurrency: 'USD',
    },
    {
      service: 'OpenAI (LLM + Whisper)',
      costUSD: totalOpenAIUSD,
      costAUD: usdToAud(totalOpenAIUSD),
      details: 'GPT-4o-mini + Whisper',
      isNativeCurrency: 'USD',
    },
    {
      service: 'Fly.io (Hosting)',
      costUSD: flyioCostAUD / USD_TO_AUD_RATE,
      costAUD: flyioCostAUD,
      details: 'shared-cpu-1x 1GB',
      isNativeCurrency: 'AUD',
    },
  ];

  const totalApiCostAUD = usdToAud(totalApiCostUSD) + flyioCostAUD;
  const grossMargin = totalRevenue > 0 ? ((totalRevenue - totalApiCostAUD) / totalRevenue) * 100 : 0;

  return {
    period: billingPeriod,
    totalVoiceMinutes,
    totalChatSessions,
    totalConversations: totalVoiceMinutes + totalChatSessions,
    serviceBreakdown,
    totalApiCostUSD,
    totalApiCostAUD,
    totalRevenue,
    grossMargin,
    organizations,
  };
}

// ============================================================================
// Pricing Settings Management (for super admin)
// ============================================================================

export interface StoredPricingSettings {
  key: string;
  value: unknown;
  updated_at: string;
  updated_by?: string;
}

/**
 * Get current USD/AUD exchange rate setting
 */
export async function getExchangeRate(): Promise<number> {
  // For now, return the default rate
  // In the future, this could fetch from a settings table or external API
  return USD_TO_AUD_RATE;
}

/**
 * Update exchange rate (super admin only)
 */
export async function updateExchangeRate(newRate: number): Promise<boolean> {
  // This would update a settings table in the database
  // For now, just return true as a placeholder
  console.log("Exchange rate would be updated to:", newRate);
  return true;
}

// ============================================================================
// Export summary for display
// ============================================================================

export interface BillingSummaryForDisplay {
  // Top-level metrics
  totalRevenueAUD: number;
  totalApiCostsAUD: number;
  grossProfitAUD: number;
  grossMarginPercent: number;
  // Service breakdown
  services: {
    name: string;
    costAUD: number;
    costUSD: number;
    percentOfTotal: number;
    details: string;
  }[];
  // Usage metrics
  usage: {
    voiceMinutes: number;
    chatSessions: number;
    totalConversations: number;
    tokensUsed: number;
  };
  // Exchange rate info
  exchangeRate: number;
  lastUpdated: string;
}

/**
 * Format billing data for display
 */
export function formatBillingForDisplay(summary: PlatformBillingSummary): BillingSummaryForDisplay {
  const totalCost = summary.totalApiCostAUD;

  return {
    totalRevenueAUD: summary.totalRevenue,
    totalApiCostsAUD: summary.totalApiCostAUD,
    grossProfitAUD: summary.totalRevenue - summary.totalApiCostAUD,
    grossMarginPercent: summary.grossMargin,
    services: summary.serviceBreakdown.map((s) => ({
      name: s.service,
      costAUD: s.costAUD,
      costUSD: s.costUSD,
      percentOfTotal: totalCost > 0 ? (s.costAUD / totalCost) * 100 : 0,
      details: s.details,
    })),
    usage: {
      voiceMinutes: summary.totalVoiceMinutes,
      chatSessions: summary.totalChatSessions,
      totalConversations: summary.totalConversations,
      tokensUsed: summary.organizations.reduce(
        (sum, org) => sum + org.usage.totalInputTokens + org.usage.totalOutputTokens,
        0
      ),
    },
    exchangeRate: USD_TO_AUD_RATE,
    lastUpdated: new Date().toISOString(),
  };
}
