import { supabase } from "@/supabaseClient";
import { logAuditEvent, AUDIT_ACTIONS } from "@/services/auditService";

export interface RubricDimension {
  name: string;
  weight: number;
  criteria: string;
}

export interface Rubric {
  dimensions: RubricDimension[];
  overall_weight: number;
  scoring_scale: {
    min: number;
    max: number;
    excellent: number;
    good: number;
    satisfactory: number;
    needs_improvement: number;
    poor: number;
  };
  version: number;
  created_at?: string;
}

export interface RubricUsageStats {
  org_id: string;
  org_name: string;
  has_org_rubric: boolean;
  total_assistants: number;
  assistants_with_custom_rubric: number;
  assistants_using_org_default: number;
}

/**
 * Get organization's default rubric
 * Note: Uses settings JSONB column since default_rubric column may not exist
 */
export async function getOrganizationRubric(orgId: string): Promise<{
  success: boolean;
  data?: Rubric | null;
  error?: Error;
}> {
  try {
    const { data, error } = await supabase
      .from("organizations")
      .select("settings")
      .eq("id", orgId)
      .single();

    if (error) {
      console.log("Error fetching organization rubric:", error.message);
      return { success: true, data: null };
    }

    // Try to get rubric from settings JSONB column
    const rubric = data?.settings?.default_rubric || null;

    return { success: true, data: rubric };
  } catch (err) {
    console.error("Error fetching organization rubric:", err);
    return { success: true, data: null };
  }
}

/**
 * Update organization's default rubric
 * Note: Stores rubric in settings JSONB column since default_rubric column may not exist
 */
export async function updateOrganizationRubric(
  orgId: string,
  rubric: Rubric,
  userId?: string
): Promise<{
  success: boolean;
  data?: Rubric;
  error?: Error;
}> {
  try {
    // Check if this is a new rubric or an update
    const existingRubric = await getOrganizationRubric(orgId);
    const isNewRubric = !existingRubric.success || !existingRubric.data;

    const rubricWithTimestamp = {
      ...rubric,
      created_at: new Date().toISOString()
    };

    // First get current settings
    const { data: currentOrg } = await supabase
      .from("organizations")
      .select("settings, name")
      .eq("id", orgId)
      .single();

    // Merge rubric into settings
    const mergedSettings = {
      ...(currentOrg?.settings || {}),
      default_rubric: rubricWithTimestamp
    };

    const { data, error } = await supabase
      .from("organizations")
      .update({
        settings: mergedSettings,
        updated_at: new Date().toISOString()
      })
      .eq("id", orgId)
      .select("settings, name")
      .single();

    if (error) {
      console.error("Error updating organization rubric:", error);
      return { success: false, error };
    }

    const updatedRubric = data?.settings?.default_rubric || null;

    // Log audit event
    if (userId) {
      await logAuditEvent({
        org_id: orgId,
        user_id: userId,
        action: isNewRubric ? AUDIT_ACTIONS.ORGANIZATION_RUBRIC_CREATED : AUDIT_ACTIONS.ORGANIZATION_RUBRIC_UPDATED,
        details: {
          organization_name: data?.name || currentOrg?.name,
          rubric_dimensions: rubric.dimensions?.length || 0,
          rubric_version: rubric.version || 1,
          dimension_names: rubric.dimensions?.map(d => d.name) || [],
          total_weight: rubric.dimensions?.reduce((sum, d) => sum + d.weight, 0) || 0,
          action_timestamp: new Date().toISOString()
        }
      });
    }

    return { success: true, data: updatedRubric };
  } catch (err) {
    console.error("Error updating organization rubric:", err);
    return { success: false, error: err as Error };
  }
}

/**
 * Get effective rubric for an assistant (custom or organization default)
 */
export async function getEffectiveRubric(assistantId: string): Promise<{
  success: boolean;
  data?: {
    rubric: Rubric | null;
    source: 'assistant' | 'organization' | 'none';
  };
  error?: Error;
}> {
  try {
    const { data, error } = await supabase
      .rpc('get_effective_rubric', { assistant_uuid: assistantId });

    if (error) {
      return { success: false, error };
    }

    if (!data) {
      return { 
        success: true, 
        data: { rubric: null, source: 'none' }
      };
    }

    const rubric = typeof data === 'string' ? JSON.parse(data) : data;
    
    // Determine source by checking if assistant has custom rubric
    const { data: assistantData, error: assistantError } = await supabase
      .from("assistants")
      .select("rubric")
      .eq("id", assistantId)
      .single();

    if (assistantError) {
      return { success: false, error: assistantError };
    }

    const source = assistantData?.rubric ? 'assistant' : 'organization';
    
    return { 
      success: true, 
      data: { rubric, source }
    };
  } catch (err) {
    console.error("Error fetching effective rubric:", err);
    return { success: false, error: err as Error };
  }
}

/**
 * Update assistant's custom rubric
 */
