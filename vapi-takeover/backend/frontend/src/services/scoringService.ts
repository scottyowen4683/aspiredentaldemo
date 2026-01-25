// src/services/scoringService.ts
import { supabase } from "@/supabaseClient";

export interface ScoringStats {
  total_conversations: number;
  scored_conversations: number;
  pending_scoring: number;
  avg_confidence_score: number;
  flagged_conversations: number;
  review_queue_count: number;
  current_month_tokens: number;
  current_month_minutes: number;
}

export interface CostThresholdStatus {
  current_tokens: number;
  token_threshold: number;
  token_usage_percent: number;
  current_minutes: number;
  minutes_threshold: number;
  minutes_usage_percent: number;
  threshold_exceeded: boolean;
  should_pause: boolean;
}

export interface ScoringResult {
  success: boolean;
  scoreId?: string;
  confidenceScore?: number;
  needsReview?: boolean;
  tokensUsed?: number;
  processingTimeMs?: number;
  message?: string;
  error?: string;
}

export interface ManualRescoreResult {
  success: boolean;
  results?: {
    total: number;
    successful: number;
    failed: number;
    success_rate: string;
  };
  errors?: string[];
  error?: string;
}

/**
 * Get scoring statistics for an organization
 */
export async function getScoringStats(orgId?: string): Promise<{ data: ScoringStats | null; error: any }> {
  try {
    const { data, error } = await supabase.rpc('get_scoring_stats', {
      org_uuid: orgId || null
    });

    if (error) throw error;

    return { data: data?.[0] || null, error: null };
  } catch (error) {
    console.error('Error getting scoring stats:', error);
    return { data: null, error };
  }
}

/**
 * Check cost threshold status for an organization
 */
export async function getCostThresholdStatus(orgId: string): Promise<{ data: CostThresholdStatus | null; error: any }> {
  try {
    const { data, error } = await supabase.rpc('check_cost_threshold_status', {
      org_uuid: orgId
    });

    if (error) throw error;

    return { data: data?.[0] || null, error: null };
  } catch (error) {
    console.error('Error checking cost threshold:', error);
    return { data: null, error };
  }
}

/**
 * Score a single conversation using GPT-4o
 */
export async function scoreConversation(conversationId: string, forceRescore = false): Promise<ScoringResult> {
  try {
    const { data, error } = await supabase.functions.invoke('gpt-scoring', {
      body: {
        conversationId,
        forceRescore
      }
    });

    if (error) throw error;

    return data;
  } catch (error) {
    console.error('Error scoring conversation:', error);
    return {
      success: false,
      error: error.message || 'Failed to score conversation'
    };
  }
}

/**
 * Manually rescore multiple conversations
 */
export async function manualRescore(
  conversationIds: string[], 
  userId: string, 
  reason?: string
): Promise<ManualRescoreResult> {
  try {
    const { data, error } = await supabase.functions.invoke('manual-rescore', {
      body: {
        conversationIds,
        userId,
        reason
      }
    });

    if (error) throw error;

    return data;
  } catch (error) {
    console.error('Error in manual rescore:', error);
    return {
      success: false,
      error: error.message || 'Failed to rescore conversations'
    };
  }
}

/**
 * Trigger the scoring cron job manually
 */
export async function triggerScoringCron(): Promise<{ success: boolean; summary?: any; errors?: string[]; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('scoring-cron', {
      body: {}
    });

    if (error) throw error;

    return data;
  } catch (error) {
    console.error('Error triggering scoring cron:', error);
    return {
      success: false,
      error: error.message || 'Failed to trigger scoring cron'
    };
  }
}

/**
 * Get conversations pending scoring
 */
export async function getPendingScoringConversations(orgId?: string) {
  try {
    let query = supabase
      .from('conversations')
      .select(`
        id,
        org_id,
        assistant_id,
        provider,
        created_at,
        call_duration,
        assistants!inner(
          id,
          friendly_name,
          auto_score,
          pause_auto_score
        ),
        organizations(
          name
        )
      `)
      .eq('scored', false)
      .eq('assistants.auto_score', true)
      .eq('assistants.pause_auto_score', false)
      .order('created_at', { ascending: true });

    // Filter by org for non-super admins
    if (orgId) {
      query = query.eq('org_id', orgId);
    }

    const { data, error } = await query;

    if (error) throw error;

    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error getting pending conversations:', error);
    return { data: [], error };
  }
}

/**
 * Get recent scoring activity
 */
