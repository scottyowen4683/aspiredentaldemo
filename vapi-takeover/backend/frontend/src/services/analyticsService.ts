// src/services/analyticsService.ts
import { supabase } from "@/supabaseClient";

export interface AnalyticsMetrics {
  totalCalls: number;
  totalVoiceCalls: number;
  totalTextCalls: number;
  avgCallDuration: string;
  avgVoiceCallDuration: string;
  avgTextCallDuration: string;
  aiResolutionRate: number;
  escalationRate: number;
  flaggedRate: number;
  avgScore: number;
  confidence: number;
  totalTokens?: number;
  tokenCost?: number;
  moneySaved?: number;
  roi?: number;
  servicePlanCost?: number;
  organizationName?: string;
}

export interface TopQuestion {
  question: string;
  count: number;
  trend: "up" | "down" | "neutral";
}

export interface SentimentData {
  name: string;
  value: number;
  color: string;
}

export interface FeatureUsage {
  name: string;
  value: number;
  percentage: number;
  color: string;
}

export interface ScoreDistribution {
  range: string;
  count: number;
  percentage: number;
}

export interface CallProfile {
  hour: string;
  calls: number;
}

export interface TrendData {
  date: string;
  score: number;
  confidence: number;
  tokens?: number;
}

export interface Organization {
  id: string;
  name: string;
}

export interface DeferralReason {
  reason: string;
  count: number;
  percentage: number;
  description: string;
}

/**
 * Get key performance metrics for analytics dashboard
 * Uses only existing schema tables: conversations, interaction_logs
 */
