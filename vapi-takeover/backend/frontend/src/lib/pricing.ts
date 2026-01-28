/**
 * Pricing Configuration for All Services
 * All prices are stored in their native currency and converted to AUD for display
 *
 * Services:
 * - ElevenLabs (USD) - Text-to-Speech
 * - Twilio (USD) - Voice calls and phone numbers
 * - Deepgram (USD) - Speech-to-Text
 * - Fly.io (AUD) - Server hosting
 * - OpenAI (USD) - GPT models
 */

// Exchange rate: USD to AUD
// This should be updated periodically or fetched from an API
export const USD_TO_AUD_RATE = 1.58; // As of late 2024/early 2025

/**
 * ElevenLabs Pricing (Creator Plan - USD)
 * https://elevenlabs.io/pricing
 */
export interface ElevenLabsPricing {
  plan: string;
  monthlyFeeUSD: number;
  // Text to Speech (Multilingual V2/V3)
  ttsMinutesIncluded: number;
  ttsOveragePerMinuteUSD: number;
  // Flash (faster, cheaper model)
  flashMinutesIncluded: number;
  flashOveragePerMinuteUSD: number;
  // Audio quality
  audioQuality: string;
}

export const ELEVENLABS_PRICING: ElevenLabsPricing = {
  plan: 'Creator',
  monthlyFeeUSD: 22, // Creator plan ~$22/month
  // Multilingual V2/V3 TTS
  ttsMinutesIncluded: 100,
  ttsOveragePerMinuteUSD: 0.30,
  // Flash model
  flashMinutesIncluded: 200,
  flashOveragePerMinuteUSD: 0.15,
  audioQuality: '128 & 192 kbps (via Studio & API), 44.1kHz',
};

/**
 * Twilio Pricing (Pay-as-you-go - USD)
 * https://www.twilio.com/en-us/pricing
 */
export interface TwilioPricing {
  // Voice call rates (per minute)
  localCallsMakeUSD: number;
  localCallsReceiveUSD: number;
  mobileCallsMakeUSD: number;
  mobileCallsReceiveUSD: number;
  tollFreeCallsMakeUSD: number;
  tollFreeCallsReceiveUSD: number;
  browserAppCallingMakeUSD: number;
  browserAppCallingReceiveUSD: number;
  // Phone number monthly fees
  localNumberMonthlyUSD: number;
  tollFreeNumberMonthlyUSD: number;
  mobileNumberMonthlyUSD: number;
}

export const TWILIO_PRICING: TwilioPricing = {
  // Voice calls (per minute)
  localCallsMakeUSD: 0.0252,
  localCallsReceiveUSD: 0.0100,
  mobileCallsMakeUSD: 0.0750,
  mobileCallsReceiveUSD: 0.0100,
  tollFreeCallsMakeUSD: 0.0240,
  tollFreeCallsReceiveUSD: 0.0500,
  browserAppCallingMakeUSD: 0.0040,
  browserAppCallingReceiveUSD: 0.0040,
  // Phone numbers (per month)
  localNumberMonthlyUSD: 3.00,
  tollFreeNumberMonthlyUSD: 16.00,
  mobileNumberMonthlyUSD: 6.50,
};

/**
 * Deepgram Pricing (Pay-as-you-go - USD)
 * https://deepgram.com/pricing
 */
export interface DeepgramPricing {
  freeCreditsUSD: number;
  // Nova-2 model (recommended for general use)
  nova2PerMinuteUSD: number;
  // Whisper model (OpenAI compatible)
  whisperPerMinuteUSD: number;
  // Base model (budget option)
  basePerMinuteUSD: number;
}

export const DEEPGRAM_PRICING: DeepgramPricing = {
  freeCreditsUSD: 200,
  nova2PerMinuteUSD: 0.0043, // ~$0.26/hr
  whisperPerMinuteUSD: 0.0048, // ~$0.29/hr
  basePerMinuteUSD: 0.0020, // ~$0.12/hr
};

/**
 * Fly.io Pricing (AUD - already in AUD)
 * https://fly.io/docs/about/pricing/
 */
export interface FlyioPricing {
  // Shared CPU VMs (per month) - Sydney region
  sharedCpu1x256mb: number;
  sharedCpu1x512mb: number;
  sharedCpu1x1gb: number;
  sharedCpu1x2gb: number;
  sharedCpu2x512mb: number;
  sharedCpu2x1gb: number;
  sharedCpu2x2gb: number;
  sharedCpu2x4gb: number;
  sharedCpu4x1gb: number;
  // Additional RAM per GB per month
  additionalRamPerGb: number;
  // Storage (per GB per month)
  storagePerGb: number;
  // Outbound data (per GB)
  outboundDataPerGb: number;
}

