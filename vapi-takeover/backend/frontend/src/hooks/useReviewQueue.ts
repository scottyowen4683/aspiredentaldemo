import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getFlaggedConversations,
  getConversationForReview,
  markConversationReviewed,
  getReviewQueueStats,
  // Legacy exports for backwards compatibility
  getReviewQueueItems
} from '@/services/reviewQueueService';

export function useReviewQueueItems(orgId: string, reviewed: boolean = false) {
  return useQuery({
    queryKey: ['review-queue', orgId, reviewed],
    queryFn: () => getFlaggedConversations(orgId, reviewed),
    refetchInterval: 30000, // Refresh every 30 seconds
    enabled: !!orgId && orgId.trim() !== ''
  });
}

export function useFlaggedConversations(orgId: string, reviewed: boolean = false) {
  return useQuery({
    queryKey: ['flagged-conversations', orgId, reviewed],
    queryFn: () => getFlaggedConversations(orgId, reviewed),
    refetchInterval: 30000,
    enabled: !!orgId && orgId.trim() !== ''
  });
}

export function useConversationForReview(conversationId: string, type: 'voice' | 'chat') {
  return useQuery({
    queryKey: ['conversation-for-review', conversationId, type],
    queryFn: () => getConversationForReview(conversationId, type),
    enabled: !!conversationId
  });
}

export function useReviewQueueStats(orgId: string) {
  return useQuery({
    queryKey: ['review-queue-stats', orgId],
    queryFn: () => getReviewQueueStats(orgId),
    refetchInterval: 60000,
    enabled: !!orgId && orgId.trim() !== ''
  });
}

export function useMarkReviewed() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      conversationId,
      type,
      userId,
      notes
    }: {
      conversationId: string;
      type: 'voice' | 'chat';
      userId: string;
      notes?: string;
    }) => markConversationReviewed(conversationId, type, userId, notes),

    onSuccess: () => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['review-queue'] });
      queryClient.invalidateQueries({ queryKey: ['flagged-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['review-queue-stats'] });
      queryClient.invalidateQueries({ queryKey: ['conversation-for-review'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    }
  });
}

// Legacy hook - kept for backwards compatibility
export function useReviewQueueItem(reviewId: string) {
  return useQuery({
    queryKey: ['review-queue-item', reviewId],
    queryFn: () => ({ success: false, error: { message: 'Deprecated' } }),
    enabled: false
  });
}

// Legacy hook - kept for backwards compatibility
export function useSubmitReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (_args: any) => {
      return { success: false, error: { message: 'Deprecated - use useMarkReviewed instead' } };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review-queue'] });
      queryClient.invalidateQueries({ queryKey: ['review-queue-stats'] });
    }
  });
}
