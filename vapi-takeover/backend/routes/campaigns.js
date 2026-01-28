// routes/campaigns.js - Outbound Calling Campaign Management
import express from 'express';
import multer from 'multer';
import csv from 'csv-parser';
import { Readable } from 'stream';
import twilio from 'twilio';
import supabaseService from '../services/supabase-service.js';
import logger from '../services/logger.js';

const router = express.Router();

// Configure multer for CSV uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  }
});

// =============================================================================
// CAMPAIGN CRUD
// =============================================================================

// POST /api/campaigns - Create new campaign
router.post('/', async (req, res) => {
  try {
    const {
      org_id,
      name,
      description,
      assistant_id,
      start_date,
      end_date,
      call_hours_start,
      call_hours_end,
      timezone,
      max_concurrent_calls,
      calls_per_minute
    } = req.body;

    // Validation
    if (!org_id || !name || !assistant_id) {
      return res.status(400).json({
        success: false,
        error: 'org_id, name, and assistant_id are required'
      });
    }

    // Verify assistant exists and belongs to org
    const assistant = await supabaseService.getAssistant(assistant_id);
    if (!assistant || assistant.org_id !== org_id) {
      return res.status(400).json({
        success: false,
        error: 'Invalid assistant or assistant does not belong to organization'
      });
    }

    // Verify assistant is voice type
    if (assistant.bot_type !== 'voice') {
      return res.status(400).json({
        success: false,
        error: 'Assistant must be a voice bot for outbound campaigns'
      });
    }

    // Create campaign
    const { data, error } = await supabaseService.client
      .from('outbound_campaigns')
      .insert({
        org_id,
        name,
        description,
        assistant_id,
        status: 'draft',
        start_date,
        end_date,
        call_hours_start: call_hours_start || '09:00:00',
        call_hours_end: call_hours_end || '17:00:00',
        timezone: timezone || 'Australia/Brisbane',
        max_concurrent_calls: max_concurrent_calls || 5,
        calls_per_minute: calls_per_minute || 10
      })
      .select()
      .single();

    if (error) {
      logger.error('Campaign creation error:', error);
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    logger.info('Campaign created:', { id: data.id, name: data.name });

    res.json({
      success: true,
      campaign: data
    });

  } catch (error) {
    logger.error('Campaign creation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create campaign'
    });
  }
});

// GET /api/campaigns - List campaigns
router.get('/', async (req, res) => {
  try {
    const { org_id, status } = req.query;

    let query = supabaseService.client
      .from('outbound_campaigns')
      .select('*')
      .order('created_at', { ascending: false });

    if (org_id) {
      query = query.eq('org_id', org_id);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({
      success: true,
      campaigns: data
    });

  } catch (error) {
    logger.error('Campaign list error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch campaigns'
    });
  }
});

// GET /api/campaigns/:id - Get campaign details
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseService.client
      .from('outbound_campaigns')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found'
      });
    }

    res.json({
      success: true,
      campaign: data
    });

  } catch (error) {
    logger.error('Campaign fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch campaign'
    });
  }
});

// PATCH /api/campaigns/:id - Update campaign
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Don't allow changing org_id or created_by
    delete updates.org_id;
    delete updates.created_by;
    delete updates.created_at;

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabaseService.client
      .from('outbound_campaigns')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    logger.info('Campaign updated:', { id });

    res.json({
      success: true,
      campaign: data
    });

  } catch (error) {
    logger.error('Campaign update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update campaign'
    });
  }
});

// DELETE /api/campaigns/:id - Delete campaign
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if campaign has started
    const { data: campaign } = await supabaseService.client
      .from('outbound_campaigns')
      .select('status')
      .eq('id', id)
      .single();

    if (campaign?.status === 'active') {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete active campaign. Pause or complete it first.'
      });
    }

    const { error } = await supabaseService.client
      .from('outbound_campaigns')
      .delete()
      .eq('id', id);

    if (error) throw error;

    logger.info('Campaign deleted:', { id });

    res.json({
      success: true,
      message: 'Campaign deleted successfully'
    });

  } catch (error) {
    logger.error('Campaign deletion error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete campaign'
    });
  }
});

// =============================================================================
// CONTACT MANAGEMENT
// =============================================================================

