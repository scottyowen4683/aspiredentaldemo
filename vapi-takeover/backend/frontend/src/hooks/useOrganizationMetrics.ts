import { useState, useEffect } from 'react';
import { supabase } from '@/supabaseClient';

export interface OrganizationMetrics {
  totalConversations: number;
  conversationsThisMonth: number;
  conversationsGrowth: number;
  activeAssistants: number;
  avgScore: number;
  flaggedConversations: number;
  totalCostThisMonth: number;
  costGrowth: number;
  avgResponseTime: number;
}

export const useOrganizationMetrics = (orgId: string | null) => {
  const [metrics, setMetrics] = useState<OrganizationMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      return;
    }

    const fetchMetrics = async () => {
      try {
        setLoading(true);
        setError(null);

        // Get current month and previous month date ranges
        const now = new Date();
        const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

        // Fetch conversations data
        const { data: allConversations, error: conversationsError } = await supabase
          .from('conversations')
          .select('id, created_at, scored, confidence_score, total_cost, call_duration')
          .eq('org_id', orgId);

        if (conversationsError) throw conversationsError;

        // Fetch assistants data
        const { data: assistants, error: assistantsError } = await supabase
          .from('assistants')
          .select('id, auto_score, pause_auto_score')
          .eq('org_id', orgId);

        if (assistantsError) throw assistantsError;

        // Fetch flagged conversations (from review_queue) - gracefully handle if table doesn't exist
        let flaggedData: any[] = [];
        try {
          const { data: flagged, error: flaggedError } = await supabase
            .from('review_queue')
            .select('id')
            .eq('org_id', orgId)
            .eq('reviewed', false);

          if (!flaggedError) {
            flaggedData = flagged || [];
          }
        } catch (e) {
          // review_queue table may not exist - use empty array
          console.log('review_queue table not available');
        }

        // Calculate metrics
        const totalConversations = allConversations?.length || 0;
        
        const conversationsThisMonth = allConversations?.filter(conv => 
          new Date(conv.created_at) >= startOfThisMonth
        ).length || 0;

        const conversationsLastMonth = allConversations?.filter(conv => {
          const date = new Date(conv.created_at);
          return date >= startOfLastMonth && date <= endOfLastMonth;
        }).length || 0;

        const conversationsGrowth = conversationsLastMonth > 0 
          ? ((conversationsThisMonth - conversationsLastMonth) / conversationsLastMonth) * 100 
          : conversationsThisMonth > 0 ? 100 : 0;

        const activeAssistants = assistants?.filter(assistant => 
          assistant.auto_score && !assistant.pause_auto_score
        ).length || 0;

        // Calculate average score from scored conversations
        const scoredConversations = allConversations?.filter(conv => 
          conv.scored && conv.confidence_score !== null
        ) || [];
        
        const avgScore = scoredConversations.length > 0
          ? scoredConversations.reduce((sum, conv) => sum + (conv.confidence_score || 0), 0) / scoredConversations.length
          : 0;

        const flaggedConversations = flaggedData?.length || 0;

        // Calculate cost metrics
        const conversationsThisMonthWithCost = allConversations?.filter(conv => {
          const date = new Date(conv.created_at);
          return date >= startOfThisMonth && conv.total_cost;
        }) || [];

        const conversationsLastMonthWithCost = allConversations?.filter(conv => {
          const date = new Date(conv.created_at);
          return date >= startOfLastMonth && date <= endOfLastMonth && conv.total_cost;
        }) || [];

        const totalCostThisMonth = conversationsThisMonthWithCost.reduce(
          (sum, conv) => sum + (conv.total_cost || 0), 0
        );

        const totalCostLastMonth = conversationsLastMonthWithCost.reduce(
          (sum, conv) => sum + (conv.total_cost || 0), 0
        );

        const costGrowth = totalCostLastMonth > 0 
          ? ((totalCostThisMonth - totalCostLastMonth) / totalCostLastMonth) * 100 
          : totalCostThisMonth > 0 ? 100 : 0;

        // Calculate average response time (using call_duration as proxy)
        const conversationsWithDuration = allConversations?.filter(conv => 
          conv.call_duration && conv.call_duration > 0
        ) || [];
        
        const avgResponseTime = conversationsWithDuration.length > 0
          ? conversationsWithDuration.reduce((sum, conv) => sum + (conv.call_duration || 0), 0) / conversationsWithDuration.length
          : 0;

        const calculatedMetrics: OrganizationMetrics = {
          totalConversations,
          conversationsThisMonth,
          conversationsGrowth: Math.round(conversationsGrowth * 10) / 10,
          activeAssistants,
          avgScore: Math.round(avgScore * 10) / 10,
          flaggedConversations,
          totalCostThisMonth: Math.round(totalCostThisMonth * 100) / 100,
          costGrowth: Math.round(costGrowth * 10) / 10,
          avgResponseTime: Math.round(avgResponseTime)
        };

        setMetrics(calculatedMetrics);
      } catch (err) {
        console.error('Error fetching organization metrics:', err);
        setError(err instanceof Error ? err.message : 'Unknown error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();

    // Set up real-time subscription for conversations
    const conversationsSubscription = supabase
      .channel('org_conversations')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'conversations',
        filter: `org_id=eq.${orgId}`
      }, () => {
        // Refetch metrics when conversations change
        fetchMetrics();
      })
      .subscribe();

    return () => {
      conversationsSubscription.unsubscribe();
    };
  }, [orgId]);

  return { metrics, loading, error, refetch: () => {
    if (orgId) {
      setLoading(true);
      // Trigger useEffect by changing dependency
    }
  }};
};

