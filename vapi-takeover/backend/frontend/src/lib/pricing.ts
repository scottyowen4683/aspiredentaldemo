/**
 * Pricing Configuration for All Services
 *
 * ITEMISED COSTING – USD (as specified by business requirements)
 * Last updated: January 2026
 *
 * Services:
 * - ElevenLabs (USD) - Text-to-Speech
 * - Twilio (USD) - Voice calls, SMS, and phone numbers
 * - Deepgram (USD) - Speech-to-Text
 * - OpenAI (USD) - GPT models
 * - Fly.io (USD) - Server hosting
 * - Supabase (USD) - Database
 */

// Exchange rate: USD to AUD
export const USD_TO_AUD_RATE = 1.58;

// ============================================================================
// VARIABLE COSTS PER UNIT (USD)
// ============================================================================

/**
 * Voice AI Minute - Total: $0.071 USD
 * These costs apply per AI-handled voice minute
 */
export const VOICE_AI_COSTS_PER_MINUTE = {
  twilio: 0.0100,      // Twilio AU voice (inbound/outbound)
  deepgram: 0.0100,    // Deepgram STT per transcription minute
  elevenlabs: 0.0360,  // ElevenLabs TTS per generated audio minute
  openai: 0.0100,      // OpenAI GPT-mini modelled per-minute equivalent
  flyio: 0.0040,       // Fly.io incremental compute (flat estimate)
  supabase: 0.0010,    // Supabase reads/writes (negligible)
  total: 0.0710,       // Total variable cost per AI voice minute
};

/**
 * Post-Transfer Minute - Total: $0.010 USD
 * After AI transfers to human, only Twilio costs apply
 */
export const POST_TRANSFER_COSTS_PER_MINUTE = {
  twilio: 0.0100,
  total: 0.0100,
};

/**
 * Chat Interaction - Total: $0.047 USD
 * Per chat session (not per minute)
 */
export const CHAT_COSTS_PER_INTERACTION = {
  openai: 0.0400,      // OpenAI GPT-mini avg tokens per chat
  flyio: 0.0050,       // Fly.io request handling
  supabase: 0.0020,    // Supabase reads/writes
  total: 0.0470,       // Total per chat interaction
};

/**
 * SMS Interaction - Total: $0.019 USD
 * Per SMS sent by AI
 */
export const SMS_COSTS_PER_MESSAGE = {
  twilio: 0.0150,      // Twilio SMS send (AU)
  openai: 0.0030,      // OpenAI GPT-mini message generation
  flyio: 0.0005,       // Fly.io compute (negligible)
  supabase: 0.0005,    // Supabase (negligible)
  total: 0.0190,       // Total per SMS
};

// ============================================================================
// FIXED MONTHLY COSTS (USD)
// ============================================================================

export const FIXED_MONTHLY_COSTS = {
  twilioPhoneNumber: 6.50,    // Per phone number rental
  flyioVmSydney: 7.23,        // Fly.io VM shared-cpu-1x, 1GB Sydney
};

// ============================================================================
// ELEVENLABS PLAN DETAILS (Creator Plan - $11/month)
// ============================================================================

export interface ElevenLabsPricing {
  plan: string;
  monthlyFeeUSD: number;
  ttsMinutesIncluded: number;
  ttsOveragePerMinuteUSD: number;
  flashMinutesIncluded: number;
  flashOveragePerMinuteUSD: number;
  audioQuality: string;
}

export const ELEVENLABS_PRICING: ElevenLabsPricing = {
  plan: 'Creator',
  monthlyFeeUSD: 11,                    // Creator plan $11/month
  ttsMinutesIncluded: 100,              // ~100 mins Multilingual V2/V3 included
  ttsOveragePerMinuteUSD: 0.30,         // ~$0.30/min overage
  flashMinutesIncluded: 200,            // ~200 mins Flash included
  flashOveragePerMinuteUSD: 0.15,       // ~$0.15/min Flash overage
  audioQuality: '128 & 192 kbps (via Studio & API), 44.1kHz',
};

