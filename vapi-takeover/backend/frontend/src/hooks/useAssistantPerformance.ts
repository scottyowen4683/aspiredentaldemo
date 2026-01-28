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

        // Fetch assistants with related conversation data (without scores join that may fail)
        const { data: assistantsData, error: assistantsError } = await supabase
          .from('assistants')
          .select(`
            id,
            friendly_name,
            auto_score,
            pause_auto_score
          `)
          .eq('org_id', orgId);

        if (assistantsError) throw assistantsError;

        // Fetch conversations separately (avoiding inner join issues)
        const { data: conversationsData } = await supabase
          .from('conversations')
          .select('id, created_at, overall_score, assistant_id')
          .eq('org_id', orgId);

        // Group conversations by assistant
        const conversationsByAssistant: Record<string, any[]> = {};
        conversationsData?.forEach(conv => {
          if (conv.assistant_id) {
            if (!conversationsByAssistant[conv.assistant_id]) {
              conversationsByAssistant[conv.assistant_id] = [];
            }
            conversationsByAssistant[conv.assistant_id].push(conv);
          }
        });

        // Flagged conversations feature not available without review_queue table
        let flaggedByAssistant: Record<string, number> = {};

        // Process data for each assistant
        const processedAssistants: AssistantPerformanceData[] = assistantsData?.map(assistant => {
          const conversations = conversationsByAssistant[assistant.id] || [];

          // Filter conversations within date range
          const recentConversations = conversations.filter(conv =>
            new Date(conv.created_at) >= startDate
          );

          // Calculate metrics
          const totalConversations = recentConversations.length;

          // Use overall_score
          const scoredConversations = recentConversations.filter(conv =>
            conv.overall_score !== null && conv.overall_score !== undefined
          );

          const avgScore = scoredConversations.length > 0
            ? scoredConversations.reduce((sum, conv) => sum + (conv.overall_score || 0), 0) / scoredConversations.length
            : 0;

          // Sentiment not available without scores table
          const avgSentiment = 'neutral';

          // Count flagged conversations for this assistant
          const flaggedConversations = flaggedByAssistant[assistant.id] || 0;

          // Cost tracking removed for self-hosted platform
          const totalCost = 0;

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
  platformCost: number;
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

        // Fetch conversations - only select columns that exist
        const { data: conversations, error: conversationsError } = await supabase
          .from('conversations')
          .select('id, created_at, started_at')
          .eq('org_id', orgId)
          .gte('created_at', startDate.toISOString())
          .lte('created_at', endDate.toISOString())
          .order('created_at', { ascending: true });

        // If created_at doesn't work, try started_at
        let convData = conversations;
        if (conversationsError) {
          console.log('Cost analytics: trying with started_at instead of created_at');
          const { data: convStarted, error: startedError } = await supabase
            .from('conversations')
            .select('id, started_at')
            .eq('org_id', orgId)
            .gte('started_at', startDate.toISOString())
            .lte('started_at', endDate.toISOString())
            .order('started_at', { ascending: true });

          if (startedError) {
            console.log('Cost analytics query failed:', startedError.message);
            // Return empty data rather than failing
            setCostData([]);
            setTotalCost(0);
            setLoading(false);
            return;
          }
          convData = convStarted;
        }

        // Group conversations by date (cost tracking disabled for self-hosted)
        const dailyCosts: Record<string, CostBreakdown> = {};

        convData?.forEach(conv => {
          const dateStr = new Date(conv.created_at || conv.started_at).toISOString().split('T')[0];

          if (!dailyCosts[dateStr]) {
            dailyCosts[dateStr] = {
              date: dateStr,
              totalCost: 0,
              llmCost: 0,
              ttsStCost: 0,
              platformCost: 0,
              conversationCount: 0
            };
          }

          dailyCosts[dateStr].conversationCount += 1;
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
            platformCost: 0,
            conversationCount: 0
          });
        }

        setCostData(costArray);
        setTotalCost(0); // No cost tracking for self-hosted
      } catch (err) {
        console.error('Error fetching cost analytics:', err);
        // Don't set error - just use empty data
        setCostData([]);
        setTotalCost(0);
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
      const score = conv.overall_score;
      if (score !== null && score !== undefined) {
        dailyData[date].totalScore += score;
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