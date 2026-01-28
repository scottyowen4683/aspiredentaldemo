// routes/invitations.js - Organization invitation management
import express from 'express';
import crypto from 'crypto';
import logger from '../services/logger.js';
import supabaseService from '../services/supabase-service.js';
import { sendInvitationEmail } from '../services/email-service.js';

const router = express.Router();

/**
 * GET /api/invitations/validate/:token
 * Validate an invitation token (public endpoint for Auth page)
 * Returns invitation details if valid
 */
router.get('/validate/:token', async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Missing invitation token'
      });
    }

    // Find the invitation using service role (bypasses RLS)
    const { data: invitation, error: inviteError } = await supabaseService.client
      .from('invites')
      .select('id, email, org_id, role, accepted, expires_at, organizations(name)')
      .eq('token', token)
      .single();

    if (inviteError || !invitation) {
      logger.warn('Invitation validation failed - not found:', { token: token.substring(0, 8) + '...' });
      return res.status(404).json({
        success: false,
        message: 'Invitation not found or invalid'
      });
    }

    // Check if already accepted
    if (invitation.accepted) {
      return res.status(400).json({
        success: false,
        message: 'This invitation has already been used',
        accepted: true
      });
    }

    // Check expiration
    const expiresAt = new Date(invitation.expires_at);
    if (expiresAt < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'This invitation has expired. Please contact your administrator for a new invitation.',
        expired: true
      });
    }

    logger.info('Invitation validated successfully', { email: invitation.email, orgId: invitation.org_id });

    return res.json({
      success: true,
      invitation: {
        email: invitation.email,
        role: invitation.role,
        organizationId: invitation.org_id,
        organizationName: invitation.organizations?.name,
        expiresAt: invitation.expires_at
      }
    });

  } catch (error) {
    logger.error('Validate invitation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * POST /api/invitations/send
 * Send invitation to a user for an organization
 *
 * Body: { orgId, userEmail, role? }
 */
router.post('/send', async (req, res) => {
  try {
    const { orgId, userEmail, role = 'org_admin' } = req.body;

    if (!orgId || !userEmail) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: orgId and userEmail'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    // Get organization details
    const { data: organization, error: orgError } = await supabaseService.client
      .from('organizations')
      .select('id, name')
      .eq('id', orgId)
      .single();

    if (orgError || !organization) {
      logger.error('Organization not found:', { orgId, error: orgError?.message });
      return res.status(404).json({
        success: false,
        message: 'Organization not found'
      });
    }

    // Check if user already exists in this org
    const { data: existingUser } = await supabaseService.client
      .from('users')
      .select('id, email')
      .eq('email', userEmail)
      .eq('org_id', orgId)
      .single();

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'User already belongs to this organization'
      });
    }

    // Check for existing pending invitation
    const { data: existingInvite } = await supabaseService.client
      .from('invites')
      .select('id, token, expires_at, accepted')
      .eq('email', userEmail)
      .eq('org_id', orgId)
      .eq('accepted', false)
      .single();

    let invitationToken;
    let expiresAt;

    if (existingInvite) {
      // Check if existing invite is still valid
      const isExpired = new Date(existingInvite.expires_at) < new Date();

      if (isExpired) {
        // Delete expired invite and create new one
        await supabaseService.client
          .from('invites')
          .delete()
          .eq('id', existingInvite.id);
      } else {
        // Use existing valid invite token
        invitationToken = existingInvite.token;
        expiresAt = existingInvite.expires_at;
        logger.info('Resending existing invitation', { email: userEmail, orgId });
      }
    }

    // Create new invitation if needed
    if (!invitationToken) {
      invitationToken = crypto.randomUUID();
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7-day expiration

      const { error: inviteError } = await supabaseService.client
        .from('invites')
        .insert({
          token: invitationToken,
          email: userEmail,
          org_id: orgId,
          role: role,
          accepted: false,
          expires_at: expiresAt.toISOString(),
          created_at: new Date().toISOString()
        });

      if (inviteError) {
        logger.error('Failed to create invitation:', inviteError);
        return res.status(500).json({
          success: false,
          message: 'Failed to create invitation'
        });
      }

      logger.info('New invitation created', { email: userEmail, orgId, token: invitationToken });
    }

    // Build invitation link
    const baseUrl = process.env.PORTAL_URL || process.env.BASE_URL || 'https://portal.aspireexecutive.ai';
    const invitationLink = `${baseUrl}/auth?invite=${invitationToken}`;

    // Send invitation email via Brevo
    try {
      const emailResult = await sendInvitationEmail(
        userEmail,
        organization.name,
        invitationLink,
        invitationToken
      );

      if (emailResult.skipped) {
        logger.warn('Email sending skipped:', emailResult.reason);
        // Still return success but note that email wasn't sent
        return res.json({
          success: true,
          message: 'Invitation created but email not sent (email service not configured)',
          invitationToken,
          invitationLink,
          organizationId: orgId,
          emailSkipped: true
        });
      }

      logger.info('Invitation email sent successfully', { email: userEmail, messageId: emailResult.messageId });

      // Log to audit
      try {
        await supabaseService.client.from('audit_logs').insert({
          org_id: orgId,
          action: 'invitation_sent',
          details: JSON.stringify({
            email: userEmail,
            role: role,
            expires_at: expiresAt
          }),
          created_at: new Date().toISOString()
        });
      } catch (auditError) {
        logger.warn('Failed to create audit log:', auditError.message);
      }

      return res.json({
        success: true,
        message: `Invitation sent to ${userEmail}`,
        invitationToken,
        invitationLink,
        organizationId: orgId
      });

    } catch (emailError) {
      logger.error('Failed to send invitation email:', emailError);
      // Invitation was created, but email failed
      return res.status(500).json({
        success: false,
        message: 'Invitation created but failed to send email. Please try resending.',
        invitationToken,
        organizationId: orgId
      });
    }

  } catch (error) {
    logger.error('Send invitation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * POST /api/invitations/signup
 * Create user account and process invitation in one step
 * Uses admin API to create user with email already confirmed
 *
 * Body: { token, email, password, fullName }
 */
router.post('/signup', async (req, res) => {
  try {
    const { token, email, password, fullName } = req.body;

    if (!token || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: token, email, and password'
      });
    }

    // Find and validate the invitation
    const { data: invitation, error: inviteError } = await supabaseService.client
      .from('invites')
      .select('*, organizations(name)')
      .eq('token', token)
      .single();

    if (inviteError || !invitation) {
      return res.status(404).json({
        success: false,
        message: 'Invitation not found or invalid'
      });
    }

    if (invitation.accepted) {
      return res.status(400).json({
        success: false,
        message: 'This invitation has already been used'
      });
    }

    if (new Date(invitation.expires_at) < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'This invitation has expired. Please request a new one.'
      });
    }

    // Validate email matches invitation
    if (invitation.email.toLowerCase() !== email.toLowerCase()) {
      return res.status(400).json({
        success: false,
        message: `This invitation was sent to ${invitation.email}. Please use that email address.`
      });
    }

    // Create user via admin API (email auto-confirmed, no verification email sent)
    const { data: authData, error: authError } = await supabaseService.client.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true, // Skip email verification
      user_metadata: {
        full_name: fullName || ''
      }
    });

    if (authError) {
      logger.error('Failed to create user:', authError);

      // Check for duplicate user
      if (authError.message?.includes('already been registered') || authError.message?.includes('already exists')) {
        return res.status(409).json({
          success: false,
          message: 'An account with this email already exists. Please sign in instead.'
        });
      }

      return res.status(500).json({
        success: false,
        message: authError.message || 'Failed to create account'
      });
    }

    const userId = authData.user.id;
    logger.info('User created via admin API', { userId, email });

    // Create user record in users table
    const { error: userError } = await supabaseService.client
      .from('users')
      .insert({
        auth_id: userId,
        email: email,
        full_name: fullName || '',
        role: invitation.role || 'org_admin',
        org_id: invitation.org_id,
        mfa_enabled: false,
        created_at: new Date().toISOString()
      });

    if (userError) {
      logger.error('Failed to create user record:', userError);
      // Try to clean up auth user
      try {
        await supabaseService.client.auth.admin.deleteUser(userId);
      } catch (e) {
        logger.error('Failed to cleanup auth user:', e);
      }
      return res.status(500).json({
        success: false,
        message: 'Failed to create user profile'
      });
    }

    // Mark invitation as accepted
    await supabaseService.client
      .from('invites')
      .update({ accepted: true })
      .eq('token', token);

    // Log to audit
    try {
      await supabaseService.client.from('audit_logs').insert({
        org_id: invitation.org_id,
        action: 'user_signup_via_invitation',
        details: JSON.stringify({
          email: email,
          auth_id: userId,
          role: invitation.role
        }),
        created_at: new Date().toISOString()
      });
    } catch (auditError) {
      logger.warn('Failed to create audit log:', auditError.message);
    }

    logger.info('User signup via invitation complete', {
      email,
      orgId: invitation.org_id,
      orgName: invitation.organizations?.name
    });

    return res.json({
      success: true,
      message: `Welcome to ${invitation.organizations?.name || 'the organization'}!`,
      userId: userId,
      organizationId: invitation.org_id,
      organizationName: invitation.organizations?.name
    });

  } catch (error) {
    logger.error('Invitation signup error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * POST /api/invitations/process
 * Process invitation when user signs up (legacy - for existing auth users)
 *
 * Body: { token, userId, email? }
 */
router.post('/process', async (req, res) => {
  try {
    const { token, userId, email: providedEmail } = req.body;

    if (!token || !userId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: token and userId'
      });
    }

    // Find the invitation
    const { data: invitation, error: inviteError } = await supabaseService.client
      .from('invites')
      .select('*, organizations(name)')
      .eq('token', token)
      .single();

    if (inviteError || !invitation) {
      logger.warn('Invitation not found:', { token });
      return res.status(404).json({
        success: false,
        message: 'Invitation not found or invalid'
      });
    }

    // Check if already accepted
    if (invitation.accepted) {
      return res.status(400).json({
        success: false,
        message: 'This invitation has already been used'
      });
    }

    // Check expiration
    if (new Date(invitation.expires_at) < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'This invitation has expired. Please request a new one.'
      });
    }

    // Get auth user details from Supabase Auth
    const { data: authData, error: authError } = await supabaseService.client.auth.admin.getUserById(userId);

    if (authError) {
      // Fallback: try to get from auth.users table directly
      logger.warn('Admin getUserById failed, trying alternative:', authError.message);
    }

    const authUser = authData?.user;
    const signupEmail = authUser?.email || providedEmail;
    const userFullName = authUser?.user_metadata?.full_name || '';

    // Validate that the signup email matches the invitation email
    if (signupEmail && invitation.email.toLowerCase() !== signupEmail.toLowerCase()) {
      logger.warn('Email mismatch on invitation:', {
        inviteEmail: invitation.email,
        signupEmail: signupEmail
      });
      return res.status(400).json({
        success: false,
        message: `This invitation was sent to ${invitation.email}. Please use that email address to sign up.`
      });
    }

    const userEmail = invitation.email; // Always use the invitation email

    // Check if user already exists in users table
    const { data: existingUser } = await supabaseService.client
      .from('users')
      .select('id')
      .eq('auth_id', userId)
      .single();

    if (existingUser) {
      // Update existing user with org assignment
      const { error: updateError } = await supabaseService.client
        .from('users')
        .update({
          org_id: invitation.org_id,
          role: invitation.role || 'org_admin',
          updated_at: new Date().toISOString()
        })
        .eq('auth_id', userId);

      if (updateError) {
        logger.error('Failed to update user org:', updateError);
        return res.status(500).json({
          success: false,
          message: 'Failed to assign user to organization'
        });
      }
    } else {
      // Create new user record
      const { error: createError } = await supabaseService.client
        .from('users')
        .insert({
          auth_id: userId,
          email: userEmail,
          full_name: userFullName,
          role: invitation.role || 'org_admin',
          org_id: invitation.org_id,
          mfa_enabled: false,
          created_at: new Date().toISOString()
        });

      if (createError) {
        logger.error('Failed to create user:', createError);
        return res.status(500).json({
          success: false,
          message: 'Failed to create user record'
        });
      }
    }

    // Mark invitation as accepted
    const { error: acceptError } = await supabaseService.client
      .from('invites')
      .update({ accepted: true })
      .eq('token', token);

    if (acceptError) {
      logger.error('Failed to mark invitation as accepted:', acceptError);
      // Continue anyway - user is already set up
    }

    // Log to audit
    try {
      await supabaseService.client.from('audit_logs').insert({
        org_id: invitation.org_id,
        user_id: existingUser?.id || null,
        action: 'invitation_accepted',
        details: JSON.stringify({
          email: userEmail,
          auth_id: userId,
          role: invitation.role
        }),
        created_at: new Date().toISOString()
      });
    } catch (auditError) {
      logger.warn('Failed to create audit log:', auditError.message);
    }

    logger.info('Invitation processed successfully', {
      email: userEmail,
      orgId: invitation.org_id,
      orgName: invitation.organizations?.name
    });

    return res.json({
      success: true,
      message: `Welcome to ${invitation.organizations?.name || 'the organization'}!`,
      organizationId: invitation.org_id,
      organizationName: invitation.organizations?.name
    });

  } catch (error) {
    logger.error('Process invitation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * POST /api/invitations/resend
 * Resend an existing invitation
 *
 * Body: { inviteId }
 */
router.post('/resend', async (req, res) => {
  try {
    const { inviteId } = req.body;

    if (!inviteId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required field: inviteId'
      });
    }

    // Get the invitation
    const { data: invitation, error: inviteError } = await supabaseService.client
      .from('invites')
      .select('*, organizations(name)')
      .eq('id', inviteId)
      .single();

    if (inviteError || !invitation) {
      return res.status(404).json({
        success: false,
        message: 'Invitation not found'
      });
    }

    if (invitation.accepted) {
      return res.status(400).json({
        success: false,
        message: 'This invitation has already been accepted'
      });
    }

    // Update expiration date
    const newExpiresAt = new Date();
    newExpiresAt.setDate(newExpiresAt.getDate() + 7);

    await supabaseService.client
      .from('invites')
      .update({ expires_at: newExpiresAt.toISOString() })
      .eq('id', inviteId);

    // Build invitation link
    const baseUrl = process.env.PORTAL_URL || process.env.BASE_URL || 'https://portal.aspireexecutive.ai';
    const invitationLink = `${baseUrl}/auth?invite=${invitation.token}`;

    // Resend email
    try {
      await sendInvitationEmail(
        invitation.email,
        invitation.organizations?.name || 'your organization',
        invitationLink,
        invitation.token
      );

      logger.info('Invitation resent', { email: invitation.email, inviteId });

      return res.json({
        success: true,
        message: `Invitation resent to ${invitation.email}`
      });

    } catch (emailError) {
      logger.error('Failed to resend invitation email:', emailError);
      return res.status(500).json({
        success: false,
        message: 'Failed to send email'
      });
    }

  } catch (error) {
    logger.error('Resend invitation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * DELETE /api/invitations/:id
 * Cancel/delete an invitation
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabaseService.client
      .from('invites')
      .delete()
      .eq('id', id);

    if (error) {
      logger.error('Failed to delete invitation:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete invitation'
      });
    }

    logger.info('Invitation deleted', { id });

    return res.json({
      success: true,
      message: 'Invitation cancelled'
    });

  } catch (error) {
    logger.error('Delete invitation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

export default router;
