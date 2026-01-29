// services/integration-service.js - CRM & External API Integration Service
// Handles bidirectional integrations with TechOne, SAP, Genesys, Salesforce, etc.
// - Outbound: Push data to CRMs (tickets, logs, updates)
// - Inbound: Pull knowledge base content from external systems

import crypto from 'crypto';
import supabaseService from './supabase-service.js';
import { processKnowledgeBase } from './kb-processor.js';
import logger from './logger.js';

// =============================================================================
// PROVIDER CONFIGURATIONS - Pre-built connectors for known CRMs
// =============================================================================

const PROVIDER_CONFIGS = {
  techone: {
    name: 'TechOne',
    authType: 'oauth2',
    headers: (config) => ({
      'Authorization': `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }),
    endpoints: {
      createRequest: '/api/crm/requests',
      getKnowledgeBase: '/api/kb/articles',
      searchKB: '/api/kb/search',
      logInteraction: '/api/crm/interactions'
    },
    // Field mappings from our format to TechOne format
    fieldMappings: {
      customerName: 'ContactName',
      customerEmail: 'ContactEmail',
      customerPhone: 'ContactPhone',
      subject: 'RequestSubject',
      description: 'RequestDescription',
      channel: 'RequestChannel',
      conversationId: 'ExternalReference'
    },
    kbParser: (response) => {
      // Parse TechOne KB response format
      const articles = response.data || response.articles || response;
      return Array.isArray(articles) ? articles.map(a => ({
        title: a.Title || a.title || a.Subject,
        content: a.Content || a.content || a.Body,
        category: a.Category || a.category,
        id: a.Id || a.id || a.ArticleId
      })) : [];
    }
  },

  sap: {
    name: 'SAP',
    authType: 'oauth2',
    headers: (config) => ({
      'Authorization': `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'sap-client': config.sapClient || '100'
    }),
    endpoints: {
      createServiceTicket: '/sap/opu/odata/sap/API_SERVICEREQUEST_SRV/A_ServiceRequest',
      getKnowledgeArticles: '/sap/opu/odata/sap/API_KNOWLEDGE_SRV/KnowledgeArticles',
      searchKB: '/sap/opu/odata/sap/API_KNOWLEDGE_SRV/KnowledgeArticles',
      logActivity: '/sap/opu/odata/sap/API_BUSINESS_PARTNER/A_BusinessPartnerActivity'
    },
    fieldMappings: {
      customerName: 'CustomerName',
      customerEmail: 'CustomerEmail',
      subject: 'ServiceRequestDescription',
      description: 'ServiceRequestLongText',
      channel: 'ServiceRequestType',
      conversationId: 'ExternalReferenceID'
    },
    kbParser: (response) => {
      const articles = response.d?.results || response.value || [];
      return articles.map(a => ({
        title: a.KnowledgeArticleTitle || a.Title,
        content: a.KnowledgeArticleContent || a.Content,
        category: a.KnowledgeArticleCategory,
        id: a.KnowledgeArticleID || a.ID
      }));
    }
  },

  genesys: {
    name: 'Genesys Cloud',
    authType: 'oauth2',
    headers: (config) => ({
      'Authorization': `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json'
    }),
    endpoints: {
      createInteraction: '/api/v2/conversations',
      logConversation: '/api/v2/analytics/conversations/details',
      getQueues: '/api/v2/routing/queues',
      transferCall: '/api/v2/conversations/calls/{callId}/participants/{participantId}/replace'
    },
    fieldMappings: {
      customerPhone: 'address',
      subject: 'subject',
      channel: 'mediaType',
      conversationId: 'externalContactId'
    },
    supportsKBImport: false
  },

  salesforce: {
    name: 'Salesforce',
    authType: 'oauth2',
    headers: (config) => ({
      'Authorization': `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json'
    }),
    endpoints: {
      createCase: '/services/data/v58.0/sobjects/Case',
      createLead: '/services/data/v58.0/sobjects/Lead',
      getKnowledgeArticles: '/services/data/v58.0/support/knowledgeArticles',
      searchKB: '/services/data/v58.0/search',
      logActivity: '/services/data/v58.0/sobjects/Task'
    },
    fieldMappings: {
      customerName: 'SuppliedName',
      customerEmail: 'SuppliedEmail',
      customerPhone: 'SuppliedPhone',
      subject: 'Subject',
      description: 'Description',
      channel: 'Origin',
      conversationId: 'ExternalReference__c'
    },
    kbParser: (response) => {
      const articles = response.articles || response.records || [];
      return articles.map(a => ({
        title: a.title || a.Title,
        content: a.summary || a.Body || a.Answer__c,
        category: a.categoryGroups?.[0]?.name,
        id: a.id || a.Id
      }));
    }
  },

  zendesk: {
    name: 'Zendesk',
    authType: 'api_key',
    headers: (config) => ({
      'Authorization': `Basic ${Buffer.from(`${config.email}/token:${config.apiKey}`).toString('base64')}`,
      'Content-Type': 'application/json'
    }),
    endpoints: {
      createTicket: '/api/v2/tickets',
      getArticles: '/api/v2/help_center/articles',
      searchArticles: '/api/v2/help_center/articles/search'
    },
    fieldMappings: {
      customerName: 'requester.name',
      customerEmail: 'requester.email',
      subject: 'subject',
      description: 'comment.body',
      channel: 'via.channel'
    },
    kbParser: (response) => {
      const articles = response.articles || response.results || [];
      return articles.map(a => ({
        title: a.title || a.name,
        content: a.body || a.body_text,
        category: a.section?.name,
        id: a.id
      }));
    }
  },

  freshdesk: {
    name: 'Freshdesk',
    authType: 'api_key',
    headers: (config) => ({
      'Authorization': `Basic ${Buffer.from(`${config.apiKey}:X`).toString('base64')}`,
      'Content-Type': 'application/json'
    }),
    endpoints: {
      createTicket: '/api/v2/tickets',
      getArticles: '/api/v2/solutions/articles',
      searchArticles: '/api/v2/search/solutions'
    },
    fieldMappings: {
      customerName: 'name',
      customerEmail: 'email',
      customerPhone: 'phone',
      subject: 'subject',
      description: 'description',
      channel: 'source'
    },
    kbParser: (response) => {
      const articles = response.results || response || [];
      return articles.map(a => ({
        title: a.title,
        content: a.description || a.description_text,
        category: a.folder?.name,
        id: a.id
      }));
    }
  },

  dynamics365: {
    name: 'Microsoft Dynamics 365',
    authType: 'oauth2',
    headers: (config) => ({
      'Authorization': `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0'
    }),
    endpoints: {
      createCase: '/api/data/v9.2/incidents',
      getKnowledgeArticles: '/api/data/v9.2/knowledgearticles',
      searchKB: '/api/data/v9.2/knowledgearticles',
      logActivity: '/api/data/v9.2/tasks'
    },
    fieldMappings: {
      customerName: 'customerid_contact@odata.bind',
      subject: 'title',
      description: 'description',
      channel: 'caseorigincode',
      conversationId: 'ticketnumber'
    },
    kbParser: (response) => {
      const articles = response.value || [];
      return articles.map(a => ({
        title: a.title,
        content: a.content || a.description,
        category: a.subjectid?.name,
        id: a.knowledgearticleid
      }));
    }
  },

  custom: {
    name: 'Custom API',
    authType: 'api_key',
    headers: (config) => {
      const headers = { 'Content-Type': 'application/json' };
      if (config.authType === 'bearer') {
        headers['Authorization'] = `Bearer ${config.apiKey}`;
      } else if (config.authType === 'api_key') {
        headers[config.apiKeyHeader || 'X-API-Key'] = config.apiKey;
      } else if (config.authType === 'basic') {
        headers['Authorization'] = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}`;
      }
      return headers;
    },
    endpoints: {
      createRecord: '/api/records',
      getRecords: '/api/records',
      searchRecords: '/api/search'
    },
    fieldMappings: {},
    kbParser: (response) => {
      // Try common response formats
      const data = response.data || response.results || response.items || response;
      return Array.isArray(data) ? data.map(item => ({
        title: item.title || item.name || item.heading || item.subject,
        content: item.content || item.body || item.text || item.description,
        category: item.category || item.type || item.section,
        id: item.id || item._id
      })) : [];
    }
  }
};

