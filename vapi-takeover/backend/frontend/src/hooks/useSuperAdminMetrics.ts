import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/supabaseClient';

export interface SuperAdminMetrics {
  // Platform Overview
  totalOrganizations: number;
  totalUsers: number;
  totalConversations: number;
  totalAssistants: number;
  
  // Performance Metrics
  avgConfidenceScore: number;
  totalFlaggedConversations: number;
  platformUptime: number;
  avgProcessingTime: number;
  
  // Usage & Costs
  totalTokensUsed: number;
  totalCostThisMonth: number;
  totalMinutesProcessed: number;
  
  // Growth Metrics
  newOrganizations30d: number;
  conversationGrowth30d: number;
  userGrowth30d: number;
  
  // System Health
  errorRate: number;
  activeAssistants: number;
  reviewQueueSize: number;
}

export interface OrganizationSummary {
  id: string;
  name: string;
  totalConversations: number;
  avgScore: number;
  totalCost: number;
  assistantCount: number;
  userCount: number;
  flaggedCount: number;
  status: 'active' | 'inactive' | 'suspended';
  created_at: string;
}

export interface RecentActivity {
  id: string;
  action: string;
  details: string;
  user_name: string;
  org_name: string;
  created_at: string;
  severity: 'info' | 'warning' | 'error' | 'success';
}

