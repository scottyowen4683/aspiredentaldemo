// services/supabase-service.js - Supabase database service
import { createClient } from '@supabase/supabase-js';
import logger from './logger.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables');
}

// Create Supabase client with service role key (bypasses RLS)
const supabase = createClient(supabaseUrl, supabaseServiceKey);

class SupabaseService {
  // Expose the raw supabase client for direct queries
  get client() {
    return supabase;
  }

  // ===========================================================================
  // ORGANIZATIONS
  // ===========================================================================

  async getOrganization(orgId) {
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .single();

    if (error) {
      logger.error('Error fetching organization:', error);
      throw error;
    }

    return data;
  }

  async getOrganizationBySlug(slug) {
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .eq('slug', slug)
      .single();

    if (error) {
      logger.error('Error fetching organization by slug:', error);
      throw error;
    }

    return data;
  }

  // ===========================================================================
  // ASSISTANTS
  // ===========================================================================

  async getAssistant(assistantId) {
    const { data, error } = await supabase
      .from('assistants')
      .select('*')
      .eq('id', assistantId)
      .single();

    if (error) {
      logger.error('Error fetching assistant:', error);
      throw error;
    }

    return data;
  }

  async getAssistantByPhoneNumber(phoneNumber) {
    // Normalize phone number - try with and without + prefix
    const normalizedNumber = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
    const withoutPlus = phoneNumber.replace(/^\+/, '');

    logger.info('Looking up assistant by phone number:', {
      original: phoneNumber,
      normalized: normalizedNumber,
      withoutPlus
    });

    // Try normalized format first (with +)
    let { data, error } = await supabase
      .from('assistants')
      .select('*')
      .eq('phone_number', normalizedNumber)
      .maybeSingle();

    // If not found, try without the + prefix
    if (!data) {
      logger.info('Not found with +, trying without:', withoutPlus);
      const result = await supabase
        .from('assistants')
        .select('*')
        .eq('phone_number', withoutPlus)
        .maybeSingle();
      data = result.data;
      error = result.error;
    }

    // If still not found, try original format
    if (!data && phoneNumber !== normalizedNumber && phoneNumber !== withoutPlus) {
      logger.info('Not found, trying original format:', phoneNumber);
      const result = await supabase
        .from('assistants')
        .select('*')
        .eq('phone_number', phoneNumber)
        .maybeSingle();
      data = result.data;
      error = result.error;
    }

    if (error) {
      logger.error('Error fetching assistant by phone:', error);
    }

    if (!data) {
      logger.warn('No assistant found for phone number:', { phoneNumber, normalizedNumber, withoutPlus });
      return null;
    }

    // Check if assistant is active
    if (data.active === false) {
      logger.warn('Assistant found but is inactive:', { id: data.id, name: data.friendly_name });
      return null;
    }

    logger.info('Assistant found:', { id: data.id, name: data.friendly_name, phone: data.phone_number });
    return data;
  }

  // ===========================================================================
  // CONVERSATIONS
  // ===========================================================================

  async createConversation({ orgId, assistantId, sessionId, channel }) {
    logger.info('Creating conversation:', { orgId, assistantId, sessionId, channel });

    // First attempt: Try with session_id column (migration schema)
    const fullData = {
      org_id: orgId,
      assistant_id: assistantId,
      session_id: sessionId,
      channel: channel || 'voice',
      is_voice: channel === 'voice',
      provider: 'aspire', // Mark as our platform
      started_at: new Date().toISOString(),
      transcript: []
    };

    let { data, error } = await supabase
      .from('conversations')
      .insert(fullData)
      .select()
      .single();

    if (data) {
      logger.info('Conversation created (full):', { id: data.id, org_id: data.org_id });
      return data;
    }

    logger.warn('Full insert failed:', error?.message);

    // Second attempt: Without session_id (it might not exist)
    const withoutSessionId = {
      org_id: orgId,
      assistant_id: assistantId,
      channel: channel || 'voice',
      is_voice: channel === 'voice',
      provider: 'aspire',
      started_at: new Date().toISOString(),
      transcript: []
    };

    const result2 = await supabase
      .from('conversations')
      .insert(withoutSessionId)
      .select()
      .single();

    if (result2.data) {
      logger.info('Conversation created (no session_id):', { id: result2.data.id });
      // Map session to conversation ID for lookups
      this._sessionMap = this._sessionMap || new Map();
      this._sessionMap.set(sessionId, result2.data.id);
      return result2.data;
    }

    logger.warn('Second insert failed:', result2.error?.message);

    // Third attempt: Absolute minimal (just required fields)
    const minimal = {
      org_id: orgId,
      assistant_id: assistantId,
      started_at: new Date().toISOString()
    };

    const result3 = await supabase
      .from('conversations')
      .insert(minimal)
      .select()
      .single();

    if (result3.data) {
      logger.info('Conversation created (minimal):', { id: result3.data.id });
      this._sessionMap = this._sessionMap || new Map();
      this._sessionMap.set(sessionId, result3.data.id);
      return result3.data;
    }

    logger.error('All insert attempts failed:', result3.error);
    throw result3.error || new Error('Failed to create conversation');
  }