export const FLYIO_PRICING: FlyioPricing = {
  // Already in AUD
  sharedCpu1x256mb: 2.47,
  sharedCpu1x512mb: 4.05,
  sharedCpu1x1gb: 7.23,
  sharedCpu1x2gb: 13.58,
  sharedCpu2x512mb: 4.93,
  sharedCpu2x1gb: 8.11,
  sharedCpu2x2gb: 14.46,
  sharedCpu2x4gb: 27.16,
  sharedCpu4x1gb: 9.87,
  additionalRamPerGb: 6.35,
  storagePerGb: 0.15,
  outboundDataPerGb: 0.02,
};

/**
 * OpenAI Pricing (USD)
 * https://openai.com/pricing
 */
export interface OpenAIPricing {
  // GPT-4o-mini (default model)
  gpt4oMiniInputPer1kTokensUSD: number;
  gpt4oMiniOutputPer1kTokensUSD: number;
  // GPT-4o
  gpt4oInputPer1kTokensUSD: number;
  gpt4oOutputPer1kTokensUSD: number;
  // Whisper (Speech-to-Text)
  whisperPerMinuteUSD: number;
  // Embeddings
  embeddingsAda002Per1kTokensUSD: number;
  embeddings3SmallPer1kTokensUSD: number;
}

export const OPENAI_PRICING: OpenAIPricing = {
  // GPT-4o-mini
  gpt4oMiniInputPer1kTokensUSD: 0.00015,
  gpt4oMiniOutputPer1kTokensUSD: 0.0006,
  // GPT-4o
  gpt4oInputPer1kTokensUSD: 0.0025,
  gpt4oOutputPer1kTokensUSD: 0.01,
  // Whisper
  whisperPerMinuteUSD: 0.006,
  // Embeddings
  embeddingsAda002Per1kTokensUSD: 0.0001,
  embeddings3SmallPer1kTokensUSD: 0.00002,
};

// ============================================================================
// Conversion Utilities
// ============================================================================

/**
 * Convert USD to AUD
 */
export function usdToAud(usd: number): number {
  return usd * USD_TO_AUD_RATE;
}

/**
 * Convert AUD to USD
 */
export function audToUsd(aud: number): number {
  return aud / USD_TO_AUD_RATE;
}

/**
 * Format currency for display
 */
export function formatCurrency(amount: number, currency: 'AUD' | 'USD' = 'AUD'): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(amount);
}

/**
 * Format small amounts (useful for per-minute rates)
 */
export function formatSmallCurrency(amount: number, currency: 'AUD' | 'USD' = 'AUD'): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  }).format(amount);
}

// ============================================================================
// Cost Calculation Functions
// ============================================================================

/**
 * Calculate ElevenLabs cost for a given usage
 */
export function calculateElevenLabsCost(
  ttsMinutes: number,
  flashMinutes: number = 0,
  includeMonthlyFee: boolean = false
): { usd: number; aud: number; breakdown: { tts: number; flash: number; fee: number } } {
  const ttsOverage = Math.max(0, ttsMinutes - ELEVENLABS_PRICING.ttsMinutesIncluded);
  const ttsCost = ttsOverage * ELEVENLABS_PRICING.ttsOveragePerMinuteUSD;

  const flashOverage = Math.max(0, flashMinutes - ELEVENLABS_PRICING.flashMinutesIncluded);
  const flashCost = flashOverage * ELEVENLABS_PRICING.flashOveragePerMinuteUSD;

  const fee = includeMonthlyFee ? ELEVENLABS_PRICING.monthlyFeeUSD : 0;

  const totalUSD = ttsCost + flashCost + fee;

  return {
    usd: totalUSD,
    aud: usdToAud(totalUSD),
    breakdown: {
      tts: ttsCost,
      flash: flashCost,
      fee: fee,
    },
  };
}

/**
 * Calculate Twilio call cost
 */