export async function getAnalyticsMetrics(
  orgId?: string,
  period: string = "30d"
): Promise<AnalyticsMetrics> {
  try {
    console.log("Analytics Metrics Calculation:", { orgId, period });

    const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - days);

    // Build base query - using actual schema columns
    let conversationsQuery = supabase
      .from("conversations")
      .select(`
        id,
        org_id,
        assistant_id,
        channel,
        started_at,
        ended_at,
        duration_seconds,
        success,
        scored,
        overall_score,
        tokens_in,
        tokens_out,
        total_cost,
        end_reason
      `)
      .gte("started_at", dateFrom.toISOString());

    if (orgId && orgId !== "all") {
      conversationsQuery = conversationsQuery.eq("org_id", orgId);
    }

    const { data: conversations, error: conversationsError } = await conversationsQuery;

    if (conversationsError) {
      console.error("Error fetching conversations:", conversationsError);
      throw conversationsError;
    }

    // Calculate metrics
    const totalCalls = conversations?.length || 0;

    // Separate voice and text calls based on channel
    const voiceCalls = conversations?.filter(c => c.channel === 'voice' || c.channel === 'phone') || [];
    const textCalls = conversations?.filter(c => c.channel === 'chat' || c.channel === 'web') || [];
    const totalVoiceCalls = voiceCalls.length;
    const totalTextCalls = textCalls.length;

    // Calculate durations (duration_seconds is in seconds, convert to minutes)
    const callDurations = conversations?.filter(c => c.duration_seconds).map(c => c.duration_seconds / 60) || [];
    const avgCallDurationMinutes = callDurations.length > 0
      ? callDurations.reduce((sum, duration) => sum + duration, 0) / callDurations.length
      : 0;

    // Voice call durations
    const voiceCallDurations = voiceCalls.filter(c => c.duration_seconds).map(c => c.duration_seconds / 60);
    const avgVoiceCallDurationMinutes = voiceCallDurations.length > 0
      ? voiceCallDurations.reduce((sum, duration) => sum + duration, 0) / voiceCallDurations.length
      : 0;

    // Text call durations
    const textCallDurations = textCalls.filter(c => c.duration_seconds).map(c => c.duration_seconds / 60);
    const avgTextCallDurationMinutes = textCallDurations.length > 0
      ? textCallDurations.reduce((sum, duration) => sum + duration, 0) / textCallDurations.length
      : 0;

    // Calculate scores from overall_score column in conversations table
    const scoreValues = conversations?.filter(c => c.overall_score !== null && c.overall_score !== undefined)
      .map(c => c.overall_score) || [];

    const finalAvgScore = scoreValues.length > 0
      ? scoreValues.reduce((sum, score) => sum + score, 0) / scoreValues.length
      : 0;

    // Calculate success rate as AI resolution rate
    const successfulCalls = conversations?.filter(c => c.success === true).length || 0;
    const aiResolutionRate = totalCalls > 0 ? (successfulCalls / totalCalls) * 100 : 0;
    const escalationRate = 100 - aiResolutionRate;

    // Flagged rate - conversations that ended with escalation
    const flaggedConversations = conversations?.filter(c =>
      c.end_reason === 'escalated' || c.end_reason === 'transferred'
    ).length || 0;
    const flaggedRate = totalCalls > 0 ? (flaggedConversations / totalCalls) * 100 : 0;

    // Token usage
    const totalTokensIn = conversations?.reduce((sum, c) => sum + (c.tokens_in || 0), 0) || 0;
    const totalTokensOut = conversations?.reduce((sum, c) => sum + (c.tokens_out || 0), 0) || 0;
    const totalTokens = totalTokensIn + totalTokensOut;

    // Total cost from conversations
    const totalConversationCost = conversations?.reduce((sum, c) => sum + (c.total_cost || 0), 0) || 0;

    // Get organization data
    let organizationName = "All Organizations";
    let totalServicePlanCost = 0;
    let totalMoneySaved = 0;

    if (orgId && orgId !== "all") {
      const { data: orgData } = await supabase
        .from("organizations")
        .select("name, flat_rate_fee, price_per_interaction")
        .eq("id", orgId)
        .single();

      if (orgData) {
        organizationName = orgData.name || "Unknown";
        totalServicePlanCost = orgData.flat_rate_fee || 0;
        // Estimate money saved (avg $5 per human handled call)
        totalMoneySaved = totalCalls * 5;
      }
    }

    // Calculate ROI
    const roi = totalServicePlanCost > 0
      ? ((totalMoneySaved - totalServicePlanCost) / totalServicePlanCost) * 100
      : 0;

    return {
      totalCalls,
      totalVoiceCalls,
      totalTextCalls,
      avgCallDuration: `${avgCallDurationMinutes.toFixed(1)} min`,
      avgVoiceCallDuration: `${avgVoiceCallDurationMinutes.toFixed(1)} min`,
      avgTextCallDuration: `${avgTextCallDurationMinutes.toFixed(1)} min`,
      aiResolutionRate: Math.round(aiResolutionRate * 10) / 10,
      escalationRate: Math.round(escalationRate * 10) / 10,
      flaggedRate: Math.round(flaggedRate * 10) / 10,
      avgScore: Math.round(finalAvgScore * 10) / 10,
      confidence: Math.round(aiResolutionRate * 10) / 10, // Use success rate as confidence proxy
      totalTokens,
      tokenCost: totalConversationCost,
      moneySaved: Math.round(totalMoneySaved),
      roi: Math.round(roi),
      servicePlanCost: totalServicePlanCost,
      organizationName
    };

  } catch (error) {
    console.error("Error in getAnalyticsMetrics:", error);
    throw error;
  }
}

/**
 * Get top questions from conversation transcripts
 * Extracts user messages from transcript.conversation_flow JSONB
 */