  async getConversation(sessionId) {
    // First check if we have a local mapping (used when session_id column doesn't exist)
    const mappedId = this._sessionMap?.get(sessionId);
    if (mappedId) {
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', mappedId)
        .single();

      if (!error && data) return data;
    }

    // Try with session_id column
    let { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (data) return data;

    // Log but don't throw - conversation might just not exist yet
    if (error && error.code !== 'PGRST116') {
      logger.debug('getConversation query issue:', error.message);
    }

    return null;
  }

  async updateConversation(sessionId, updates) {
    const updateData = {
      ...updates,
      updated_at: new Date().toISOString()
    };

    // First check if we have a local mapping
    const mappedId = this._sessionMap?.get(sessionId);

    if (mappedId) {
      const { data, error } = await supabase
        .from('conversations')
        .update(updateData)
        .eq('id', mappedId)
        .select()
        .single();

      if (!error) return data;
      logger.warn('Update by mapped ID failed:', error.message);
    }

    // Try with session_id column
    let { data, error } = await supabase
      .from('conversations')
      .update(updateData)
      .eq('session_id', sessionId)
      .select()
      .maybeSingle();

    if (error) {
      logger.error('Error updating conversation:', error.message);
      // Don't throw - let the call continue
      return null;
    }

    return data;
  }

  async endConversation(sessionId, { endReason, duration, costs }) {
    // Build updates that work with both schema versions
    const updates = {
      ended_at: new Date().toISOString(),
      end_reason: endReason,
      duration_seconds: duration,
      call_duration: duration,
      // Use total_cost (exists in both schemas)
      total_cost: costs?.total_cost || 0,
      // Store detailed breakdown in cost_breakdown JSONB (production schema)
      cost_breakdown: {
        whisper_cost: costs?.whisper_cost || 0,
        gpt_cost: costs?.gpt_cost || 0,
        elevenlabs_cost: costs?.elevenlabs_cost || 0,
        twilio_cost: costs?.twilio_cost || 0,
        total: costs?.total_cost || 0
      }
    };

    // Also try to set individual cost columns if they exist (migration schema)
    if (costs?.whisper_cost) updates.whisper_cost = costs.whisper_cost;
    if (costs?.gpt_cost) updates.gpt_cost = costs.gpt_cost;
    if (costs?.elevenlabs_cost) updates.elevenlabs_cost = costs.elevenlabs_cost;
    if (costs?.twilio_cost) updates.twilio_cost = costs.twilio_cost;

    try {
      return await this.updateConversation(sessionId, updates);
    } catch (error) {
      // If update fails due to missing columns, try with just compatible fields
      logger.warn('Full update failed, trying minimal update:', error.message);
      const minimalUpdates = {
        ended_at: new Date().toISOString(),
        end_reason: endReason,
        duration_seconds: duration,
        total_cost: costs?.total_cost || 0,
        cost_breakdown: updates.cost_breakdown
      };
      return await this.updateConversation(sessionId, minimalUpdates);
    }
  }

  // ===========================================================================
  // CONVERSATION MESSAGES
  // Uses transcript JSONB field in conversations table (not separate table)
  // ===========================================================================

  async addMessage({ conversationId, role, content, functionName, functionArgs, latencyMs }) {
    // Build message object
    const message = {
      role,
      content,
      timestamp: new Date().toISOString(),
      ...(functionName && { function_name: functionName }),
      ...(functionArgs && { function_args: functionArgs }),
      ...(latencyMs && { latency_ms: latencyMs })
    };

    try {
      // Get current transcript
      const { data: conversation, error: fetchError } = await supabase
        .from('conversations')
        .select('transcript')
        .eq('id', conversationId)
        .single();

      if (fetchError) {
        logger.warn('Could not fetch conversation transcript:', fetchError.message);
        // Return message anyway - don't break the call
        return message;
      }

      // Append to existing transcript or create new array
      const currentTranscript = Array.isArray(conversation?.transcript) ? conversation.transcript : [];
      const newTranscript = [...currentTranscript, message];

      // Update conversation with new transcript
      const { error } = await supabase
        .from('conversations')
        .update({
          transcript: newTranscript,
          updated_at: new Date().toISOString()
        })
        .eq('id', conversationId);

      if (error) {
        logger.warn('Could not update transcript:', error.message);
        // Don't throw - continue with the call
      } else {
        logger.debug('Message added to conversation', {
          conversationId,
          role,
          messageCount: newTranscript.length
        });
      }

      return message;
    } catch (error) {
      // Don't let message storage break the voice call
      logger.error('Error adding message (non-fatal):', error.message);
      return message;
    }
  }

  async getMessages(conversationId) {
    const { data, error } = await supabase
      .from('conversations')
      .select('transcript')
      .eq('id', conversationId)
      .single();

    if (error) {
      logger.error('Error fetching messages:', error);
      return [];
    }

    return data?.transcript || [];
  }

  async getConversationHistory(sessionId, limit = 20) {
    // Get conversation with transcript
    const conversation = await this.getConversation(sessionId);
    if (!conversation) return [];

    // Get messages from transcript field
    const messages = conversation.transcript || [];

    // Return in OpenAI format (filter system messages for context)
    return messages
      .filter(msg => msg.role !== 'system')
      .slice(-limit)
      .map(msg => ({
        role: msg.role,
        content: msg.content
      }));
  }

  // ===========================================================================
  // KNOWLEDGE BASE
  // ===========================================================================

  async searchKnowledgeBase(tenantId, queryEmbedding, matchCount = 5) {
    // Ensure tenant_id is a string (DB stores it as text)
    const tenantIdStr = String(tenantId);

    // Try the moretonbaypilot parameter naming first (p_tenant_id format)
    let { data, error } = await supabase.rpc('match_knowledge_chunks', {
      p_tenant_id: tenantIdStr,
      p_query_embedding: queryEmbedding,
      p_match_count: matchCount
    });

    // If that fails, try alternative parameter naming
    if (error) {
      logger.info('Trying alternative RPC parameters...');
      const result = await supabase.rpc('match_knowledge_chunks', {
        query_embedding: queryEmbedding,
        match_tenant_id: tenantIdStr,
        match_count: matchCount,
        similarity_threshold: 0.7
      });
      data = result.data;
      error = result.error;
    }

    if (error) {
      logger.error('Error searching knowledge base:', error);

      // Fallback: direct query with cosine similarity if RPC doesn't exist
      logger.info('Trying fallback direct query...');
      const fallbackResult = await supabase
        .from('knowledge_chunks')
        .select('id, content, source, section, metadata, embedding')
        .eq('tenant_id', tenantIdStr)
        .eq('active', true)
        .limit(matchCount * 2); // Get more and filter by similarity client-side

      if (fallbackResult.error) {
        logger.error('Fallback query also failed:', fallbackResult.error);
        return [];
      }

      // Simple cosine similarity calculation
      const cosineSimilarity = (a, b) => {
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < a.length; i++) {
          dotProduct += a[i] * b[i];
          normA += a[i] * a[i];
          normB += b[i] * b[i];
        }
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
      };

      // Score and sort results
      const scored = (fallbackResult.data || [])
        .map(chunk => ({
          ...chunk,
          similarity: chunk.embedding ? cosineSimilarity(queryEmbedding, chunk.embedding) : 0
        }))
        .filter(chunk => chunk.similarity > 0.7)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, matchCount);

      logger.info('Fallback KB search results:', { count: scored.length });
      return scored;
    }

