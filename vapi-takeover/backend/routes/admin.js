// routes/admin.js - Admin API endpoints for self-service management
import express from 'express';
import multer from 'multer';
import supabaseService from '../services/supabase-service.js';
import { processKnowledgeBase } from '../services/kb-processor.js';
import { validateTwilioNumber } from '../services/twilio-validator.js';
import logger from '../services/logger.js';

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
    const { name, slug, monthly_interaction_limit, price_per_interaction, default_rubric } = req.body;

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
        monthly_interaction_limit: monthly_interaction_limit || 1000,
        price_per_interaction: price_per_interaction || 0.50,
        default_rubric: default_rubric || null
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

    // Validation
    if (!org_id || !friendly_name || !bot_type || !prompt) {
      return res.status(400).json({
        success: false,
        error: 'org_id, friendly_name, bot_type, and prompt are required'
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

    // Create assistant
    const { data, error } = await supabaseService.client
      .from('assistants')
      .insert({
        org_id,
        friendly_name,
        bot_type,
        phone_number: bot_type === 'voice' ? phone_number : null,
        elevenlabs_voice_id: bot_type === 'voice' ? (elevenlabs_voice_id || process.env.ELEVENLABS_VOICE_DEFAULT) : null,
        prompt,
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
    const { org_id, assistant_id } = req.query;

    let query = supabaseService.client
      .from('knowledge_chunks')
      .select('id, source, chunk_text, created_at')
      .order('created_at', { ascending: false });

    if (org_id) {
      query = query.eq('org_id', org_id);
    }

    if (assistant_id) {
      query = query.eq('assistant_id', assistant_id);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({
      success: true,
      chunks: data
    });

  } catch (error) {
    logger.error('Knowledge base list error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch knowledge base'
    });
  }
});

// =============================================================================
// TWILIO VALIDATION
// =============================================================================

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

// =============================================================================
// STATS & MONITORING
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

export default router;
