// routes/admin.js - Admin API endpoints for self-service management
import express from 'express';
import multer from 'multer';
import supabaseService from '../services/supabase-service.js';
import { processKnowledgeBase } from '../services/kb-processor.js';
import { validateTwilioNumber } from '../services/twilio-validator.js';
import logger from '../services/logger.js';
import emailService from '../services/email-service.js';

const router = express.Router();

// Configure multer for file uploads (in-memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['text/plain', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only TXT, PDF, and DOCX files are allowed.'));
    }
  }
});

// =============================================================================
// ORGANIZATION MANAGEMENT
// =============================================================================

// POST /api/admin/organizations - Create new organization
router.post('/organizations', async (req, res) => {
  try {
    const { name, slug, flat_rate_fee, included_interactions, overage_rate_per_1000 } = req.body;

    // Validation
    if (!name || !slug) {
      return res.status(400).json({
        success: false,
        error: 'Organization name and slug are required'
      });
    }

    // Create organization in Supabase (UUID auto-generated)
    const { data, error } = await supabaseService.client
      .from('organizations')
      .insert({
        name,
        slug,
        flat_rate_fee: flat_rate_fee || 500.00,
        included_interactions: included_interactions || 5000,
        overage_rate_per_1000: overage_rate_per_1000 || 50.00
      })
      .select()
      .single();

    if (error) {
      logger.error('Organization creation error:', error);
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    logger.info('Organization created:', { id: data.id, name: data.name });

    res.json({
      success: true,
      organization: data,
      message: `Organization "${data.name}" created successfully. UUID: ${data.id}`
    });

  } catch (error) {
    logger.error('Organization creation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create organization'
    });
  }
});

// GET /api/admin/organizations - List all organizations
router.get('/organizations', async (req, res) => {
  try {
    const { data, error } = await supabaseService.client
      .from('organizations')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      organizations: data
    });

  } catch (error) {
    logger.error('Organization list error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch organizations'
    });
  }
});

// GET /api/admin/organizations/:id - Get organization by ID
router.get('/organizations/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseService.client
      .from('organizations')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({
        success: false,
        error: 'Organization not found'
      });
    }

    res.json({
      success: true,
      organization: data
    });

  } catch (error) {
    logger.error('Organization fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch organization'
    });
  }
});

// GET /api/admin/usage/:org_id - Get organization usage data
router.get('/usage/:org_id', async (req, res) => {
  try {
    const { org_id } = req.params;

    // Get organization details
    const { data: org, error: orgError } = await supabaseService.client
      .from('organizations')
      .select('*')
      .eq('id', org_id)
      .single();

    if (orgError) throw orgError;

    if (!org) {
      return res.status(404).json({
        success: false,
        error: 'Organization not found'
      });
    }

    // Get usage summary from view
    const { data: usage, error: usageError } = await supabaseService.client
      .from('organization_usage_summary')
      .select('*')
      .eq('org_id', org_id)
      .single();

    if (usageError && usageError.code !== 'PGRST116') {
      throw usageError;
    }

    // Combine organization data with usage data
    const usageData = {
      org_id: org.id,
      org_name: org.name,
      flat_rate_fee: org.flat_rate_fee,
      included_interactions: org.included_interactions,
      overage_rate_per_1000: org.overage_rate_per_1000,
      current_period_start: org.current_period_start,
      current_period_end: org.current_period_end,
      current_period_interactions: org.current_period_interactions,
      total_interactions: org.total_interactions,
      overage_interactions: usage?.overage_interactions || 0,
      overage_cost: usage?.overage_cost || 0,
      total_cost_this_period: usage?.total_cost_this_period || org.flat_rate_fee,
      remaining_interactions: usage?.remaining_interactions || org.included_interactions
    };

    res.json({
      success: true,
      usage: usageData
    });

  } catch (error) {
    logger.error('Usage fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch usage data'
    });
  }
});

// =============================================================================
// ASSISTANT MANAGEMENT
// =============================================================================

