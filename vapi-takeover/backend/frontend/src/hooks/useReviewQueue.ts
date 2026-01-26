import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  getReviewQueueItems, 
  getReviewQueueItem, 
  submitReview, 
  getReviewQueueStats,
  type ReviewFormData 
} from '@/services/reviewQueueService';

export function useReviewQueueItems(orgId: string, reviewed: boolean = false) {
  return useQuery({
    queryKey: ['review-queue', orgId, reviewed],
    queryFn: () => getReviewQueueItems(orgId, reviewed),
    refetchInterval: 30000, // Refresh every 30 seconds
    enabled: !!orgId && orgId.trim() !== ''
  });
}

export function useReviewQueueItem(reviewId: string) {
  return useQuery({
    queryKey: ['review-queue-item', reviewId],
    queryFn: () => getReviewQueueItem(reviewId),
    enabled: !!reviewId
  });
}

export function useReviewQueueStats(orgId: string) {
  return useQuery({
    queryKey: ['review-queue-stats', orgId],
    queryFn: () => getReviewQueueStats(orgId),
    refetchInterval: 60000, // Refresh every minute
    enabled: !!orgId && orgId.trim() !== ''
  });
}

export function useSubmitReview() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ 
      reviewId, 
      scoreId, 
      reviewData, 
      userId 
    }: { 
      reviewId: string; 
      scoreId: string; 
      reviewData: ReviewFormData; 
      userId: string; 
    }) => submitReview(reviewId, scoreId, reviewData, userId),
    
    onSuccess: (_, variables) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['review-queue'] });
      queryClient.invalidateQueries({ queryKey: ['review-queue-stats'] });
      queryClient.invalidateQueries({ queryKey: ['review-queue-item', variables.reviewId] });
    }
  });
}