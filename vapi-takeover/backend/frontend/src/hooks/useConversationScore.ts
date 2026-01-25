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
        // First check if scores table exists and what columns it has
        let query = supabase
          .from('scores')
          .select('*')
          .eq('conversation_id', conversationId)
          .eq('is_used', true)
          .order('created_at', { ascending: false })
          .limit(1);

        // Apply role-based filtering
        if (user?.role !== 'super_admin' && user?.org_id) {
          query = query.eq('org_id', user.org_id);
        }

        const { data, error } = await query;

        if (error) {
          console.error('Error fetching conversation score:', error);
          // If the table doesn't exist or there's a column mismatch, return null gracefully
          if ((error as any).code === 'PGRST106' || (error as any).code === '42P01' || error.message?.includes('does not exist')) {
            console.warn('Scores table not found or columns do not match, returning null');
            return null;
          }
          throw error;
        }

        return data && data.length > 0 ? (data[0] as ConversationScore) : null;
      } catch (error) {
        console.error('Failed to fetch conversation score:', error);
        return null;
      }
    },
    enabled: !!user && !!conversationId,
    // Add error handling to prevent crashes
    retry: (failureCount, error) => {
      // Don't retry if it's a schema/table issue
      if (error?.message?.includes('does not exist') || (error as any)?.code === 'PGRST106') {
        return false;
      }
      return failureCount < 3;
    },
  });
}