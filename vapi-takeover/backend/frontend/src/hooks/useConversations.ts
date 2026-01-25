import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/supabaseClient';
import { useUser } from '@/context/UserContext';

export interface Conversation {
  id: string;
  org_id: string;
  assistant_id: string;
  provider: string;
  transcript: any;
  transcript_source: 'provider' | 'asr';
  final_ai_summary: string | null;
  confidence_score: number | null;
  scored: boolean;
  prompt_version: number | null;
  kb_version: number | null;
  success_evaluation: boolean;
  total_cost: number | null;
  call_duration: number | null;
  cost_breakdown: any;
  recording_url: string | null;
  stereo_recording_url: string | null;
  log_url: string | null;
  end_reason: string | null;
  created_at: string;
  updated_at: string;
  escalation: string | null;
  is_voice: boolean | null;
  sentiment: string | null;
  // Relations
  organizations?: {
    name: string;
  };
  assistants?: {
    friendly_name: string;
  };
}

export interface ConversationsFilters {
  search?: string;
  assistant_id?: string;
  org_id?: string;
  provider?: string;
  flagged?: boolean;
  low_confidence?: boolean;
  // New enhanced filters
  date_from?: string;
  date_to?: string;
  sentiment?: string;
  score_min?: number;
  score_max?: number;
  escalation_status?: string;
  // Pagination
  page?: number;
  pageSize?: number;
}

export interface ConversationsResponse {
  data: Conversation[];
  total: number;
  totalPages: number;
  currentPage: number;
  pageSize: number;
}

export function useConversations(filters: ConversationsFilters = {}) {
  const { user } = useUser();

  return useQuery({
    queryKey: ['conversations', filters, user?.org_id],
    queryFn: async (): Promise<ConversationsResponse> => {
      // Pagination setup
      const page = filters.page || 1;
      const pageSize = filters.pageSize || 20;
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      // First, get the count for pagination
      let countQuery = supabase
        .from('conversations')
        .select('*', { count: 'exact', head: true });

      // Apply same filters for count
      if (user?.role !== 'super_admin' && user?.org_id) {
        countQuery = countQuery.eq('org_id', user.org_id);
      }

      // Apply filters to count query
      if (filters.search) {
        countQuery = countQuery.ilike('provider', `%${filters.search}%`);
      }
      if (filters.assistant_id) {
        countQuery = countQuery.eq('assistant_id', filters.assistant_id);
      }
      if (filters.org_id && user?.role === 'super_admin') {
        countQuery = countQuery.eq('org_id', filters.org_id);
      }
      if (filters.provider) {
        countQuery = countQuery.eq('provider', filters.provider);
      }
      if (filters.flagged) {
        countQuery = countQuery.or('confidence_score.lt.70,success_evaluation.eq.false');
      }
      if (filters.low_confidence) {
        countQuery = countQuery.lt('confidence_score', 70);
      }
      if (filters.date_from) {
        countQuery = countQuery.gte('created_at', filters.date_from);
      }
      if (filters.date_to) {
        countQuery = countQuery.lte('created_at', filters.date_to);
      }
      if (filters.score_min !== undefined) {
        countQuery = countQuery.gte('confidence_score', filters.score_min);
      }
      if (filters.score_max !== undefined) {
        countQuery = countQuery.lte('confidence_score', filters.score_max);
      }

      // Get total count
      const { count, error: countError } = await countQuery;
      if (countError) {
        throw new Error(`Failed to fetch conversation count: ${countError.message}`);
      }

      // Main data query with pagination
      let query = supabase
        .from('conversations')
        .select(`
          *,
          organizations(name),
          assistants(friendly_name)
        `)
        .range(from, to)
        .order('created_at', { ascending: false });

      // Apply role-based filtering
      if (user?.role !== 'super_admin' && user?.org_id) {
        query = query.eq('org_id', user.org_id);
      }

      // Apply search filter
      if (filters.search) {
        query = query.ilike('provider', `%${filters.search}%`);
      }

      // Apply assistant filter
      if (filters.assistant_id) {
        query = query.eq('assistant_id', filters.assistant_id);
      }

      // Apply organization filter (only for super_admin)
      if (filters.org_id && user?.role === 'super_admin') {
        query = query.eq('org_id', filters.org_id);
      }

      // Apply provider filter
      if (filters.provider) {
        query = query.eq('provider', filters.provider);
      }

      // Apply status filters
      if (filters.flagged) {
        query = query.or('confidence_score.lt.70,success_evaluation.eq.false');
      }

      if (filters.low_confidence) {
        query = query.lt('confidence_score', 70);
      }

      // Apply new enhanced filters
      if (filters.date_from) {
        query = query.gte('created_at', filters.date_from);
      }

      if (filters.date_to) {
        query = query.lte('created_at', filters.date_to);
      }

      if (filters.score_min !== undefined) {
        query = query.gte('confidence_score', filters.score_min);
      }

      if (filters.score_max !== undefined) {
        query = query.lte('confidence_score', filters.score_max);
      }

      if (filters.sentiment && filters.sentiment !== 'all') {
        query = query.eq('sentiment', filters.sentiment);
      }

      // Escalation status would require additional database fields

      const { data, error } = await query;

      if (error) {
        throw new Error(`Failed to fetch conversations: ${error.message}`);
      }

      const total = count || 0;
      const totalPages = Math.ceil(total / pageSize);

      return {
        data: data as Conversation[],
        total,
        totalPages,
        currentPage: page,
        pageSize
      };
    },
    enabled: !!user,
  });
}

// Hook for fetching filter options
export function useConversationFilters() {
  const { user } = useUser();

  const assistantsQuery = useQuery({
    queryKey: ['conversation-assistants', user?.org_id],
    queryFn: async () => {
      let query = supabase
        .from('assistants')
        .select('id, friendly_name')
        .order('friendly_name');

      if (user?.role !== 'super_admin' && user?.org_id) {
        query = query.eq('org_id', user.org_id);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: !!user,
  });

  const organizationsQuery = useQuery({
    queryKey: ['conversation-organizations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name')
        .order('name');

      if (error) throw new Error(error.message);
      return data;
    },
    enabled: !!user && user.role === 'super_admin',
  });

  return {
    assistants: assistantsQuery.data || [],
    organizations: organizationsQuery.data || [],
    isLoading: assistantsQuery.isLoading || organizationsQuery.isLoading,
  };
}