export async function getTopQuestions(
  orgId?: string,
  period: string = "30d",
  limit: number = 10
): Promise<TopQuestion[]> {
  try {
    const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - days);

    // Query conversations with transcript data
    let query = supabase
      .from("conversations")
      .select("transcript, started_at")
      .not("transcript", "is", null)
      .gte("started_at", dateFrom.toISOString());

    if (orgId && orgId !== "all") {
      query = query.eq("org_id", orgId);
    }

    const { data: conversations, error } = await query;

    if (error) {
      console.error("Error fetching conversations for questions:", error);
      return [];
    }

    if (!conversations || conversations.length === 0) {
      return [];
    }

    // Extract user questions from transcripts
    const questionCounts: Record<string, { count: number; recentDate: Date }> = {};

    for (const conv of conversations) {
      const transcript = conv.transcript as { conversation_flow?: Array<{ role: string; message: string }> } | null;
      const flow = transcript?.conversation_flow;

      if (!flow || !Array.isArray(flow)) continue;

      // Get user messages that look like questions
      const userMessages = flow
        .filter(msg => msg.role === "user" && msg.message)
        .map(msg => msg.message.trim());

      for (const message of userMessages) {
        // Skip very short messages or non-questions
        if (message.length < 10) continue;

        // Normalize the question for grouping
        const normalized = normalizeQuestion(message);
        if (!normalized) continue;

        if (questionCounts[normalized]) {
          questionCounts[normalized].count++;
          // Track most recent occurrence
          const convDate = new Date(conv.started_at);
          if (convDate > questionCounts[normalized].recentDate) {
            questionCounts[normalized].recentDate = convDate;
          }
        } else {
          questionCounts[normalized] = {
            count: 1,
            recentDate: new Date(conv.started_at)
          };
        }
      }
    }

    // Sort by count and take top N
    const sortedQuestions = Object.entries(questionCounts)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, limit)
      .map(([question, data]) => ({
        question,
        count: data.count,
        trend: determineTrend(data.recentDate, days) as "up" | "down" | "neutral"
      }));

    return sortedQuestions;

  } catch (error) {
    console.error("Error in getTopQuestions:", error);
    return [];
  }
}

/**
 * Normalize a question for grouping similar questions together
 */
function normalizeQuestion(message: string): string | null {
  // Convert to lowercase and clean up
  let normalized = message.toLowerCase().trim();

  // Remove filler words at start
  normalized = normalized.replace(/^(hi|hello|hey|um|uh|so|well|okay|ok|please|can you|could you|would you|do you)\s*/gi, '');

  // Identify question type and normalize
  if (normalized.includes("councillor") || normalized.includes("councilor") || normalized.includes("counselor") || normalized.includes("cancelor") || normalized.includes("canceler")) {
    // Group councillor questions
    const suburbMatch = normalized.match(/(?:for|in)\s+(\w+(?:\s+\w+)?)/i);
    if (suburbMatch) {
      return `Who is the councillor for ${capitalizeFirst(suburbMatch[1])}?`;
    }
    return "Who is my local councillor?";
  }

  if (normalized.includes("bin") || normalized.includes("rubbish") || normalized.includes("garbage") || normalized.includes("waste")) {
    if (normalized.includes("when") || normalized.includes("day") || normalized.includes("put out")) {
      return "When is my bin collection day?";
    }
    return "Bin collection information";
  }

  if (normalized.includes("phone") || normalized.includes("contact") || normalized.includes("email") || normalized.includes("number")) {
    return "Contact details inquiry";
  }

  if (normalized.includes("opening") || normalized.includes("hours") || normalized.includes("open")) {
    return "Opening hours inquiry";
  }

  if (normalized.includes("rate") || normalized.includes("payment") || normalized.includes("pay")) {
    return "Rates and payments inquiry";
  }

  if (normalized.includes("dog") || normalized.includes("pet") || normalized.includes("animal")) {
    return "Pet/animal related inquiry";
  }

  if (normalized.includes("park") || normalized.includes("playground") || normalized.includes("facility")) {
    return "Parks and facilities inquiry";
  }

  // If it's a question (has ?) and is substantial, keep a shortened version
  if (message.includes("?") && message.length > 15) {
    // Truncate to first 60 chars and add ellipsis
    const truncated = message.substring(0, 60).trim();
    return truncated.length < message.length ? truncated + "..." : truncated;
  }

  // Skip non-questions and very short messages
  return null;
}

/**
 * Determine trend based on recency
 */
function determineTrend(recentDate: Date, periodDays: number): string {
  const now = new Date();
  const daysSinceRecent = (now.getTime() - recentDate.getTime()) / (1000 * 60 * 60 * 24);

  // If asked in last 25% of period, trending up
  if (daysSinceRecent < periodDays * 0.25) {
    return "up";
  }
  // If asked in last 50% of period, neutral
  if (daysSinceRecent < periodDays * 0.5) {
    return "neutral";
  }
  // If older, trending down
  return "down";
}

