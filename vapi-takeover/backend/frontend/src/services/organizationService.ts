import { supabase } from "@/supabaseClient";

export interface OrganizationRow {
  id: string;
  name?: string | null;
  slug?: string | null;
  contact_email?: string | null;
  billing_email?: string | null;
  active?: boolean | null;
}

export async function fetchOrganizations(): Promise<OrganizationRow[]> {
  const { data, error } = await supabase.from("organizations").select("id, name, slug, contact_email, billing_email, active");
  if (error) throw error;
  return (data as OrganizationRow[]) || [];
}


export interface Organization {
  id: string;
  name: string;
  slug?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  billing_email?: string | null;
  monthly_interaction_limit?: number | null;
  price_per_interaction?: number | null;
  flat_rate_fee?: number | null;
  included_interactions?: number | null;
  overage_rate_per_1000?: number | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
  current_period_interactions?: number | null;
  total_interactions?: number | null;
  settings?: any | null;
  active?: boolean | null;
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
    // Get organizations with actual schema columns
    const { data: organizationsData, error: orgError } = await supabase
      .from('organizations')
      .select(`
        id,
        name,
        slug,
        contact_email,
        contact_phone,
        billing_email,
        monthly_interaction_limit,
        price_per_interaction,
        flat_rate_fee,
        included_interactions,
        overage_rate_per_1000,
        current_period_start,
        current_period_end,
        current_period_interactions,
        total_interactions,
        settings,
        active,
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
      slug: org.slug,
      contact_email: org.contact_email,
      contact_phone: org.contact_phone,
      billing_email: org.billing_email,
      monthly_interaction_limit: org.monthly_interaction_limit,
      price_per_interaction: org.price_per_interaction,
      flat_rate_fee: org.flat_rate_fee,
      included_interactions: org.included_interactions,
      overage_rate_per_1000: org.overage_rate_per_1000,
      current_period_start: org.current_period_start,
      current_period_end: org.current_period_end,
      current_period_interactions: org.current_period_interactions,
      total_interactions: org.total_interactions,
      settings: org.settings,
      active: org.active,
      created_at: org.created_at,
      updated_at: org.updated_at,
      // Computed fields
      assistantCount: assistantCounts[org.id] || 0,
      userCount: userCounts[org.id] || 0,
      conversationCount: conversationCounts[org.id] || 0,
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
      slug: org.slug,
      contact_email: org.contact_email,
      contact_phone: org.contact_phone,
      billing_email: org.billing_email,
      monthly_interaction_limit: org.monthly_interaction_limit,
      price_per_interaction: org.price_per_interaction,
      flat_rate_fee: org.flat_rate_fee,
      included_interactions: org.included_interactions,
      overage_rate_per_1000: org.overage_rate_per_1000,
      current_period_start: org.current_period_start,
      current_period_end: org.current_period_end,
      current_period_interactions: org.current_period_interactions,
      total_interactions: org.total_interactions,
      settings: org.settings,
      active: org.active,
      created_at: org.created_at,
      updated_at: org.updated_at,
      assistantCount: assistantCounts[org.id] || 0,
      userCount: userCounts[org.id] || 0,
      conversationCount: conversationCounts[org.id] || 0,
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
 * Update an organization's fields using actual schema columns
 */
export async function updateOrganization(id: string, updates: Partial<{
  name: string;
  slug: string;
  contact_email: string;
  contact_phone: string;
  billing_email: string;
  monthly_interaction_limit: number;
  price_per_interaction: number;
  flat_rate_fee: number;
  included_interactions: number;
  overage_rate_per_1000: number;
  settings: any;
  active: boolean;
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
 * Delete an organization and all related data
 * Note: CASCADE delete will automatically remove related assistants, users, conversations, etc.
 */
export async function deleteOrganization(id: string): Promise<{
  success: boolean;
  data?: Organization;
  error?: string;
}> {
  try {
    // Get org name before deleting for confirmation
    const { data: orgData } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', id)
      .single();

    const { data, error } = await supabase
      .from('organizations')
      .delete()
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error deleting organization:', error);
      return { success: false, error: error.message };
    }

    console.log(`Organization "${orgData?.name}" (${id}) deleted successfully`);
    return { success: true, data };
  } catch (err) {
    console.error('Unexpected error deleting organization:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Update organization settings (stored in JSONB settings column)
 */
export async function updateOrganizationApiSettings(id: string, apiSettings: Record<string, any>): Promise<{
  success: boolean;
  data?: Organization;
  error?: string;
}> {
  try {
    // Get current settings first
    const { data: currentOrg } = await supabase
      .from('organizations')
      .select('settings')
      .eq('id', id)
      .single();

    const mergedSettings = {
      ...(currentOrg?.settings || {}),
      ...apiSettings
    };

    const { data, error } = await supabase
      .from('organizations')
      .update({
        settings: mergedSettings,
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