// =============================================================================
// INTEGRATION SERVICE CLASS
// =============================================================================

class IntegrationService {
  constructor() {
    this.requestCache = new Map(); // Simple in-memory cache for rate limiting
  }

  // ---------------------------------------------------------------------------
  // CRUD Operations for Integrations
  // ---------------------------------------------------------------------------

  async getIntegrations(orgId) {
    const { data, error } = await supabaseService.client
      .from('organization_integrations')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Error fetching integrations:', error);
      throw error;
    }

    return data || [];
  }

  async getIntegration(integrationId) {
    const { data, error } = await supabaseService.client
      .from('organization_integrations')
      .select('*')
      .eq('id', integrationId)
      .single();

    if (error) {
      logger.error('Error fetching integration:', error);
      throw error;
    }

    return data;
  }

  async createIntegration(orgId, integrationData) {
    const { data, error } = await supabaseService.client
      .from('organization_integrations')
      .insert({
        org_id: orgId,
        ...integrationData,
        status: 'pending_setup'
      })
      .select()
      .single();

    if (error) {
      logger.error('Error creating integration:', error);
      throw error;
    }

    logger.info('Integration created:', { id: data.id, provider: data.provider });
    return data;
  }

  async updateIntegration(integrationId, updates) {
    const { data, error } = await supabaseService.client
      .from('organization_integrations')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', integrationId)
      .select()
      .single();

    if (error) {
      logger.error('Error updating integration:', error);
      throw error;
    }

    return data;
  }

  async deleteIntegration(integrationId) {
    const { error } = await supabaseService.client
      .from('organization_integrations')
      .delete()
      .eq('id', integrationId);

    if (error) {
      logger.error('Error deleting integration:', error);
      throw error;
    }

    logger.info('Integration deleted:', { id: integrationId });
    return true;
  }

  // ---------------------------------------------------------------------------
  // Get Provider Templates
  // ---------------------------------------------------------------------------

  async getTemplates() {
    const { data, error } = await supabaseService.client
      .from('integration_templates')
      .select('*')
      .order('display_name');

    if (error) {
      logger.error('Error fetching templates:', error);
      throw error;
    }

    return data || [];
  }

  async getTemplate(provider) {
    const { data, error } = await supabaseService.client
      .from('integration_templates')
      .select('*')
      .eq('provider', provider)
      .single();

    if (error && error.code !== 'PGRST116') {
      logger.error('Error fetching template:', error);
      throw error;
    }

    return data;
  }

  // ---------------------------------------------------------------------------
  // Connection Testing
  // ---------------------------------------------------------------------------

  async testConnection(integration) {
    const provider = integration.provider;
    const config = PROVIDER_CONFIGS[provider] || PROVIDER_CONFIGS.custom;

    try {
      const authConfig = integration.auth_config || {};
      const baseUrl = integration.base_url;

      // Build headers based on auth type
      let headers;
      if (config.headers) {
        headers = config.headers(authConfig);
      } else {
        headers = { 'Content-Type': 'application/json' };
      }

      // For OAuth2, we might need to refresh the token first
      if (integration.auth_type === 'oauth2' && authConfig.refreshToken) {
        const newToken = await this.refreshOAuthToken(integration);
        if (newToken) {
          authConfig.accessToken = newToken;
          headers = config.headers(authConfig);
        }
      }

      // Try a simple GET request to verify connection
      const testEndpoint = integration.endpoints?.test ||
        integration.endpoints?.getKnowledgeBase ||
        config.endpoints?.getKnowledgeArticles ||
        config.endpoints?.getQueues ||
        '/api/status';

      const response = await fetch(`${baseUrl}${testEndpoint}`, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });

      if (response.ok) {
        // Update integration status
        await this.updateIntegration(integration.id, {
          status: 'active',
          last_sync_status: 'completed',
          last_sync_message: 'Connection test successful'
        });

        return {
          success: true,
          message: 'Connection successful',
          statusCode: response.status
        };
      } else {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
      }

    } catch (error) {
      logger.error('Connection test failed:', { provider, error: error.message });

      // Update integration status
      await this.updateIntegration(integration.id, {
        status: 'error',
        last_sync_status: 'failed',
        last_sync_message: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  // ---------------------------------------------------------------------------
  // OAuth Token Refresh
  // ---------------------------------------------------------------------------

  async refreshOAuthToken(integration) {
    const authConfig = integration.auth_config || {};

    if (!authConfig.refreshToken || !authConfig.tokenUrl) {
      return null;
    }

    try {
      const response = await fetch(authConfig.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: authConfig.refreshToken,
          client_id: authConfig.clientId,
          client_secret: authConfig.clientSecret
        })
      });

      if (response.ok) {
        const tokenData = await response.json();

        // Update stored tokens
        await this.updateIntegration(integration.id, {
          auth_config: {
            ...authConfig,
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token || authConfig.refreshToken,
            expiresAt: Date.now() + (tokenData.expires_in * 1000)
          }
        });

        return tokenData.access_token;
      }

      logger.warn('OAuth token refresh failed:', response.status);
      return null;

    } catch (error) {
      logger.error('OAuth token refresh error:', error);
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // OUTBOUND: Send Data to External CRM
  // ---------------------------------------------------------------------------

  async sendToExternalCRM(integration, eventType, data) {
    const provider = integration.provider;
    const config = PROVIDER_CONFIGS[provider] || PROVIDER_CONFIGS.custom;
    const authConfig = integration.auth_config || {};
    const baseUrl = integration.base_url;
    const customEndpoints = integration.endpoints || {};
    const customMappings = integration.field_mappings || {};

    try {
      // Build headers
      let headers = config.headers ? config.headers(authConfig) : { 'Content-Type': 'application/json' };

      // Get the appropriate endpoint for this event type
      const endpoints = { ...config.endpoints, ...customEndpoints };
      let endpoint = endpoints[eventType];

      if (!endpoint) {
        throw new Error(`No endpoint configured for event type: ${eventType}`);
      }

      // Map our data to the external format
      const fieldMappings = { ...config.fieldMappings, ...customMappings };
      const mappedData = this.mapFields(data, fieldMappings);

      // Make the API call
      const response = await fetch(`${baseUrl}${endpoint}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(mappedData),
        signal: AbortSignal.timeout(30000) // 30 second timeout
      });

      const responseBody = await response.text();
      let parsedResponse;
      try {
        parsedResponse = JSON.parse(responseBody);
      } catch {
        parsedResponse = { raw: responseBody };
      }

      // Log the sync
      await this.logSync(integration.id, integration.org_id, {
        direction: 'outbound',
        status: response.ok ? 'completed' : 'failed',
        recordsProcessed: 1,
        recordsSucceeded: response.ok ? 1 : 0,
        recordsFailed: response.ok ? 0 : 1,
        errorMessage: response.ok ? null : `HTTP ${response.status}: ${responseBody.substring(0, 500)}`
      });

      if (response.ok) {
        logger.info('Outbound CRM sync successful:', { provider, eventType });
        return { success: true, response: parsedResponse };
      } else {
        throw new Error(`HTTP ${response.status}: ${responseBody.substring(0, 200)}`);
      }

    } catch (error) {
      logger.error('Outbound CRM sync failed:', { provider, eventType, error: error.message });

      await this.logSync(integration.id, integration.org_id, {
        direction: 'outbound',
        status: 'failed',
        recordsProcessed: 1,
        recordsFailed: 1,
        errorMessage: error.message
      });

      return { success: false, error: error.message };
    }
  }

  // ---------------------------------------------------------------------------
  // INBOUND: Import Knowledge Base from External System
  // ---------------------------------------------------------------------------

  async importKnowledgeBase(integration) {
    const provider = integration.provider;
    const config = PROVIDER_CONFIGS[provider] || PROVIDER_CONFIGS.custom;
    const authConfig = integration.auth_config || {};
    const baseUrl = integration.base_url;
    const customEndpoints = integration.endpoints || {};

    const startTime = Date.now();

    try {
      // Build headers
      let headers = config.headers ? config.headers(authConfig) : { 'Content-Type': 'application/json' };

      // Get KB endpoint
      const endpoints = { ...config.endpoints, ...customEndpoints };
      const kbEndpoint = endpoints.getKnowledgeBase || endpoints.getKnowledgeArticles || endpoints.getArticles;

      if (!kbEndpoint) {
        throw new Error('No knowledge base endpoint configured for this integration');
      }

      logger.info('Starting KB import:', { provider, endpoint: kbEndpoint });

      // Fetch articles from external system
      let allArticles = [];
      let nextUrl = `${baseUrl}${kbEndpoint}`;
      let pageCount = 0;
      const maxPages = 50; // Safety limit

      while (nextUrl && pageCount < maxPages) {
        const response = await fetch(nextUrl, {
          method: 'GET',
          headers,
          signal: AbortSignal.timeout(60000) // 60 second timeout per page
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }

        const data = await response.json();

        // Parse the response using provider-specific parser
        const parser = config.kbParser || PROVIDER_CONFIGS.custom.kbParser;
        const articles = parser(data);
        allArticles = allArticles.concat(articles);

        // Check for pagination
        nextUrl = data.next_page_url || data['@odata.nextLink'] || data.next || null;
        pageCount++;

        logger.info(`KB import page ${pageCount}:`, { articlesThisPage: articles.length, totalSoFar: allArticles.length });
      }

      if (allArticles.length === 0) {
        logger.warn('No articles found to import');
        return {
          success: true,
          message: 'No articles found in external knowledge base',
          articlesImported: 0
        };
      }

      // Convert articles to our KB format and process
      const combinedText = allArticles.map(article => {
        const heading = article.title || 'Untitled';
        const content = article.content || '';
        const category = article.category || 'General';

        return `------------------------------------------------------------
${heading.toUpperCase()}
------------------------------------------------------------
Category: ${category}

${content}

`;
      }).join('\n');

      // Use existing KB processor to chunk and embed
      const result = await processKnowledgeBase({
        text: combinedText,
        fileName: `${provider}_kb_import_${new Date().toISOString().split('T')[0]}`,
        mimeType: 'text/plain',
        org_id: integration.org_id
      });

      const durationSeconds = Math.round((Date.now() - startTime) / 1000);

      // Log the sync
      await this.logSync(integration.id, integration.org_id, {
        direction: 'inbound',
        status: result.success ? 'completed' : 'failed',
        recordsProcessed: allArticles.length,
        recordsSucceeded: result.success ? allArticles.length : 0,
        kbChunksCreated: result.chunksCreated || 0,
        durationSeconds,
        errorMessage: result.error || null
      });

      // Update integration last sync
      await this.updateIntegration(integration.id, {
        last_sync_at: new Date().toISOString(),
        last_sync_status: result.success ? 'completed' : 'failed',
        last_sync_message: result.success
          ? `Imported ${allArticles.length} articles (${result.chunksCreated} chunks)`
          : result.error
      });

      logger.info('KB import completed:', {
        provider,
        articles: allArticles.length,
        chunks: result.chunksCreated,
        duration: durationSeconds
      });

      return {
        success: result.success,
        articlesImported: allArticles.length,
        chunksCreated: result.chunksCreated,
        durationSeconds,
        error: result.error
      };

    } catch (error) {
      logger.error('KB import failed:', { provider, error: error.message });

      const durationSeconds = Math.round((Date.now() - startTime) / 1000);

      await this.logSync(integration.id, integration.org_id, {
        direction: 'inbound',
        status: 'failed',
        recordsProcessed: 0,
        recordsFailed: 1,
        durationSeconds,
        errorMessage: error.message
      });

      await this.updateIntegration(integration.id, {
        last_sync_at: new Date().toISOString(),
        last_sync_status: 'failed',
        last_sync_message: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Event Queue Processing (for async outbound events)
  // ---------------------------------------------------------------------------

  async queueEvent(integrationId, orgId, eventType, payload) {
    const { data, error } = await supabaseService.client
      .from('integration_event_queue')
      .insert({
        integration_id: integrationId,
        org_id: orgId,
        event_type: eventType,
        payload,
        status: 'pending',
        next_attempt_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      logger.error('Error queuing event:', error);
      throw error;
    }

    logger.info('Event queued:', { id: data.id, eventType });
    return data;
  }

  async processEventQueue(limit = 50) {
    // Get pending events
    const { data: events, error } = await supabaseService.client
      .from('integration_event_queue')
      .select('*, organization_integrations(*)')
      .in('status', ['pending', 'failed'])
      .lt('attempts', 3)
      .lte('next_attempt_at', new Date().toISOString())
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      logger.error('Error fetching event queue:', error);
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    if (!events || events.length === 0) {
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    let succeeded = 0;
    let failed = 0;

    for (const event of events) {
      const integration = event.organization_integrations;

      if (!integration || integration.status !== 'active') {
        // Skip if integration not found or inactive
        continue;
      }

      // Mark as processing
      await supabaseService.client
        .from('integration_event_queue')
        .update({
          status: 'processing',
          attempts: event.attempts + 1,
          last_attempt_at: new Date().toISOString()
        })
        .eq('id', event.id);

      // Send to CRM
      const result = await this.sendToExternalCRM(integration, event.event_type, event.payload);

      // Update event status
      await supabaseService.client
        .from('integration_event_queue')
        .update({
          status: result.success ? 'sent' : 'failed',
          response_status: result.response?.status,
          response_body: result.response,
          error_message: result.error,
          processed_at: result.success ? new Date().toISOString() : null,
          next_attempt_at: result.success ? null : new Date(Date.now() + Math.pow(2, event.attempts + 1) * 60000).toISOString() // Exponential backoff
        })
        .eq('id', event.id);

      if (result.success) {
        succeeded++;
      } else {
        failed++;
      }
    }

    logger.info('Event queue processed:', { processed: events.length, succeeded, failed });
    return { processed: events.length, succeeded, failed };
  }

  // ---------------------------------------------------------------------------
  // Sync Logging
  // ---------------------------------------------------------------------------

  async logSync(integrationId, orgId, syncData) {
    const { error } = await supabaseService.client
      .from('integration_sync_logs')
      .insert({
        integration_id: integrationId,
        org_id: orgId,
        direction: syncData.direction,
        status: syncData.status,
        records_processed: syncData.recordsProcessed || 0,
        records_succeeded: syncData.recordsSucceeded || 0,
        records_failed: syncData.recordsFailed || 0,
        kb_chunks_created: syncData.kbChunksCreated || 0,
        kb_chunks_updated: syncData.kbChunksUpdated || 0,
        duration_seconds: syncData.durationSeconds,
        error_message: syncData.errorMessage,
        error_details: syncData.errorDetails,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString()
      });

    if (error) {
      logger.error('Error logging sync:', error);
    }
  }

  async getSyncLogs(integrationId, limit = 20) {
    const { data, error } = await supabaseService.client
      .from('integration_sync_logs')
      .select('*')
      .eq('integration_id', integrationId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error('Error fetching sync logs:', error);
      throw error;
    }

    return data || [];
  }

  // ---------------------------------------------------------------------------
  // Helper: Map fields from our format to external format
  // ---------------------------------------------------------------------------

  mapFields(data, mappings) {
    const mapped = {};

    for (const [ourField, theirField] of Object.entries(mappings)) {
      if (data[ourField] !== undefined) {
        // Handle nested field paths like "requester.name"
        if (theirField.includes('.')) {
          const parts = theirField.split('.');
          let current = mapped;
          for (let i = 0; i < parts.length - 1; i++) {
            current[parts[i]] = current[parts[i]] || {};
            current = current[parts[i]];
          }
          current[parts[parts.length - 1]] = data[ourField];
        } else {
          mapped[theirField] = data[ourField];
        }
      }
    }

    // Include any unmapped fields as-is
    for (const [key, value] of Object.entries(data)) {
      if (!mappings[key]) {
        mapped[key] = value;
      }
    }

    return mapped;
  }

  // ---------------------------------------------------------------------------
  // Auto-trigger integrations on conversation events
  // ---------------------------------------------------------------------------

  async triggerConversationEnded(conversationData) {
    const { org_id } = conversationData;

    // Get active outbound integrations for this org
    const { data: integrations } = await supabaseService.client
      .from('organization_integrations')
      .select('*')
      .eq('org_id', org_id)
      .eq('status', 'active')
      .in('direction', ['outbound', 'bidirectional']);

    if (!integrations || integrations.length === 0) {
      return;
    }

    for (const integration of integrations) {
      // Queue the event for async processing
      await this.queueEvent(integration.id, org_id, 'logInteraction', {
        conversationId: conversationData.id,
        sessionId: conversationData.session_id,
        channel: conversationData.channel,
        customerName: conversationData.customer_name,
        customerEmail: conversationData.customer_email,
        customerPhone: conversationData.customer_phone,
        transcript: conversationData.transcript_text,
        duration: conversationData.duration_seconds,
        endReason: conversationData.end_reason,
        score: conversationData.overall_score,
        timestamp: new Date().toISOString()
      });
    }
  }
}

const integrationService = new IntegrationService();
export default integrationService;
