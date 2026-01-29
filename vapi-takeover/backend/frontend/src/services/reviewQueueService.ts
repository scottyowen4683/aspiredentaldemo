import { supabase } from '@/supabaseClient';

export interface FlaggedConversation {
  id: string;
  type: 'voice' | 'chat';
  assistant_id: string;
  org_id: string;
  overall_score: number | null;
  success_evaluation: boolean | null;
  sentiment: string | null;
  kb_used: boolean;
  scored: boolean;
  reviewed: boolean;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_notes: string | null;
  started_at: string;
  ended_at: string | null;
  transcript: any;
  final_ai_summary: string | null;
  score_details: any;
  // Joined data
  assistant: {
    friendly_name: string;
  } | null;
  organization: {
    name: string;
  } | null;
}

export interface ReviewFormData {
  notes?: string;
}

/**
 * Check if a conversation is flagged based on the same criteria as Conversations page:
 * - Scored AND (low score < 70 OR success_evaluation === false OR sentiment === 'negative')
 */
function isFlagged(conversation: any): boolean {
  if (!conversation.scored) return false;
  const score = conversation.overall_score;
  return (score !== null && score < 70) ||
         conversation.success_evaluation === false ||
         conversation.sentiment === 'negative';
}

/**
 * Get flagged conversations that need review
 */
export async function getFlaggedConversations(orgId: string, reviewed: boolean = false) {
  try {
    // Fetch voice conversations
    const { data: voiceData, error: voiceError } = await supabase
      .from('conversations')
      .select(`
        id,
        assistant_id,
        org_id,
        overall_score,
        success_evaluation,
        sentiment,
        kb_used,
        scored,
        reviewed,
        reviewed_at,
        reviewed_by,
        review_notes,
        started_at,
        ended_at,
        transcript,
        final_ai_summary,
        score_details
      `)
      .eq('org_id', orgId)
      .eq('reviewed', reviewed)
      .eq('scored', true)
      .order('started_at', { ascending: false });

    if (voiceError) {
      console.error('Error fetching voice conversations:', voiceError);
    }

    // Fetch chat conversations
    const { data: chatData, error: chatError } = await supabase
      .from('chat_conversations')
      .select(`
        id,
        assistant_id,
        org_id,
        overall_score,
        success_evaluation,
        sentiment,
        kb_used,
        scored,
        reviewed,
        reviewed_at,
        reviewed_by,
        review_notes,
        started_at,
        ended_at,
        transcript,
        final_ai_summary,
        score_details
      `)
      .eq('org_id', orgId)
      .eq('reviewed', reviewed)
      .eq('scored', true)
      .order('started_at', { ascending: false });

    if (chatError) {
      console.error('Error fetching chat conversations:', chatError);
    }

    // Combine and process
    const voiceConvos = (voiceData || []).map(c => ({ ...c, type: 'voice' as const }));
    const chatConvos = (chatData || []).map(c => ({ ...c, type: 'chat' as const }));
    const allConversations = [...voiceConvos, ...chatConvos];

    // Filter to only flagged conversations
    const flaggedConversations = allConversations.filter(isFlagged);

    // Get assistant and organization names
    const assistantIds = [...new Set(flaggedConversations.map(c => c.assistant_id).filter(Boolean))];
    const orgIds = [...new Set(flaggedConversations.map(c => c.org_id).filter(Boolean))];

    // Fetch assistants
    const { data: assistants } = await supabase
      .from('assistants')
      .select('id, friendly_name')
      .in('id', assistantIds.length > 0 ? assistantIds : ['none']);

    // Fetch organizations
    const { data: organizations } = await supabase
      .from('organizations')
      .select('id, name')
      .in('id', orgIds.length > 0 ? orgIds : ['none']);

    // Map assistant and org data
    const assistantMap = new Map((assistants || []).map(a => [a.id, a]));
    const orgMap = new Map((organizations || []).map(o => [o.id, o]));

    const enrichedConversations: FlaggedConversation[] = flaggedConversations.map(c => ({
      ...c,
      assistant: assistantMap.get(c.assistant_id) || null,
      organization: orgMap.get(c.org_id) || null
    }));

    // Sort by date descending
    enrichedConversations.sort((a, b) =>
      new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
    );

    return { success: true, data: enrichedConversations };
  } catch (error) {
    console.error('Error fetching flagged conversations:', error);
    return { success: false, error, data: [] };
  }
}

/**
 * Get a single conversation for review
 */
