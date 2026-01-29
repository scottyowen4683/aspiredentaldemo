// routes/crm.js - CRM Customer Layer Endpoints
// Handles customers, activities, follow-ups, notes, and email campaigns

import express from 'express';
import supabaseService from '../services/supabase-service.js';
import emailService from '../services/email-service.js';
import logger from '../services/logger.js';

const router = express.Router();

// =============================================================================
// CUSTOMERS - CRUD Operations
// =============================================================================

// GET /api/crm/customers/:org_id - Get all customers for an organization
router.get('/customers/:org_id', async (req, res) => {
  try {
    const { org_id } = req.params;
    const { status, stage, state, search, limit = 50, offset = 0, sort_by = 'created_at', sort_dir = 'desc' } = req.query;

    let query = supabaseService.client
      .from('crm_customers')
      .select('*, assigned_user:users!crm_customers_assigned_to_fkey(id, full_name, email)')
      .order(sort_by, { ascending: sort_dir === 'asc' });

    // Filter by org (unless "all" for super admin)
    if (org_id !== 'all') {
      query = query.eq('org_id', org_id);
    }

    // Apply filters
    if (status) query = query.eq('status', status);
    if (stage) query = query.eq('stage', stage);
    if (state) query = query.eq('australian_state', state);

    // Text search
    if (search) {
      query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,company_name.ilike.%${search}%`);
    }

    // Pagination
    query = query.range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    // Get total count for pagination
    let countQuery = supabaseService.client
      .from('crm_customers')
      .select('*', { count: 'exact', head: true });

    if (org_id !== 'all') {
      countQuery = countQuery.eq('org_id', org_id);
    }
    if (status) countQuery = countQuery.eq('status', status);
    if (stage) countQuery = countQuery.eq('stage', stage);
    if (state) countQuery = countQuery.eq('australian_state', state);
    if (search) {
      countQuery = countQuery.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,company_name.ilike.%${search}%`);
    }

    const { count: totalCount } = await countQuery;

    res.json({
      success: true,
      customers: data || [],
      total: totalCount || 0,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    logger.error('Error fetching customers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch customers'
    });
  }
});

// GET /api/crm/customers/:org_id/:customer_id - Get single customer with details
router.get('/customers/:org_id/:customer_id', async (req, res) => {
  try {
    const { customer_id } = req.params;

    // Get customer
    const { data: customer, error } = await supabaseService.client
      .from('crm_customers')
      .select('*, assigned_user:users!crm_customers_assigned_to_fkey(id, full_name, email)')
      .eq('id', customer_id)
      .single();

    if (error) throw error;
    if (!customer) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }

    // Get recent activities
    const { data: activities } = await supabaseService.client
      .from('crm_activities')
      .select('*, created_by_user:users!crm_activities_created_by_fkey(full_name)')
      .eq('customer_id', customer_id)
      .order('activity_date', { ascending: false })
      .limit(10);

    // Get pending follow-ups
    const { data: followups } = await supabaseService.client
      .from('crm_followups')
      .select('*, assigned_user:users!crm_followups_assigned_to_fkey(full_name)')
      .eq('customer_id', customer_id)
      .eq('status', 'pending')
      .order('due_date', { ascending: true });

    // Get notes
    const { data: notes } = await supabaseService.client
      .from('crm_notes')
      .select('*, created_by_user:users!crm_notes_created_by_fkey(full_name)')
      .eq('customer_id', customer_id)
      .order('created_at', { ascending: false })
      .limit(20);

    res.json({
      success: true,
      customer,
      activities: activities || [],
      followups: followups || [],
      notes: notes || []
    });

  } catch (error) {
    logger.error('Error fetching customer details:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch customer details'
    });
  }
});

// POST /api/crm/customers/:org_id - Create new customer
router.post('/customers/:org_id', async (req, res) => {
  try {
    const { org_id } = req.params;
    const customerData = req.body;

    const { data, error } = await supabaseService.client
      .from('crm_customers')
      .insert({
        org_id,
        ...customerData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    // Log activity for new customer
    await supabaseService.client
      .from('crm_activities')
      .insert({
        org_id,
        customer_id: data.id,
        activity_type: 'note',
        subject: 'Customer created',
        description: `New customer added to CRM`,
        created_by: customerData.created_by
      });

    logger.info('Customer created:', { id: data.id, org_id });

    res.json({
      success: true,
      customer: data
    });

  } catch (error) {
    logger.error('Error creating customer:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create customer'
    });
  }
});

// PUT /api/crm/customers/:customer_id - Update customer
router.put('/customers/:customer_id', async (req, res) => {
  try {
    const { customer_id } = req.params;
    const updates = req.body;

    // Remove fields that shouldn't be updated directly
    delete updates.id;
    delete updates.org_id;
    delete updates.created_at;

    const { data, error } = await supabaseService.client
      .from('crm_customers')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', customer_id)
      .select()
      .single();

    if (error) throw error;

    logger.info('Customer updated:', { id: customer_id });

    res.json({
      success: true,
      customer: data
    });

  } catch (error) {
    logger.error('Error updating customer:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update customer'
    });
  }
});

