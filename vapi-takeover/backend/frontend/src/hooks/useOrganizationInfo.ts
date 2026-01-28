import { useState, useEffect } from 'react';
import { supabase } from '@/supabaseClient';

export interface OrganizationInfo {
  id: string;
  name: string;
  flat_rate_fee?: number | null;
  included_interactions?: number | null;
  overage_rate_per_1000?: number | null;
  settings?: Record<string, any> | null;
  created_at: string;
}

export const useOrganizationInfo = (orgId: string | null) => {
  const [organization, setOrganization] = useState<OrganizationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      return;
    }

    const fetchOrganizationInfo = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data, error: fetchError } = await supabase
          .from('organizations')
          .select(`
            id,
            name,
            flat_rate_fee,
            included_interactions,
            overage_rate_per_1000,
            settings,
            created_at
          `)
          .eq('id', orgId)
          .single();

        if (fetchError) {
          console.error('Error fetching organization info:', fetchError);
          setError(fetchError.message);
          return;
        }

        setOrganization(data);
      } catch (err) {
        console.error('Unexpected error fetching organization info:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchOrganizationInfo();
  }, [orgId]);

  return { organization, loading, error };
};