export async function updateAssistantRubric(
  assistantId: string, 
  rubric: Rubric | null, 
  userId?: string
): Promise<{
  success: boolean;
  data?: Rubric | null;
  error?: Error;
}> {
  try {
    // Get assistant info for audit logging
    const { data: assistantInfo } = await supabase
      .from("assistants")
      .select("friendly_name, org_id, rubric")
      .eq("id", assistantId)
      .single();

    const previousHadRubric = !!assistantInfo?.rubric;

    const rubricData = rubric ? JSON.stringify({
      ...rubric,
      created_at: new Date().toISOString()
    }) : null;

    const { data, error } = await supabase
      .from("assistants")
      .update({ 
        rubric: rubricData,
        rubric_version: rubric ? (rubric.version || 1) : null,
        updated_at: new Date().toISOString()
      })
      .eq("id", assistantId)
      .select("rubric")
      .single();

    if (error) {
      return { success: false, error };
    }

    const updatedRubric = data?.rubric ? JSON.parse(data.rubric) : null;
    
    // Log audit event
    if (userId && assistantInfo) {
      let action: string;
      if (!rubric) {
        action = AUDIT_ACTIONS.ASSISTANT_RUBRIC_RESET;
      } else if (!previousHadRubric) {
        action = AUDIT_ACTIONS.ASSISTANT_RUBRIC_CREATED;
      } else {
        action = AUDIT_ACTIONS.ASSISTANT_RUBRIC_UPDATED;
      }

      await logAuditEvent({
        org_id: assistantInfo.org_id,
        user_id: userId,
        assistant_id: assistantId,
        action,
        details: {
          assistant_name: assistantInfo.friendly_name,
          rubric_dimensions: rubric?.dimensions?.length || 0,
          rubric_version: rubric?.version || null,
          dimension_names: rubric?.dimensions?.map(d => d.name) || [],
          total_weight: rubric?.dimensions?.reduce((sum, d) => sum + d.weight, 0) || 0,
          was_reset: !rubric,
          action_timestamp: new Date().toISOString()
        }
      });
    }
    
    return { success: true, data: updatedRubric };
  } catch (err) {
    console.error("Error updating assistant rubric:", err);
    return { success: false, error: err as Error };
  }
}

/**
 * Get rubric usage statistics
 */
export async function getRubricUsageStats(): Promise<{
  success: boolean;
  data?: RubricUsageStats[];
  error?: Error;
}> {
  try {
    const { data, error } = await supabase
      .from("rubric_usage")
      .select("*");

    if (error) {
      return { success: false, error };
    }

    return { success: true, data: data || [] };
  } catch (err) {
    console.error("Error fetching rubric usage stats:", err);
    return { success: false, error: err as Error };
  }
}

/**
 * Validate rubric structure
 */
export function validateRubric(rubric: Rubric): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!rubric.dimensions || rubric.dimensions.length === 0) {
    errors.push("At least one dimension is required");
  }

  if (rubric.dimensions) {
    rubric.dimensions.forEach((dimension, index) => {
      if (!dimension.name?.trim()) {
        errors.push(`Dimension ${index + 1}: Name is required`);
      }
      
      if (!dimension.weight || dimension.weight <= 0 || dimension.weight > 100) {
        errors.push(`Dimension ${index + 1}: Weight must be between 1 and 100`);
      }
      
      if (!dimension.criteria?.trim()) {
        errors.push(`Dimension ${index + 1}: Criteria is required`);
      }
    });

    const totalWeight = rubric.dimensions.reduce((sum, dim) => sum + (dim.weight || 0), 0);
    if (totalWeight !== 100) {
      errors.push(`Total weight must equal 100% (currently ${totalWeight}%)`);
    }
  }

  if (!rubric.scoring_scale) {
    errors.push("Scoring scale is required");
  } else {
    const { min, max, excellent, good, satisfactory, needs_improvement, poor } = rubric.scoring_scale;
    
    if (min >= max) {
      errors.push("Minimum score must be less than maximum score");
    }
    
    if (poor >= needs_improvement || needs_improvement >= satisfactory || 
        satisfactory >= good || good >= excellent) {
      errors.push("Scoring thresholds must be in ascending order");
    }
    
    if (excellent > max || poor < min) {
      errors.push("All thresholds must be within the min/max range");
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Create a default rubric template
 */
export function createDefaultRubric(): Rubric {
  return {
    dimensions: [
      {
        name: "Communication Quality",
        weight: 30,
        criteria: "Clarity, professionalism, and appropriateness of language used"
      },
      {
        name: "Problem Resolution", 
        weight: 40,
        criteria: "Ability to understand and effectively address customer concerns"
      },
      {
        name: "Policy Compliance",
        weight: 20, 
        criteria: "Adherence to organizational policies and procedures"
      },
      {
        name: "Customer Satisfaction",
        weight: 10,
        criteria: "Overall customer experience and satisfaction indicators"
      }
    ],
    overall_weight: 100,
    scoring_scale: {
      min: 0,
      max: 100,
      excellent: 90,
      good: 80,
      satisfactory: 70,
      needs_improvement: 60,
      poor: 50
    },
    version: 1
  };
}