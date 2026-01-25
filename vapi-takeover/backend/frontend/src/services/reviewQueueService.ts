import { supabase } from '@/supabaseClient';

export interface ReviewQueueItem {
  id: string;
  score_id: string;
  org_id: string;
  reason: string;
  reviewed: boolean;
  reviewer_id: string | null;
  created_at: string;
  reviewed_at: string | null;
  // Joined data from scores and conversations
  score: {
    id: string;
    conversation_id: string;
    org_id: string;
    rubric_version: number;
    scores: any;
    sentiments: any;
    flags: any;
    is_provider: boolean;
    is_used: boolean;
    created_at: string;
  } | null;
  conversation: {
    id: string;
    assistant_id: string;
    org_id: string;
    provider: string;
    transcript: any;
    transcript_source: string;
    final_ai_summary: string;
    confidence_score: number;
    scored: boolean;
    prompt_version: number;
    kb_version: number;
    success_evaluation: boolean;
    total_cost: number;
    call_duration: number;
    cost_breakdown: any;
    recording_url: string;
    stereo_recording_url: string;
    log_url: string;
    end_reason: string;
    created_at: string;
    updated_at: string;
    assistant: {
      friendly_name: string;
    } | null;
    organization: {
      name: string;
    } | null;
  } | null;
}

export interface ReviewFormData {
  approved: boolean;
  updated_scores?: Record<string, number>;
  updated_flags?: Record<string, boolean>;
  confidence_override?: number;
}

// Get review queue items for an organization
export async function getReviewQueueItems(orgId: string, reviewed: boolean = false) {
  try {
    console.log('Fetching review queue for orgId:', orgId, 'reviewed:', reviewed);
    
    // Simplified query - get review queue items first
    const { data: reviewQueueData, error: reviewQueueError } = await supabase
      .from('review_queue')
      .select('*')
      .eq('org_id', orgId)
      .eq('reviewed', reviewed)
      .order('created_at', { ascending: false });

    if (reviewQueueError) {
      console.error('Error fetching review queue:', reviewQueueError);
      return { success: false, error: reviewQueueError };
    }

    console.log('Raw review queue data:', reviewQueueData);

    if (!reviewQueueData || reviewQueueData.length === 0) {
      console.log('No review queue items found for orgId:', orgId);
      
      // Debug: Check what review queue items exist at all
      const { data: allReviewItems } = await supabase
        .from('review_queue')
        .select('id, org_id, created_at, reviewed')
        .limit(10);
      console.log('All review queue items (first 10):', allReviewItems);
      
      return { success: true, data: [] };
    }

    // Get related data separately to avoid complex join issues
    const reviewItems = [];
    
    for (const reviewItem of reviewQueueData) {
      // Get the score record
      let scoreData = null;
      if (reviewItem.score_id) {
        const { data: score } = await supabase
          .from('scores')
          .select(`
            id,
            conversation_id,
            org_id,
            rubric_version,
            scores,
            sentiments,
            flags,
            is_provider,
            is_used,
            created_at
          `)
          .eq('id', reviewItem.score_id)
          .single();
        
        scoreData = score;
      }

      // Get conversation details with proper joins
      let conversationData = null;
      if (scoreData?.conversation_id) {
        const { data: conversation } = await supabase
          .from('conversations')
          .select(`
            id,
            assistant_id,
            org_id,
            provider,
            transcript,
            transcript_source,
            final_ai_summary,
            confidence_score,
            scored,
            prompt_version,
            kb_version,
            success_evaluation,
            total_cost,
            call_duration,
            cost_breakdown,
            recording_url,
            stereo_recording_url,
            log_url,
            end_reason,
            created_at,
            updated_at
          `)
          .eq('id', scoreData.conversation_id)
          .single();
        
        if (conversation) {
          // Get assistant details separately
          let assistantData = null;
          if (conversation.assistant_id) {
            const { data: assistant } = await supabase
              .from('assistants')
              .select('friendly_name')
              .eq('id', conversation.assistant_id)
              .single();
            assistantData = assistant;
          }

          // Get organization details separately
          let organizationData = null;
          if (conversation.org_id) {
            const { data: organization } = await supabase
              .from('organizations')
              .select('name')
              .eq('id', conversation.org_id)
              .single();
            organizationData = organization;
          }

          conversationData = {
            ...conversation,
            assistant: assistantData,
            organization: organizationData
          };
        }
      }

      reviewItems.push({
        ...reviewItem,
        score: scoreData,
        conversation: conversationData
      });
    }

    console.log('Processed review items:', reviewItems);
    return { success: true, data: reviewItems };
  } catch (error) {
    console.error('Unexpected error fetching review queue:', error);
    return { success: false, error };
  }
}

