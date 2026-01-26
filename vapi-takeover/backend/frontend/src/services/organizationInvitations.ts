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
}

export interface InvitationResult {
  success: boolean;
  organizationId?: string;
  invitationToken?: string;
  message: string;
}

/**
 * Creates a new organization and sends an invitation to the specified user
 * Uses Supabase Edge Function for secure server-side processing
 * @param data - Organization and user data
 * @returns Promise with invitation result
 */
export async function createOrganizationAndInvite(data: CreateOrganizationData): Promise<InvitationResult> {
  try {
    const { data: result, error } = await supabase.functions.invoke('create-organization', {
      body: {
        organizationName: data.organizationName,
        userEmail: data.userEmail,
        servicePlanName: data.servicePlanName,
        monthlyServiceFee: data.monthlyServiceFee,
        baselineHumanCostPerCall: data.baselineHumanCostPerCall,
        coverageHours: data.coverageHours,
        timeZone: data.timeZone
      }
    });

    if (error) {
      console.error('Error calling create-organization function:', error);
      return {
        success: false,
        message: `Failed to create organization: ${error.message}`
      };
    }

    return result || {
      success: false,
      message: 'No response from create-organization function'
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
 * Invites an additional user to an existing organization
 * Uses Supabase Edge Function for secure server-side processing
 * @param data - Organization ID and user email
 * @returns Promise with invitation result
 */
export async function inviteUserToOrganization(data: InviteUserToOrganizationData): Promise<InvitationResult> {
  try {
    const { data: result, error } = await supabase.functions.invoke('create-organization', {
      body: {
        orgId: data.organizationId,
        userEmail: data.userEmail,
        // No organizationName since we're inviting to existing org
      }
    });

    if (error) {
      console.error('Error calling create-organization function for invitation:', error);
      return {
        success: false,
        message: `Failed to send invitation: ${error.message}`
      };
    }

    return result || {
      success: false,
      message: 'No response from create-organization function'
    };

  } catch (error) {
    console.error('Unexpected error sending invitation:', error);
    return {
      success: false,
      message: `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Processes organization invitation when user registers
 * Uses Supabase Edge Function for secure server-side processing
 * @param token - Invitation token from URL
 * @param userId - New user's auth ID (from Supabase Auth)
 * @returns Promise with processing result
 */
export async function processInvitation(token: string, userId: string): Promise<InvitationResult> {
  try {
    const { data: result, error } = await supabase.functions.invoke('process-invitation', {
      body: {
        token,
        userId
      }
    });

    if (error) {
      console.error('Error calling process-invitation function:', error);
      return {
        success: false,
        message: `Failed to process invitation: ${error.message}`
      };
    }

    return result || {
      success: false,
      message: 'No response from process-invitation function'
    };

  } catch (error) {
    console.error('Unexpected error processing invitation:', error);
    return {
      success: false,
      message: `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Sends invitation email to user (placeholder - implement with your email service)
 * @param email - User email
 * @param organizationName - Organization name
 * @param token - Invitation token
 */
async function sendInvitationEmail(email: string, organizationName: string, token: string): Promise<void> {
  // TODO: Implement with your email service (SendGrid, Mailgun, etc.)
  // For now, just log the invitation link
  const invitationLink = `${window.location.origin}/auth?invite=${token}`;

  console.log(`
    ==========================================================
    ORGANIZATION INVITATION
    ==========================================================
    To: ${email}
    Organization: ${organizationName}
    Invitation Link: ${invitationLink}
    ==========================================================
  `);

  // Email sending is now handled by the create-organization Edge Function
  // This function is kept for local development/testing purposes only
}