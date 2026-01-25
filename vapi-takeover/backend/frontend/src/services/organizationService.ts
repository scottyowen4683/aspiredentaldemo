import { supabase } from "@/supabaseClient";

export interface OrganizationRow {
  id: string;
  name?: string | null;
  ghl_api_key?: string | null;
  ghl_location_id?: string | null;
  ghl_base_url?: string | null;
}

export async function fetchOrganizations(): Promise<OrganizationRow[]> {
  const { data, error } = await supabase.from<OrganizationRow>("organizations").select("id, name, ghl_api_key, ghl_location_id, ghl_base_url");
  if (error) throw error;
  return (data as OrganizationRow[]) || [];
}


export interface Organization {
  id: string;
  name: string;
  bucket_name?: string | null;
  region: string;
  secret?: string | null;
  vapi_webhook_secret?: string;
  ghl_webhook_secret?: string;
  // GHL API Settings
  ghl_api_key?: string | null;
  ghl_location_id?: string | null;
  ghl_base_url?: string | null;
  // Service Plan Configuration
  service_plan_name?: string | null;
  monthly_service_fee?: number | null;
  baseline_human_cost_per_call?: number | null;
  coverage_hours?: "12hr" | "24hr" | null;
  time_zone?: string | null;
  status?: string | null;
  monthly_token_threshold?: string | null;
  monthly_minutes_threshold?: string | null;
  default_rubric?: string | null; // JSON string of Rubric object
  created_at: string;
  updated_at: string;
  // Computed fields
  assistantCount?: number;
  userCount?: number;
  conversationCount?: number;
}

export interface OrganizationStats {
  organizations: number;
  totalUsers: number;
  totalAssistants: number;
  totalConversations: number;
}

/**
 * Fetch all organizations with their stats using JOIN queries
 */
