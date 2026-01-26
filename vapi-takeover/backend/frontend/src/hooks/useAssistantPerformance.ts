import { useState, useEffect } from 'react';
import { supabase } from '@/supabaseClient';

export interface AssistantPerformanceData {
  id: string;
  friendlyName: string;
  totalConversations: number;
  avgScore: number;
  avgSentiment: string;
  flaggedConversations: number;
  autoScore: boolean;
  pauseAutoScore: boolean;
  totalCost: number;
  trendsData: {
    date: string;
    conversations: number;
    avgScore: number;
  }[];
}

export const useAssistantPerformance = (orgId: string | null, days: number = 30) => {
  const [assistants, setAssistants] = useState<AssistantPerformanceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      return;
    }

    const fetchAssistantPerformance = async () => {
      try {
        setLoading(true);
        setError(null);

        // Calculate date range
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        // Fetch assistants with related conversation and score data
        const { data: assistantsData, error: assistantsError } = await supabase
          .from('assistants')
          .select(`
            id,
            friendly_name,
            auto_score,
            pause_auto_score,
            conversations!inner(
              id,
              created_at,
              confidence_score,
              total_cost,
              scores(
                sentiments,
                flags
              )
            )
          `)
          .eq('org_id', orgId);

        if (assistantsError) throw assistantsError;

        // Fetch flagged conversations by assistant
        const { data: flaggedData, error: flaggedError } = await supabase
          .from('review_queue')
          .select(`
            id,
            score_id,
            org_id
          `)
          .eq('org_id', orgId)
          .eq('reviewed', false);

        // Fetch score data separately to get conversation and assistant relationships
        let flaggedByAssistant: Record<string, number> = {};
        if (flaggedData && flaggedData.length > 0) {
          const scoreIds = flaggedData.map(item => item.score_id).filter(Boolean);
          if (scoreIds.length > 0) {
            const { data: scoresData } = await supabase
              .from('scores')
              .select(`
                id,
                conversation_id,
                conversations!inner(
                  assistant_id
                )
              `)
              .in('id', scoreIds);

            if (scoresData) {
              scoresData.forEach(score => {
                const assistantId = score.conversations?.assistant_id;
                if (assistantId) {
                  flaggedByAssistant[assistantId] = (flaggedByAssistant[assistantId] || 0) + 1;
                }
              });
            }
          }
        }

        if (flaggedError) throw flaggedError;

        // Process data for each assistant
        const processedAssistants: AssistantPerformanceData[] = assistantsData?.map(assistant => {
          const conversations = assistant.conversations || [];
          
          // Filter conversations within date range
          const recentConversations = conversations.filter(conv => 
            new Date(conv.created_at) >= startDate
          );

          // Calculate metrics
          const totalConversations = recentConversations.length;
          
          const scoredConversations = recentConversations.filter(conv => 
            conv.confidence_score !== null && conv.confidence_score !== undefined
          );
          
          const avgScore = scoredConversations.length > 0
            ? scoredConversations.reduce((sum, conv) => sum + (conv.confidence_score || 0), 0) / scoredConversations.length
            : 0;

          // Calculate sentiment distribution and get most common
          const sentiments = recentConversations
            .map(conv => conv.scores?.[0]?.sentiments?.overall_sentiment)
            .filter(Boolean);
          
          const sentimentCounts = sentiments.reduce((acc, sentiment) => {
            acc[sentiment] = (acc[sentiment] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);

          const avgSentiment = Object.keys(sentimentCounts).length > 0 
            ? Object.entries(sentimentCounts).reduce((max, [sentiment, count]) => 
                (count as number) > (max.count as number) ? { sentiment, count } : max, 
                { sentiment: 'neutral', count: 0 }
              ).sentiment
            : 'neutral';

          // Count flagged conversations for this assistant
          const flaggedConversations = flaggedByAssistant[assistant.id] || 0;

          // Calculate total cost
          const totalCost = recentConversations.reduce(
            (sum, conv) => sum + (conv.total_cost || 0), 0
          );

          // Generate trends data (daily aggregations)
          const trendsData = generateDailyTrends(recentConversations, startDate, endDate);

          return {
            id: assistant.id,
            friendlyName: assistant.friendly_name || 'Unnamed Assistant',
            totalConversations,
            avgScore: Math.round(avgScore * 10) / 10,
            avgSentiment,
            flaggedConversations,
            autoScore: assistant.auto_score || false,
            pauseAutoScore: assistant.pause_auto_score || false,
            totalCost: Math.round(totalCost * 100) / 100,
            trendsData
          };
        }) || [];

        setAssistants(processedAssistants);
      } catch (err) {
        console.error('Error fetching assistant performance:', err);
        setError(err instanceof Error ? err.message : 'Unknown error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchAssistantPerformance();

    // Set up real-time subscription
    const subscription = supabase
      .channel('assistant_performance')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'conversations',
        filter: `org_id=eq.${orgId}`
      }, fetchAssistantPerformance)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'scores'
      }, fetchAssistantPerformance)
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [orgId, days]);

  return { assistants, loading, error };
};

