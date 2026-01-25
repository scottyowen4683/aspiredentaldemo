import { useState, useEffect } from 'react';
import { supabase } from '@/supabaseClient';

export interface OrganizationInfo {
  id: string;
  name: string;
  service_plan_name?: string | null;
  monthly_service_fee?: number | null;
  baseline_human_cost_per_call?: number | null;
  coverage_hours?: "12hr" | "24hr" | null;
  time_zone?: string | null;
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
            service_plan_name,
            monthly_service_fee,
            baseline_human_cost_per_call,
            coverage_hours,
            time_zone,
            created_at
          `)
          .eq('id', orgId)
          .single();

        if (fetchError) {
          console.error('Error fetching organization info:', fetchError);
          setError(fetchError.message);
          return;
        }

        // Handle case where service plan columns might not exist yet
        if (data) {
          // Only log if we're getting undefined for service plan fields
          const hasServicePlanFields = data.service_plan_name !== undefined || data.monthly_service_fee !== undefined;
          if (!hasServicePlanFields) {
            console.log('Service plan fields not found in database - migration may need to be run');
          }
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