export function calculateTwilioCallCost(
  callType: 'local' | 'mobile' | 'toll_free' | 'browser',
  direction: 'inbound' | 'outbound',
  durationMinutes: number
): { usd: number; aud: number } {
  let ratePerMinute: number;

  switch (callType) {
    case 'local':
      ratePerMinute = direction === 'outbound'
        ? TWILIO_PRICING.localCallsMakeUSD
        : TWILIO_PRICING.localCallsReceiveUSD;
      break;
    case 'mobile':
      ratePerMinute = direction === 'outbound'
        ? TWILIO_PRICING.mobileCallsMakeUSD
        : TWILIO_PRICING.mobileCallsReceiveUSD;
      break;
    case 'toll_free':
      ratePerMinute = direction === 'outbound'
        ? TWILIO_PRICING.tollFreeCallsMakeUSD
        : TWILIO_PRICING.tollFreeCallsReceiveUSD;
      break;
    case 'browser':
      ratePerMinute = direction === 'outbound'
        ? TWILIO_PRICING.browserAppCallingMakeUSD
        : TWILIO_PRICING.browserAppCallingReceiveUSD;
      break;
    default:
      ratePerMinute = TWILIO_PRICING.localCallsReceiveUSD;
  }

  const costUSD = durationMinutes * ratePerMinute;
  return {
    usd: costUSD,
    aud: usdToAud(costUSD),
  };
}

/**
 * Calculate Twilio phone number monthly cost
 */
export function calculateTwilioNumberCost(
  numberType: 'local' | 'toll_free' | 'mobile',
  count: number = 1
): { usd: number; aud: number } {
  let monthlyFee: number;

  switch (numberType) {
    case 'local':
      monthlyFee = TWILIO_PRICING.localNumberMonthlyUSD;
      break;
    case 'toll_free':
      monthlyFee = TWILIO_PRICING.tollFreeNumberMonthlyUSD;
      break;
    case 'mobile':
      monthlyFee = TWILIO_PRICING.mobileNumberMonthlyUSD;
      break;
    default:
      monthlyFee = TWILIO_PRICING.localNumberMonthlyUSD;
  }

  const totalUSD = monthlyFee * count;
  return {
    usd: totalUSD,
    aud: usdToAud(totalUSD),
  };
}

/**
 * Calculate Deepgram transcription cost
 */
export function calculateDeepgramCost(
  minutes: number,
  model: 'nova2' | 'whisper' | 'base' = 'nova2'
): { usd: number; aud: number } {
  let ratePerMinute: number;

  switch (model) {
    case 'nova2':
      ratePerMinute = DEEPGRAM_PRICING.nova2PerMinuteUSD;
      break;
    case 'whisper':
      ratePerMinute = DEEPGRAM_PRICING.whisperPerMinuteUSD;
      break;
    case 'base':
      ratePerMinute = DEEPGRAM_PRICING.basePerMinuteUSD;
      break;
    default:
      ratePerMinute = DEEPGRAM_PRICING.nova2PerMinuteUSD;
  }

  const costUSD = minutes * ratePerMinute;
  return {
    usd: costUSD,
    aud: usdToAud(costUSD),
  };
}

/**
 * Calculate OpenAI LLM cost
 */
export function calculateOpenAICost(
  inputTokens: number,
  outputTokens: number,
  model: 'gpt-4o-mini' | 'gpt-4o' = 'gpt-4o-mini'
): { usd: number; aud: number } {
  let inputRate: number;
  let outputRate: number;

  if (model === 'gpt-4o') {
    inputRate = OPENAI_PRICING.gpt4oInputPer1kTokensUSD;
    outputRate = OPENAI_PRICING.gpt4oOutputPer1kTokensUSD;
  } else {
    inputRate = OPENAI_PRICING.gpt4oMiniInputPer1kTokensUSD;
    outputRate = OPENAI_PRICING.gpt4oMiniOutputPer1kTokensUSD;
  }

  const costUSD = (inputTokens / 1000) * inputRate + (outputTokens / 1000) * outputRate;
  return {
    usd: costUSD,
    aud: usdToAud(costUSD),
  };
}

/**
 * Calculate Fly.io hosting cost
 */
export function calculateFlyioCost(
  vmType: keyof Omit<FlyioPricing, 'additionalRamPerGb' | 'storagePerGb' | 'outboundDataPerGb'>,
  additionalStorageGb: number = 0,
  outboundDataGb: number = 0
): { aud: number } {
  const vmCost = FLYIO_PRICING[vmType] as number;
  const storageCost = additionalStorageGb * FLYIO_PRICING.storagePerGb;
  const dataCost = outboundDataGb * FLYIO_PRICING.outboundDataPerGb;

  return {
    aud: vmCost + storageCost + dataCost,
  };
}

// ============================================================================
// Platform Cost Summary
// ============================================================================