// DELETE /api/crm/customers/:customer_id - Delete customer
router.delete('/customers/:customer_id', async (req, res) => {
  try {
    const { customer_id } = req.params;

    const { error } = await supabaseService.client
      .from('crm_customers')
      .delete()
      .eq('id', customer_id);

    if (error) throw error;

    logger.info('Customer deleted:', { id: customer_id });

    res.json({
      success: true,
      message: 'Customer deleted successfully'
    });

  } catch (error) {
    logger.error('Error deleting customer:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete customer'
    });
  }
});

// =============================================================================
// CUSTOMER STATUS/STAGE UPDATES
// =============================================================================

// PUT /api/crm/customers/:customer_id/status - Update customer status
router.put('/customers/:customer_id/status', async (req, res) => {
  try {
    const { customer_id } = req.params;
    const { status, user_id } = req.body;

    // Get current customer to log the change
    const { data: current } = await supabaseService.client
      .from('crm_customers')
      .select('status, org_id')
      .eq('id', customer_id)
      .single();

    const { data, error } = await supabaseService.client
      .from('crm_customers')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', customer_id)
      .select()
      .single();

    if (error) throw error;

    // Log activity
    await supabaseService.client
      .from('crm_activities')
      .insert({
        org_id: current.org_id,
        customer_id,
        activity_type: 'note',
        subject: 'Status changed',
        description: `Status changed from ${current.status} to ${status}`,
        created_by: user_id
      });

    res.json({ success: true, customer: data });

  } catch (error) {
    logger.error('Error updating customer status:', error);
    res.status(500).json({ success: false, error: 'Failed to update status' });
  }
});

// PUT /api/crm/customers/:customer_id/stage - Update customer stage (pipeline)
router.put('/customers/:customer_id/stage', async (req, res) => {
  try {
    const { customer_id } = req.params;
    const { stage, user_id } = req.body;

    // Get current customer
    const { data: current } = await supabaseService.client
      .from('crm_customers')
      .select('stage, org_id')
      .eq('id', customer_id)
      .single();

    const { data, error } = await supabaseService.client
      .from('crm_customers')
      .update({ stage, updated_at: new Date().toISOString() })
      .eq('id', customer_id)
      .select()
      .single();

    if (error) throw error;

    // Log activity
    await supabaseService.client
      .from('crm_activities')
      .insert({
        org_id: current.org_id,
        customer_id,
        activity_type: 'note',
        subject: 'Pipeline stage changed',
        description: `Moved from ${current.stage} to ${stage}`,
        created_by: user_id
      });

    res.json({ success: true, customer: data });

  } catch (error) {
    logger.error('Error updating customer stage:', error);
    res.status(500).json({ success: false, error: 'Failed to update stage' });
  }
});

// =============================================================================
// ACTIVITIES
// =============================================================================

// GET /api/crm/activities/:customer_id - Get activities for a customer
router.get('/activities/:customer_id', async (req, res) => {
  try {
    const { customer_id } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const { data, error } = await supabaseService.client
      .from('crm_activities')
      .select('*, created_by_user:users!crm_activities_created_by_fkey(full_name)')
      .eq('customer_id', customer_id)
      .order('activity_date', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (error) throw error;

    res.json({
      success: true,
      activities: data || []
    });

  } catch (error) {
    logger.error('Error fetching activities:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch activities' });
  }
});

