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

    // Build base query
    let conversationsQuery = supabase
      .from("conversations")
      .select(`
        *,
        scores(*)
      `)
      .gte("created_at", dateFrom.toISOString());

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
    
    // Separate voice and text calls
    const voiceCalls = conversations?.filter(c => c.is_voice === true) || [];
    const textCalls = conversations?.filter(c => c.is_voice === false) || [];
    const totalVoiceCalls = voiceCalls.length;
    const totalTextCalls = textCalls.length;
    
    // Calculate durations overall (call_duration is in seconds, convert to minutes)
    const callDurations = conversations?.filter(c => c.call_duration).map(c => parseFloat(c.call_duration) / 60) || [];

    console.log("Call Durations Sample (in minutes):", callDurations);
    const avgCallDurationMinutes = callDurations.length > 0 
      ? callDurations.reduce((sum, duration) => sum + duration, 0) / callDurations.length 
      : 0;
    
    // Calculate voice call durations (in seconds, convert to minutes)
    const voiceCallDurations = voiceCalls.filter(c => c.call_duration).map(c => parseFloat(c.call_duration) / 60);
    const avgVoiceCallDurationMinutes = voiceCallDurations.length > 0
      ? voiceCallDurations.reduce((sum, duration) => sum + duration, 0) / voiceCallDurations.length
      : 0;
    
    // Calculate text call durations (in seconds, convert to minutes)
    const textCallDurations = textCalls.filter(c => c.call_duration).map(c => parseFloat(c.call_duration) / 60);
    const avgTextCallDurationMinutes = textCallDurations.length > 0
      ? textCallDurations.reduce((sum, duration) => sum + duration, 0) / textCallDurations.length
      : 0;

    const scoredConversations = conversations?.filter(c => c.scored && c.scores?.length > 0) || [];
    const confidenceScores = conversations?.filter(c => c.confidence_score).map(c => c.confidence_score) || [];
    const avgConfidence = confidenceScores.length > 0 
      ? confidenceScores.reduce((sum, score) => sum + score, 0) / confidenceScores.length 
      : 0;

    // Calculate scores from the scores table
    const allScores = scoredConversations.flatMap(c => c.scores || []);
    const scoreValues: number[] = [];
    
    allScores.forEach(scoreRecord => {
      if (scoreRecord.is_used && scoreRecord.scores) {
        let overallScore = null;
        
        if (typeof scoreRecord.scores === 'object') {
          overallScore = scoreRecord.scores.overall_score || 
                        scoreRecord.scores.overall || 
                        scoreRecord.scores.total_score ||
                        scoreRecord.scores.score ||
                        scoreRecord.scores.average_score;
        }
        
        if (overallScore && typeof overallScore === 'number' && overallScore >= 0 && overallScore <= 100) {
          scoreValues.push(overallScore);
        }
      }
    });
    
    let finalAvgScore = scoreValues.length > 0 
      ? scoreValues.reduce((sum, score) => sum + score, 0) / scoreValues.length 
      : 0;

    // If no scores found via conversations, try direct scores table query
    if (scoreValues.length === 0 && totalCalls > 0) {
      let directScoresQuery = supabase
        .from("scores")
        .select(`
          scores,
          is_used,
          conversations!inner(created_at, org_id)
        `)
        .eq("is_used", true)
        .gte("conversations.created_at", dateFrom.toISOString());

      if (orgId && orgId !== "all") {
        directScoresQuery = directScoresQuery.eq("conversations.org_id", orgId);
      }

      const { data: directScores } = await directScoresQuery;

      if (directScores && directScores.length > 0) {
        const directScoreValues: number[] = [];
        
        directScores.forEach(scoreRecord => {
          if (scoreRecord.scores) {
            let overallScore = null;
            
            if (typeof scoreRecord.scores === 'object') {
              overallScore = scoreRecord.scores.overall_score || 
                            scoreRecord.scores.overall || 
                            scoreRecord.scores.total_score ||
                            scoreRecord.scores.score ||
                            scoreRecord.scores.average_score;
            }
            
            if (overallScore && typeof overallScore === 'number' && overallScore >= 0 && overallScore <= 100) {
              directScoreValues.push(overallScore);
            }
          }
        });
        
        if (directScoreValues.length > 0) {
          finalAvgScore = directScoreValues.reduce((sum, score) => sum + score, 0) / directScoreValues.length;
        }
      }
    }

    // Count flagged conversations
    const flaggedConversations = allScores.filter(s => 
      s.is_used && (
        s.flags?.requires_human_review || 
        s.flags?.policy_violation || 
        s.flags?.customer_complaint
      )
    ).length;

    const flaggedRate = totalCalls > 0 ? (flaggedConversations / totalCalls) * 100 : 0;

    // Calculate escalation rate (conversations with low scores or flags)
    const escalatedConversations = allScores.filter(s => 
      s.is_used && (
        (s.scores?.overall_score && s.scores.overall_score < 70) ||
        s.flags?.requires_human_review
      )
    ).length;
    
    const escalationRate = totalCalls > 0 ? (escalatedConversations / totalCalls) * 100 : 0;
    const aiResolutionRate = 100 - escalationRate;

    // Get organization cost configuration and conversation costs
    let totalConversationCost = 0;
    let totalServicePlanCost = 0;
    let totalMoneySaved = 0;
    let organizationName = "Unknown";

    if (orgId && orgId !== "all") {
      // Get organization service plan configuration
      const { data: orgData, error: orgError } = await supabase
        .from("organizations")
        .select("name, monthly_service_fee, baseline_human_cost_per_call, service_plan_name")
        .eq("id", orgId)
        .single();

      if (!orgError && orgData) {
        organizationName = orgData.name || "Unknown";
        const monthlyServiceFee = orgData.monthly_service_fee || 0;
        const baselineHumanCost = orgData.baseline_human_cost_per_call || 7.50;

        // Debug organization data
        console.log("Organization Cost Configuration:", {
          orgId,
          organizationName,
          monthlyServiceFee,
          baselineHumanCost,
          totalCalls,
          orgData
        });

        // Calculate costs based on service plan
        totalServicePlanCost = monthlyServiceFee;
        totalMoneySaved = totalCalls * baselineHumanCost; // What it would cost with humans
        totalConversationCost = monthlyServiceFee; // Use monthly fee as the cost basis for ROI calculation
      } else {
        console.log("Organization data error or missing:", { orgError, orgData, orgId });
      }
    } else {
      // For super admin viewing all organizations, aggregate costs
      const { data: allOrgs, error: allOrgsError } = await supabase
        .from("organizations")
        .select("id, monthly_service_fee, baseline_human_cost_per_call");

      if (!allOrgsError && allOrgs) {
        totalServicePlanCost = allOrgs.reduce((sum, org) => sum + (org.monthly_service_fee || 0), 0);
        const avgBaselineHumanCost = allOrgs.reduce((sum, org) => sum + (org.baseline_human_cost_per_call || 7.50), 0) / allOrgs.length;
        totalMoneySaved = totalCalls * avgBaselineHumanCost;
        totalConversationCost = totalServicePlanCost; // Total service plan costs across all orgs
      }
    }

    // Get legacy cost data for super admin (internal cost tracking)
    let internalTokenCost = 0;
    if (orgId === "all" || !orgId) {
      let costQuery = supabase
        .from("cost_usage")
        .select("tokens_used, minutes_processed")
        .gte("period_start", dateFrom.toISOString());

      const { data: costData, error: costError } = await costQuery;
      
      if (!costError && costData) {
        const totalTokens = costData.reduce((sum, usage) => sum + (usage.tokens_used || 0), 0);
        const totalMinutes = costData.reduce((sum, usage) => sum + parseFloat(usage.minutes_processed || "0"), 0);

        // GPT-4o pricing: ~$0.00003 per token (rough estimate)
        // Whisper pricing: $0.006 per minute
        const tokenCost = totalTokens * 0.00003;
        const whisperCost = totalMinutes * 0.006;
        internalTokenCost = tokenCost + whisperCost;
      }
    }

    // Calculate ROI based on role and context
    const roi = totalConversationCost > 0 ? ((totalMoneySaved - totalConversationCost) / totalConversationCost) * 100 : 0;

    // Debug logging for ROI calculation
    console.log("ROI Calculation Debug:", {
      totalMoneySaved,
      totalConversationCost,
      totalServicePlanCost,
      internalTokenCost,
      roi,
      totalCalls,
      orgId,
      organizationName
    });

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
      confidence: Math.round(avgConfidence * 10) / 10,
      totalTokens: 0, // Legacy field for compatibility
      tokenCost: internalTokenCost || totalConversationCost, // Use internal cost for super admin, service plan cost for org admin
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
 * Get top questions from resident_questions table
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

    let query = supabase
      .from("resident_questions")
      .select("intent, frequency")
      .gte("created_at", dateFrom.toISOString())
      .order("frequency", { ascending: false })
      .limit(limit);

    if (orgId && orgId !== "all") {
      query = query.eq("org_id", orgId);
    }

    const { data: questions, error } = await query;

    if (error) {
      console.error("Error fetching top questions:", error);
      throw error;
    }

    return (questions || []).map((q, index) => ({
      question: q.intent || `Question ${index + 1}`,
      count: q.frequency || 0,
      trend: "neutral" as const // Default trend when no historical data available
    }));

  } catch (error) {
    console.error("Error in getTopQuestions:", error);
    return [];
  }
}

