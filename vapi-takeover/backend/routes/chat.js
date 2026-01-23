// routes/chat.js - Chat API endpoint (Direct OpenAI integration)
import express from 'express';
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import supabaseService from '../services/supabase-service.js';
import logger from '../services/logger.js';

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

    // Increment assistant interaction count
    await supabaseService.incrementInteractions(assistantId);

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

      // Increment interactions
      await supabaseService.incrementInteractions(session.assistantId);
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