// POST /api/crm/activities - Create activity
router.post('/activities', async (req, res) => {
  try {
    const activityData = req.body;

    const { data, error } = await supabaseService.client
      .from('crm_activities')
      .insert({
        ...activityData,
        activity_date: activityData.activity_date || new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    // Update customer's last_contacted_at
    await supabaseService.client
      .from('crm_customers')
      .update({
        last_contacted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', activityData.customer_id);

    logger.info('Activity created:', { id: data.id, type: data.activity_type });

    res.json({ success: true, activity: data });

  } catch (error) {
    logger.error('Error creating activity:', error);
    res.status(500).json({ success: false, error: 'Failed to create activity' });
  }
});

// DELETE /api/crm/activities/:activity_id - Delete activity
router.delete('/activities/:activity_id', async (req, res) => {
  try {
    const { activity_id } = req.params;

    const { error } = await supabaseService.client
      .from('crm_activities')
      .delete()
      .eq('id', activity_id);

    if (error) throw error;

    res.json({ success: true, message: 'Activity deleted' });

  } catch (error) {
    logger.error('Error deleting activity:', error);
    res.status(500).json({ success: false, error: 'Failed to delete activity' });
  }
});

// =============================================================================
// FOLLOW-UPS
// =============================================================================

// GET /api/crm/followups/:org_id - Get all follow-ups for an org
router.get('/followups/:org_id', async (req, res) => {
  try {
    const { org_id } = req.params;
    const { status = 'pending', assigned_to, due_before, due_after } = req.query;

    let query = supabaseService.client
      .from('crm_followups')
      .select('*, customer:crm_customers(id, first_name, last_name, company_name, email), assigned_user:users!crm_followups_assigned_to_fkey(full_name)')
      .order('due_date', { ascending: true });

    if (org_id !== 'all') {
      query = query.eq('org_id', org_id);
    }

    if (status) query = query.eq('status', status);
    if (assigned_to) query = query.eq('assigned_to', assigned_to);
    if (due_before) query = query.lte('due_date', due_before);
    if (due_after) query = query.gte('due_date', due_after);

    const { data, error } = await query;

    if (error) throw error;

    res.json({
      success: true,
      followups: data || []
    });

  } catch (error) {
    logger.error('Error fetching follow-ups:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch follow-ups' });
  }
});

// POST /api/crm/followups - Create follow-up
router.post('/followups', async (req, res) => {
  try {
    const followupData = req.body;

    const { data, error } = await supabaseService.client
      .from('crm_followups')
      .insert(followupData)
      .select()
      .single();

    if (error) throw error;

    // Update customer's next_followup_at
    await supabaseService.client
      .from('crm_customers')
      .update({
        next_followup_at: followupData.due_date,
        updated_at: new Date().toISOString()
      })
      .eq('id', followupData.customer_id);

    logger.info('Follow-up created:', { id: data.id });

    res.json({ success: true, followup: data });

  } catch (error) {
    logger.error('Error creating follow-up:', error);
    res.status(500).json({ success: false, error: 'Failed to create follow-up' });
  }
});

// PUT /api/crm/followups/:followup_id - Update follow-up
router.put('/followups/:followup_id', async (req, res) => {
  try {
    const { followup_id } = req.params;
    const updates = req.body;

    delete updates.id;
    delete updates.org_id;

    const { data, error } = await supabaseService.client
      .from('crm_followups')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', followup_id)
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, followup: data });

  } catch (error) {
    logger.error('Error updating follow-up:', error);
    res.status(500).json({ success: false, error: 'Failed to update follow-up' });
  }
});

// PUT /api/crm/followups/:followup_id/complete - Mark follow-up as complete
router.put('/followups/:followup_id/complete', async (req, res) => {
  try {
    const { followup_id } = req.params;
    const { completed_by, completion_notes } = req.body;

    const { data, error } = await supabaseService.client
      .from('crm_followups')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        completed_by,
        completion_notes,
        updated_at: new Date().toISOString()
      })
      .eq('id', followup_id)
      .select('*, customer:crm_customers(id, org_id)')
      .single();

    if (error) throw error;

    // Log activity
    await supabaseService.client
      .from('crm_activities')
      .insert({
        org_id: data.customer.org_id,
        customer_id: data.customer_id,
        activity_type: 'task',
        subject: 'Follow-up completed',
        description: data.title + (completion_notes ? ` - ${completion_notes}` : ''),
        created_by: completed_by
      });

    res.json({ success: true, followup: data });

  } catch (error) {
    logger.error('Error completing follow-up:', error);
    res.status(500).json({ success: false, error: 'Failed to complete follow-up' });
  }
});

// DELETE /api/crm/followups/:followup_id - Delete follow-up
router.delete('/followups/:followup_id', async (req, res) => {
  try {
    const { followup_id } = req.params;

    const { error } = await supabaseService.client
      .from('crm_followups')
      .delete()
      .eq('id', followup_id);

    if (error) throw error;

    res.json({ success: true, message: 'Follow-up deleted' });

  } catch (error) {
    logger.error('Error deleting follow-up:', error);
    res.status(500).json({ success: false, error: 'Failed to delete follow-up' });
  }
});

// =============================================================================
// NOTES
// =============================================================================

// POST /api/crm/notes - Create note
router.post('/notes', async (req, res) => {
  try {
    const noteData = req.body;

    const { data, error } = await supabaseService.client
      .from('crm_notes')
      .insert(noteData)
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, note: data });

  } catch (error) {
    logger.error('Error creating note:', error);
    res.status(500).json({ success: false, error: 'Failed to create note' });
  }
});

// PUT /api/crm/notes/:note_id - Update note
router.put('/notes/:note_id', async (req, res) => {
  try {
    const { note_id } = req.params;
    const { content, is_pinned } = req.body;

    const { data, error } = await supabaseService.client
      .from('crm_notes')
      .update({ content, is_pinned, updated_at: new Date().toISOString() })
      .eq('id', note_id)
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, note: data });

  } catch (error) {
    logger.error('Error updating note:', error);
    res.status(500).json({ success: false, error: 'Failed to update note' });
  }
});