export async function getRecentScoringActivity(orgId?: string, limit = 50) {
  try {
    let query = supabase
      .from('audit_logs')
      .select(`
        id,
        action,
        details,
        created_at,
        users(full_name, email),
        assistants(friendly_name),
        organizations(name)
      `)
      .in('action', [
        'conversation_scored',
        'conversation_rescored',
        'manual_rescore_requested',
        'auto_scoring_paused_cost_threshold'
      ])
      .order('created_at', { ascending: false })
      .limit(limit);

    if (orgId) {
      query = query.eq('org_id', orgId);
    }

    const { data, error } = await query;

    if (error) throw error;

    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error getting scoring activity:', error);
    return { data: [], error };
  }
}

/**
 * Update assistant scoring settings
 */
export async function updateAssistantScoringSettings(
  assistantId: string, 
  settings: {
    auto_score?: boolean;
    pause_auto_score?: boolean;
    rubric?: string;
  }
) {
  try {
    const { data, error } = await supabase
      .from('assistants')
      .update(settings)
      .eq('id', assistantId)
      .select();

    if (error) throw error;

    return { data: data?.[0] || null, error: null };
  } catch (error) {
    console.error('Error updating assistant settings:', error);
    return { data: null, error };
  }
}

/**
 * Update organization cost thresholds
 */
export async function updateCostThresholds(
  orgId: string,
  thresholds: {
    monthly_token_threshold?: number;
    monthly_minutes_threshold?: number;
  }
) {
  try {
    const { data, error } = await supabase
      .from('organizations')
      .update(thresholds)
      .eq('id', orgId)
      .select();

    if (error) throw error;

    return { data: data?.[0] || null, error: null };
  } catch (error) {
    console.error('Error updating cost thresholds:', error);
    return { data: null, error };
  }
}

/**
 * Get resident questions analytics for an assistant or organization
 */
export async function getResidentQuestions(assistantId?: string, orgId?: string, limit = 50) {
  try {
    let query = supabase
      .from('resident_questions')
      .select(`
        id,
        intent,
        frequency,
        created_at,
        updated_at,
        assistants(friendly_name),
        organizations(name)
      `)
      .order('frequency', { ascending: false })
      .limit(limit);

    if (assistantId) {
      query = query.eq('assistant_id', assistantId);
    }

    if (orgId) {
      query = query.eq('org_id', orgId);
    }

    const { data, error } = await query;

    if (error) throw error;

    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error getting resident questions:', error);
    return { data: [], error };
  }
}

/**
 * Get resident questions statistics
 */
export async function getResidentQuestionsStats(assistantId?: string, orgId?: string) {
  try {
    let query = supabase
      .from('resident_questions')
      .select('intent, frequency');

    if (assistantId) {
      query = query.eq('assistant_id', assistantId);
    }

    if (orgId) {
      query = query.eq('org_id', orgId);
    }

    const { data, error } = await query;

    if (error) throw error;

    const stats = {
      total_questions: data?.length || 0,
      total_frequency: data?.reduce((sum, q) => sum + (q.frequency || 0), 0) || 0,
      avg_frequency: 0,
      top_intents: [] as Array<{ intent: string; frequency: number }>
    };

    if (stats.total_questions > 0) {
      stats.avg_frequency = Math.round(stats.total_frequency / stats.total_questions);
      stats.top_intents = data
        ?.sort((a, b) => (b.frequency || 0) - (a.frequency || 0))
        .slice(0, 10)
        .map(q => ({ intent: q.intent, frequency: q.frequency || 0 })) || [];
    }

    return { data: stats, error: null };
  } catch (error) {
    console.error('Error getting resident questions stats:', error);
    return { data: null, error };
  }
}

/**
 * Search resident questions by intent or keyword
 */
export async function searchResidentQuestions(searchTerm: string, assistantId?: string, orgId?: string) {
  try {
    let query = supabase
      .from('resident_questions')
      .select(`
        id,
        intent,
        frequency,
        created_at,
        updated_at,
        assistants(friendly_name),
        organizations(name)
      `)
      .ilike('intent', `%${searchTerm}%`)
      .order('frequency', { ascending: false });

    if (assistantId) {
      query = query.eq('assistant_id', assistantId);
    }

    if (orgId) {
      query = query.eq('org_id', orgId);
    }

    const { data, error } = await query;

    if (error) throw error;

    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error searching resident questions:', error);
    return { data: [], error };
  }
}