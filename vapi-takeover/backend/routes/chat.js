// routes/chat.js - Chat API endpoint (Direct OpenAI integration)
import express from 'express';
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import supabaseService from '../services/supabase-service.js';
import logger from '../services/logger.js';
import { scoreConversation } from '../ai/rubric-scorer.js';
import { sendContactRequestNotification } from '../services/email-service.js';

const router = express.Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Function definitions for OpenAI function calling
const CHAT_FUNCTIONS = [
  {
    name: 'capture_contact_request',
    description: 'Use this function when a user provides contact information, wants to lodge a complaint/request, or wants to be contacted. This captures their details for follow-up.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'The name of the person (if provided)'
        },
        email: {
          type: 'string',
          description: 'The email address of the person (if provided)'
        },
        phone: {
          type: 'string',
          description: 'The phone number of the person (if provided)'
        },
        address: {
          type: 'string',
          description: 'The address related to the request (if provided, e.g., for barking dog complaints)'
        },
        request_type: {
          type: 'string',
          enum: ['complaint', 'enquiry', 'feedback', 'service_request', 'contact_request', 'other'],
          description: 'The type of request'
        },
        request_details: {
          type: 'string',
          description: 'Full details of what the user is requesting or reporting'
        },
        urgency: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'The urgency level of the request'
        }
      },
      required: ['request_type', 'request_details']
    }
  }
];

// Default system prompt for chat - used when assistant has no custom prompt
const DEFAULT_CHAT_PROMPT = `You are a helpful, friendly AI assistant.

CORE INSTRUCTIONS:
1. Use ONLY the knowledge base information provided below to answer questions - this is your PRIMARY source of truth
2. Be conversational, helpful, and thorough in your responses
3. If the knowledge base contains the answer, use it confidently and accurately
4. If information is NOT in the knowledge base, say: "I don't have that specific information in my records. Would you like me to help connect you with someone who can assist?"
5. NEVER make up or hallucinate information - accuracy is critical
6. Be warm, professional, and helpful

RESPONSE STYLE:
- Provide clear, well-structured answers
- Use bullet points or numbered lists for complex information
- Offer to help with related questions
- Be concise but thorough

CAPTURING REQUESTS (IMPORTANT):
When a user:
- Wants to lodge a complaint (barking dog, noise, rubbish, etc.)
- Wants to report an issue (with an address)
- Wants to be contacted or receive follow-up
- Provides contact details for any service

You MUST use the capture_contact_request function to log their request. Include:
- Their name and contact info (if provided)
- The address related to the issue (if applicable)
- The type of request (complaint, enquiry, service_request, etc.)
- Full details of what they need

After capturing, confirm what you've recorded and let them know someone will follow up.

Always be helpful and guide users to the information they need.`;

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
    logger.info('KB check for assistant', {
      assistantId,
      kb_enabled: assistant.kb_enabled,
      org_id: assistant.org_id,
      kb_match_count: assistant.kb_match_count
    });

    if (assistant.kb_enabled) {
      try {
        // Create embedding for the message
        const embeddingResponse = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: message
        });

        const embedding = embeddingResponse.data[0].embedding;
        logger.info('Created embedding for KB search', { embeddingLength: embedding.length });

        // Search knowledge base
        const kbResults = await supabaseService.searchKnowledgeBase(
          assistant.org_id, // Use org_id as tenant_id
          embedding,
          assistant.kb_match_count || 5
        );

        logger.info('KB search results', {
          resultCount: kbResults?.length || 0,
          hasResults: kbResults && kbResults.length > 0,
          topResult: kbResults?.[0]?.content?.substring(0, 100)
        });

        if (kbResults && kbResults.length > 0) {
          kbContext = '\n\nRelevant information from knowledge base:\n' +
            kbResults.map(r => `${r.heading ? r.heading + ':\n' : ''}${r.content}`).join('\n\n');
          logger.info('KB context added to prompt', { contextLength: kbContext.length });
        }
      } catch (kbError) {
        logger.error('KB search failed:', kbError);
        // Continue without KB context
      }
    } else {
      logger.info('KB not enabled for this assistant');
    }

    // Build system prompt - use assistant's prompt if set, otherwise use default
    // ALWAYS append function calling instructions so requests get captured
    const basePrompt = assistant.prompt || DEFAULT_CHAT_PROMPT;

    // Function calling instructions - always included
    const functionInstructions = `

CAPTURING REQUESTS (IMPORTANT - ALWAYS DO THIS):
When a user:
- Wants to lodge a complaint (barking dog, noise, rubbish, etc.)
- Wants to report an issue (with an address)
- Wants to be contacted or receive follow-up
- Provides details about a problem that needs action

You MUST call the capture_contact_request function to log their request. Include:
- Their name and contact info (if provided)
- The address related to the issue (if applicable)
- The type of request (complaint, enquiry, service_request, etc.)
- Full details of what they need

After capturing, confirm what you've recorded and let them know someone will follow up.`;

    const systemPrompt = basePrompt + functionInstructions + kbContext;
    const messages = [
      {
        role: 'system',
        content: systemPrompt
      },
      ...history
    ];

    // Call OpenAI with function calling enabled
    const completion = await openai.chat.completions.create({
      model: assistant.model || 'gpt-4o-mini',
      messages,
      temperature: assistant.temperature || 0.5,
      max_tokens: assistant.max_tokens || 800,
      tools: CHAT_FUNCTIONS.map(fn => ({ type: 'function', function: fn })),
      tool_choice: 'auto' // Let the model decide when to use functions
    });

    let aiResponse = completion.choices[0].message.content || '';
    const tokensIn = completion.usage.prompt_tokens;
    const tokensOut = completion.usage.completion_tokens;

    // Check if the model wants to call a function
    const toolCalls = completion.choices[0].message.tool_calls;
    if (toolCalls && toolCalls.length > 0) {
      for (const toolCall of toolCalls) {
        if (toolCall.function.name === 'capture_contact_request') {
          try {
            const args = JSON.parse(toolCall.function.arguments);

            logger.info('Contact request captured', {
              conversationId: conversation.id,
              assistantId,
              request: args
            });

            // Store the contact request in the database
            await supabaseService.client
              .from('contact_requests')
              .insert({
                conversation_id: conversation.id,
                org_id: assistant.org_id,
                assistant_id: assistantId,
                name: args.name || null,
                email: args.email || null,
                phone: args.phone || null,
                address: args.address || null,
                request_type: args.request_type,
                request_details: args.request_details,
                urgency: args.urgency || 'medium',
                status: 'pending',
                created_at: new Date().toISOString()
              });

            logger.info('Contact request stored in database', {
              conversationId: conversation.id,
              requestType: args.request_type
            });

            // Send email notification (async, don't wait)
            sendContactRequestNotification(args, {
              assistantName: assistant.friendly_name || assistant.name,
              conversationId: conversation.id,
              channel: 'chat'
            }).catch(err => {
              logger.error('Failed to send contact request email:', err);
            });

            // If no text response, generate a confirmation
            if (!aiResponse) {
              aiResponse = `I've captured your ${args.request_type.replace('_', ' ')}. ` +
                (args.address ? `The address is ${args.address}. ` : '') +
                `Our team will follow up on this shortly.`;
            }
          } catch (fnError) {
            logger.error('Error processing function call:', fnError);
            // Continue with any text response
          }
        }
      }
    }

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