// DELETE /api/crm/notes/:note_id - Delete note
router.delete('/notes/:note_id', async (req, res) => {
  try {
    const { note_id } = req.params;

    const { error } = await supabaseService.client
      .from('crm_notes')
      .delete()
      .eq('id', note_id);

    if (error) throw error;

    res.json({ success: true, message: 'Note deleted' });

  } catch (error) {
    logger.error('Error deleting note:', error);
    res.status(500).json({ success: false, error: 'Failed to delete note' });
  }
});

// =============================================================================
// EMAIL TEMPLATES
// =============================================================================

// GET /api/crm/templates/:org_id - Get email templates
router.get('/templates/:org_id', async (req, res) => {
  try {
    const { org_id } = req.params;

    let query = supabaseService.client
      .from('crm_email_templates')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (org_id !== 'all') {
      query = query.eq('org_id', org_id);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({ success: true, templates: data || [] });

  } catch (error) {
    logger.error('Error fetching email templates:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch templates' });
  }
});

// POST /api/crm/templates - Create email template
router.post('/templates', async (req, res) => {
  try {
    const templateData = req.body;

    const { data, error } = await supabaseService.client
      .from('crm_email_templates')
      .insert(templateData)
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, template: data });

  } catch (error) {
    logger.error('Error creating email template:', error);
    res.status(500).json({ success: false, error: 'Failed to create template' });
  }
});

// PUT /api/crm/templates/:template_id - Update email template
router.put('/templates/:template_id', async (req, res) => {
  try {
    const { template_id } = req.params;
    const updates = req.body;

    delete updates.id;
    delete updates.org_id;

    const { data, error } = await supabaseService.client
      .from('crm_email_templates')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', template_id)
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, template: data });

  } catch (error) {
    logger.error('Error updating email template:', error);
    res.status(500).json({ success: false, error: 'Failed to update template' });
  }
});

// DELETE /api/crm/templates/:template_id - Delete email template
router.delete('/templates/:template_id', async (req, res) => {
  try {
    const { template_id } = req.params;

    const { error } = await supabaseService.client
      .from('crm_email_templates')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', template_id);

    if (error) throw error;

    res.json({ success: true, message: 'Template deleted' });

  } catch (error) {
    logger.error('Error deleting email template:', error);
    res.status(500).json({ success: false, error: 'Failed to delete template' });
  }
});

// =============================================================================
// EMAIL CAMPAIGNS
// =============================================================================

// GET /api/crm/campaigns/:org_id - Get all campaigns
router.get('/campaigns/:org_id', async (req, res) => {
  try {
    const { org_id } = req.params;
    const { status } = req.query;

    let query = supabaseService.client
      .from('crm_campaigns')
      .select('*, template:crm_email_templates(name)')
      .order('created_at', { ascending: false });

    if (org_id !== 'all') {
      query = query.eq('org_id', org_id);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({ success: true, campaigns: data || [] });

  } catch (error) {
    logger.error('Error fetching campaigns:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch campaigns' });
  }
});

// GET /api/crm/campaigns/:org_id/:campaign_id - Get campaign details
router.get('/campaigns/:org_id/:campaign_id', async (req, res) => {
  try {
    const { campaign_id } = req.params;

    const { data: campaign, error } = await supabaseService.client
      .from('crm_campaigns')
      .select('*')
      .eq('id', campaign_id)
      .single();

    if (error) throw error;

    // Get recipients with their status
    const { data: recipients } = await supabaseService.client
      .from('crm_campaign_recipients')
      .select('*, customer:crm_customers(id, first_name, last_name, email, company_name)')
      .eq('campaign_id', campaign_id)
      .order('created_at', { ascending: false });

    res.json({
      success: true,
      campaign,
      recipients: recipients || []
    });

  } catch (error) {
    logger.error('Error fetching campaign details:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch campaign' });
  }
});

// POST /api/crm/campaigns - Create campaign
router.post('/campaigns', async (req, res) => {
  try {
    const campaignData = req.body;

    const { data, error } = await supabaseService.client
      .from('crm_campaigns')
      .insert(campaignData)
      .select()
      .single();

    if (error) throw error;

    logger.info('Campaign created:', { id: data.id, name: data.name });

    res.json({ success: true, campaign: data });

  } catch (error) {
    logger.error('Error creating campaign:', error);
    res.status(500).json({ success: false, error: 'Failed to create campaign' });
  }
});

// PUT /api/crm/campaigns/:campaign_id - Update campaign
router.put('/campaigns/:campaign_id', async (req, res) => {
  try {
    const { campaign_id } = req.params;
    const updates = req.body;

    delete updates.id;
    delete updates.org_id;

    const { data, error } = await supabaseService.client
      .from('crm_campaigns')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', campaign_id)
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, campaign: data });

  } catch (error) {
    logger.error('Error updating campaign:', error);
    res.status(500).json({ success: false, error: 'Failed to update campaign' });
  }
});