// ============================================================================
// DETAILED SERVICE PRICING (for reference/breakdown)
// ============================================================================

export interface TwilioPricing {
  localCallsReceiveUSD: number;
  localCallsMakeUSD: number;
  smsOutboundUSD: number;
  smsInboundUSD: number;
  localNumberMonthlyUSD: number;
  mobileNumberMonthlyUSD: number;
  tollFreeNumberMonthlyUSD: number;
}

export const TWILIO_PRICING: TwilioPricing = {
  localCallsReceiveUSD: 0.0100,
  localCallsMakeUSD: 0.0100,           // Simplified to single rate for AU
  smsOutboundUSD: 0.0150,
  smsInboundUSD: 0.0075,
  localNumberMonthlyUSD: 6.50,
  mobileNumberMonthlyUSD: 6.50,
  tollFreeNumberMonthlyUSD: 16.00,
};

export interface DeepgramPricing {
  nova2PerMinuteUSD: number;
}

export const DEEPGRAM_PRICING: DeepgramPricing = {
  nova2PerMinuteUSD: 0.0100,           // Simplified to match actual cost
};

export interface OpenAIPricing {
  gpt4oMiniInputPer1kTokensUSD: number;
  gpt4oMiniOutputPer1kTokensUSD: number;
  whisperPerMinuteUSD: number;
}

export const OPENAI_PRICING: OpenAIPricing = {
  gpt4oMiniInputPer1kTokensUSD: 0.00015,
  gpt4oMiniOutputPer1kTokensUSD: 0.0006,
  whisperPerMinuteUSD: 0.006,
};

export interface FlyioPricing {
  sharedCpu1x1gb: number;
  perMinuteEstimate: number;
}

export const FLYIO_PRICING: FlyioPricing = {
  sharedCpu1x1gb: 7.23,                // Monthly fixed cost
  perMinuteEstimate: 0.0040,           // Per-minute variable estimate
};

// ============================================================================
// CONVERSION UTILITIES
// ============================================================================

export function usdToAud(usd: number): number {
  return usd * USD_TO_AUD_RATE;
}

export function audToUsd(aud: number): number {
  return aud / USD_TO_AUD_RATE;
}

export function formatCurrency(amount: number, currency: 'AUD' | 'USD' = 'AUD'): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatSmallCurrency(amount: number, currency: 'AUD' | 'USD' = 'AUD'): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(amount);
}

// ============================================================================
// COST CALCULATION FUNCTIONS
// ============================================================================

/**
 * Calculate cost for AI-handled voice minutes
 */
export function calculateVoiceAICost(minutes: number): { usd: number; aud: number } {
  const costUSD = minutes * VOICE_AI_COSTS_PER_MINUTE.total;
  return { usd: costUSD, aud: usdToAud(costUSD) };
}

/**
 * Calculate cost for post-transfer minutes (human handoff)
 */
export function calculatePostTransferCost(minutes: number): { usd: number; aud: number } {
  const costUSD = minutes * POST_TRANSFER_COSTS_PER_MINUTE.total;
  return { usd: costUSD, aud: usdToAud(costUSD) };
}

/**
 * Calculate cost for chat interactions
 */
export function calculateChatCost(interactions: number): { usd: number; aud: number } {
  const costUSD = interactions * CHAT_COSTS_PER_INTERACTION.total;
  return { usd: costUSD, aud: usdToAud(costUSD) };
}

/**
 * Calculate cost for SMS messages
 */
export function calculateSMSCost(messages: number): { usd: number; aud: number } {
  const costUSD = messages * SMS_COSTS_PER_MESSAGE.total;
  return { usd: costUSD, aud: usdToAud(costUSD) };
}

/**
 * Calculate fixed monthly costs
 */
