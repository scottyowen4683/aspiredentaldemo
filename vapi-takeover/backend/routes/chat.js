// routes/chat.js - Chat API endpoint (Direct OpenAI integration)
import express from 'express';
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import supabaseService from '../services/supabase-service.js';
import logger from '../services/logger.js';
import { scoreConversation } from '../ai/rubric-scorer.js';

const router = express.Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Session timeout tracking
const activeSessions = new Map();
const SESSION_TIMEOUT_MS = parseInt(process.env.SESSION_TIMEOUT_MS) || 900000; // 15 minutes

// POST /api/chat
// Body: { assistantId, sessionId?, message }
router.post('/', async (req, res) => {
  const startTime = Date.now();

  try {
    const { assistantId, sessionId: providedSessionId, message } = req.body;

    if (!assistantId || !message) {
      return res.status(400).json({
        error: 'Missing required fields: assistantId, message'
      });
    }

    // Get or create session ID
    const sessionId = providedSessionId || uuidv4();

    // Fetch assistant configuration
    const assistant = await supabaseService.getAssistant(assistantId);
    if (!assistant) {
      return res.status(404).json({ error: 'Assistant not found' });
    }

    if (!assistant.active) {
      return res.status(400).json({ error: 'Assistant is not active' });
    }

    // Get or create conversation
    let conversation = await supabaseService.getConversation(sessionId);
    let isNewConversation = false;

    if (!conversation) {
      conversation = await supabaseService.createConversation({
        orgId: assistant.org_id,
        assistantId: assistant.id,
        sessionId,
        channel: 'chat'
      });
      isNewConversation = true;
    }

    // Update session timeout
    clearTimeout(activeSessions.get(sessionId)?.timeout);
    const timeout = setTimeout(() => {
      handleSessionTimeout(sessionId, conversation.id, assistant.id);
    }, SESSION_TIMEOUT_MS);

    activeSessions.set(sessionId, {
      conversationId: conversation.id,
      assistantId: assistant.id,
      lastActivity: new Date(),
      timeout
    });

    // Add user message to database
    await supabaseService.addMessage({
      conversationId: conversation.id,
      role: 'user',
      content: message
    });

    // Get conversation history
    const history = await supabaseService.getConversationHistory(sessionId);

    // Search knowledge base if enabled
    let kbContext = '';
    if (assistant.kb_enabled) {
      // Create embedding for the message
      const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: message
      });

      const embedding = embeddingResponse.data[0].embedding;

      // Search knowledge base
      const kbResults = await supabaseService.searchKnowledgeBase(
        assistant.org_id, // Use org_id as tenant_id
        embedding,
        assistant.kb_match_count || 5
      );

      if (kbResults.length > 0) {
        kbContext = '\n\nRelevant information from knowledge base:\n' +
          kbResults.map(r => `${r.heading ? r.heading + ':\n' : ''}${r.content}`).join('\n\n');
      }
    }

    // Build messages for OpenAI
    const messages = [
      {
        role: 'system',
        content: assistant.prompt + kbContext
      },
      ...history
    ];

    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: assistant.model || 'gpt-4o-mini',
      messages,
      temperature: assistant.temperature || 0.5,
      max_tokens: assistant.max_tokens || 800,
      // TODO: Add function calling for email tool
    });

    const aiResponse = completion.choices[0].message.content;
    const tokensIn = completion.usage.prompt_tokens;
    const tokensOut = completion.usage.completion_tokens;

    // Calculate cost (GPT-4o-mini pricing)
    const GPT_INPUT_COST = 0.15 / 1000000; // $0.15 per 1M tokens
    const GPT_OUTPUT_COST = 0.60 / 1000000; // $0.60 per 1M tokens
    const gptCost = (tokensIn * GPT_INPUT_COST) + (tokensOut * GPT_OUTPUT_COST);

    // Add assistant message to database
    await supabaseService.addMessage({
      conversationId: conversation.id,
      role: 'assistant',
      content: aiResponse,
      latencyMs: Date.now() - startTime
    });

    // Update conversation with costs
    await supabaseService.updateConversation(sessionId, {
      gpt_cost: (conversation.gpt_cost || 0) + gptCost,
      total_cost: (conversation.total_cost || 0) + gptCost,
      tokens_in: (conversation.tokens_in || 0) + tokensIn,
      tokens_out: (conversation.tokens_out || 0) + tokensOut
    });

    logger.info('Chat response generated', {
      sessionId,
      assistantId,
      tokensIn,
      tokensOut,
      cost: gptCost.toFixed(6),
      latency: Date.now() - startTime
    });

    // Return response
    res.json({
      sessionId,
      response: aiResponse,
      isNewConversation,
      tokens: {
        input: tokensIn,
        output: tokensOut
      },
      cost: gptCost,
      latencyMs: Date.now() - startTime
    });

  } catch (error) {
    logger.error('Chat API error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Score a completed chat conversation (optimized for government compliance)
async function scoreChatConversation(sessionId, conversationId, assistantId) {
  try {
    // Get assistant configuration
    const assistant = await supabaseService.getAssistant(assistantId);
    if (!assistant || assistant.auto_score === false) {
      logger.info('Auto-scoring disabled for assistant', { assistantId });
      return;
    }

    // Get full conversation transcript
    const history = await supabaseService.getConversationHistory(sessionId);
    if (!history || history.length === 0) {
      logger.info('No conversation to score');
      return;
    }

    // Format transcript for scoring
    const transcript = history
      .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n');

    // Get organization for rubric
    const organization = await supabaseService.client
      .from('organizations')
      .select('name, default_rubric')
      .eq('id', assistant.org_id)
      .single();

    // Use assistant-specific rubric, or fallback to org default
    const rubric = assistant.rubric || organization.data?.default_rubric || null;

    logger.info('Scoring chat conversation:', {
      conversationId,
      assistantId,
      hasCustomRubric: !!rubric
    });

    // Score using optimized GPT-4o-mini scorer (96% cost savings vs GPT-4o)
    const scoringResult = await scoreConversation({
      transcript,
      rubric,
      conversationType: 'chat',
      organizationName: organization.data?.name || 'Unknown',
      assistantName: assistant.friendly_name
    });

    // Save score to database
    await supabaseService.client
      .from('conversation_scores')
      .insert({
        conversation_id: conversationId,
        overall_score: scoringResult.overallScore,
        dimension_scores: scoringResult.dimensions,
        flags: scoringResult.flags,
        feedback: scoringResult.feedback,
        cost: scoringResult.metadata.cost.total,
        model_used: 'gpt-4o-mini',
        scoring_type: 'chat'
      });

    // Update conversation with score
    await supabaseService.client
      .from('chat_conversations')
      .update({
        score: scoringResult.overallScore,
        scored_at: new Date().toISOString(),
        total_cost: (await supabaseService.getConversation(sessionId)).total_cost + scoringResult.metadata.cost.total
      })
      .eq('id', conversationId);

    logger.info('Chat conversation scored:', {
      conversationId,
      score: scoringResult.overallScore,
      flags: scoringResult.flags.length,
      scoringCost: scoringResult.metadata.cost.total
    });

  } catch (error) {
    logger.error('Conversation scoring failed:', error);
    // Don't throw - scoring failure shouldn't break session end
  }
}

// Handle session timeout
async function handleSessionTimeout(sessionId, conversationId, assistantId) {
  logger.info('Session timeout', { sessionId });

  try {
    // Get current conversation data
    const conversation = await supabaseService.getConversation(sessionId);
    if (!conversation || conversation.ended_at) {
      // Already ended
      return;
    }

    // Calculate duration
    const startedAt = new Date(conversation.started_at);
    const duration = Math.floor((Date.now() - startedAt) / 1000); // seconds

    // End conversation
    await supabaseService.endConversation(sessionId, {
      endReason: 'timeout',
      duration,
      costs: {} // Costs already tracked during conversation
    });

    // Get assistant for org_id
    const assistant = await supabaseService.getAssistant(assistantId);

    // Log interaction for billing tracking
    await supabaseService.logInteraction({
      orgId: assistant.org_id,
      assistantId,
      interactionType: 'chat_session',
      conversationId,
      sessionId,
      messageCount: conversation.tokens_in && conversation.tokens_out ?
        Math.ceil((conversation.tokens_in + conversation.tokens_out) / 100) : 1,
      cost: conversation.total_cost || 0
    });

    // Auto-score conversation for government compliance
    await scoreChatConversation(sessionId, conversationId, assistantId);

    // Cleanup
    activeSessions.delete(sessionId);

    logger.info('Session ended due to timeout', {
      sessionId,
      duration: `${duration}s`
    });

  } catch (error) {
    logger.error('Error handling session timeout:', error);
  }
}

// POST /api/chat/end
// Manually end a session
router.post('/end', async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'Missing sessionId' });
    }

    const session = activeSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Clear timeout
    clearTimeout(session.timeout);

    // End conversation
    const conversation = await supabaseService.getConversation(sessionId);
    if (conversation && !conversation.ended_at) {
      const startedAt = new Date(conversation.started_at);
      const duration = Math.floor((Date.now() - startedAt) / 1000);

      await supabaseService.endConversation(sessionId, {
        endReason: 'user_ended',
        duration,
        costs: {}
      });

      // Get assistant for org_id
      const assistant = await supabaseService.getAssistant(session.assistantId);

      // Log interaction for billing tracking
      await supabaseService.logInteraction({
        orgId: assistant.org_id,
        assistantId: session.assistantId,
        interactionType: 'chat_session',
        conversationId: conversation.id,
        sessionId,
        messageCount: conversation.tokens_in && conversation.tokens_out ?
          Math.ceil((conversation.tokens_in + conversation.tokens_out) / 100) : 1,
        cost: conversation.total_cost || 0
      });

      // Auto-score conversation for government compliance
      await scoreChatConversation(sessionId, conversation.id, session.assistantId);
    }

    // Cleanup
    activeSessions.delete(sessionId);

    logger.info('Session ended manually', { sessionId });

    res.json({ success: true });

  } catch (error) {
    logger.error('End session error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