// POST /api/crm/campaigns/:campaign_id/recipients - Add recipients to campaign
router.post('/campaigns/:campaign_id/recipients', async (req, res) => {
  try {
    const { campaign_id } = req.params;
    const { customer_ids, filter } = req.body;

    let customerIdsToAdd = customer_ids || [];

    // If filter provided, fetch matching customers
    if (filter && Object.keys(filter).length > 0) {
      let query = supabaseService.client
        .from('crm_customers')
        .select('id')
        .eq('email_opt_in', true);

      if (filter.org_id) query = query.eq('org_id', filter.org_id);
      if (filter.status) query = query.eq('status', filter.status);
      if (filter.stage) query = query.eq('stage', filter.stage);
      if (filter.tags && filter.tags.length > 0) {
        query = query.overlaps('tags', filter.tags);
      }

      const { data: customers } = await query;
      customerIdsToAdd = customers?.map(c => c.id) || [];
    }

    if (customerIdsToAdd.length === 0) {
      return res.json({ success: true, added: 0, message: 'No customers to add' });
    }

    // Insert recipients (ignore duplicates)
    const recipients = customerIdsToAdd.map(customer_id => ({
      campaign_id,
      customer_id,
      status: 'pending'
    }));

    const { data, error } = await supabaseService.client
      .from('crm_campaign_recipients')
      .upsert(recipients, { onConflict: 'campaign_id,customer_id', ignoreDuplicates: true })
      .select();

    if (error) throw error;

    // Update campaign recipient count
    const { count } = await supabaseService.client
      .from('crm_campaign_recipients')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', campaign_id);

    await supabaseService.client
      .from('crm_campaigns')
      .update({ recipient_count: count })
      .eq('id', campaign_id);

    res.json({
      success: true,
      added: data?.length || 0,
      total: count
    });

  } catch (error) {
    logger.error('Error adding campaign recipients:', error);
    res.status(500).json({ success: false, error: 'Failed to add recipients' });
  }
});

// POST /api/crm/campaigns/:campaign_id/send - Send campaign
router.post('/campaigns/:campaign_id/send', async (req, res) => {
  try {
    const { campaign_id } = req.params;

    // Get campaign
    const { data: campaign, error: campaignError } = await supabaseService.client
      .from('crm_campaigns')
      .select('*')
      .eq('id', campaign_id)
      .single();

    if (campaignError) throw campaignError;

    if (campaign.status === 'sent' || campaign.status === 'sending') {
      return res.status(400).json({
        success: false,
        error: 'Campaign has already been sent or is sending'
      });
    }

    // Update status to sending
    await supabaseService.client
      .from('crm_campaigns')
      .update({
        status: 'sending',
        started_at: new Date().toISOString()
      })
      .eq('id', campaign_id);

    // Get pending recipients
    const { data: recipients } = await supabaseService.client
      .from('crm_campaign_recipients')
      .select('*, customer:crm_customers(id, first_name, last_name, email, company_name)')
      .eq('campaign_id', campaign_id)
      .eq('status', 'pending');

    let sent = 0;
    let failed = 0;

    // Send emails (process in batches)
    for (const recipient of recipients || []) {
      if (!recipient.customer?.email) {
        failed++;
        continue;
      }

      try {
        // Replace placeholders in content
        let htmlContent = campaign.html_content || '';
        let subject = campaign.subject || '';

        const placeholders = {
          first_name: recipient.customer.first_name || '',
          last_name: recipient.customer.last_name || '',
          company_name: recipient.customer.company_name || '',
          email: recipient.customer.email || ''
        };

        for (const [key, value] of Object.entries(placeholders)) {
          const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'gi');
          htmlContent = htmlContent.replace(regex, value);
          subject = subject.replace(regex, value);
        }

        // Send email via Brevo
        const result = await emailService.sendEmail({
          to: recipient.customer.email,
          subject,
          html: htmlContent
        });

        // Update recipient status
        await supabaseService.client
          .from('crm_campaign_recipients')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            message_id: result.messageId
          })
          .eq('id', recipient.id);

        sent++;

        // Log activity
        await supabaseService.client
          .from('crm_activities')
          .insert({
            org_id: campaign.org_id,
            customer_id: recipient.customer_id,
            activity_type: 'email',
            subject: `Campaign: ${campaign.name}`,
            description: `Email sent: ${subject}`,
            campaign_id: campaign_id
          });

      } catch (emailError) {
        logger.error('Failed to send campaign email:', emailError);

        await supabaseService.client
          .from('crm_campaign_recipients')
          .update({
            status: 'failed',
            error_message: emailError.message
          })
          .eq('id', recipient.id);

        failed++;
      }
    }

    // Update campaign stats
    await supabaseService.client
      .from('crm_campaigns')
      .update({
        status: 'sent',
        completed_at: new Date().toISOString(),
        total_sent: sent,
        total_bounced: failed
      })
      .eq('id', campaign_id);

    logger.info('Campaign sent:', { campaign_id, sent, failed });

    res.json({
      success: true,
      sent,
      failed,
      message: `Campaign sent to ${sent} recipients (${failed} failed)`
    });

  } catch (error) {
    logger.error('Error sending campaign:', error);

    // Reset status on error
    await supabaseService.client
      .from('crm_campaigns')
      .update({ status: 'draft' })
      .eq('id', req.params.campaign_id);

    res.status(500).json({ success: false, error: 'Failed to send campaign' });
  }
});