/**
 * Capitalize first letter
 */
function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Get sentiment analysis data based on conversation success rate
 */
export async function getSentimentData(
  orgId?: string,
  period: string = "30d"
): Promise<SentimentData[]> {
  try {
    const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - days);

    let query = supabase
      .from("conversations")
      .select("success, overall_score")
      .gte("started_at", dateFrom.toISOString());

    if (orgId && orgId !== "all") {
      query = query.eq("org_id", orgId);
    }

    const { data: conversations, error } = await query;

    if (error) {
      console.error("Error fetching sentiment data:", error);
      throw error;
    }

    const total = conversations?.length || 0;

    if (total === 0) {
      return [
        { name: "Positive", value: 0, color: "#10B981" },
        { name: "Neutral", value: 0, color: "#6B7280" },
        { name: "Negative", value: 0, color: "#EF4444" },
      ];
    }

    // Use success and score to infer sentiment
    const positive = conversations?.filter(c =>
      c.success === true || (c.overall_score && c.overall_score >= 70)
    ).length || 0;

    const negative = conversations?.filter(c =>
      c.success === false && (!c.overall_score || c.overall_score < 50)
    ).length || 0;

    const neutral = total - positive - negative;

    return [
      { name: "Positive", value: Math.round((positive / total) * 1000) / 10, color: "#10B981" },
      { name: "Neutral", value: Math.round((neutral / total) * 1000) / 10, color: "#6B7280" },
      { name: "Negative", value: Math.round((negative / total) * 1000) / 10, color: "#EF4444" },
    ];

  } catch (error) {
    console.error("Error in getSentimentData:", error);
    return [
      { name: "Positive", value: 0, color: "#10B981" },
      { name: "Neutral", value: 0, color: "#6B7280" },
      { name: "Negative", value: 0, color: "#EF4444" },
    ];
  }
}

/**
 * Get feature usage data (voice vs chat) based on channel column
 */
export async function getFeatureUsage(
  orgId?: string,
  period: string = "30d"
): Promise<FeatureUsage[]> {
  try {
    const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - days);

    let query = supabase
      .from("conversations")
      .select("channel")
      .gte("started_at", dateFrom.toISOString());

    if (orgId && orgId !== "all") {
      query = query.eq("org_id", orgId);
    }

    const { data: conversations, error } = await query;

    if (error) {
      console.error("Error fetching feature usage:", error);
      throw error;
    }

    const total = conversations?.length || 0;

    // Voice calls based on channel
    const voiceCalls = conversations?.filter(c =>
      c.channel === 'voice' || c.channel === 'phone'
    ).length || 0;

    const textConversations = conversations?.filter(c =>
      c.channel === 'chat' || c.channel === 'web' || !c.channel
    ).length || 0;

    if (total === 0) {
      return [
        { name: "Voice Calls", value: 0, percentage: 0, color: "#8B5CF6" },
        { name: "Text Conversations", value: 0, percentage: 0, color: "#06B6D4" },
      ];
    }

    return [
      {
        name: "Voice Calls",
        value: voiceCalls,
        percentage: Math.round((voiceCalls / total) * 1000) / 10,
        color: "#8B5CF6"
      },
      {
        name: "Text Conversations",
        value: textConversations,
        percentage: Math.round((textConversations / total) * 1000) / 10,
        color: "#06B6D4"
      },
    ];

  } catch (error) {
    console.error("Error in getFeatureUsage:", error);
    return [
      { name: "Voice Calls", value: 0, percentage: 0, color: "#8B5CF6" },
      { name: "Text Conversations", value: 0, percentage: 0, color: "#06B6D4" },
    ];
  }
}

/**
 * Get score distribution data using overall_score column
 */