export function calculateFixedMonthlyCosts(phoneNumbers: number): { usd: number; aud: number } {
  const costUSD = (phoneNumbers * FIXED_MONTHLY_COSTS.twilioPhoneNumber) + FIXED_MONTHLY_COSTS.flyioVmSydney;
  return { usd: costUSD, aud: usdToAud(costUSD) };
}

/**
 * Calculate ElevenLabs overage costs
 * Returns overage cost if over included minutes, 0 otherwise
 */
export function calculateElevenLabsOverage(
  ttsMinutesUsed: number,
  flashMinutesUsed: number = 0
): {
  usd: number;
  aud: number;
  ttsOverageMinutes: number;
  flashOverageMinutes: number;
  ttsUsagePercent: number;
  flashUsagePercent: number;
  needsUpgrade: boolean;
} {
  const ttsOverage = Math.max(0, ttsMinutesUsed - ELEVENLABS_PRICING.ttsMinutesIncluded);
  const flashOverage = Math.max(0, flashMinutesUsed - ELEVENLABS_PRICING.flashMinutesIncluded);

  const ttsCost = ttsOverage * ELEVENLABS_PRICING.ttsOveragePerMinuteUSD;
  const flashCost = flashOverage * ELEVENLABS_PRICING.flashOveragePerMinuteUSD;

  const totalUSD = ttsCost + flashCost;

  const ttsUsagePercent = (ttsMinutesUsed / ELEVENLABS_PRICING.ttsMinutesIncluded) * 100;
  const flashUsagePercent = (flashMinutesUsed / ELEVENLABS_PRICING.flashMinutesIncluded) * 100;

  // Flag if approaching 80% of included minutes
  const needsUpgrade = ttsUsagePercent >= 80 || flashUsagePercent >= 80;

  return {
    usd: totalUSD,
    aud: usdToAud(totalUSD),
    ttsOverageMinutes: ttsOverage,
    flashOverageMinutes: flashOverage,
    ttsUsagePercent,
    flashUsagePercent,
    needsUpgrade,
  };
}

/**
 * Calculate fully-loaded cost per AI voice minute
 * This includes variable costs + prorated fixed costs
 */
export function calculateFullyLoadedVoiceCost(
  totalAiMinutesThisMonth: number,
  phoneNumbers: number = 1
): { usd: number; aud: number; breakdown: { variable: number; fixed: number } } {
  const variableCost = VOICE_AI_COSTS_PER_MINUTE.total;

  // Prorate fixed costs across AI minutes
  const fixedMonthly = (phoneNumbers * FIXED_MONTHLY_COSTS.twilioPhoneNumber) + FIXED_MONTHLY_COSTS.flyioVmSydney;
  const fixedPerMinute = totalAiMinutesThisMonth > 0 ? fixedMonthly / totalAiMinutesThisMonth : 0;

  const totalPerMinute = variableCost + fixedPerMinute;

  return {
    usd: totalPerMinute,
    aud: usdToAud(totalPerMinute),
    breakdown: {
      variable: variableCost,
      fixed: fixedPerMinute,
    },
  };
}

// ============================================================================
// COMPREHENSIVE COST SUMMARY
// ============================================================================

export interface CostSummary {
  // Variable costs
  voiceAiMinutes: number;
  voiceAiCostUSD: number;
  postTransferMinutes: number;
  postTransferCostUSD: number;
  chatInteractions: number;
  chatCostUSD: number;
  smsMessages: number;
  smsCostUSD: number;
  totalVariableCostUSD: number;

  // Fixed costs
  phoneNumbers: number;
  phoneNumberCostUSD: number;
  flyioCostUSD: number;
  totalFixedCostUSD: number;

  // ElevenLabs
  elevenLabsMonthlyFeeUSD: number;
  elevenLabsOverageCostUSD: number;
  elevenLabsTotalUSD: number;
  ttsMinutesUsed: number;
  ttsMinutesIncluded: number;
  ttsUsagePercent: number;

  // Totals
  totalCostUSD: number;
  totalCostAUD: number;

  // Alerts
  elevenLabsNeedsUpgrade: boolean;
}