export async function getAllOrganizations(): Promise<{
  success: boolean;
  data?: Organization[];
  error?: string;
}> {
  try {
    // Get organizations first - explicitly select all needed fields including service plan and GHL API fields
    const { data: organizationsData, error: orgError } = await supabase
      .from('organizations')
      .select(`
        id,
        name,
        bucket_name,
        region,
        secret,
        vapi_webhook_secret,
        ghl_webhook_secret,
        ghl_api_key,
        ghl_location_id,
        ghl_base_url,
        service_plan_name,
        monthly_service_fee,
        baseline_human_cost_per_call,
        coverage_hours,
        time_zone,
        status,
        monthly_token_threshold,
        monthly_minutes_threshold,
        default_rubric,
        created_at,
        updated_at
      `)
      .order('created_at', { ascending: false });

    if (orgError) {
      console.error('Error fetching organizations:', orgError);
      return {
        success: false,
        error: orgError.message
      };
    }

    if (!organizationsData || organizationsData.length === 0) {
      return {
        success: true,
        data: []
      };
    }



    // Get stats for all organizations using JOIN-like queries with IN clause
    const organizationIds = organizationsData.map(org => org.id);
    
    // Get counts for all organizations at once using parallel queries
    const [usersData, assistantsData, conversationsData] = await Promise.all([
      supabase
        .from('users')
        .select('org_id')
        .in('org_id', organizationIds),
      supabase
        .from('assistants')
        .select('org_id')
        .in('org_id', organizationIds),
      supabase
        .from('conversations')
        .select('org_id')
        .in('org_id', organizationIds)
    ]);

    // Count occurrences by org_id (equivalent to GROUP BY in SQL)
    const userCounts = (usersData.data || []).reduce((acc: Record<string, number>, user) => {
      acc[user.org_id] = (acc[user.org_id] || 0) + 1;
      return acc;
    }, {});

    const assistantCounts = (assistantsData.data || []).reduce((acc: Record<string, number>, assistant) => {
      acc[assistant.org_id] = (acc[assistant.org_id] || 0) + 1;
      return acc;
    }, {});

    const conversationCounts = (conversationsData.data || []).reduce((acc: Record<string, number>, conversation) => {
      acc[conversation.org_id] = (acc[conversation.org_id] || 0) + 1;
      return acc;
    }, {});

    // Transform the data to match our interface
    const organizations: Organization[] = organizationsData.map((org: any) => ({
      id: org.id,
      name: org.name,
      region: org.region,
      bucket_name: org.bucket_name,
      secret: org.secret,
      created_at: org.created_at,
      updated_at: org.updated_at,
      vapi_webhook_secret: org.vapi_webhook_secret,
      ghl_webhook_secret: org.ghl_webhook_secret,
      // GHL API Settings
      ghl_api_key: org.ghl_api_key,
      ghl_location_id: org.ghl_location_id,
      ghl_base_url: org.ghl_base_url,
      // Service Plan Configuration
      service_plan_name: org.service_plan_name,
      monthly_service_fee: org.monthly_service_fee,
      baseline_human_cost_per_call: org.baseline_human_cost_per_call,
      coverage_hours: org.coverage_hours,
      time_zone: org.time_zone,
      // Computed fields
      assistantCount: assistantCounts[org.id] || 0,
      userCount: userCounts[org.id] || 0,
      conversationCount: conversationCounts[org.id] || 0,
      status: org.status || 'active',
      monthly_token_threshold: org.monthly_token_threshold,
      monthly_minutes_threshold: org.monthly_minutes_threshold,
      default_rubric: org.default_rubric,
    }));

    return {
      success: true,
      data: organizations
    };

  } catch (error) {
    console.error('Unexpected error fetching organizations:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Get organization statistics summary using efficient aggregation
 */
export async function getOrganizationStats(): Promise<{
  success: boolean;
  data?: OrganizationStats;
  error?: string;
}> {
  try {
    // Get aggregate counts in parallel for maximum efficiency
    const [orgCount, userCount, assistantCount, conversationCount] = await Promise.all([
      supabase.from('organizations').select('*', { count: 'exact', head: true }),
      supabase.from('users').select('*', { count: 'exact', head: true }),
      supabase.from('assistants').select('*', { count: 'exact', head: true }),
      supabase.from('conversations').select('*', { count: 'exact', head: true }),
    ]);

    // Check for errors
    if (orgCount.error) {
      throw new Error(`Failed to count organizations: ${orgCount.error.message}`);
    }
    if (userCount.error) {
      throw new Error(`Failed to count users: ${userCount.error.message}`);
    }
    if (assistantCount.error) {
      throw new Error(`Failed to count assistants: ${assistantCount.error.message}`);
    }
    if (conversationCount.error) {
      throw new Error(`Failed to count conversations: ${conversationCount.error.message}`);
    }

    const stats: OrganizationStats = {
      organizations: orgCount.count || 0,
      totalUsers: userCount.count || 0,
      totalAssistants: assistantCount.count || 0,
      totalConversations: conversationCount.count || 0,
    };

    return {
      success: true,
      data: stats
    };

  } catch (error) {
    console.error('Error calculating organization stats:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Get a single organization by ID
 */
export async function getOrganizationById(id: string): Promise<{
  success: boolean;
  data?: Organization;
  error?: string;
}> {
  try {
    const { data: organization, error } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching organization:', error);
      return {
        success: false,
        error: error.message
      };
    }

    return {
      success: true,
      data: organization
    };

  } catch (error) {
    console.error('Unexpected error fetching organization:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Search organizations by name with stats using JOIN queries
 */
export async function searchOrganizations(
  query: string,
  limit: number = 50,
  offset: number = 0
): Promise<{
  success: boolean;
  data?: Organization[];
  error?: string;
}> {
  try {
    // Search organizations with pagination
    const { data: organizations, error } = await supabase
      .from('organizations')
      .select('*')
      .ilike('name', `%${query}%`)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Error searching organizations:', error);
      return {
        success: false,
        error: error.message
      };
    }

    if (!organizations || organizations.length === 0) {
      return {
        success: true,
        data: []
      };
    }

    // Get stats for searched organizations using JOIN-like queries
    const organizationIds = organizations.map(org => org.id);
    
    const [usersData, assistantsData, conversationsData] = await Promise.all([
      supabase
        .from('users')
        .select('org_id')
        .in('org_id', organizationIds),
      supabase
        .from('assistants')
        .select('org_id')
        .in('org_id', organizationIds),
      supabase
        .from('conversations')
        .select('org_id')
        .in('org_id', organizationIds)
    ]);

    // Count occurrences by org_id (equivalent to GROUP BY in SQL)
    const userCounts = (usersData.data || []).reduce((acc: Record<string, number>, user) => {
      acc[user.org_id] = (acc[user.org_id] || 0) + 1;
      return acc;
    }, {});

    const assistantCounts = (assistantsData.data || []).reduce((acc: Record<string, number>, assistant) => {
      acc[assistant.org_id] = (acc[assistant.org_id] || 0) + 1;
      return acc;
    }, {});

    const conversationCounts = (conversationsData.data || []).reduce((acc: Record<string, number>, conversation) => {
      acc[conversation.org_id] = (acc[conversation.org_id] || 0) + 1;
      return acc;
    }, {});

    const organizationsWithStats: Organization[] = organizations.map((org: any) => ({
      id: org.id,
      name: org.name,
      region: org.region,
      created_at: org.created_at,
      updated_at: org.updated_at,
      vapi_webhook_secret: org.vapi_webhook_secret,
      ghl_webhook_secret: org.ghl_webhook_secret,
      // GHL API Settings
      ghl_api_key: org.ghl_api_key,
      ghl_location_id: org.ghl_location_id,
      ghl_base_url: org.ghl_base_url,
      assistantCount: assistantCounts[org.id] || 0,
      userCount: userCounts[org.id] || 0,
      conversationCount: conversationCounts[org.id] || 0,
      status: 'active' as const,
    }));

    return {
      success: true,
      data: organizationsWithStats
    };

  } catch (error) {
    console.error('Unexpected error searching organizations:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Update an organization's fields (name, region, service plan, etc.)
 */
export async function updateOrganization(id: string, updates: Partial<{ 
  name: string; 
  region: string;
  service_plan_name: string;
  monthly_service_fee: number;
  baseline_human_cost_per_call: number;
  coverage_hours: "12hr" | "24hr";
  time_zone: string;
}>): Promise<{
  success: boolean;
  data?: Organization;
  error?: string;
}> {
  try {
    const { data, error } = await supabase
      .from('organizations')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating organization:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (err) {
    console.error('Unexpected error updating organization:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Update organization API settings (GHL configuration)
 */
export async function updateOrganizationApiSettings(id: string, apiSettings: {
  ghl_api_key?: string;
  ghl_location_id?: string;
  ghl_base_url?: string;
}): Promise<{
  success: boolean;
  data?: Organization;
  error?: string;
}> {
  try {
    const { data, error } = await supabase
      .from('organizations')
      .update({
        ...apiSettings,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating organization API settings:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (err) {
    console.error('Unexpected error updating organization API settings:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Generate a secure webhook secret
 */
export function generateWebhookSecret(provider: 'vapi' | 'ghl'): string {
  const randomString = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `${provider}_${randomString}`;
}

/**
 * Update webhook secrets for an organization
 */
export async function updateWebhookSecrets(
  id: string, 
  secrets: { vapi_webhook_secret?: string; ghl_webhook_secret?: string }
): Promise<{
  success: boolean;
  data?: Organization;
  error?: string;
}> {
  try {
    const { data, error } = await supabase
      .from('organizations')
      .update(secrets)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating webhook secrets:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (err) {
    console.error('Unexpected error updating webhook secrets:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Get webhook URLs for an organization
 */
export function getWebhookUrls(orgId: string): {
  vapi: string;
  ghl: string;
} {
  const baseUrl = 'https://lpdkauusceocfqghcpqp.supabase.co/functions/v1/webhook';
  return {
    vapi: `${baseUrl}/${orgId}/vapi`,
    ghl: `${baseUrl}/${orgId}/ghl`
  };
}