export function useSuperAdminMetrics() {
  return useQuery({
    queryKey: ['super-admin-metrics'],
    queryFn: async (): Promise<SuperAdminMetrics> => {
      try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const startOfMonth = new Date();
        startOfMonth.setDate(1);

        // Get total organizations
        const { count: totalOrganizations } = await supabase
          .from('organizations')
          .select('*', { count: 'exact', head: true });

        // Get new organizations in last 30 days
        const { count: newOrganizations30d } = await supabase
          .from('organizations')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', thirtyDaysAgo.toISOString());

        // Get total users
        const { count: totalUsers } = await supabase
          .from('users')
          .select('*', { count: 'exact', head: true });

        // Get user growth in last 30 days
        const { count: userGrowth30d } = await supabase
          .from('users')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', thirtyDaysAgo.toISOString());

        // Get total conversations
        const { count: totalConversations } = await supabase
          .from('conversations')
          .select('*', { count: 'exact', head: true });

        // Get conversations from last 30 days
        const { count: conversationGrowth30d } = await supabase
          .from('conversations')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', thirtyDaysAgo.toISOString());

        // Get total assistants
        const { count: totalAssistants } = await supabase
          .from('assistants')
          .select('*', { count: 'exact', head: true });

        // Get active assistants (auto_score enabled and not paused)
        const { count: activeAssistants } = await supabase
          .from('assistants')
          .select('*', { count: 'exact', head: true })
          .eq('auto_score', true)
          .eq('pause_auto_score', false);

        // Get average confidence score
        const { data: avgConfidenceData } = await supabase
          .from('conversations')
          .select('confidence_score')
          .not('confidence_score', 'is', null);
        
        const avgConfidenceScore = avgConfidenceData?.length > 0
          ? avgConfidenceData.reduce((sum, c) => sum + (c.confidence_score || 0), 0) / avgConfidenceData.length
          : 0;

        // Get flagged conversations (confidence < 70 or success_evaluation = false)
        const { count: totalFlaggedConversations } = await supabase
          .from('conversations')
          .select('*', { count: 'exact', head: true })
          .or('confidence_score.lt.70,success_evaluation.eq.false');

        // Get review queue size
        const { count: reviewQueueSize } = await supabase
          .from('review_queue')
          .select('*', { count: 'exact', head: true })
          .eq('reviewed', false);

        // Cost usage - derive from conversations (no separate cost_usage table)
        const { data: conversationCosts } = await supabase
          .from('conversations')
          .select('tokens_in, tokens_out, duration_seconds')
          .gte('created_at', startOfMonth.toISOString());

        const totalTokensUsed = conversationCosts?.reduce((sum, c) => sum + (c.tokens_in || 0) + (c.tokens_out || 0), 0) || 0;
        const totalMinutesProcessed = conversationCosts?.reduce((sum, c) => sum + ((c.duration_seconds || 0) / 60), 0) || 0;

        // Get total cost from conversations this month
        const { data: conversationsThisMonth } = await supabase
          .from('conversations')
          .select('total_cost')
          .gte('created_at', startOfMonth.toISOString())
          .not('total_cost', 'is', null);

        const totalCostThisMonth = conversationsThisMonth?.reduce((sum, c) => sum + (c.total_cost || 0), 0) || 0;

        // Calculate average processing time (mock for now - would need actual timing data)
        const avgProcessingTime = 2.4; // seconds

        // Calculate platform uptime (mock for now - would need actual monitoring data)
        const platformUptime = 99.9; // percentage

        // Calculate error rate (mock for now - would need actual error tracking)
        const errorRate = 0.1; // percentage

        return {
          totalOrganizations: totalOrganizations || 0,
          totalUsers: totalUsers || 0,
          totalConversations: totalConversations || 0,
          totalAssistants: totalAssistants || 0,
          avgConfidenceScore: Math.round(avgConfidenceScore * 10) / 10,
          totalFlaggedConversations: totalFlaggedConversations || 0,
          platformUptime,
          avgProcessingTime,
          totalTokensUsed,
          totalCostThisMonth: Math.round(totalCostThisMonth * 100) / 100,
          totalMinutesProcessed: Math.round(totalMinutesProcessed * 10) / 10,
          newOrganizations30d: newOrganizations30d || 0,
          conversationGrowth30d: conversationGrowth30d || 0,
          userGrowth30d: userGrowth30d || 0,
          errorRate,
          activeAssistants: activeAssistants || 0,
          reviewQueueSize: reviewQueueSize || 0
        };
      } catch (error) {
        console.error('Error fetching super admin metrics:', error);
        throw error;
      }
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

export function useOrganizationSummaries() {
  return useQuery({
    queryKey: ['organization-summaries'],
    queryFn: async (): Promise<OrganizationSummary[]> => {
      try {
        // Get all organizations with related counts
        const { data: organizations, error } = await supabase
          .from('organizations')
          .select(`
            id,
            name,
            active,
            created_at
          `)
          .order('created_at', { ascending: false });

        if (error) throw error;

        // Get counts for each organization
        const summaries: OrganizationSummary[] = [];
        
        for (const org of organizations || []) {
          // Get conversation count
          const { count: totalConversations } = await supabase
            .from('conversations')
            .select('*', { count: 'exact', head: true })
            .eq('org_id', org.id);

          // Get assistant count
          const { count: assistantCount } = await supabase
            .from('assistants')
            .select('*', { count: 'exact', head: true })
            .eq('org_id', org.id);

          // Get user count
          const { count: userCount } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .eq('org_id', org.id);

          // Get flagged conversations count
          const { count: flaggedCount } = await supabase
            .from('conversations')
            .select('*', { count: 'exact', head: true })
            .eq('org_id', org.id)
            .or('confidence_score.lt.70,success_evaluation.eq.false');

          // Get average score and total cost
          const { data: orgConversations } = await supabase
            .from('conversations')
            .select('confidence_score, total_cost')
            .eq('org_id', org.id)
            .not('confidence_score', 'is', null);

          const avgScore = orgConversations?.length > 0
            ? orgConversations.reduce((sum, c) => sum + (c.confidence_score || 0), 0) / orgConversations.length
            : 0;

          const totalCost = orgConversations?.reduce((sum, c) => sum + (c.total_cost || 0), 0) || 0;

          summaries.push({
            id: org.id,
            name: org.name,
            totalConversations: totalConversations || 0,
            avgScore: Math.round(avgScore * 10) / 10,
            totalCost: Math.round(totalCost * 100) / 100,
            assistantCount: assistantCount || 0,
            userCount: userCount || 0,
            flaggedCount: flaggedCount || 0,
            status: org.active === false ? 'inactive' : 'active',
            created_at: org.created_at
          });
        }

        return summaries;
      } catch (error) {
        console.error('Error fetching organization summaries:', error);
        throw error;
      }
    },
    refetchInterval: 60000, // Refresh every minute
  });
}

export function useSuperAdminRecentActivity(limit: number = 20) {
  return useQuery({
    queryKey: ['super-admin-recent-activity', limit],
    queryFn: async (): Promise<RecentActivity[]> => {
      try {
        const { data: activities, error } = await supabase
          .from('audit_logs')
          .select(`
            id,
            action,
            details,
            created_at,
            users(full_name),
            organizations(name)
          `)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (error) throw error;

        return (activities || []).map(activity => ({
          id: activity.id,
          action: activity.action,
          details: typeof activity.details === 'string' 
            ? activity.details 
            : (activity.details ? JSON.stringify(activity.details) : 'No details available'),
          user_name: activity.users?.full_name || 'System',
          org_name: activity.organizations?.name || 'Platform',
          created_at: activity.created_at,
          severity: getSeverityFromAction(activity.action)
        }));
      } catch (error) {
        console.error('Error fetching super admin recent activity:', error);
        return [];
      }
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

function getSeverityFromAction(action: string): 'info' | 'warning' | 'error' | 'success' {
  if (action.includes('error') || action.includes('failed') || action.includes('suspended')) {
    return 'error';
  }
  if (action.includes('warning') || action.includes('threshold') || action.includes('flagged')) {
    return 'warning';
  }
  if (action.includes('created') || action.includes('success') || action.includes('completed')) {
    return 'success';
  }
  return 'info';
}