export interface ServiceCostBreakdown {
  service: string;
  costUSD: number;
  costAUD: number;
  details: string;
  isNativeCurrency: 'USD' | 'AUD';
}

export interface MonthlyPlatformCosts {
  totalAUD: number;
  totalUSD: number;
  breakdown: ServiceCostBreakdown[];
  exchangeRate: number;
}

/**
 * Calculate total monthly platform costs
 */
export function calculateMonthlyPlatformCosts(usage: {
  // ElevenLabs
  elevenLabsTtsMinutes?: number;
  elevenLabsFlashMinutes?: number;
  includeElevenLabsFee?: boolean;
  // Twilio calls (all in minutes)
  twilioLocalInboundMinutes?: number;
  twilioLocalOutboundMinutes?: number;
  twilioMobileInboundMinutes?: number;
  twilioMobileOutboundMinutes?: number;
  // Twilio phone numbers
  twilioLocalNumbers?: number;
  twilioTollFreeNumbers?: number;
  twilioMobileNumbers?: number;
  // Deepgram
  deepgramMinutes?: number;
  deepgramModel?: 'nova2' | 'whisper' | 'base';
  // OpenAI
  openAIInputTokens?: number;
  openAIOutputTokens?: number;
  openAIModel?: 'gpt-4o-mini' | 'gpt-4o';
  openAIWhisperMinutes?: number;
  // Fly.io
  flyioVmType?: keyof Omit<FlyioPricing, 'additionalRamPerGb' | 'storagePerGb' | 'outboundDataPerGb'>;
  flyioStorageGb?: number;
  flyioOutboundGb?: number;
}): MonthlyPlatformCosts {
  const breakdown: ServiceCostBreakdown[] = [];
  let totalUSD = 0;

  // ElevenLabs
  if (usage.elevenLabsTtsMinutes || usage.elevenLabsFlashMinutes || usage.includeElevenLabsFee) {
    const elCost = calculateElevenLabsCost(
      usage.elevenLabsTtsMinutes || 0,
      usage.elevenLabsFlashMinutes || 0,
      usage.includeElevenLabsFee
    );
    breakdown.push({
      service: 'ElevenLabs (TTS)',
      costUSD: elCost.usd,
      costAUD: elCost.aud,
      details: `${usage.elevenLabsTtsMinutes || 0} TTS mins, ${usage.elevenLabsFlashMinutes || 0} Flash mins`,
      isNativeCurrency: 'USD',
    });
    totalUSD += elCost.usd;
  }

  // Twilio Calls
  let twilioCalls = 0;
  const twilioDetails: string[] = [];

  if (usage.twilioLocalInboundMinutes) {
    const cost = calculateTwilioCallCost('local', 'inbound', usage.twilioLocalInboundMinutes);
    twilioCalls += cost.usd;
    twilioDetails.push(`${usage.twilioLocalInboundMinutes} local inbound mins`);
  }
  if (usage.twilioLocalOutboundMinutes) {
    const cost = calculateTwilioCallCost('local', 'outbound', usage.twilioLocalOutboundMinutes);
    twilioCalls += cost.usd;
    twilioDetails.push(`${usage.twilioLocalOutboundMinutes} local outbound mins`);
  }
  if (usage.twilioMobileInboundMinutes) {
    const cost = calculateTwilioCallCost('mobile', 'inbound', usage.twilioMobileInboundMinutes);
    twilioCalls += cost.usd;
    twilioDetails.push(`${usage.twilioMobileInboundMinutes} mobile inbound mins`);
  }
  if (usage.twilioMobileOutboundMinutes) {
    const cost = calculateTwilioCallCost('mobile', 'outbound', usage.twilioMobileOutboundMinutes);
    twilioCalls += cost.usd;
    twilioDetails.push(`${usage.twilioMobileOutboundMinutes} mobile outbound mins`);
  }

  if (twilioCalls > 0) {
    breakdown.push({
      service: 'Twilio (Calls)',
      costUSD: twilioCalls,
      costAUD: usdToAud(twilioCalls),
      details: twilioDetails.join(', '),
      isNativeCurrency: 'USD',
    });
    totalUSD += twilioCalls;
  }

  // Twilio Phone Numbers
  let twilioNumbers = 0;
  const numberDetails: string[] = [];

  if (usage.twilioLocalNumbers) {
    const cost = calculateTwilioNumberCost('local', usage.twilioLocalNumbers);
    twilioNumbers += cost.usd;
    numberDetails.push(`${usage.twilioLocalNumbers} local`);
  }
  if (usage.twilioTollFreeNumbers) {
    const cost = calculateTwilioNumberCost('toll_free', usage.twilioTollFreeNumbers);
    twilioNumbers += cost.usd;
    numberDetails.push(`${usage.twilioTollFreeNumbers} toll-free`);
  }
  if (usage.twilioMobileNumbers) {
    const cost = calculateTwilioNumberCost('mobile', usage.twilioMobileNumbers);
    twilioNumbers += cost.usd;
    numberDetails.push(`${usage.twilioMobileNumbers} mobile`);
  }

  if (twilioNumbers > 0) {
    breakdown.push({
      service: 'Twilio (Phone Numbers)',
      costUSD: twilioNumbers,
      costAUD: usdToAud(twilioNumbers),
      details: numberDetails.join(', '),
      isNativeCurrency: 'USD',
    });
    totalUSD += twilioNumbers;
  }

  // Deepgram
  if (usage.deepgramMinutes) {
    const dgCost = calculateDeepgramCost(usage.deepgramMinutes, usage.deepgramModel || 'nova2');
    breakdown.push({
      service: 'Deepgram (STT)',
      costUSD: dgCost.usd,
      costAUD: dgCost.aud,
      details: `${usage.deepgramMinutes} mins (${usage.deepgramModel || 'nova2'})`,
      isNativeCurrency: 'USD',
    });
    totalUSD += dgCost.usd;
  }

  // OpenAI
  let openAICost = 0;
  const openAIDetails: string[] = [];

  if (usage.openAIInputTokens || usage.openAIOutputTokens) {
    const llmCost = calculateOpenAICost(
      usage.openAIInputTokens || 0,
      usage.openAIOutputTokens || 0,
      usage.openAIModel || 'gpt-4o-mini'
    );
    openAICost += llmCost.usd;
    openAIDetails.push(`${((usage.openAIInputTokens || 0) / 1000).toFixed(1)}k in / ${((usage.openAIOutputTokens || 0) / 1000).toFixed(1)}k out tokens`);
  }

  if (usage.openAIWhisperMinutes) {
    const whisperCost = usage.openAIWhisperMinutes * OPENAI_PRICING.whisperPerMinuteUSD;
    openAICost += whisperCost;
    openAIDetails.push(`${usage.openAIWhisperMinutes} Whisper mins`);
  }

  if (openAICost > 0) {
    breakdown.push({
      service: 'OpenAI (LLM + Whisper)',
      costUSD: openAICost,
      costAUD: usdToAud(openAICost),
      details: openAIDetails.join(', '),
      isNativeCurrency: 'USD',
    });
    totalUSD += openAICost;
  }

  // Fly.io (already in AUD)
  if (usage.flyioVmType) {
    const flyioCost = calculateFlyioCost(
      usage.flyioVmType,
      usage.flyioStorageGb || 0,
      usage.flyioOutboundGb || 0
    );
    breakdown.push({
      service: 'Fly.io (Hosting)',
      costUSD: audToUsd(flyioCost.aud),
      costAUD: flyioCost.aud,
      details: `${usage.flyioVmType}${usage.flyioStorageGb ? `, ${usage.flyioStorageGb}GB storage` : ''}`,
      isNativeCurrency: 'AUD',
    });
    // Fly.io is in AUD, so convert to USD for the total
    totalUSD += audToUsd(flyioCost.aud);
  }

  return {
    totalAUD: usdToAud(totalUSD),
    totalUSD: totalUSD,
    breakdown,
    exchangeRate: USD_TO_AUD_RATE,
  };
}

// ============================================================================
// Default Configurable Settings (can be overridden by super admin)
// ============================================================================

export interface PlatformPricingSettings {
  usdToAudRate: number;
  elevenLabs: ElevenLabsPricing;
  twilio: TwilioPricing;
  deepgram: DeepgramPricing;
  openai: OpenAIPricing;
  flyio: FlyioPricing;
  lastUpdated: string;
}

export const DEFAULT_PRICING_SETTINGS: PlatformPricingSettings = {
  usdToAudRate: USD_TO_AUD_RATE,
  elevenLabs: ELEVENLABS_PRICING,
  twilio: TWILIO_PRICING,
  deepgram: DEEPGRAM_PRICING,
  openai: OPENAI_PRICING,
  flyio: FLYIO_PRICING,
  lastUpdated: new Date().toISOString(),
};