export async function getConversationForReview(conversationId: string, type: 'voice' | 'chat') {
  try {
    const tableName = type === 'voice' ? 'conversations' : 'chat_conversations';

    const { data, error } = await supabase
      .from(tableName)
      .select(`
        id,
        assistant_id,
        org_id,
        overall_score,
        success_evaluation,
        sentiment,
        kb_used,
        scored,
        reviewed,
        reviewed_at,
        reviewed_by,
        review_notes,
        started_at,
        ended_at,
        transcript,
        final_ai_summary,
        score_details
      `)
      .eq('id', conversationId)
      .single();

    if (error) {
      return { success: false, error };
    }

    // Get assistant and organization
    let assistant = null;
    let organization = null;

    if (data.assistant_id) {
      const { data: assistantData } = await supabase
        .from('assistants')
        .select('id, friendly_name')
        .eq('id', data.assistant_id)
        .single();
      assistant = assistantData;
    }

    if (data.org_id) {
      const { data: orgData } = await supabase
        .from('organizations')
        .select('id, name')
        .eq('id', data.org_id)
        .single();
      organization = orgData;
    }

    return {
      success: true,
      data: {
        ...data,
        type,
        assistant,
        organization
      } as FlaggedConversation
    };
  } catch (error) {
    console.error('Error fetching conversation:', error);
    return { success: false, error };
  }
}

/**
 * Mark a conversation as reviewed
 */
export async function markConversationReviewed(
  conversationId: string,
  type: 'voice' | 'chat',
  userId: string,
  notes?: string
) {
  try {
    const tableName = type === 'voice' ? 'conversations' : 'chat_conversations';

    const { error } = await supabase
      .from(tableName)
      .update({
        reviewed: true,
        reviewed_at: new Date().toISOString(),
        reviewed_by: userId,
        review_notes: notes || null
      })
      .eq('id', conversationId);

    if (error) {
      return { success: false, error };
    }

    // Log audit event
    const { data: conversationData } = await supabase
      .from(tableName)
      .select('org_id')
      .eq('id', conversationId)
      .single();

    if (conversationData?.org_id) {
      await supabase
        .from('audit_logs')
        .insert({
          org_id: conversationData.org_id,
          user_id: userId,
          action: 'conversation_reviewed',
          details: {
            conversation_id: conversationId,
            conversation_type: type,
            notes
          }
        });
    }

    return { success: true };
  } catch (error) {
    console.error('Error marking conversation as reviewed:', error);
    return { success: false, error };
  }
}

/**
 * Get review queue statistics
 */
export async function getReviewQueueStats(orgId: string) {
  try {
    // Fetch all scored conversations
    const { data: voiceData } = await supabase
      .from('conversations')
      .select('id, overall_score, success_evaluation, sentiment, scored, reviewed, reviewed_at')
      .eq('org_id', orgId)
      .eq('scored', true);

    const { data: chatData } = await supabase
      .from('chat_conversations')
      .select('id, overall_score, success_evaluation, sentiment, scored, reviewed, reviewed_at')
      .eq('org_id', orgId)
      .eq('scored', true);

    const allConversations = [...(voiceData || []), ...(chatData || [])];

    // Filter flagged
    const flagged = allConversations.filter(isFlagged);
    const pending = flagged.filter(c => !c.reviewed);

    // Reviewed today
    const today = new Date().toISOString().split('T')[0];
    const reviewedToday = flagged.filter(c =>
      c.reviewed && c.reviewed_at && c.reviewed_at.startsWith(today)
    );

    return {
      success: true,
      data: {
        pending: pending.length,
        reviewedToday: reviewedToday.length,
        totalFlagged: flagged.length,
        avgReviewTime: 'N/A'
      }
    };
  } catch (error) {
    console.error('Error fetching review stats:', error);
    return {
      success: true,
      data: {
        pending: 0,
        reviewedToday: 0,
        totalFlagged: 0,
        avgReviewTime: 'N/A'
      }
    };
  }
}

// Legacy exports for backwards compatibility (deprecated)
export interface ReviewQueueItem {
  id: string;
  score_id: string;
  org_id: string;
  reason: string;
  reviewed: boolean;
  reviewer_id: string | null;
  created_at: string;
  reviewed_at: string | null;
  score: any;
  conversation: any;
}

export async function getReviewQueueItems(orgId: string, reviewed: boolean = false) {
  return getFlaggedConversations(orgId, reviewed);
}

export async function getReviewQueueItem(reviewId: string) {
  return { success: false, error: { message: 'Deprecated - use getConversationForReview instead' } };
}

export async function submitReview(
  reviewId: string,
  scoreId: string,
  reviewData: any,
  userId: string
) {
  return { success: false, error: { message: 'Deprecated - use markConversationReviewed instead' } };
}