// POST /api/admin/assistants - Create new assistant (voice or chat)
router.post('/assistants', async (req, res) => {
  try {
    const {
      org_id,
      friendly_name,
      bot_type, // 'voice' or 'chat'
      phone_number, // For voice bots
      elevenlabs_voice_id, // For voice bots
      prompt,
      model,
      rubric // Optional: assistant-specific rubric
    } = req.body;

    // Validation - prompt is now optional (uses default if not provided)
    if (!org_id || !friendly_name || !bot_type) {
      return res.status(400).json({
        success: false,
        error: 'org_id, friendly_name, and bot_type are required'
      });
    }

    if (!['voice', 'chat'].includes(bot_type)) {
      return res.status(400).json({
        success: false,
        error: 'bot_type must be either "voice" or "chat"'
      });
    }

    // Voice-specific validation
    if (bot_type === 'voice') {
      if (!phone_number) {
        return res.status(400).json({
          success: false,
          error: 'phone_number is required for voice assistants'
        });
      }

      // Validate Twilio number
      const twilioValidation = await validateTwilioNumber(phone_number);
      if (!twilioValidation.valid) {
        return res.status(400).json({
          success: false,
          error: `Invalid Twilio number: ${twilioValidation.error}`
        });
      }
    }

    // Create assistant - prompt is optional, voice-handler uses default if empty
    const { data, error } = await supabaseService.client
      .from('assistants')
      .insert({
        org_id,
        friendly_name,
        bot_type,
        phone_number: bot_type === 'voice' ? phone_number : null,
        elevenlabs_voice_id: bot_type === 'voice' ? (elevenlabs_voice_id || process.env.ELEVENLABS_VOICE_DEFAULT) : null,
        prompt: prompt || null, // Optional - voice-handler uses DEFAULT_SYSTEM_PROMPT if empty
        model: model || 'gpt-4o-mini',
        rubric: rubric || null
      })
      .select()
      .single();

    if (error) {
      logger.error('Assistant creation error:', error);
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    logger.info('Assistant created:', { id: data.id, type: bot_type, org_id });

    res.json({
      success: true,
      assistant: data,
      message: `${bot_type === 'voice' ? 'Voice' : 'Chat'} assistant "${friendly_name}" created successfully`
    });

  } catch (error) {
    logger.error('Assistant creation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create assistant'
    });
  }
});

// GET /api/admin/assistants - List assistants (optionally filter by org)
router.get('/assistants', async (req, res) => {
  try {
    const { org_id } = req.query;

    let query = supabaseService.client
      .from('assistants')
      .select('*')
      .order('created_at', { ascending: false });

    if (org_id) {
      query = query.eq('org_id', org_id);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({
      success: true,
      assistants: data
    });

  } catch (error) {
    logger.error('Assistant list error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch assistants'
    });
  }
});

// =============================================================================
// KNOWLEDGE BASE MANAGEMENT
// =============================================================================

