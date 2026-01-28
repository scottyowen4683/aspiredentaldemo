import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/supabaseClient';
import { useUser } from '@/context/UserContext';

export interface ConversationScore {
  id: string;
  conversation_id: string;
  org_id: string;
  rubric_version: number;
  scores: Record<string, number>;
  sentiments: {
    emotional_tone?: string;
    overall_sentiment?: string;
    customer_satisfaction?: string;
    sentiment_progression?: string[];
  };
  flags: Record<string, boolean>;
  is_provider: boolean;
  is_used: boolean;
  created_at: string;
  effective_rubric?: any;
  rubric_source?: string;
}

export function useConversationScore(conversationId: string) {
  const { user } = useUser();

  return useQuery({
    queryKey: ['conversation-score', conversationId],
    queryFn: async () => {
      if (!conversationId) return null;

      try {
        // Get score_details from conversations table (our schema stores scoring inline)
        const { data: conversation, error } = await supabase
          .from('conversations')
          .select('id, org_id, overall_score, scored, score_details, created_at')
          .eq('id', conversationId)
          .single();

        if (error) {
          console.error('Error fetching conversation score:', error);
          return null;
        }

        // If no score_details, return null
        if (!conversation?.score_details || !conversation.scored) {
          return null;
        }

        // Map score_details to ConversationScore format expected by UI
        const scoreDetails = typeof conversation.score_details === 'string'
          ? JSON.parse(conversation.score_details)
          : conversation.score_details;

        return {
          id: conversation.id,
          conversation_id: conversation.id,
          org_id: conversation.org_id,
          rubric_version: 1,
          scores: scoreDetails.scores || {},
          sentiments: scoreDetails.sentiments || {},
          flags: scoreDetails.flags || {},
          is_provider: false,
          is_used: true,
          created_at: conversation.created_at,
          rubric_source: scoreDetails.model_used || 'gpt-4o-mini',
          // Include additional fields from score_details
          summary: scoreDetails.summary,
          strengths: scoreDetails.strengths,
          improvements: scoreDetails.improvements,
          success_evaluation: scoreDetails.success_evaluation,
          resident_intents: scoreDetails.resident_intents,
          grade: scoreDetails.grade
        } as ConversationScore;
      } catch (error) {
        console.error('Failed to fetch conversation score:', error);
        return null;
      }
    },
    enabled: !!user && !!conversationId,
  });
}