// DELETE /api/crm/campaigns/:campaign_id - Delete campaign
router.delete('/campaigns/:campaign_id', async (req, res) => {
  try {
    const { campaign_id } = req.params;

    const { error } = await supabaseService.client
      .from('crm_campaigns')
      .delete()
      .eq('id', campaign_id);

    if (error) throw error;

    res.json({ success: true, message: 'Campaign deleted' });

  } catch (error) {
    logger.error('Error deleting campaign:', error);
    res.status(500).json({ success: false, error: 'Failed to delete campaign' });
  }
});

// =============================================================================
// SEND SINGLE EMAIL TO CUSTOMER
// =============================================================================

// POST /api/crm/customers/:customer_id/email - Send single email to customer
router.post('/customers/:customer_id/email', async (req, res) => {
  try {
    const { customer_id } = req.params;
    const { subject, html_content, user_id } = req.body;

    // Get customer
    const { data: customer, error: customerError } = await supabaseService.client
      .from('crm_customers')
      .select('*')
      .eq('id', customer_id)
      .single();

    if (customerError || !customer) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }

    if (!customer.email) {
      return res.status(400).json({ success: false, error: 'Customer has no email address' });
    }

    // Replace placeholders
    let finalContent = html_content || '';
    let finalSubject = subject || '';

    const placeholders = {
      first_name: customer.first_name || '',
      last_name: customer.last_name || '',
      company_name: customer.company_name || '',
      email: customer.email || ''
    };

    for (const [key, value] of Object.entries(placeholders)) {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'gi');
      finalContent = finalContent.replace(regex, value);
      finalSubject = finalSubject.replace(regex, value);
    }

    // Send email
    const result = await emailService.sendEmail({
      to: customer.email,
      subject: finalSubject,
      html: finalContent
    });

    // Log activity
    await supabaseService.client
      .from('crm_activities')
      .insert({
        org_id: customer.org_id,
        customer_id,
        activity_type: 'email',
        subject: `Email sent: ${finalSubject}`,
        description: 'Individual email sent to customer',
        created_by: user_id
      });

    // Update last contacted
    await supabaseService.client
      .from('crm_customers')
      .update({
        last_contacted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', customer_id);

    logger.info('Email sent to customer:', { customer_id, subject: finalSubject });

    res.json({
      success: true,
      message: 'Email sent successfully',
      messageId: result.messageId
    });

  } catch (error) {
    logger.error('Error sending email to customer:', error);
    res.status(500).json({ success: false, error: 'Failed to send email' });
  }
});

// =============================================================================
// DASHBOARD STATS
// =============================================================================