    logger.info('KB search results:', { count: data?.length || 0 });
    return data || [];
  }

  // ===========================================================================
  // COST TRACKING
  // ===========================================================================

  async incrementInteractions(assistantId) {
    const { error } = await supabase.rpc('increment', {
      row_id: assistantId,
      x: 1
    });

    if (error) {
      logger.error('Error incrementing interactions:', error);
    }
  }

  /**
   * Log an interaction for billing tracking
   * @param {Object} params - Interaction parameters
   * @param {string} params.orgId - Organization ID
   * @param {string} params.assistantId - Assistant ID
   * @param {string} params.interactionType - Type: sms_inbound, sms_outbound, call_inbound, call_outbound, chat_session
   * @param {string} [params.conversationId] - Conversation ID
   * @param {string} [params.sessionId] - Session ID
   * @param {string} [params.contactNumber] - Phone number or identifier
   * @param {number} [params.durationSeconds] - Duration for calls
   * @param {number} [params.messageCount] - Message count for chat
   * @param {number} [params.cost] - Actual API cost
   * @param {string} [params.campaignId] - Campaign ID for outbound calls
   */
  async logInteraction(params) {
    const {
      orgId,
      assistantId,
      interactionType,
      conversationId = null,
      sessionId = null,
      contactNumber = null,
      durationSeconds = null,
      messageCount = null,
      cost = 0,
      campaignId = null
    } = params;

    const { error } = await supabase.rpc('increment_interaction', {
      p_org_id: orgId,
      p_assistant_id: assistantId,
      p_interaction_type: interactionType,
      p_conversation_id: conversationId,
      p_session_id: sessionId,
      p_contact_number: contactNumber,
      p_duration_seconds: durationSeconds,
      p_message_count: messageCount,
      p_cost: cost,
      p_campaign_id: campaignId
    });

    if (error) {
      logger.error('Error logging interaction:', error);
    } else {
      logger.info('Interaction logged:', {
        orgId,
        interactionType,
        conversationId
      });
    }
  }

  // ===========================================================================
  // AUDIT LOGGING
  // ===========================================================================

  async logAudit({ orgId, userId, action, details }) {
    const { error } = await supabase
      .from('audit_logs')
      .insert({
        org_id: orgId,
        user_id: userId,
        action,
        details
      });

    if (error) {
      logger.error('Error logging audit:', error);
    }
  }
}

const supabaseService = new SupabaseService();

export default supabaseService;
export { supabase };