// POST /api/admin/knowledge-base/upload - Upload and process knowledge base file
router.post('/knowledge-base/upload', upload.single('file'), async (req, res) => {
  try {
    const { org_id, assistant_id } = req.body;
    const file = req.file;

    // Validation
    if (!org_id) {
      return res.status(400).json({
        success: false,
        error: 'org_id is required'
      });
    }

    if (!file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    logger.info('Processing knowledge base file:', {
      filename: file.originalname,
      size: file.size,
      type: file.mimetype,
      org_id
    });

    // Process file: extract text → chunk → generate embeddings → save to DB
    const result = await processKnowledgeBase({
      fileBuffer: file.buffer,
      fileName: file.originalname,
      mimeType: file.mimetype,
      org_id,
      assistant_id: assistant_id || null
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    logger.info('Knowledge base processed successfully:', {
      chunks: result.chunksCreated,
      org_id
    });

    res.json({
      success: true,
      message: `Successfully processed ${result.chunksCreated} knowledge chunks`,
      chunks: result.chunksCreated,
      metadata: result.metadata
    });

  } catch (error) {
    logger.error('Knowledge base upload error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process knowledge base file'
    });
  }
});

// POST /api/admin/knowledge-base/text - Upload text-based knowledge
router.post('/knowledge-base/text', async (req, res) => {
  try {
    const { org_id, assistant_id, text, title } = req.body;

    // Validation
    if (!org_id || !text) {
      return res.status(400).json({
        success: false,
        error: 'org_id and text are required'
      });
    }

    logger.info('Processing text knowledge base:', {
      textLength: text.length,
      org_id,
      title: title || 'Untitled'
    });

    // Process text: chunk → generate embeddings → save to DB
    const result = await processKnowledgeBase({
      text,
      fileName: title || 'Text Input',
      mimeType: 'text/plain',
      org_id,
      assistant_id: assistant_id || null
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    logger.info('Text knowledge base processed:', {
      chunks: result.chunksCreated,
      org_id
    });

    res.json({
      success: true,
      message: `Successfully processed ${result.chunksCreated} knowledge chunks`,
      chunks: result.chunksCreated
    });

  } catch (error) {
    logger.error('Text knowledge base error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process text'
    });
  }
});

// GET /api/admin/knowledge-base - List knowledge chunks (by org or assistant)
router.get('/knowledge-base', async (req, res) => {
  try {
    const { org_id, assistant_id, tenant_id } = req.query;

    // Use correct column names matching kb-processor.js
    let query = supabaseService.client
      .from('knowledge_chunks')
      .select('id, source, content, tenant_id, org_id, assistant_id, created_at')
      .order('created_at', { ascending: false })
      .limit(100);

    // Filter by tenant_id (primary), org_id, or assistant_id
    if (tenant_id) {
      query = query.eq('tenant_id', tenant_id);
    } else if (org_id) {
      query = query.eq('tenant_id', org_id); // tenant_id = org_id.toString()
    }

    if (assistant_id) {
      query = query.eq('assistant_id', assistant_id);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('KB query error:', error);
      throw error;
    }

    logger.info('KB list query result:', {
      org_id,
      assistant_id,
      tenant_id,
      chunksFound: data?.length || 0
    });

    res.json({
      success: true,
      chunks: data || [],
      count: data?.length || 0
    });

  } catch (error) {
    logger.error('Knowledge base list error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch knowledge base'
    });
  }
});

// =============================================================================
// TWILIO VALIDATION
// =============================================================================

// GET /api/admin/twilio-status - Check if Twilio is configured (for debugging)
router.get('/twilio-status', async (req, res) => {
  const hasAccountSid = !!process.env.TWILIO_ACCOUNT_SID;
  const hasAuthToken = !!process.env.TWILIO_AUTH_TOKEN;

  res.json({
    configured: hasAccountSid && hasAuthToken,
    hasAccountSid,
    hasAuthToken,
    accountSidPrefix: hasAccountSid ? process.env.TWILIO_ACCOUNT_SID.substring(0, 8) + '...' : null,
    message: hasAccountSid && hasAuthToken
      ? 'Twilio is configured'
      : 'Twilio credentials missing - set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN'
  });
});

// GET /api/admin/twilio-numbers - List all Twilio phone numbers and their webhook config
router.get('/twilio-numbers', async (req, res) => {
  try {
    const { listTwilioNumbers } = await import('../services/twilio-validator.js');
    const result = await listTwilioNumbers();
    res.json(result);
  } catch (error) {
    logger.error('List Twilio numbers error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/admin/twilio-number-details - Get full details about a specific Twilio number
router.get('/twilio-number-details', async (req, res) => {
  try {
    const { phone } = req.query;

    if (!phone) {
      return res.status(400).json({ success: false, error: 'phone query param required' });
    }

    const { getPhoneNumberDetails } = await import('../services/twilio-validator.js');
    const result = await getPhoneNumberDetails(phone);

    // Highlight potential issues
    if (result.success && result.number) {
      const issues = [];

      if (result.number.trunkSid) {
        issues.push(`⚠️ TRUNK_SID is set (${result.number.trunkSid}) - calls route to SIP trunk, not webhook`);
      }

      if (result.number.voiceApplicationSid) {
        issues.push(`⚠️ VOICE_APPLICATION_SID is set (${result.number.voiceApplicationSid}) - TwiML app overrides webhook URL`);
      }

      if (!result.number.voiceUrl) {
        issues.push('⚠️ NO VOICE_URL configured');
      }

      if (!result.number.capabilities?.voice) {
        issues.push('⚠️ Voice capability NOT enabled for this number');
      }

      result.issues = issues;
      result.hasIssues = issues.length > 0;
    }

    res.json(result);
  } catch (error) {
    logger.error('Get Twilio number details error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/admin/reset-twilio-number - Clear trunk/app associations and set webhook directly
router.post('/reset-twilio-number', async (req, res) => {
  try {
    const { phone_number } = req.body;

    if (!phone_number) {
      return res.status(400).json({ success: false, error: 'phone_number is required' });
    }

    const { resetPhoneNumberToWebhook } = await import('../services/twilio-validator.js');

    // Get the base URL for webhooks
    const baseUrl = process.env.BASE_URL || `https://${req.get('host')}`;

    const result = await resetPhoneNumberToWebhook(
      phone_number,
      `${baseUrl}/api/voice/incoming`,
      `${baseUrl}/api/voice/status`
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    logger.info('Twilio number reset:', result);

    res.json({
      success: true,
      message: `Number ${phone_number} has been reset - trunk and app associations cleared, webhook set directly`,
      ...result
    });
  } catch (error) {
    logger.error('Reset Twilio number error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/admin/ai-status - Check if AI services are configured (OpenAI, ElevenLabs)
router.get('/ai-status', async (req, res) => {
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasElevenLabs = !!process.env.ELEVENLABS_API_KEY;

  res.json({
    openai: {
      configured: hasOpenAI,
      keyPrefix: hasOpenAI ? process.env.OPENAI_API_KEY.substring(0, 7) + '...' : null
    },
    elevenlabs: {
      configured: hasElevenLabs,
      keyPrefix: hasElevenLabs ? process.env.ELEVENLABS_API_KEY.substring(0, 8) + '...' : null
    },
    allConfigured: hasOpenAI && hasElevenLabs,
    message: hasOpenAI && hasElevenLabs
      ? 'All AI services configured'
      : `Missing: ${!hasOpenAI ? 'OPENAI_API_KEY ' : ''}${!hasElevenLabs ? 'ELEVENLABS_API_KEY' : ''}`.trim()
  });
});

// POST /api/admin/validate-twilio-number - Validate Twilio phone number
router.post('/validate-twilio-number', async (req, res) => {
  try {
    const { phone_number } = req.body;

    if (!phone_number) {
      return res.status(400).json({
        success: false,
        error: 'phone_number is required'
      });
    }

    const result = await validateTwilioNumber(phone_number);

    res.json(result);

  } catch (error) {
    logger.error('Twilio validation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate phone number'
    });
  }
});

// POST /api/admin/configure-twilio-webhook - Configure Twilio webhook for a phone number
router.post('/configure-twilio-webhook', async (req, res) => {
  try {
    const { phone_number } = req.body;

    if (!phone_number) {
      return res.status(400).json({
        success: false,
        error: 'phone_number is required'
      });
    }

    const { configureTwilioWebhooks } = await import('../services/twilio-validator.js');

    // Get the base URL for webhooks
    const baseUrl = process.env.BASE_URL || `https://${req.get('host')}`;

    const result = await configureTwilioWebhooks(phone_number, {
      voiceUrl: `${baseUrl}/api/voice/incoming`,
      statusCallbackUrl: `${baseUrl}/api/voice/status`
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    logger.info('Twilio webhooks configured:', result);

    res.json({
      success: true,
      message: `Webhooks configured for ${phone_number}`,
      voiceUrl: result.voiceUrl,
      statusCallback: result.statusCallback
    });

  } catch (error) {
    logger.error('Configure webhook error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to configure webhooks'
    });
  }
});

// =============================================================================
// DEBUG ENDPOINTS
// =============================================================================

// GET /api/admin/debug/assistants-by-phone - List all assistants with phone numbers (for debugging)
router.get('/debug/assistants-by-phone', async (req, res) => {
  try {
    const { data, error } = await supabaseService.client
      .from('assistants')
      .select('id, friendly_name, phone_number, active, bot_type, org_id, created_at')
      .not('phone_number', 'is', null)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      count: data?.length || 0,
      assistants: data?.map(a => ({
        id: a.id,
        name: a.friendly_name,
        phone: a.phone_number,
        active: a.active,
        bot_type: a.bot_type,
        org_id: a.org_id
      })) || []
    });
  } catch (error) {
    logger.error('Debug assistants error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/admin/debug/activate-assistant - Activate an assistant for voice routing
router.post('/debug/activate-assistant', async (req, res) => {
  try {
    const { assistant_id } = req.body;

    if (!assistant_id) {
      return res.status(400).json({ success: false, error: 'assistant_id is required' });
    }

    const { data, error } = await supabaseService.client
      .from('assistants')
      .update({ active: true })
      .eq('id', assistant_id)
      .select()
      .single();

    if (error) throw error;

    logger.info('Assistant activated:', { id: assistant_id, name: data.friendly_name });

    res.json({
      success: true,
      message: `Assistant "${data.friendly_name}" is now active`,
      assistant: {
        id: data.id,
        name: data.friendly_name,
        phone: data.phone_number,
        active: data.active
      }
    });
  } catch (error) {
    logger.error('Activate assistant error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/admin/debug/test-phone-lookup - Test phone lookup function directly
router.get('/debug/test-phone-lookup', async (req, res) => {
  try {
    const { phone } = req.query;

    if (!phone) {
      return res.status(400).json({ success: false, error: 'phone query param required' });
    }

    logger.info('Testing phone lookup for:', phone);

    const assistant = await supabaseService.getAssistantByPhoneNumber(phone);

    res.json({
      success: true,
      phoneSearched: phone,
      found: !!assistant,
      assistant: assistant ? {
        id: assistant.id,
        name: assistant.friendly_name,
        phone: assistant.phone_number,
        active: assistant.active
      } : null
    });
  } catch (error) {
    logger.error('Test phone lookup error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================================================
// STATS & MONITORING
// =============================================================================

// =============================================================================
// EMBED CODE / INTEGRATION
// =============================================================================

// GET /api/admin/assistants/:id/embed-code - Get embed code for assistant
router.get('/assistants/:id/embed-code', async (req, res) => {
  try {
    const { id } = req.params;
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;

    // Get assistant
    const { data: assistant, error } = await supabaseService.client
      .from('assistants')
      .select('*, organizations(name, slug)')
      .eq('id', id)
      .single();

    if (error || !assistant) {
      return res.status(404).json({
        success: false,
        error: 'Assistant not found'
      });
    }

    // Get widget config (if any)
    const widgetConfig = assistant.widget_config || {};
    const primaryColor = widgetConfig.primaryColor || '#8B5CF6';
    const greeting = widgetConfig.greeting || `Hello! I'm ${assistant.friendly_name}. How can I help you today?`;
    const title = widgetConfig.title || assistant.friendly_name;

    // Generate embed codes based on bot_type
    let embedCodes = {};

    if (assistant.bot_type === 'chat' || assistant.bot_type === 'both') {
      // Chat widget embed code
      embedCodes.chat = {
        script: `<!-- Aspire AI Chat Widget -->
<script
  src="${baseUrl}/widget/aspire-chat.js"
  data-assistant-id="${assistant.id}"
  data-api-url="${baseUrl}"
  data-primary-color="${primaryColor}"
  data-greeting="${greeting}"
  data-title="${title}"
  data-position="bottom-right"
  async>
</script>`,
        iframe: `<!-- Aspire AI Chat Widget (iframe) -->
<iframe
  src="${baseUrl}/widget/chat-frame.html?assistantId=${assistant.id}"
  style="position: fixed; bottom: 20px; right: 20px; width: 400px; height: 600px; border: none; z-index: 9999;"
  allow="microphone"
></iframe>`,
        npm: `// Install: npm install @aspire-ai/chat-widget
import { AspireChat } from '@aspire-ai/chat-widget';

const chat = new AspireChat({
  assistantId: '${assistant.id}',
  apiUrl: '${baseUrl}',
  primaryColor: '${primaryColor}',
  greeting: '${greeting}',
  title: '${title}'
});

chat.init();`,
        react: `// React Component
import { useEffect } from 'react';

export function AspireChatWidget() {
  useEffect(() => {
    const script = document.createElement('script');
    script.src = '${baseUrl}/widget/aspire-chat.js';
    script.async = true;
    script.setAttribute('data-assistant-id', '${assistant.id}');
    script.setAttribute('data-api-url', '${baseUrl}');
    script.setAttribute('data-primary-color', '${primaryColor}');
    script.setAttribute('data-greeting', '${greeting}');
    script.setAttribute('data-title', '${title}');
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  return null;
}`,
        api: {
          endpoint: `${baseUrl}/api/chat`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: {
            assistantId: assistant.id,
            sessionId: 'optional-unique-session-id',
            message: 'User message here'
          },
          example: `curl -X POST ${baseUrl}/api/chat \\
  -H "Content-Type: application/json" \\
  -d '{
    "assistantId": "${assistant.id}",
    "message": "Hello, I need help"
  }'`
        }
      };
    }

    if (assistant.bot_type === 'voice') {
      // Voice assistant integration info
      embedCodes.voice = {
        phoneNumber: assistant.phone_number,
        twilioWebhook: `${baseUrl}/api/voice/incoming`,
        outboundApi: {
          endpoint: `${baseUrl}/api/voice/outbound`,
          method: 'POST',
          body: {
            assistantId: assistant.id,
            toNumber: '+1234567890'
          },
          example: `curl -X POST ${baseUrl}/api/voice/outbound \\
  -H "Content-Type: application/json" \\
  -d '{
    "assistantId": "${assistant.id}",
    "toNumber": "+1234567890"
  }'`
        },
        instructions: `To set up voice:
1. Configure your Twilio number (${assistant.phone_number || 'Not configured'}) webhooks:
   - Voice URL: ${baseUrl}/api/voice/incoming (POST)
   - Status Callback: ${baseUrl}/api/voice/status (POST)

2. For outbound calls, use the API endpoint above.

3. Call recordings will be stored and accessible via the dashboard.`
      };
    }

    // Include pilot URL if pilot mode is enabled
    const pilotUrl = assistant.pilot_enabled && assistant.pilot_slug
      ? `${baseUrl}/pilot/${assistant.pilot_slug}`
      : null;

    res.json({
      success: true,
      assistant: {
        id: assistant.id,
        name: assistant.friendly_name,
        type: assistant.bot_type,
        organization: assistant.organizations?.name,
        pilotEnabled: assistant.pilot_enabled,
        pilotSlug: assistant.pilot_slug
      },
      baseUrl, // Expose production base URL for frontend
      pilotUrl, // Full pilot URL ready to share
      embedCodes,
      widgetConfig: {
        primaryColor,
        greeting,
        title,
        position: 'bottom-right',
        showPoweredBy: true
      }
    });

  } catch (error) {
    logger.error('Embed code generation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate embed code'
    });
  }
});

// =============================================================================
// SYSTEM STATS
// =============================================================================

// GET /api/admin/stats - Get system-wide stats (for super admin)
router.get('/stats', async (req, res) => {
  try {
    // Get counts
    const [orgs, assistants, conversations] = await Promise.all([
      supabaseService.client.from('organizations').select('id', { count: 'exact' }),
      supabaseService.client.from('assistants').select('id', { count: 'exact' }),
      supabaseService.client.from('chat_conversations').select('id', { count: 'exact' })
    ]);

    res.json({
      success: true,
      stats: {
        organizations: orgs.count || 0,
        assistants: assistants.count || 0,
        conversations: conversations.count || 0,
        thisMonthInteractions: 0, // TODO: Calculate from sessions
        thisMonthCost: 0 // TODO: Sum costs from conversations
      }
    });
  } catch (error) {
    logger.error('Admin stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// =============================================================================
// SERVICE REQUESTS
// =============================================================================

// POST /api/admin/service-request - Submit a service request (for org users to contact Aspire)
router.post('/service-request', async (req, res) => {
  try {
    const { subject, message, requestType, urgency, organizationId, organizationName, userName, userEmail } = req.body;

    // Validation
    if (!subject || !message) {
      return res.status(400).json({
        success: false,
        error: 'Subject and message are required'
      });
    }

    // Build email content
    const urgencyColors = {
      high: '#dc2626',
      medium: '#f59e0b',
      low: '#22c55e'
    };

    const requestTypeLabels = {
      general: 'General Inquiry',
      technical: 'Technical Support',
      billing: 'Billing Question',
      feature: 'Feature Request',
      bug: 'Bug Report',
      other: 'Other'
    };

    const urgencyColor = urgencyColors[urgency] || urgencyColors.medium;
    const requestLabel = requestTypeLabels[requestType] || 'Service Request';
    const referenceId = `SR-${Date.now().toString(36).toUpperCase()}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #8B5CF6, #6366F1); padding: 20px; border-radius: 8px 8px 0 0; }
          .header h1 { color: white; margin: 0; font-size: 20px; }
          .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; }
          .field { margin-bottom: 12px; }
          .label { font-weight: 600; color: #6b7280; font-size: 12px; text-transform: uppercase; }
          .value { color: #111827; margin-top: 4px; }
          .urgency { display: inline-block; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; color: white; }
          .details-box { background: white; padding: 16px; border-radius: 8px; border: 1px solid #e5e7eb; margin-top: 16px; }
          .footer { padding: 16px 20px; background: #f3f4f6; border-radius: 0 0 8px 8px; font-size: 12px; color: #6b7280; border: 1px solid #e5e7eb; border-top: none; }
          .reference { font-family: monospace; font-size: 14px; font-weight: 600; color: #8B5CF6; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Service Request - ${requestLabel}</h1>
          </div>
          <div class="content">
            <div class="field">
              <div class="label">Reference</div>
              <div class="value reference">${referenceId}</div>
            </div>

            <div class="field">
              <div class="label">Urgency</div>
              <div class="value">
                <span class="urgency" style="background-color: ${urgencyColor}">
                  ${(urgency || 'medium').toUpperCase()}
                </span>
              </div>
            </div>

            <div class="field">
              <div class="label">Subject</div>
              <div class="value">${escapeHtml(subject)}</div>
            </div>

            ${organizationName ? `
            <div class="field">
              <div class="label">Organization</div>
              <div class="value">${escapeHtml(organizationName)}</div>
            </div>
            ` : ''}

            ${userName ? `
            <div class="field">
              <div class="label">Submitted By</div>
              <div class="value">${escapeHtml(userName)}</div>
            </div>
            ` : ''}

            ${userEmail ? `
            <div class="field">
              <div class="label">Contact Email</div>
              <div class="value"><a href="mailto:${userEmail}">${escapeHtml(userEmail)}</a></div>
            </div>
            ` : ''}

            <div class="details-box">
              <div class="label">Message</div>
              <div class="value" style="white-space: pre-wrap; margin-top: 8px;">${escapeHtml(message)}</div>
            </div>
          </div>
          <div class="footer">
            <p style="margin: 0;">
              Organization ID: ${organizationId || 'N/A'}
            </p>
            <p style="margin: 8px 0 0 0;">
              Submitted via <a href="https://portal.aspireexecutive.ai" style="color: #8B5CF6;">Aspire Portal</a>
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Send email to Aspire support
    const aspireEmail = process.env.ASPIRE_SUPPORT_EMAIL || process.env.NOTIFICATION_EMAIL || 'support@aspireexecutive.ai';

    const result = await emailService.sendEmail({
      to: aspireEmail,
      subject: `[${(urgency || 'MEDIUM').toUpperCase()}] Service Request: ${subject}`,
      html
    });

    if (result.skipped) {
      logger.warn('Service request email skipped:', result.reason);
      return res.json({
        success: true,
        message: 'Service request received but email not sent (email service not configured)',
        referenceId,
        emailSkipped: true
      });
    }

    // Log to audit
    try {
      if (organizationId) {
        await supabaseService.client.from('audit_logs').insert({
          org_id: organizationId,
          action: 'service_request_submitted',
          details: JSON.stringify({
            referenceId,
            subject,
            requestType,
            urgency,
            userName,
            userEmail
          }),
          created_at: new Date().toISOString()
        });
      }
    } catch (auditError) {
      logger.warn('Failed to create audit log:', auditError.message);
    }

    logger.info('Service request submitted', { referenceId, subject, organizationId });

    return res.json({
      success: true,
      message: 'Service request submitted successfully. Our team will respond shortly.',
      referenceId
    });

  } catch (error) {
    logger.error('Service request error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit service request'
    });
  }
});

// Helper function to escape HTML
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default router;