export async function getScoreDistribution(
  orgId?: string,
  period: string = "30d"
): Promise<ScoreDistribution[]> {
  try {
    const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - days);

    let baseQuery = supabase
      .from("conversations")
      .select("overall_score")
      .eq("scored", true)
      .not("overall_score", "is", null)
      .gte("started_at", dateFrom.toISOString());

    if (orgId && orgId !== "all") {
      baseQuery = baseQuery.eq("org_id", orgId);
    }

    const { data: conversations, error: conversationsError } = await baseQuery;

    if (conversationsError) {
      console.error("Error fetching conversations:", conversationsError);
      return getEmptyScoreDistribution();
    }

    if (!conversations || conversations.length === 0) {
      return getEmptyScoreDistribution();
    }

    // Extract overall_score from conversations
    const scores: number[] = conversations
      .filter(conv => conv.overall_score !== null && conv.overall_score >= 0 && conv.overall_score <= 100)
      .map(conv => conv.overall_score);

    if (scores.length === 0) {
      return getEmptyScoreDistribution();
    }

    return calculateScoreDistribution(scores);

  } catch (error) {
    console.error("Error in getScoreDistribution:", error);
    return getEmptyScoreDistribution();
  }
}

/**
 * Get empty score distribution when no data is available
 */
function getEmptyScoreDistribution(): ScoreDistribution[] {
  return [
    { range: "90-100", count: 0, percentage: 0 },
    { range: "80-89", count: 0, percentage: 0 },
    { range: "70-79", count: 0, percentage: 0 },
    { range: "60-69", count: 0, percentage: 0 },
    { range: "0-59", count: 0, percentage: 0 },
  ];
}

/**
 * Helper function to calculate score distribution from array of scores
 */
function calculateScoreDistribution(scores: number[]): ScoreDistribution[] {
  const total = scores.length;
  
  const ranges = {
    "90-100": scores.filter(s => s >= 90).length,
    "80-89": scores.filter(s => s >= 80 && s < 90).length,
    "70-79": scores.filter(s => s >= 70 && s < 80).length,
    "60-69": scores.filter(s => s >= 60 && s < 70).length,
    "0-59": scores.filter(s => s < 60).length,
  };

  return Object.entries(ranges).map(([range, count]) => ({
    range,
    count,
    percentage: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
  }));
}

/**
 * Get call profile data (calls by hour)
 */
export async function getCallProfile(
  orgId?: string,
  period: string = "30d"
): Promise<CallProfile[]> {
  try {
    const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - days);

    let query = supabase
      .from("conversations")
      .select("started_at")
      .gte("started_at", dateFrom.toISOString());

    if (orgId && orgId !== "all") {
      query = query.eq("org_id", orgId);
    }

    const { data: conversations, error } = await query;

    if (error) {
      console.error("Error fetching call profile:", error);
      throw error;
    }

    // Group by hour
    const hourCounts = new Array(24).fill(0);
    conversations?.forEach(conv => {
      if (conv.started_at) {
        const hour = new Date(conv.started_at).getHours();
        hourCounts[hour]++;
      }
    });

    // Format for business hours (9 AM - 5 PM)
    return [
      { hour: "9AM", calls: hourCounts[9] },
      { hour: "10AM", calls: hourCounts[10] },
      { hour: "11AM", calls: hourCounts[11] },
      { hour: "12PM", calls: hourCounts[12] },
      { hour: "1PM", calls: hourCounts[13] },
      { hour: "2PM", calls: hourCounts[14] },
      { hour: "3PM", calls: hourCounts[15] },
      { hour: "4PM", calls: hourCounts[16] },
      { hour: "5PM", calls: hourCounts[17] },
    ];

  } catch (error) {
    console.error("Error in getCallProfile:", error);
    return [
      { hour: "9AM", calls: 0 },
      { hour: "10AM", calls: 0 },
      { hour: "11AM", calls: 0 },
      { hour: "12PM", calls: 0 },
      { hour: "1PM", calls: 0 },
      { hour: "2PM", calls: 0 },
      { hour: "3PM", calls: 0 },
      { hour: "4PM", calls: 0 },
      { hour: "5PM", calls: 0 },
    ];
  }
}