export interface RecentActivity {
  id: string;
  type: 'conversation' | 'assistant' | 'review' | 'alert';
  title: string;
  description: string;
  timestamp: string;
  assistantName?: string;
  score?: number;
  sentiment?: string;
  flagged?: boolean;
  status?: string;
}

export const useRecentActivity = (orgId: string | null, limit: number = 10) => {
  const [activities, setActivities] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      return;
    }

    const fetchRecentActivity = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch recent conversations with assistant info (without scores join that may fail)
        const { data: conversations, error: convError } = await supabase
          .from('conversations')
          .select(`
            id,
            created_at,
            confidence_score,
            overall_score,
            assistant:assistants(friendly_name)
          `)
          .eq('org_id', orgId)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (convError) throw convError;

        // Fetch recent audit logs - gracefully handle if empty or table issues
        let auditLogs: any[] = [];
        try {
          const { data: logs, error: auditError } = await supabase
            .from('audit_logs')
            .select('id, action, created_at, details')
            .eq('org_id', orgId)
            .order('created_at', { ascending: false })
            .limit(limit);

          if (!auditError) {
            auditLogs = logs || [];
          }
        } catch (e) {
          console.log('audit_logs query failed:', e);
        }

        // Transform conversations into activities
        const conversationActivities: RecentActivity[] = conversations?.map(conv => {
          // Use confidence_score or overall_score
          const score = conv.confidence_score || conv.overall_score || null;

          return {
            id: conv.id,
            type: 'conversation',
            title: 'New Conversation',
            description: `Conversation with ${conv.assistant?.friendly_name || 'Unknown Assistant'}`,
            timestamp: conv.created_at,
            assistantName: conv.assistant?.friendly_name,
            score: score,
            sentiment: 'neutral',
            flagged: false
          };
        }) || [];

        // Transform audit logs into activities
        const auditActivities: RecentActivity[] = auditLogs?.map(log => ({
          id: log.id,
          type: getActivityTypeFromAction(log.action),
          title: getActivityTitleFromAction(log.action),
          description: getActivityDescriptionFromLog(log),
          timestamp: log.created_at,
          status: log.action
        })) || [];

        // Combine and sort all activities by timestamp
        const allActivities = [...conversationActivities, ...auditActivities]
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .slice(0, limit);

        setActivities(allActivities);
      } catch (err) {
        console.error('Error fetching recent activity:', err);
        setError(err instanceof Error ? err.message : 'Unknown error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchRecentActivity();

    // Set up real-time subscription
    const subscription = supabase
      .channel('org_activity')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'conversations',
        filter: `org_id=eq.${orgId}`
      }, fetchRecentActivity)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'audit_logs',
        filter: `org_id=eq.${orgId}`
      }, fetchRecentActivity)
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [orgId, limit]);

  return { activities, loading, error };
};

// Helper functions for audit log transformation
function getActivityTypeFromAction(action: string): RecentActivity['type'] {
  if (action.includes('conversation')) return 'conversation';
  if (action.includes('assistant')) return 'assistant';
  if (action.includes('review')) return 'review';
  return 'alert';
}

function getActivityTitleFromAction(action: string): string {
  const actionMap: Record<string, string> = {
    'conversation_scored': 'Conversation Scored',
    'conversation_rescored': 'Conversation Rescored',
    'assistant_created': 'Assistant Created',
    'assistant_updated': 'Assistant Updated',
    'scoring_paused': 'Scoring Paused',
    'scoring_resumed': 'Scoring Resumed',
    'review_completed': 'Review Completed',
    'cost_threshold_exceeded': 'Cost Alert'
  };
  
  return actionMap[action] || action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function getActivityDescriptionFromLog(log: any): string {
  const details = log.details || {};
  
  switch (log.action) {
    case 'conversation_scored':
    case 'conversation_rescored':
      return `Score: ${details.confidence_score || 'N/A'}% | Tokens: ${details.tokens_used || 0}`;
    case 'assistant_created':
      return `New assistant: ${details.assistant_name || 'Unknown'}`;
    case 'cost_threshold_exceeded':
      return `Monthly cost limit reached: $${details.total_cost || 0}`;
    default:
      return details.message || 'Activity logged';
  }
}