export function calculateCompleteCostSummary(usage: {
  voiceAiMinutes: number;
  postTransferMinutes?: number;
  chatInteractions: number;
  smsMessages?: number;
  phoneNumbers: number;
  ttsMinutesUsed?: number;
  flashMinutesUsed?: number;
}): CostSummary {
  // Variable costs
  const voiceAiCost = usage.voiceAiMinutes * VOICE_AI_COSTS_PER_MINUTE.total;
  const postTransferCost = (usage.postTransferMinutes || 0) * POST_TRANSFER_COSTS_PER_MINUTE.total;
  const chatCost = usage.chatInteractions * CHAT_COSTS_PER_INTERACTION.total;
  const smsCost = (usage.smsMessages || 0) * SMS_COSTS_PER_MESSAGE.total;
  const totalVariableCost = voiceAiCost + postTransferCost + chatCost + smsCost;

  // Fixed costs
  const phoneNumberCost = usage.phoneNumbers * FIXED_MONTHLY_COSTS.twilioPhoneNumber;
  const flyioCost = FIXED_MONTHLY_COSTS.flyioVmSydney;
  const totalFixedCost = phoneNumberCost + flyioCost;

  // ElevenLabs
  const elevenLabsOverage = calculateElevenLabsOverage(
    usage.ttsMinutesUsed || usage.voiceAiMinutes,
    usage.flashMinutesUsed || 0
  );
  const elevenLabsTotal = ELEVENLABS_PRICING.monthlyFeeUSD + elevenLabsOverage.usd;

  // Total
  const totalCostUSD = totalVariableCost + totalFixedCost + elevenLabsTotal;

  return {
    // Variable
    voiceAiMinutes: usage.voiceAiMinutes,
    voiceAiCostUSD: voiceAiCost,
    postTransferMinutes: usage.postTransferMinutes || 0,
    postTransferCostUSD: postTransferCost,
    chatInteractions: usage.chatInteractions,
    chatCostUSD: chatCost,
    smsMessages: usage.smsMessages || 0,
    smsCostUSD: smsCost,
    totalVariableCostUSD: totalVariableCost,

    // Fixed
    phoneNumbers: usage.phoneNumbers,
    phoneNumberCostUSD: phoneNumberCost,
    flyioCostUSD: flyioCost,
    totalFixedCostUSD: totalFixedCost,

    // ElevenLabs
    elevenLabsMonthlyFeeUSD: ELEVENLABS_PRICING.monthlyFeeUSD,
    elevenLabsOverageCostUSD: elevenLabsOverage.usd,
    elevenLabsTotalUSD: elevenLabsTotal,
    ttsMinutesUsed: usage.ttsMinutesUsed || usage.voiceAiMinutes,
    ttsMinutesIncluded: ELEVENLABS_PRICING.ttsMinutesIncluded,
    ttsUsagePercent: elevenLabsOverage.ttsUsagePercent,

    // Totals
    totalCostUSD: totalCostUSD,
    totalCostAUD: usdToAud(totalCostUSD),

    // Alerts
    elevenLabsNeedsUpgrade: elevenLabsOverage.needsUpgrade,
  };
}

// ============================================================================
// UNIT COST QUICK REFERENCE (for display)
// ============================================================================

export const UNIT_COSTS_QUICK_REF = {
  voiceAiPerMinute: { usd: 0.071, description: 'AI voice minute (variable)' },
  postTransferPerMinute: { usd: 0.010, description: 'Post-transfer minute' },
  chatPerInteraction: { usd: 0.047, description: 'Chat interaction' },
  smsPerMessage: { usd: 0.019, description: 'SMS message' },
  phoneNumberMonthly: { usd: 6.50, description: 'Phone number (monthly)' },
  flyioMonthly: { usd: 7.23, description: 'Fly.io VM (monthly)' },
  elevenLabsMonthly: { usd: 11.00, description: 'ElevenLabs Creator (monthly)' },
};