// POST /api/campaigns/:id/contacts/upload - Upload CSV contacts
router.post('/:id/contacts/upload', upload.single('file'), async (req, res) => {
  try {
    const { id } = req.params;
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        success: false,
        error: 'No CSV file uploaded'
      });
    }

    logger.info('Processing CSV upload:', {
      campaignId: id,
      filename: file.originalname,
      size: file.size
    });

    // Parse CSV - strip BOM and normalize
    const contacts = [];
    let csvContent = file.buffer.toString('utf8');
    // Remove BOM if present (Excel often adds this)
    if (csvContent.charCodeAt(0) === 0xFEFF) {
      csvContent = csvContent.slice(1);
    }
    // Also handle UTF-8 BOM bytes
    if (csvContent.startsWith('\uFEFF')) {
      csvContent = csvContent.slice(1);
    }

    logger.info('CSV content preview:', {
      first100chars: csvContent.substring(0, 100),
      length: csvContent.length
    });

    const stream = Readable.from(csvContent);

    let headerLogged = false;
    await new Promise((resolve, reject) => {
      stream
        .pipe(csv({
          mapHeaders: ({ header }) => header.trim().toLowerCase().replace(/\s+/g, '_')
        }))
        .on('data', (row) => {
          // Log headers on first row
          if (!headerLogged) {
            logger.info('CSV columns found:', { columns: Object.keys(row) });
            headerLogged = true;
          }

          // Expected columns: phone_number, first_name, last_name, email, ...
          // Store extra columns in custom_fields
          const { phone_number, first_name, last_name, email, ...customFields } = row;

          if (phone_number) {
            // Normalize phone number - add + prefix if missing
            let normalizedPhone = phone_number.trim();
            if (normalizedPhone && !normalizedPhone.startsWith('+')) {
              normalizedPhone = '+' + normalizedPhone;
            }

            contacts.push({
              campaign_id: id,
              phone_number: normalizedPhone,
              first_name: first_name?.trim() || null,
              last_name: last_name?.trim() || null,
              email: email?.trim() || null,
              custom_fields: Object.keys(customFields).length > 0 ? customFields : null,
              status: 'pending',
              attempts: 0,
              max_attempts: 3
            });
          }
        })
        .on('end', resolve)
        .on('error', reject);
    });

    if (contacts.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid contacts found in CSV. Ensure phone_number column exists.'
      });
    }

    // Insert contacts in batch
    const { data, error } = await supabaseService.client
      .from('campaign_contacts')
      .insert(contacts)
      .select();

    if (error) {
      logger.error('Contact upload error:', error);
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    // Update campaign total_contacts
    await supabaseService.client
      .from('outbound_campaigns')
      .update({
        total_contacts: contacts.length,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    logger.info('Contacts uploaded:', {
      campaignId: id,
      count: contacts.length
    });

    res.json({
      success: true,
      message: `Successfully uploaded ${contacts.length} contacts`,
      contacts_uploaded: contacts.length
    });

  } catch (error) {
    logger.error('CSV upload error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to upload contacts'
    });
  }
});

// GET /api/campaigns/:id/contacts - List campaign contacts
router.get('/:id/contacts', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, limit = 100, offset = 0 } = req.query;

    let query = supabaseService.client
      .from('campaign_contacts')
      .select('*')
      .eq('campaign_id', id)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    res.json({
      success: true,
      contacts: data,
      total: count
    });

  } catch (error) {
    logger.error('Contacts list error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch contacts'
    });
  }
});

// =============================================================================
// CAMPAIGN EXECUTION
// =============================================================================

// POST /api/campaigns/:id/start - Start campaign
router.post('/:id/start', async (req, res) => {
  try {
    const { id } = req.params;

    // Get campaign details
    const { data: campaign, error: campaignError } = await supabaseService.client
      .from('outbound_campaigns')
      .select('*, assistants(*)')
      .eq('id', id)
      .single();

    if (campaignError) throw campaignError;

    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found'
      });
    }

    if (campaign.total_contacts === 0) {
      return res.status(400).json({
        success: false,
        error: 'Campaign has no contacts. Upload contacts first.'
      });
    }

    // Update campaign status
    await supabaseService.client
      .from('outbound_campaigns')
      .update({
        status: 'active',
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    logger.info('Campaign started:', { id, name: campaign.name });

    res.json({
      success: true,
      message: 'Campaign started successfully',
      campaign_id: id
    });

  } catch (error) {
    logger.error('Campaign start error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start campaign'
    });
  }
});

// POST /api/campaigns/:id/pause - Pause campaign
router.post('/:id/pause', async (req, res) => {
  try {
    const { id } = req.params;

    await supabaseService.client
      .from('outbound_campaigns')
      .update({
        status: 'paused',
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    logger.info('Campaign paused:', { id });

    res.json({
      success: true,
      message: 'Campaign paused successfully'
    });

  } catch (error) {
    logger.error('Campaign pause error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to pause campaign'
    });
  }
});

// GET /api/campaigns/:id/stats - Get campaign statistics
router.get('/:id/stats', async (req, res) => {
  try {
    const { id } = req.params;

    // Get campaign
    const { data: campaign } = await supabaseService.client
      .from('outbound_campaigns')
      .select('*')
      .eq('id', id)
      .single();

    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found'
      });
    }

    // Get contact status breakdown
    const { data: statusBreakdown } = await supabaseService.client
      .from('campaign_contacts')
      .select('status')
      .eq('campaign_id', id);

    const stats = {
      total_contacts: campaign.total_contacts,
      contacted: campaign.contacted,
      successful: campaign.successful,
      failed: campaign.failed,
      pending: statusBreakdown?.filter(c => c.status === 'pending').length || 0,
      completed: statusBreakdown?.filter(c => c.status === 'completed').length || 0,
      no_answer: statusBreakdown?.filter(c => c.status === 'no_answer').length || 0,
      busy: statusBreakdown?.filter(c => c.status === 'busy').length || 0,
      progress_percentage: campaign.total_contacts > 0 ?
        Math.round((campaign.contacted / campaign.total_contacts) * 100) : 0
    };

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    logger.error('Campaign stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch campaign stats'
    });
  }
});

export default router;