// GET /api/crm/stats/:org_id - Get CRM dashboard stats
router.get('/stats/:org_id', async (req, res) => {
  try {
    const { org_id } = req.params;

    const orgFilter = org_id !== 'all' ? { org_id } : {};

    // Total customers by status
    const { data: statusCounts } = await supabaseService.client
      .from('crm_customers')
      .select('status')
      .match(orgFilter);

    const customersByStatus = {};
    (statusCounts || []).forEach(c => {
      customersByStatus[c.status] = (customersByStatus[c.status] || 0) + 1;
    });

    // Pipeline by stage
    const { data: stageCounts } = await supabaseService.client
      .from('crm_customers')
      .select('stage, estimated_value')
      .match(orgFilter)
      .in('status', ['lead', 'prospect']);

    const pipelineByStage = {};
    let totalPipelineValue = 0;
    (stageCounts || []).forEach(c => {
      pipelineByStage[c.stage] = (pipelineByStage[c.stage] || 0) + 1;
      totalPipelineValue += parseFloat(c.estimated_value || 0);
    });

    // Pending follow-ups
    const { count: pendingFollowups } = await supabaseService.client
      .from('crm_followups')
      .select('*', { count: 'exact', head: true })
      .match(orgFilter)
      .eq('status', 'pending');

    // Overdue follow-ups
    const { count: overdueFollowups } = await supabaseService.client
      .from('crm_followups')
      .select('*', { count: 'exact', head: true })
      .match(orgFilter)
      .eq('status', 'pending')
      .lt('due_date', new Date().toISOString());

    // Recent activities (last 7 days)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const { count: recentActivities } = await supabaseService.client
      .from('crm_activities')
      .select('*', { count: 'exact', head: true })
      .match(orgFilter)
      .gte('activity_date', weekAgo.toISOString());

    // Campaign stats
    const { data: campaigns } = await supabaseService.client
      .from('crm_campaigns')
      .select('status, total_sent, total_opened, total_clicked')
      .match(orgFilter);

    const campaignStats = {
      total: campaigns?.length || 0,
      sent: campaigns?.filter(c => c.status === 'sent').length || 0,
      totalEmailsSent: campaigns?.reduce((sum, c) => sum + (c.total_sent || 0), 0) || 0,
      totalOpened: campaigns?.reduce((sum, c) => sum + (c.total_opened || 0), 0) || 0,
      totalClicked: campaigns?.reduce((sum, c) => sum + (c.total_clicked || 0), 0) || 0
    };

    res.json({
      success: true,
      stats: {
        totalCustomers: statusCounts?.length || 0,
        customersByStatus,
        pipelineByStage,
        totalPipelineValue,
        pendingFollowups: pendingFollowups || 0,
        overdueFollowups: overdueFollowups || 0,
        recentActivities: recentActivities || 0,
        campaigns: campaignStats
      }
    });

  } catch (error) {
    logger.error('Error fetching CRM stats:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
});

// =============================================================================
// CSV IMPORT - Import councils/customers from CSV
// =============================================================================

// Helper function to parse CSV
function parseCSV(csvText) {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };

  // Parse header - handle quoted values
  const parseRow = (line) => {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  };

  const headers = parseRow(lines[0]).map(h => h.toLowerCase().trim());
  const rows = lines.slice(1).map(line => {
    const values = parseRow(line);
    const row = {};
    headers.forEach((header, i) => {
      row[header] = values[i] || '';
    });
    return row;
  });

  return { headers, rows };
}

// Normalize Australian state codes
function normalizeState(state) {
  if (!state) return null;
  const s = state.toUpperCase().trim();
  const stateMap = {
    'QLD': 'QLD', 'QUEENSLAND': 'QLD',
    'NSW': 'NSW', 'NEW SOUTH WALES': 'NSW',
    'VIC': 'VIC', 'VICTORIA': 'VIC',
    'SA': 'SA', 'SOUTH AUSTRALIA': 'SA',
    'WA': 'WA', 'WESTERN AUSTRALIA': 'WA',
    'TAS': 'TAS', 'TASMANIA': 'TAS',
    'NT': 'NT', 'NORTHERN TERRITORY': 'NT',
    'ACT': 'ACT', 'AUSTRALIAN CAPITAL TERRITORY': 'ACT'
  };
  return stateMap[s] || s;
}

// Map common CSV column names to our fields
function mapCSVToCustomer(row, org_id, user_id) {
  // Flexible field mapping - try multiple possible column names
  const getValue = (...keys) => {
    for (const key of keys) {
      if (row[key] && row[key].trim()) return row[key].trim();
    }
    return null;
  };

  const councilName = getValue('council', 'council_name', 'council name', 'name', 'organization', 'organisation', 'company', 'company_name');
  const email = getValue('email', 'email address', 'email_address', 'contact email', 'contact_email');
  const mayor = getValue('mayor', 'mayor_name', 'mayor name');
  const ceo = getValue('ceo', 'ceo_name', 'ceo name', 'chief executive', 'chief_executive');
  const state = getValue('state', 'australian_state', 'aus_state', 'region');
  const phone = getValue('phone', 'phone_number', 'telephone', 'contact phone', 'contact_phone');
  const website = getValue('website', 'url', 'web');
  const address = getValue('address', 'address_line1', 'street', 'street address');
  const city = getValue('city', 'suburb', 'town', 'locality');
  const postcode = getValue('postcode', 'postal_code', 'post_code', 'zip');
  const councilType = getValue('type', 'council_type', 'council type', 'category');

  // Extract first name and last name from mayor if present
  let firstName = councilName || 'Unknown';
  let lastName = null;

  // If we have a mayor, use that as the primary contact
  if (mayor) {
    const parts = mayor.split(' ');
    firstName = parts[0] || councilName;
    lastName = parts.slice(1).join(' ') || null;
  }

  return {
    org_id,
    first_name: firstName,
    last_name: lastName,
    company_name: councilName,
    email: email || null,
    phone: phone || null,
    website: website || null,
    address_line1: address || null,
    city: city || null,
    postal_code: postcode || null,
    australian_state: normalizeState(state),
    state: normalizeState(state),  // Also set generic state field
    mayor_name: mayor || null,
    ceo_name: ceo || null,
    council_type: councilType || null,
    country: 'Australia',
    status: 'lead',
    stage: 'new',
    source: 'CSV Import',
    email_opt_in: !!email,  // Opt-in if they have email
    created_by: user_id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

// POST /api/crm/import/:org_id - Import customers from CSV
router.post('/import/:org_id', async (req, res) => {
  try {
    const { org_id } = req.params;
    const { csv_data, user_id, skip_duplicates = true } = req.body;

    if (!csv_data) {
      return res.status(400).json({
        success: false,
        error: 'No CSV data provided'
      });
    }

    // Parse CSV
    const { headers, rows } = parseCSV(csv_data);

    if (rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'CSV file is empty or has no data rows'
      });
    }

    logger.info('CSV import started', {
      org_id,
      headers,
      rowCount: rows.length
    });

    let imported = 0;
    let skipped = 0;
    let errors = [];

    // Process each row
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      try {
        const customerData = mapCSVToCustomer(row, org_id, user_id);

        // Skip rows with no useful data
        if (!customerData.company_name && !customerData.email) {
          skipped++;
          continue;
        }

        // Check for duplicates if requested
        if (skip_duplicates && customerData.email) {
          const { data: existing } = await supabaseService.client
            .from('crm_customers')
            .select('id')
            .eq('org_id', org_id)
            .eq('email', customerData.email)
            .limit(1);

          if (existing && existing.length > 0) {
            skipped++;
            continue;
          }
        }

        // Also check by company name if no email
        if (skip_duplicates && !customerData.email && customerData.company_name) {
          const { data: existing } = await supabaseService.client
            .from('crm_customers')
            .select('id')
            .eq('org_id', org_id)
            .eq('company_name', customerData.company_name)
            .limit(1);

          if (existing && existing.length > 0) {
            skipped++;
            continue;
          }
        }

        // Insert customer
        const { error: insertError } = await supabaseService.client
          .from('crm_customers')
          .insert(customerData);

        if (insertError) {
          throw insertError;
        }

        imported++;

      } catch (rowError) {
        errors.push({
          row: i + 2,  // +2 for header and 0-index
          error: rowError.message,
          data: row
        });
      }
    }

    logger.info('CSV import completed', {
      org_id,
      imported,
      skipped,
      errors: errors.length
    });

    res.json({
      success: true,
      imported,
      skipped,
      errors: errors.length,
      errorDetails: errors.slice(0, 10),  // Return first 10 errors
      message: `Imported ${imported} customers (${skipped} skipped, ${errors.length} errors)`
    });

  } catch (error) {
    logger.error('CSV import error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to import CSV: ' + error.message
    });
  }
});