/**
 * Get sentiment analysis data from scores
 */
export async function getSentimentData(
  orgId?: string, 
  period: string = "30d"
): Promise<SentimentData[]> {
  try {
    const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - days);

    let conversationsQuery = supabase
      .from("conversations")
      .select(`
        scores(sentiments)
      `)
      .gte("created_at", dateFrom.toISOString());

    if (orgId && orgId !== "all") {
      conversationsQuery = conversationsQuery.eq("org_id", orgId);
    }

    const { data: conversations, error } = await conversationsQuery;

    if (error) {
      console.error("Error fetching sentiment data:", error);
      throw error;
    }

    // Aggregate sentiment data
    let positive = 0, neutral = 0, negative = 0, total = 0;

    conversations?.forEach(conv => {
      conv.scores?.forEach(score => {
        if (score.sentiments?.overall_sentiment) {
          total++;
          const sentiment = score.sentiments.overall_sentiment.toLowerCase();
          if (sentiment.includes('positive')) positive++;
          else if (sentiment.includes('negative')) negative++;
          else neutral++;
        }
      });
    });

    if (total === 0) {
      return [
        { name: "Positive", value: 0, color: "#10B981" },
        { name: "Neutral", value: 0, color: "#6B7280" },
        { name: "Negative", value: 0, color: "#EF4444" },
      ];
    }

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
 * Get feature usage data (voice vs chat)
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
      .select("is_voice")
      .gte("created_at", dateFrom.toISOString());

    if (orgId && orgId !== "all") {
      query = query.eq("org_id", orgId);
    }

    const { data: conversations, error } = await query;

    if (error) {
      console.error("Error fetching feature usage:", error);
      throw error;
    }

    const total = conversations?.length || 0;
    
    // Voice calls have is_voice = true, text conversations have is_voice = false
    const voiceCalls = conversations?.filter(c => 
      c.is_voice === true
    ).length || 0;
    
    const textConversations = conversations?.filter(c => 
      c.is_voice === false
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
 * Get score distribution data
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
      .select(`
        id,
        created_at,
        org_id,
        scored,
        confidence_score
      `)
      .eq("scored", true)
      .not("confidence_score", "is", null)
      .gte("created_at", dateFrom.toISOString());

    if (orgId && orgId !== "all") {
      baseQuery = baseQuery.eq("org_id", orgId);
    }

    const { data: conversations, error: conversationsError } = await baseQuery;

    if (conversationsError) {
      console.error("Error fetching conversations:", conversationsError);
      return getEmptyScoreDistribution();
    }

    if (!conversations || conversations.length === 0) {
      console.log("No scored conversations found for score distribution");
      return getEmptyScoreDistribution();
    }

    // Extract confidence scores directly from conversations
    const scores: number[] = conversations
      .filter(conv => conv.confidence_score && conv.confidence_score >= 0 && conv.confidence_score <= 100)
      .map(conv => conv.confidence_score);

    if (scores.length === 0) {
      console.log("No valid confidence scores found for score distribution");
      return getEmptyScoreDistribution();
    }

    console.log(`Found ${scores.length} valid scores for distribution:`, scores.slice(0, 5));
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
      .select("created_at")
      .gte("created_at", dateFrom.toISOString());

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
      const hour = new Date(conv.created_at).getHours();
      hourCounts[hour]++;
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
 * Get trend data over time
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
        .select(`
          confidence_score,
          scores(scores, is_used)
        `)
        .gte("created_at", weekStart.toISOString())
        .lte("created_at", weekEnd.toISOString());

      if (orgId && orgId !== "all") {
        conversationsQuery = conversationsQuery.eq("org_id", orgId);
      }

      const { data: conversations } = await conversationsQuery;

      // Calculate averages for this week
      const confidenceScores = conversations?.filter(c => c.confidence_score).map(c => c.confidence_score) || [];
      const avgConfidence = confidenceScores.length > 0 
        ? confidenceScores.reduce((sum, score) => sum + score, 0) / confidenceScores.length 
        : 0;

      const scoreValues: number[] = [];
      conversations?.flatMap(c => c.scores || [])
        .filter(s => s.is_used && s.scores)
        .forEach(s => {
          if (s.scores) {
            let overallScore = null;
            
            if (typeof s.scores === 'object') {
              overallScore = s.scores.overall_score || 
                            s.scores.overall || 
                            s.scores.total_score ||
                            s.scores.score ||
                            s.scores.average_score;
            }
            
            if (overallScore && typeof overallScore === 'number' && overallScore >= 0 && overallScore <= 100) {
              scoreValues.push(overallScore);
            }
          }
        });
      
      const avgScore = scoreValues.length > 0 
        ? scoreValues.reduce((sum, score) => sum + score, 0) / scoreValues.length 
        : 0;

      // Get token usage for this week
      let tokenQuery = supabase
        .from("cost_usage")
        .select("tokens_used")
        .gte("period_start", weekStart.toISOString())
        .lte("period_end", weekEnd.toISOString());

      if (orgId && orgId !== "all") {
        tokenQuery = tokenQuery.eq("org_id", orgId);
      }

      const { data: tokenData } = await tokenQuery;
      const totalTokens = tokenData?.reduce((sum, usage) => sum + (usage.tokens_used || 0), 0) || 0;

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
 * Get top deferral/escalation reasons (why AI transfers to humans)
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

    // Query conversations with their scores to find escalation reasons
    let query = supabase
      .from("conversations")
      .select(`
        id,
        escalation,
        end_reason,
        scores(flags, feedback, is_used)
      `)
      .gte("created_at", dateFrom.toISOString());

    if (orgId && orgId !== "all") {
      query = query.eq("org_id", orgId);
    }

    const { data: conversations, error } = await query;

    if (error) {
      console.error("Error fetching deferral reasons:", error);
      throw error;
    }

    // Map of deferral reasons with descriptions
    const reasonDescriptions: Record<string, string> = {
      "requires_escalation": "Complex issue requiring human expertise",
      "policy_violation": "Potential policy or compliance violation detected",
      "privacy_breach": "Sensitive information or privacy concern",
      "resident_complaint": "Customer expressed dissatisfaction",
      "incomplete_resolution": "AI could not fully resolve the request",
      "compliance_risk": "Potential regulatory or compliance issue",
      "technical_limitation": "Request beyond AI capabilities",
      "customer_request": "Customer requested human agent",
      "low_confidence": "AI had low confidence in response accuracy",
      "sensitive_topic": "Topic requires human judgment",
      "high_value_customer": "VIP or high-priority customer",
      "billing_dispute": "Financial or billing related escalation",
      "legal_inquiry": "Legal or contractual matter",
      "emotional_distress": "Customer showing signs of distress",
      "other": "Other reasons requiring human review"
    };

    // Count deferral reasons
    const reasonCounts: Record<string, number> = {};
    let totalEscalations = 0;

    conversations?.forEach(conv => {
      // Check if conversation was escalated
      const wasEscalated = conv.escalation === true ||
                          conv.end_reason === 'escalated' ||
                          conv.end_reason === 'transferred';

      // Check flags in scores
      conv.scores?.forEach(score => {
        if (score.is_used && score.flags) {
          const flags = typeof score.flags === 'object' ? score.flags : {};

          // Count each active flag as a reason
          Object.entries(flags).forEach(([flag, isActive]) => {
            if (isActive === true) {
              const reason = flag;
              reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
              totalEscalations++;
            }
          });
        }
      });

      // If escalated but no specific flag, count as 'other'
      if (wasEscalated && conv.scores?.every(s => !s.flags || Object.values(s.flags).every(v => !v))) {
        reasonCounts['other'] = (reasonCounts['other'] || 0) + 1;
        totalEscalations++;
      }
    });

    // Convert to array and sort by count
    const sortedReasons = Object.entries(reasonCounts)
      .map(([reason, count]) => ({
        reason: reason.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        count,
        percentage: totalEscalations > 0 ? Math.round((count / totalEscalations) * 1000) / 10 : 0,
        description: reasonDescriptions[reason] || "Escalation reason"
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