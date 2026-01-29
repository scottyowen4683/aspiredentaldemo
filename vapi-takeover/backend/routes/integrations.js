// routes/integrations.js - CRM & API Integration Management Endpoints
// Handles configuration, testing, and syncing of external integrations

import express from 'express';
import integrationService from '../services/integration-service.js';
import supabaseService from '../services/supabase-service.js';
import logger from '../services/logger.js';

const router = express.Router();

// =============================================================================
// INTEGRATION TEMPLATES - Get pre-configured provider settings
// =============================================================================

// GET /api/integrations/templates - Get all available integration templates
router.get('/templates', async (req, res) => {
  try {
    const templates = await integrationService.getTemplates();

    res.json({
      success: true,
      templates
    });

  } catch (error) {
    logger.error('Error fetching integration templates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch integration templates'
    });
  }
});

// GET /api/integrations/templates/:provider - Get template for specific provider
router.get('/templates/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    const template = await integrationService.getTemplate(provider);

    if (!template) {
      return res.status(404).json({
        success: false,
        error: `Template not found for provider: ${provider}`
      });
    }

    res.json({
      success: true,
      template
    });

  } catch (error) {
    logger.error('Error fetching integration template:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch integration template'
    });
  }
});

// =============================================================================
// ORGANIZATION INTEGRATIONS - CRUD Operations
// =============================================================================

// GET /api/integrations/org/:org_id - Get all integrations for an organization
// Use "all" as org_id for super admins to get all integrations
router.get('/org/:org_id', async (req, res) => {
  try {
    const { org_id } = req.params;

    // Handle "all" for super admins - fetch all integrations
    if (org_id === 'all') {
      const { data, error } = await supabaseService.client
        .from('organization_integrations')
        .select('*, organizations(name)')
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('Error fetching all integrations:', error);
        throw error;
      }

      return res.json({
        success: true,
        integrations: data || []
      });
    }

    const integrations = await integrationService.getIntegrations(org_id);

    res.json({
      success: true,
      integrations
    });

  } catch (error) {
    logger.error('Error fetching organization integrations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch integrations'
    });
  }
});

// GET /api/integrations/:id - Get a specific integration
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const integration = await integrationService.getIntegration(id);

    if (!integration) {
      return res.status(404).json({
        success: false,
        error: 'Integration not found'
      });
    }

    // Mask sensitive auth config data in response
    const maskedIntegration = {
      ...integration,
      auth_config: maskAuthConfig(integration.auth_config)
    };

    res.json({
      success: true,
      integration: maskedIntegration
    });

  } catch (error) {
    logger.error('Error fetching integration:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch integration'
    });
  }
});

// POST /api/integrations/org/:org_id - Create a new integration
router.post('/org/:org_id', async (req, res) => {
  try {
    const { org_id } = req.params;
    const {
      name,
      provider,
      direction,
      base_url,
      auth_type,
      auth_config,
      endpoints,
      field_mappings,
      sync_enabled,
      sync_interval_minutes,
      rate_limit_per_minute
    } = req.body;

    // Validation
    if (!name || !provider || !base_url) {
      return res.status(400).json({
        success: false,
        error: 'Name, provider, and base_url are required'
      });
    }

    // Validate provider
    const validProviders = ['techone', 'sap', 'genesys', 'salesforce', 'dynamics365', 'zendesk', 'freshdesk', 'custom'];
    if (!validProviders.includes(provider)) {
      return res.status(400).json({
        success: false,
        error: `Invalid provider. Must be one of: ${validProviders.join(', ')}`
      });
    }

    const integration = await integrationService.createIntegration(org_id, {
      name,
      provider,
      direction: direction || 'outbound',
      base_url: base_url.replace(/\/$/, ''), // Remove trailing slash
      auth_type: auth_type || 'api_key',
      auth_config: auth_config || {},
      endpoints: endpoints || {},
      field_mappings: field_mappings || {},
      sync_enabled: sync_enabled || false,
      sync_interval_minutes: sync_interval_minutes || 60,
      rate_limit_per_minute: rate_limit_per_minute || 60
    });

    logger.info('Integration created:', { id: integration.id, provider, org_id });

    res.json({
      success: true,
      integration,
      message: `Integration "${name}" created successfully`
    });

  } catch (error) {
    logger.error('Error creating integration:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create integration'
    });
  }
});

// PUT /api/integrations/:id - Update an integration
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Don't allow updating org_id
    delete updates.org_id;
    delete updates.id;
    delete updates.created_at;

    // Clean base_url if provided
    if (updates.base_url) {
      updates.base_url = updates.base_url.replace(/\/$/, '');
    }

    const integration = await integrationService.updateIntegration(id, updates);

    res.json({
      success: true,
      integration,
      message: 'Integration updated successfully'
    });

  } catch (error) {
    logger.error('Error updating integration:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update integration'
    });
  }
});

// DELETE /api/integrations/:id - Delete an integration
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await integrationService.deleteIntegration(id);

    res.json({
      success: true,
      message: 'Integration deleted successfully'
    });

  } catch (error) {
    logger.error('Error deleting integration:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete integration'
    });
  }
});