// GET /api/crm/export/:org_id - Export customers to CSV
router.get('/export/:org_id', async (req, res) => {
  try {
    const { org_id } = req.params;
    const { state, status, stage } = req.query;

    let query = supabaseService.client
      .from('crm_customers')
      .select('*')
      .order('company_name');

    if (org_id !== 'all') {
      query = query.eq('org_id', org_id);
    }

    if (state) query = query.eq('australian_state', state);
    if (status) query = query.eq('status', status);
    if (stage) query = query.eq('stage', stage);

    const { data: customers, error } = await query;

    if (error) throw error;

    // Generate CSV
    const headers = [
      'council', 'mayor', 'ceo', 'email', 'phone', 'state',
      'address', 'city', 'postcode', 'website', 'status', 'stage',
      'lead_score', 'estimated_value', 'last_contacted', 'tags'
    ];

    const csvRows = [headers.join(',')];

    for (const c of customers || []) {
      const row = [
        `"${(c.company_name || '').replace(/"/g, '""')}"`,
        `"${(c.mayor_name || '').replace(/"/g, '""')}"`,
        `"${(c.ceo_name || '').replace(/"/g, '""')}"`,
        `"${(c.email || '').replace(/"/g, '""')}"`,
        `"${(c.phone || '').replace(/"/g, '""')}"`,
        `"${(c.australian_state || '').replace(/"/g, '""')}"`,
        `"${(c.address_line1 || '').replace(/"/g, '""')}"`,
        `"${(c.city || '').replace(/"/g, '""')}"`,
        `"${(c.postal_code || '').replace(/"/g, '""')}"`,
        `"${(c.website || '').replace(/"/g, '""')}"`,
        `"${(c.status || '').replace(/"/g, '""')}"`,
        `"${(c.stage || '').replace(/"/g, '""')}"`,
        c.lead_score || 0,
        c.estimated_value || 0,
        c.last_contacted_at ? new Date(c.last_contacted_at).toISOString().split('T')[0] : '',
        `"${(c.tags || []).join(', ')}"`
      ];
      csvRows.push(row.join(','));
    }

    const csvContent = csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="crm_export_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csvContent);

  } catch (error) {
    logger.error('CSV export error:', error);
    res.status(500).json({ success: false, error: 'Failed to export CSV' });
  }
});

// GET /api/crm/states/:org_id - Get list of states with customer counts
router.get('/states/:org_id', async (req, res) => {
  try {
    const { org_id } = req.params;

    let query = supabaseService.client
      .from('crm_customers')
      .select('australian_state');

    if (org_id !== 'all') {
      query = query.eq('org_id', org_id);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Count by state
    const stateCounts = {};
    (data || []).forEach(c => {
      const state = c.australian_state || 'Unknown';
      stateCounts[state] = (stateCounts[state] || 0) + 1;
    });

    // Convert to array and sort
    const states = Object.entries(stateCounts)
      .map(([state, count]) => ({ state, count }))
      .sort((a, b) => b.count - a.count);

    res.json({
      success: true,
      states
    });

  } catch (error) {
    logger.error('Error fetching states:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch states' });
  }
});

export default router;
