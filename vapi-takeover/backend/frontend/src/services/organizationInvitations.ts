import { supabase } from "@/supabaseClient";

export interface CreateOrganizationData {
  organizationName: string;
  userEmail: string;
  // Service Plan Information
  servicePlanName: string;
  monthlyServiceFee: number;
  baselineHumanCostPerCall: number;
  coverageHours: "12hr" | "24hr";
  timeZone: string;
}

export interface InviteUserToOrganizationData {
  organizationId: string;
  userEmail: string;
  role?: string;
}

export interface InvitationResult {
  success: boolean;
  organizationId?: string;
  invitationToken?: string;
  invitationLink?: string;
  message: string;
}

// Get the API base URL - use relative path for same-origin requests
const getApiBaseUrl = () => {
  // In production, the frontend is served from the same origin as the API
  // In development, we might need to configure this
  return import.meta.env.VITE_API_URL || '';
};

/**
 * Creates a new organization and sends an invitation to the specified user
 * @param data - Organization and user data
 * @returns Promise with invitation result
 */
export async function createOrganizationAndInvite(data: CreateOrganizationData): Promise<InvitationResult> {
  try {
    // First create the organization
    const { data: orgData, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name: data.organizationName,
        plan_name: data.servicePlanName,
        flat_rate_fee: data.monthlyServiceFee,
        price_per_interaction: data.baselineHumanCostPerCall,
        timezone: data.timeZone,
        coverage_hours: data.coverageHours,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (orgError) {
      console.error('Error creating organization:', orgError);
      return {
        success: false,
        message: `Failed to create organization: ${orgError.message}`
      };
    }

    // Now send invitation to the user
    const inviteResult = await inviteUserToOrganization({
      organizationId: orgData.id,
      userEmail: data.userEmail
    });

    if (!inviteResult.success) {
      return {
        success: false,
        message: inviteResult.message,
        organizationId: orgData.id
      };
    }

    return {
      success: true,
      message: `Organization created and invitation sent to ${data.userEmail}`,
      organizationId: orgData.id,
      invitationToken: inviteResult.invitationToken,
      invitationLink: inviteResult.invitationLink
    };

  } catch (error) {
    console.error('Unexpected error:', error);
    return {
      success: false,
      message: `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Invites a user to an existing organization
 * Calls the backend API to create invitation and send email via Brevo
 * @param data - Organization ID and user email
 * @returns Promise with invitation result
 */
export async function inviteUserToOrganization(data: InviteUserToOrganizationData): Promise<InvitationResult> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/invitations/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        orgId: data.organizationId,
        userEmail: data.userEmail,
        role: data.role || 'org_admin'
      })
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: result.message || `Failed to send invitation: HTTP ${response.status}`
      };
    }

    return {
      success: result.success,
      message: result.message,
      organizationId: result.organizationId,
      invitationToken: result.invitationToken,
      invitationLink: result.invitationLink
    };

  } catch (error) {
    console.error('Error sending invitation:', error);
    return {
      success: false,
      message: `Failed to send invitation: ${error instanceof Error ? error.message : 'Network error'}`
    };
  }
}

/**
 * Processes organization invitation when user registers
 * Calls the backend API to assign user to organization
 * @param token - Invitation token from URL
 * @param userId - New user's auth ID (from Supabase Auth)
 * @returns Promise with processing result
 */
export async function processInvitation(token: string, userId: string): Promise<InvitationResult> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/invitations/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token,
        userId
      })
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: result.message || `Failed to process invitation: HTTP ${response.status}`
      };
    }

    return {
      success: result.success,
      message: result.message,
      organizationId: result.organizationId
    };

  } catch (error) {
    console.error('Error processing invitation:', error);
    return {
      success: false,
      message: `Failed to process invitation: ${error instanceof Error ? error.message : 'Network error'}`
    };
  }
}

/**
 * Resends an existing invitation
 * @param inviteId - The invitation ID to resend
 * @returns Promise with result
 */
export async function resendInvitation(inviteId: string): Promise<InvitationResult> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/invitations/resend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inviteId
      })
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: result.message || `Failed to resend invitation: HTTP ${response.status}`
      };
    }

    return {
      success: result.success,
      message: result.message
    };

  } catch (error) {
    console.error('Error resending invitation:', error);
    return {
      success: false,
      message: `Failed to resend invitation: ${error instanceof Error ? error.message : 'Network error'}`
    };
  }
}

/**
 * Cancels/deletes an invitation
 * @param inviteId - The invitation ID to cancel
 * @returns Promise with result
 */
export async function cancelInvitation(inviteId: string): Promise<InvitationResult> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/invitations/${inviteId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: result.message || `Failed to cancel invitation: HTTP ${response.status}`
      };
    }

    return {
      success: result.success,
      message: result.message
    };

  } catch (error) {
    console.error('Error cancelling invitation:', error);
    return {
      success: false,
      message: `Failed to cancel invitation: ${error instanceof Error ? error.message : 'Network error'}`
    };
  }
}