/**
 * Get trend data over time using actual schema columns
 */
export async function getTrendData(
  orgId?: string,
  period: string = "30d"
): Promise<TrendData[]> {
  try {
    const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
    const weeks = Math.ceil(days / 7);

    const trendData: TrendData[] = [];

    for (let i = weeks - 1; i >= 0; i--) {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - (i + 1) * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      // Get conversations for this week
      let conversationsQuery = supabase
        .from("conversations")
        .select("overall_score, success, tokens_in, tokens_out")
        .gte("started_at", weekStart.toISOString())
        .lte("started_at", weekEnd.toISOString());

      if (orgId && orgId !== "all") {
        conversationsQuery = conversationsQuery.eq("org_id", orgId);
      }

      const { data: conversations } = await conversationsQuery;

      // Calculate averages for this week
      const scoreValues = conversations?.filter(c => c.overall_score !== null)
        .map(c => c.overall_score) || [];

      const avgScore = scoreValues.length > 0
        ? scoreValues.reduce((sum, score) => sum + score, 0) / scoreValues.length
        : 0;

      // Use success rate as confidence proxy
      const successCount = conversations?.filter(c => c.success === true).length || 0;
      const totalCount = conversations?.length || 0;
      const avgConfidence = totalCount > 0 ? (successCount / totalCount) * 100 : 0;

      // Calculate total tokens from conversations
      const totalTokens = conversations?.reduce((sum, c) =>
        sum + (c.tokens_in || 0) + (c.tokens_out || 0), 0) || 0;

      trendData.push({
        date: weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        score: Math.round(avgScore * 10) / 10,
        confidence: Math.round(avgConfidence * 10) / 10,
        tokens: totalTokens,
      });
    }

    return trendData;

  } catch (error) {
    console.error("Error in getTrendData:", error);
    return [];
  }
}

/**
 * Get top deferral/escalation reasons based on end_reason column
 */
export async function getTopDeferralReasons(
  orgId?: string,
  period: string = "30d",
  limit: number = 10
): Promise<DeferralReason[]> {
  try {
    const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - days);

    let query = supabase
      .from("conversations")
      .select("end_reason")
      .gte("started_at", dateFrom.toISOString())
      .not("end_reason", "is", null);

    if (orgId && orgId !== "all") {
      query = query.eq("org_id", orgId);
    }

    const { data: conversations, error } = await query;

    if (error) {
      console.error("Error fetching deferral reasons:", error);
      throw error;
    }

    // Map of end_reason descriptions
    const reasonDescriptions: Record<string, string> = {
      "escalated": "Transferred to human agent",
      "transferred": "Transferred to another department",
      "timeout": "Conversation timed out",
      "user_ended": "Customer ended conversation",
      "completed": "Successfully resolved",
      "error": "Technical error occurred",
      "other": "Other reasons"
    };

    // Count reasons
    const reasonCounts: Record<string, number> = {};
    let total = 0;

    conversations?.forEach(conv => {
      if (conv.end_reason) {
        const reason = conv.end_reason;
        reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
        total++;
      }
    });

    // Convert to array and sort by count
    const sortedReasons = Object.entries(reasonCounts)
      .map(([reason, count]) => ({
        reason: reason.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        count,
        percentage: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
        description: reasonDescriptions[reason] || "End reason"
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

    return sortedReasons;

  } catch (error) {
    console.error("Error in getTopDeferralReasons:", error);
    return [];
  }
}

/**
 * Get organizations for super admin dropdown
 */
export async function getOrganizations(): Promise<Organization[]> {
  try {
    const { data: organizations, error } = await supabase
      .from("organizations")
      .select("id, name")
      .order("name");

    if (error) {
      console.error("Error fetching organizations:", error);
      throw error;
    }

    return [
      { id: "all", name: "All Organizations" },
      ...(organizations?.map(org => ({
        id: org.id,
        name: org.name,
      })) || [])
    ];

  } catch (error) {
    console.error("Error in getOrganizations:", error);
    return [{ id: "all", name: "All Organizations" }];
  }
}