export interface CostBreakdown {
  date: string;
  totalCost: number;
  llmCost: number;
  ttsStCost: number;
  vapiCost: number;
  conversationCount: number;
}

export const useCostAnalytics = (orgId: string | null, days: number = 30) => {
  const [costData, setCostData] = useState<CostBreakdown[]>([]);
  const [totalCost, setTotalCost] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      return;
    }

    const fetchCostAnalytics = async () => {
      try {
        setLoading(true);
        setError(null);

        // Calculate date range
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        // Fetch conversations with cost breakdown
        const { data: conversations, error: conversationsError } = await supabase
          .from('conversations')
          .select('id, created_at, total_cost, cost_breakdown')
          .eq('org_id', orgId)
          .gte('created_at', startDate.toISOString())
          .lte('created_at', endDate.toISOString())
          .order('created_at', { ascending: true });

        if (conversationsError) throw conversationsError;

        // Group conversations by date and calculate daily costs
        const dailyCosts: Record<string, CostBreakdown> = {};
        let totalCostSum = 0;

        conversations?.forEach(conv => {
          const date = new Date(conv.created_at).toISOString().split('T')[0];
          const cost = conv.total_cost || 0;
          const breakdown = conv.cost_breakdown || {};

          totalCostSum += cost;

          if (!dailyCosts[date]) {
            dailyCosts[date] = {
              date,
              totalCost: 0,
              llmCost: 0,
              ttsStCost: 0,
              vapiCost: 0,
              conversationCount: 0
            };
          }

          dailyCosts[date].totalCost += cost;
          dailyCosts[date].conversationCount += 1;

          // Extract cost breakdown if available
          if (breakdown.llm) {
            dailyCosts[date].llmCost += breakdown.llm;
          }
          if (breakdown.tts || breakdown.stt) {
            dailyCosts[date].ttsStCost += (breakdown.tts || 0) + (breakdown.stt || 0);
          }
          if (breakdown.vapi) {
            dailyCosts[date].vapiCost += breakdown.vapi;
          }
        });

        // Convert to array and fill missing dates
        const costArray: CostBreakdown[] = [];
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
          const dateStr = d.toISOString().split('T')[0];
          costArray.push(dailyCosts[dateStr] || {
            date: dateStr,
            totalCost: 0,
            llmCost: 0,
            ttsStCost: 0,
            vapiCost: 0,
            conversationCount: 0
          });
        }

        setCostData(costArray);
        setTotalCost(Math.round(totalCostSum * 100) / 100);
      } catch (err) {
        console.error('Error fetching cost analytics:', err);
        setError(err instanceof Error ? err.message : 'Unknown error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchCostAnalytics();
  }, [orgId, days]);

  return { costData, totalCost, loading, error };
};

// Helper function to generate daily trends
function generateDailyTrends(
  conversations: any[],
  startDate: Date,
  endDate: Date
): { date: string; conversations: number; avgScore: number; }[] {
  const dailyData: Record<string, { conversations: number; totalScore: number; scoreCount: number; }> = {};

  // Initialize all dates
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    dailyData[dateStr] = { conversations: 0, totalScore: 0, scoreCount: 0 };
  }

  // Aggregate conversation data by date
  conversations.forEach(conv => {
    const date = new Date(conv.created_at).toISOString().split('T')[0];
    if (dailyData[date]) {
      dailyData[date].conversations += 1;
      if (conv.confidence_score !== null && conv.confidence_score !== undefined) {
        dailyData[date].totalScore += conv.confidence_score;
        dailyData[date].scoreCount += 1;
      }
    }
  });

  // Convert to array format
  return Object.entries(dailyData).map(([date, data]) => ({
    date,
    conversations: data.conversations,
    avgScore: data.scoreCount > 0 ? Math.round((data.totalScore / data.scoreCount) * 10) / 10 : 0
  }));
}