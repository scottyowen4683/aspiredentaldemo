/*
 * Client Cost Metrics Hook
 *
 * This hook calculates cost metrics from the CLIENT'S PERSPECTIVE, not internal costs.
 * All calculations are based on:
 * 1. Monthly service fee they pay us
 * 2. Baseline human cost per call (set during onboarding)
 * 3. Their conversation volume
 *
 * This does NOT include:
 * - LLM API costs
 * - TTS/STT costs
 * - Platform costs
 * - Token usage
 * - Any internal operational costs
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/supabaseClient';

export interface OrganizationPlan {
  monthlyPlanCost: number;
  baselineHumanCostPerCall: number;
  includedCallsPerMonth: number;
  overageRatePerCall: number;
}

export interface ClientCostMetrics {
  costPerConversation: number;
  savingsPerConversation: number;
  totalMonthlySavings: number;
  roi: number;
  estimatedHumanCost: number;
  serviceValue: number;
  efficiencyGain: number;
}

// Default plan values - fallback when service plan is not configured
const DEFAULT_PLAN: OrganizationPlan = {
  monthlyPlanCost: 2500,
  baselineHumanCostPerCall: 7.50,
  includedCallsPerMonth: 1000,
  overageRatePerCall: 2.50
};

export const useClientCostMetrics = (orgId: string | null, conversationsThisMonth: number = 0) => {
  const [plan, setPlan] = useState<OrganizationPlan>(DEFAULT_PLAN);
  const [metrics, setMetrics] = useState<ClientCostMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      return;
    }

    const fetchPlanAndCalculateMetrics = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch organization service plan from database
        const { data: orgData, error: orgError } = await supabase
          .from('organizations')
          .select('id, monthly_service_fee, baseline_human_cost_per_call, service_plan_name')
          .eq('id', orgId)
          .single();

        let organizationPlan: OrganizationPlan;

        if (orgError || !orgData) {
          // Use default plan if organization not found
          console.log('Organization not found, using default plan values');
          organizationPlan = DEFAULT_PLAN;
        } else if (!orgData.monthly_service_fee || orgData.monthly_service_fee === undefined) {
          // Use default plan if service plan fields don't exist or aren't configured
          console.log('Service plan not configured or database columns missing, using default plan values');
          organizationPlan = DEFAULT_PLAN;
        } else {
          // Calculate plan values from service plan configuration
          const monthlyServiceFee = orgData.monthly_service_fee;
          const baselineHumanCost = orgData.baseline_human_cost_per_call || DEFAULT_PLAN.baselineHumanCostPerCall;
          
          // Estimate included calls based on service fee (baseline: assume service fee covers reasonable volume)
          // More realistic calculation: service fee typically covers 80% of baseline volume
          const estimatedIncludedCalls = Math.floor((monthlyServiceFee / baselineHumanCost) * 0.8);
          
          organizationPlan = {
            monthlyPlanCost: monthlyServiceFee,
            baselineHumanCostPerCall: baselineHumanCost,
            includedCallsPerMonth: Math.max(estimatedIncludedCalls, 100), // Minimum 100 calls
            overageRatePerCall: baselineHumanCost * 0.4 // Overage is typically 40% of human cost
          };
        }

        setPlan(organizationPlan);

        // Calculate client-facing metrics
        const calculatedMetrics = calculateClientMetrics(organizationPlan, conversationsThisMonth);
        setMetrics(calculatedMetrics);

      } catch (err) {
        console.error('Error fetching organization plan:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        
        // Fallback to default plan
        setPlan(DEFAULT_PLAN);
        const fallbackMetrics = calculateClientMetrics(DEFAULT_PLAN, conversationsThisMonth);
        setMetrics(fallbackMetrics);
      } finally {
        setLoading(false);
      }
    };

    fetchPlanAndCalculateMetrics();
  }, [orgId, conversationsThisMonth]);

  return { plan, metrics, loading, error };
};

function calculateClientMetrics(plan: OrganizationPlan, conversationsThisMonth: number): ClientCostMetrics {
  // CLIENT-FACING COST CALCULATION (not internal AI costs)
  // This is what the client pays for the service, not what it costs us to provide it
  
  // If no conversations yet, use projected cost based on included calls
  const effectiveConversations = Math.max(conversationsThisMonth, 1);
  
  // Calculate overage costs if calls exceed included amount
  const overageCalls = Math.max(0, conversationsThisMonth - plan.includedCallsPerMonth);
  const overageCost = overageCalls * plan.overageRatePerCall;
  
  // Total client cost (what they pay us)
  const totalClientCost = plan.monthlyPlanCost + overageCost;
  
  // Client's cost per conversation (their perspective)
  const costPerConversation = totalClientCost / effectiveConversations;

  // Savings calculations compared to human baseline
  const estimatedHumanCost = conversationsThisMonth * plan.baselineHumanCostPerCall;
  const savingsPerConversation = plan.baselineHumanCostPerCall - costPerConversation; // Allow negative
  const totalMonthlySavings = estimatedHumanCost - totalClientCost; // Allow negative

  // ROI calculation: (Total Savings / Client Investment) * 100
  const roi = totalClientCost > 0 ? (totalMonthlySavings / totalClientCost) * 100 : 0;

  // Service value metrics (client perspective)
  const serviceValue = totalClientCost;
  const efficiencyGain = plan.baselineHumanCostPerCall > 0 ? 
    ((plan.baselineHumanCostPerCall - costPerConversation) / plan.baselineHumanCostPerCall) * 100 : 0;

  return {
    costPerConversation,
    savingsPerConversation,
    totalMonthlySavings,
    roi,
    estimatedHumanCost,
    serviceValue,
    efficiencyGain
  };
}