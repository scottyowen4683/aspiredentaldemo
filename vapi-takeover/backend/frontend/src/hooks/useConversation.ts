import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/supabaseClient';
import { useUser } from '@/context/UserContext';
import type { Conversation } from './useConversations';

export function useConversation(id: string) {
  const { user } = useUser();

  return useQuery({
    queryKey: ['conversation', id],
    queryFn: async () => {
      let query = supabase
        .from('conversations')
        .select(`
          *,
          organizations(name),
          assistants(friendly_name)
        `)
        .eq('id', id)
        .single();

      // Apply role-based filtering
      if (user?.role !== 'super_admin' && user?.org_id) {
        query = query.eq('org_id', user.org_id);
      }

      const { data, error } = await query;

      if (error) {
        if (error.code === 'PGRST116') {
          throw new Error('Conversation not found');
        }
        throw new Error(`Failed to fetch conversation: ${error.message}`);
      }

      return data as Conversation;
    },
    enabled: !!user && !!id,
  });
}