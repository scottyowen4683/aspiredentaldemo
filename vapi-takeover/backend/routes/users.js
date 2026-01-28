// routes/users.js - User management endpoints
import express from 'express';
import logger from '../services/logger.js';
import supabaseService from '../services/supabase-service.js';

const router = express.Router();

/**
 * DELETE /api/users/:userId
 * Delete a user from both auth and users table
 *
 * Query params: authId (required) - the Supabase auth user ID
 */
router.delete('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { authId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameter: userId'
      });
    }

    if (!authId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required query parameter: authId'
      });
    }

    logger.info('Deleting user', { userId, authId });

    // First, delete from users table
    const { error: userError } = await supabaseService.client
      .from('users')
      .delete()
      .eq('id', userId);

    if (userError) {
      logger.error('Failed to delete user record:', userError);
      return res.status(500).json({
        success: false,
        message: `Failed to delete user record: ${userError.message}`
      });
    }

    // Then delete from Supabase Auth using admin API
    const { error: authError } = await supabaseService.client.auth.admin.deleteUser(authId);

    if (authError) {
      logger.warn('Failed to delete auth user (may not exist):', authError);
      // Don't fail the whole operation if auth user doesn't exist
      // The users table record is already deleted
      return res.json({
        success: true,
        message: 'User record deleted. Auth user may have already been removed.',
        warning: authError.message
      });
    }

    // Log to audit
    try {
      await supabaseService.client.from('audit_logs').insert({
        action: 'user_deleted',
        details: JSON.stringify({
          userId,
          authId
        }),
        created_at: new Date().toISOString()
      });
    } catch (auditError) {
      logger.warn('Failed to create audit log:', auditError.message);
    }

    logger.info('User deleted successfully', { userId, authId });

    return res.json({
      success: true,
      message: 'User deleted successfully'
    });

  } catch (error) {
    logger.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

export default router;