// =============================================================================
// CONNECTION TESTING
// =============================================================================

// POST /api/integrations/:id/test - Test an integration connection
router.post('/:id/test', async (req, res) => {
  try {
    const { id } = req.params;

    const integration = await integrationService.getIntegration(id);
    if (!integration) {
      return res.status(404).json({
        success: false,
        error: 'Integration not found'
      });
    }

    logger.info('Testing integration connection:', { id, provider: integration.provider });

    const result = await integrationService.testConnection(integration);

    res.json({
      success: result.success,
      message: result.message || result.error,
      statusCode: result.statusCode
    });

  } catch (error) {
    logger.error('Error testing integration:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Connection test failed'
    });
  }
});

// =============================================================================
// KNOWLEDGE BASE IMPORT (Inbound)
// =============================================================================

// POST /api/integrations/:id/import-kb - Import knowledge base from external system
router.post('/:id/import-kb', async (req, res) => {
  try {
    const { id } = req.params;

    const integration = await integrationService.getIntegration(id);
    if (!integration) {
      return res.status(404).json({
        success: false,
        error: 'Integration not found'
      });
    }

    // Check if this integration supports KB import
    if (integration.direction === 'outbound') {
      return res.status(400).json({
        success: false,
        error: 'This integration is configured for outbound only. Enable inbound or bidirectional mode to import KB.'
      });
    }

    logger.info('Starting KB import:', { id, provider: integration.provider });

    const result = await integrationService.importKnowledgeBase(integration);

    res.json({
      success: result.success,
      articlesImported: result.articlesImported,
      chunksCreated: result.chunksCreated,
      durationSeconds: result.durationSeconds,
      message: result.success
        ? `Successfully imported ${result.articlesImported} articles (${result.chunksCreated} chunks created)`
        : result.error
    });

  } catch (error) {
    logger.error('Error importing KB:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'KB import failed'
    });
  }
});

// =============================================================================
// OUTBOUND DATA SYNC
// =============================================================================

// POST /api/integrations/:id/send - Send data to external CRM
router.post('/:id/send', async (req, res) => {
  try {
    const { id } = req.params;
    const { event_type, data } = req.body;

    if (!event_type || !data) {
      return res.status(400).json({
        success: false,
        error: 'event_type and data are required'
      });
    }

    const integration = await integrationService.getIntegration(id);
    if (!integration) {
      return res.status(404).json({
        success: false,
        error: 'Integration not found'
      });
    }

    if (integration.direction === 'inbound') {
      return res.status(400).json({
        success: false,
        error: 'This integration is configured for inbound only. Enable outbound or bidirectional mode to send data.'
      });
    }

    logger.info('Sending data to external CRM:', { id, provider: integration.provider, event_type });

    const result = await integrationService.sendToExternalCRM(integration, event_type, data);

    res.json({
      success: result.success,
      response: result.response,
      error: result.error
    });

  } catch (error) {
    logger.error('Error sending to CRM:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to send data to CRM'
    });
  }
});

// POST /api/integrations/:id/queue - Queue an event for async processing
router.post('/:id/queue', async (req, res) => {
  try {
    const { id } = req.params;
    const { event_type, payload } = req.body;

    if (!event_type || !payload) {
      return res.status(400).json({
        success: false,
        error: 'event_type and payload are required'
      });
    }

    const integration = await integrationService.getIntegration(id);
    if (!integration) {
      return res.status(404).json({
        success: false,
        error: 'Integration not found'
      });
    }

    const event = await integrationService.queueEvent(id, integration.org_id, event_type, payload);

    res.json({
      success: true,
      event,
      message: 'Event queued for processing'
    });

  } catch (error) {
    logger.error('Error queuing event:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to queue event'
    });
  }
});

// =============================================================================
// SYNC LOGS
// =============================================================================

// GET /api/integrations/:id/logs - Get sync logs for an integration
router.get('/:id/logs', async (req, res) => {
  try {
    const { id } = req.params;
    const limit = parseInt(req.query.limit) || 20;

    const logs = await integrationService.getSyncLogs(id, limit);

    res.json({
      success: true,
      logs
    });

  } catch (error) {
    logger.error('Error fetching sync logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sync logs'
    });
  }
});

// =============================================================================
// EVENT QUEUE PROCESSING (for cron/scheduled tasks)
// =============================================================================

// POST /api/integrations/process-queue - Process pending events in queue
router.post('/process-queue', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;

    const result = await integrationService.processEventQueue(limit);

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    logger.error('Error processing event queue:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process event queue'
    });
  }
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Mask sensitive fields in auth_config for API responses
 */
function maskAuthConfig(authConfig) {
  if (!authConfig) return {};

  const masked = { ...authConfig };

  // Mask sensitive fields
  const sensitiveFields = ['apiKey', 'api_key', 'accessToken', 'access_token', 'refreshToken', 'refresh_token', 'clientSecret', 'client_secret', 'password'];

  for (const field of sensitiveFields) {
    if (masked[field]) {
      masked[field] = '********' + (masked[field].slice(-4) || '');
    }
  }

  return masked;
}

export default router;
