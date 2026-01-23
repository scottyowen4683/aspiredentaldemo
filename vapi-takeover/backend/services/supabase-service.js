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
    const { data, error } = await supabase
      .from('assistants')
      .select('*')
      .eq('phone_number', phoneNumber)
      .eq('active', true)
      .single();

    if (error) {
      logger.error('Error fetching assistant by phone:', error);
      return null;
    }

    return data;
  }

  // ===========================================================================
  // CONVERSATIONS
  // ===========================================================================

  async createConversation({ orgId, assistantId, sessionId, channel }) {
    const { data, error } = await supabase
      .from('conversations')
      .insert({
        org_id: orgId,
        assistant_id: assistantId,
        session_id: sessionId,
        channel,
        started_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      logger.error('Error creating conversation:', error);
      throw error;
    }

    logger.info('Conversation created:', { conversationId: data.id, sessionId });
    return data;
  }

  async getConversation(sessionId) {
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('session_id', sessionId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') { // Not found
        return null;
      }
      logger.error('Error fetching conversation:', error);
      throw error;
    }

    return data;
  }

  async updateConversation(sessionId, updates) {
    const { data, error} = await supabase
      .from('conversations')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('session_id', sessionId)
      .select()
      .single();

    if (error) {
      logger.error('Error updating conversation:', error);
      throw error;
    }

    return data;
  }

  async endConversation(sessionId, { endReason, duration, costs }) {
    const updates = {
      ended_at: new Date().toISOString(),
      end_reason: endReason,
      duration_seconds: duration,
      ...costs
    };

    return await this.updateConversation(sessionId, updates);
  }

  // ===========================================================================
  // CONVERSATION MESSAGES
  // ===========================================================================

  async addMessage({ conversationId, role, content, functionName, functionArgs, latencyMs }) {
    const { data, error } = await supabase
      .from('conversation_messages')
      .insert({
        conversation_id: conversationId,
        role,
        content,
        function_name: functionName,
        function_args: functionArgs,
        latency_ms: latencyMs,
        timestamp: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      logger.error('Error adding message:', error);
      throw error;
    }

    return data;
  }

  async getMessages(conversationId) {
    const { data, error } = await supabase
      .from('conversation_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('timestamp', { ascending: true });

    if (error) {
      logger.error('Error fetching messages:', error);
      throw error;
    }

    return data || [];
  }

  async getConversationHistory(sessionId, limit = 20) {
    // Get conversation ID first
    const conversation = await this.getConversation(sessionId);
    if (!conversation) return [];

    // Get messages
    const messages = await this.getMessages(conversation.id);

    // Return in OpenAI format
    return messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
  }

  // ===========================================================================
  // KNOWLEDGE BASE
  // ===========================================================================

  async searchKnowledgeBase(tenantId, queryEmbedding, matchCount = 5) {
    const { data, error } = await supabase.rpc('match_knowledge_chunks', {
      query_embedding: queryEmbedding,
      match_tenant_id: tenantId,
      match_count: matchCount,
      similarity_threshold: 0.7
    });

    if (error) {
      logger.error('Error searching knowledge base:', error);
      return [];
    }

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
