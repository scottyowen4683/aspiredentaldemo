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

    // Debug: log assistant settings including background sound
    logger.info('Assistant fetched:', {
      id: data?.id,
      friendly_name: data?.friendly_name,
      background_sound: data?.background_sound,
      background_volume: data?.background_volume,
      elevenlabs_voice_id: data?.elevenlabs_voice_id,
      first_message: data?.first_message?.substring(0, 50)
    });

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

  async createConversation({ orgId, assistantId, sessionId, channel, customerPhoneNumber }) {
    logger.info('Creating conversation:', { orgId, assistantId, sessionId, channel, customerPhoneNumber });

    // Match exact schema: session_id is NOT NULL, channel is enum
    // Start with required fields only
    const conversationData = {
      org_id: orgId,
      assistant_id: assistantId,
      session_id: sessionId, // Required - NOT NULL
      channel: channel || 'voice', // Enum: likely 'voice', 'chat', 'sms'
      started_at: new Date().toISOString(),
      transcript: []
    };

    // Try to include customer_phone_number if provided
    if (customerPhoneNumber) {
      conversationData.customer_phone_number = customerPhoneNumber;
    }

    let { data, error } = await supabase
      .from('conversations')
      .insert(conversationData)
      .select()
      .single();

    // If insert failed and we included customer_phone_number, retry without it
    // (in case the column doesn't exist in the database)
    if (error && customerPhoneNumber) {
      logger.warn('Insert failed with customer_phone_number, retrying without it:', error.message);
      delete conversationData.customer_phone_number;

      const retryResult = await supabase
        .from('conversations')
        .insert(conversationData)
        .select()
        .single();

      data = retryResult.data;
      error = retryResult.error;
    }

    if (error) {
      logger.error('Failed to create conversation:', {
        error: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        data: conversationData
      });
      throw error;
    }

    logger.info('Conversation created:', { id: data.id, org_id: data.org_id, session_id: data.session_id });
    return data;
  }

  async getConversation(sessionId) {
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (error) {
      logger.warn('getConversation error:', error.message);
      return null;
    }

    return data;
  }

  async updateConversation(sessionId, updates) {
    const { data, error } = await supabase
      .from('conversations')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('session_id', sessionId)
      .select()
      .single();

    if (error) {
      logger.error('Error updating conversation:', error.message);
      return null;
    }

    return data;
  }

  async endConversation(sessionId, { endReason, duration, costs }) {
    // Match exact schema columns
    const updates = {
      ended_at: new Date().toISOString(),
      end_reason: endReason,
      duration_seconds: duration,
      // Individual cost columns (all exist in schema)
      whisper_cost: costs?.whisper_cost || 0,
      gpt_cost: costs?.gpt_cost || 0,
      elevenlabs_cost: costs?.elevenlabs_cost || 0,
      twilio_cost: costs?.twilio_cost || 0,
      total_cost: costs?.total_cost || 0
    };

    return await this.updateConversation(sessionId, updates);
  }

  // ===========================================================================
  // CONVERSATION MESSAGES
  // Uses transcript JSONB field in conversations table (not separate table)
  // ===========================================================================

  async addMessage({ conversationId, role, content, functionName, functionArgs, latencyMs }) {
    // Map role to frontend-expected format: 'assistant' -> 'bot'
    const displayRole = role === 'assistant' ? 'bot' : role;
    const speaker = role === 'user' ? 'User' : (role === 'assistant' ? 'AI Assistant' : 'System');

    // Build message object in frontend-expected format
    const message = {
      role: displayRole,
      message: content,  // Frontend expects 'message', not 'content'
      speaker: speaker,
      timestamp: Date.now(),  // Frontend expects Unix timestamp
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

      // Get existing conversation_flow array or create new one
      const currentTranscript = conversation?.transcript || {};
      const currentFlow = Array.isArray(currentTranscript.conversation_flow)
        ? currentTranscript.conversation_flow
        : [];
      const newFlow = [...currentFlow, message];

      // Build new transcript object in frontend-expected format
      const newTranscript = {
        conversation_flow: newFlow
      };

      // Build plain text version for transcript_text column (for portal display)
      const transcriptText = newFlow
        .filter(msg => msg.role !== 'system')
        .map(msg => `${msg.speaker}: ${msg.message}`)
        .join('\n');

      // Update conversation with new transcript (both JSONB and plain text)
      const { error } = await supabase
        .from('conversations')
        .update({
          transcript: newTranscript,
          transcript_text: transcriptText,
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

    // Return conversation_flow array (frontend format)
    const transcript = data?.transcript || {};
    return Array.isArray(transcript.conversation_flow)
      ? transcript.conversation_flow
      : (Array.isArray(transcript) ? transcript : []);
  }

  async getConversationHistory(sessionId, limit = 20) {
    // Get conversation with transcript
    const conversation = await this.getConversation(sessionId);
    if (!conversation) return [];

    // Get messages from transcript.conversation_flow field (frontend format)
    const transcript = conversation.transcript || {};
    const messages = Array.isArray(transcript.conversation_flow)
      ? transcript.conversation_flow
      : (Array.isArray(transcript) ? transcript : []); // Fallback for old format

    // Return in OpenAI format (filter system messages for context)
    return messages
      .filter(msg => msg.role !== 'system')
      .slice(-limit)
      .map(msg => ({
        role: msg.role === 'bot' ? 'assistant' : msg.role, // Convert back for OpenAI
        content: msg.message || msg.content // Support both formats
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