// Get a single review queue item with full details
export async function getReviewQueueItem(reviewId: string) {
  try {
    // First get the review queue item
    const { data: reviewData, error: reviewError } = await supabase
      .from('review_queue')
      .select('*')
      .eq('id', reviewId)
      .single();

    if (reviewError) {
      console.error('Error fetching review item:', reviewError);
      return { success: false, error: reviewError };
    }

    if (!reviewData) {
      return { success: false, error: { message: 'Review item not found' } };
    }

    // Get the score data separately
    let scoreData = null;
    let conversationData = null;

    if (reviewData.score_id) {
      const { data: score } = await supabase
        .from('scores')
        .select(`
          id,
          conversation_id,
          org_id,
          rubric_version,
          scores,
          sentiments,
          flags,
          is_provider,
          is_used,
          created_at
        `)
        .eq('id', reviewData.score_id)
        .single();
      
      scoreData = score;

      // Get conversation details if we have score data
      if (scoreData?.conversation_id) {
        const { data: conversation } = await supabase
          .from('conversations')
          .select(`
            id,
            assistant_id,
            org_id,
            provider,
            transcript,
            transcript_source,
            final_ai_summary,
            confidence_score,
            scored,
            prompt_version,
            kb_version,
            success_evaluation,
            total_cost,
            call_duration,
            cost_breakdown,
            recording_url,
            stereo_recording_url,
            log_url,
            end_reason,
            created_at,
            updated_at
          `)
          .eq('id', scoreData.conversation_id)
          .single();
        
        if (conversation) {
          // Get assistant details separately
          let assistantData = null;
          if (conversation.assistant_id) {
            const { data: assistant } = await supabase
              .from('assistants')
              .select('friendly_name')
              .eq('id', conversation.assistant_id)
              .single();
            assistantData = assistant;
          }

          // Get organization details separately
          let organizationData = null;
          if (conversation.org_id) {
            const { data: organization } = await supabase
              .from('organizations')
              .select('name')
              .eq('id', conversation.org_id)
              .single();
            organizationData = organization;
          }

          conversationData = {
            ...conversation,
            assistant: assistantData,
            organization: organizationData
          };
        }
      }
    }

    // Combine the data
    const combinedData = {
      ...reviewData,
      score: scoreData,
      conversation: conversationData
    };

    return { success: true, data: combinedData };
  } catch (error) {
    console.error('Unexpected error fetching review item:', error);
    return { success: false, error };
  }
}

// Submit review for a queue item
export async function submitReview(
  reviewId: string, 
  scoreId: string, 
  reviewData: ReviewFormData, 
  userId: string
) {
  try {
    // Start a transaction-like operation
    const updates = [];

    // 1. Update the review queue item
    const reviewQueueUpdate = supabase
      .from('review_queue')
      .update({
        reviewed: true,
        reviewer_id: userId,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', reviewId);

    updates.push(reviewQueueUpdate);

    // 2. If approved, update the score record if there are changes
    if (reviewData.approved) {
      const scoreUpdates: any = {};
      
      if (reviewData.updated_scores) {
        scoreUpdates.scores = reviewData.updated_scores;
      }
      
      if (reviewData.updated_flags) {
        scoreUpdates.flags = reviewData.updated_flags;
      }

      if (Object.keys(scoreUpdates).length > 0) {
        const scoreUpdate = supabase
          .from('scores')
          .update(scoreUpdates)
          .eq('id', scoreId);
        
        updates.push(scoreUpdate);
      }

      // 3. Update conversation confidence score if overridden
      if (reviewData.confidence_override !== undefined) {
        // First get the conversation_id from the score
        const { data: scoreData } = await supabase
          .from('scores')
          .select('conversation_id')
          .eq('id', scoreId)
          .single();

        if (scoreData?.conversation_id) {
          const conversationUpdate = supabase
            .from('conversations')
            .update({
              confidence_score: reviewData.confidence_override
            })
            .eq('id', scoreData.conversation_id);
          
          updates.push(conversationUpdate);
        }
      }
    }

    // Execute all updates
    const results = await Promise.all(updates);
    
    // Check for errors
    for (const result of results) {
      if (result.error) {
        console.error('Error in review submission:', result.error);
        return { success: false, error: result.error };
      }
    }

    // 4. Log audit event
    await supabase
      .from('audit_logs')
      .insert({
        org_id: (await supabase.from('review_queue').select('org_id').eq('id', reviewId).single()).data?.org_id,
        user_id: userId,
        action: reviewData.approved ? 'review_approved' : 'review_rejected',
        details: {
          review_id: reviewId,
          score_id: scoreId,
          approved: reviewData.approved,
          has_score_updates: !!reviewData.updated_scores,
          has_flag_updates: !!reviewData.updated_flags,
          confidence_override: reviewData.confidence_override
        }
      });

    return { success: true };
  } catch (error) {
    console.error('Unexpected error submitting review:', error);
    return { success: false, error };
  }
}

// Get review queue statistics
export async function getReviewQueueStats(orgId: string) {
  try {
    const { data: pending, error: pendingError } = await supabase
      .from('review_queue')
      .select('id')
      .eq('org_id', orgId)
      .eq('reviewed', false);

    const { data: reviewedToday, error: reviewedError } = await supabase
      .from('review_queue')
      .select('id, reviewed_at')
      .eq('org_id', orgId)
      .eq('reviewed', true)
      .gte('reviewed_at', new Date().toISOString().split('T')[0]); // Today

    if (pendingError || reviewedError) {
      console.error('Error fetching stats:', pendingError || reviewedError);
      return { success: false, error: pendingError || reviewedError };
    }

    return {
      success: true,
      data: {
        pending: pending?.length || 0,
        reviewedToday: reviewedToday?.length || 0,
        avgReviewTime: '3.2m' // This would need to be calculated from actual data
      }
    };
  } catch (error) {
    console.error('Unexpected error fetching stats:', error);
    return { success: false, error };
  }
}