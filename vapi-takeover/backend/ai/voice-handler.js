// ai/voice-handler.js - Complete voice pipeline (VAPI replacement)
import OpenAI from 'openai';
import fs from 'fs';
import os from 'os';
import path from 'path';
import logger from '../services/logger.js';
import supabaseService from '../services/supabase-service.js';
import { streamElevenLabsAudio, streamElevenLabsTTS, preGenerateFillerPhrases, getInstantFillerAudio, hasFillerPhrasesReady } from './elevenlabs.js';
import { BufferManager, ulawToWav } from '../audio/buffer-manager.js';
import { scoreConversation } from './rubric-scorer.js';
import { sendContactRequestNotification, sendCustomerConfirmationEmail } from '../services/email-service.js';
import { createStreamingTranscriber } from '../services/deepgram-streaming.js';
import { transferCall, sendSMS } from '../services/twilio-service.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Filler phrases to use while processing (reduces perceived latency)
// KEEP THESE SHORT - they play during transcription/GPT processing
const FILLER_PHRASES = [
  "Sure.",
  "One moment.",
  "Let me check.",
  "Okay.",
  "Mm-hmm."
];

// Function definitions for voice - same as chat
const VOICE_FUNCTIONS = [
  {
    name: 'capture_contact_request',
    description: 'Use this function when a user provides contact information, wants to lodge a complaint/request, or wants to be contacted. Use for barking dogs, noise complaints, rubbish issues, etc.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The name of the person' },
        email: { type: 'string', description: 'The email address' },
        phone: { type: 'string', description: 'The phone number' },
        address: { type: 'string', description: 'The address related to the request' },
        request_type: {
          type: 'string',
          enum: ['complaint', 'enquiry', 'feedback', 'service_request', 'contact_request', 'other'],
          description: 'Type of request'
        },
        request_details: { type: 'string', description: 'Full details of what the user is requesting' },
        urgency: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Urgency level' }
      },
      required: ['request_type', 'request_details']
    }
  }
];

// Call transfer function - only added when call_transfer_enabled is true
const TRANSFER_CALL_FUNCTION = {
  name: 'transfer_call',
  description: 'Transfer the current call to a human representative. Use this when the caller explicitly requests to speak to a real person, or when you cannot adequately help them with their request.',
  parameters: {
    type: 'object',
    properties: {
      reason: {
        type: 'string',
        description: 'Brief reason for the transfer (e.g., "customer requested human assistance", "complex issue requiring specialist")'
      }
    },
    required: ['reason']
  }
};

// SMS to customer function - only added when sms_enabled is true
const SEND_SMS_FUNCTION = {
  name: 'send_sms_to_customer',
  description: 'Send an SMS message to the customer. Use this to send confirmations, information, links, or follow-up details. You must first ask the customer for their mobile phone number before using this function.',
  parameters: {
    type: 'object',
    properties: {
      phone_number: {
        type: 'string',
        description: 'The customer\'s mobile phone number (must include country code, e.g., +61400000000)'
      },
      message: {
        type: 'string',
        description: 'The SMS message content (keep brief, under 160 characters)'
      }
    },
    required: ['phone_number', 'message']
  }
};

// Phrases that indicate the call should end
const END_CALL_PHRASES = [
  'goodbye',
  'bye bye',
  'bye for now',
  'have a great day',
  'take care',
  'thanks for calling',
  'thank you for calling'
];

// ============================================
// OPTIMIZATION 1: Simple query detection - skip KB search for these
// ============================================
const SIMPLE_QUERY_PATTERNS = [
  /^(yes|yeah|yep|yup|sure|okay|ok|no|nope|nah|mm-?hmm?|uh-?huh)[\.\!\?]?$/i,
  /^(thanks?|thank you|cheers|ta)[\.\!\?]?$/i,
  /^(bye|goodbye|see ya|catch you later)[\.\!\?]?$/i,
  /^(hi|hello|hey|g'?day)[\.\!\?]?$/i,
  /^(that's all|that is all|nothing else|i'?m done|all good|all set)[\.\!\?]?$/i,
  /^(sounds good|perfect|great|awesome|cool|got it|understood|alright|right)[\.\!\?]?$/i,
  /^(go ahead|please|continue|carry on)[\.\!\?]?$/i,
];

function isSimpleQuery(text) {
  const trimmed = text.trim().toLowerCase();
  return SIMPLE_QUERY_PATTERNS.some(pattern => pattern.test(trimmed));
}

// ============================================
// OPTIMIZATION 4: Response caching for common questions
// ============================================
const responseCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 100;

function getCacheKey(orgId, query) {
  // Normalize query: lowercase, trim, remove punctuation
  const normalized = query.toLowerCase().trim().replace(/[^\w\s]/g, '');
  return `${orgId || 'default'}:${normalized}`;
}

function getCachedResponse(orgId, query) {
  const key = getCacheKey(orgId, query);
  const cached = responseCache.get(key);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    logger.info('Cache HIT', { key: key.substring(0, 50), age: Date.now() - cached.timestamp });
    return cached.response;
  }

  if (cached) {
    responseCache.delete(key); // Expired
  }
  return null;
}

function setCachedResponse(orgId, query, response) {
  const key = getCacheKey(orgId, query);

  // LRU eviction if cache is full
  if (responseCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = responseCache.keys().next().value;
    responseCache.delete(oldestKey);
  }

  responseCache.set(key, {
    response,
    timestamp: Date.now()
  });
  logger.debug('Cached response', { key: key.substring(0, 50) });
}

// User phrases that indicate they want to end the call
const USER_END_PHRASES = [
  'goodbye',
  'bye',
  'that\'s all',
  'that is all',
  'nothing else',
  'no thanks',
  'no thank you',
  'i\'m done',
  'i am done',
  'that\'s everything',
  'all good',
  'thanks bye'
];

/**
 * Check if text indicates call should end
 */
function shouldEndCall(text, isUserText = false) {
  const lower = text.toLowerCase();
  const phrases = isUserText ? USER_END_PHRASES : END_CALL_PHRASES;
  return phrases.some(phrase => lower.includes(phrase));
}

// CRITICAL VOICE RULES - ALWAYS appended to ALL voice assistants, no exceptions
// These ensure consistent behavior regardless of custom prompts
const VOICE_RULES = `

CRITICAL VOICE CALL RULES (ALWAYS FOLLOW THESE):
1. Keep responses brief - under 50 words. You're on a phone call, not writing an essay.
2. Start responses with brief acknowledgments like "Sure," "Of course," "Let me check."
3. Use ONLY knowledge base information. If it's not in the KB, say "I don't have that specific information."
4. NEVER make up or hallucinate information - names, phone numbers, addresses, facts - if you don't have it, don't invent it.
5. Use natural conversational language appropriate for voice.
6. When user says goodbye/thanks/that's all, say a brief goodbye including the word "goodbye" to end the call.`;

// Function calling instructions appended to voice prompts
const FUNCTION_INSTRUCTIONS = `

CAPTURING REQUESTS (IMPORTANT - ALWAYS DO THIS):
When a user:
- Wants to lodge a complaint (barking dog, noise, rubbish, etc.)
- Wants to report an issue (broken footpath, streetlight, etc.)
- Wants to be contacted or followed up
- Provides their name, phone, email, or address with a request

You MUST call the capture_contact_request function to log their request.
Ask for their name and contact details if not provided.
Always confirm the address related to the issue.`;

// Call transfer instructions - appended when call_transfer_enabled
const TRANSFER_INSTRUCTIONS = `

CALL TRANSFER:
You have the ability to transfer this call to a human representative.
- Use the transfer_call function when the caller explicitly asks to speak to a person/human/representative
- Use it if you cannot help them adequately with their request
- Before transferring, briefly explain you'll be connecting them to someone who can help
- Example: "Let me transfer you to one of our team members who can assist you further."`;

// SMS to customer instructions - appended when sms_enabled
const SMS_INSTRUCTIONS = `

SMS TO CUSTOMER:
You have the ability to send SMS messages directly to the customer.
- First, ask the customer for their mobile phone number if they want to receive an SMS
- Use the send_sms_to_customer function to send confirmations, information, or follow-up details
- Always confirm the phone number with the customer before sending (e.g., "Just to confirm, that's 0400 123 456?")
- Keep messages brief (under 160 characters)
- Include relevant details like reference numbers, links, or key information they requested`;

// Default system prompt - used when assistant has no custom prompt
// This matches the moretonbaypilot chatbot behavior with email capture
const DEFAULT_SYSTEM_PROMPT = `You are a helpful, friendly AI assistant on a phone call.

RESPONSE STYLE (CRITICAL):
- ALWAYS start with a brief acknowledgment like "Sure," or "Of course," or "Let me check that." before answering
- Keep responses brief (under 50 words for voice)
- Use natural conversational language
- Be warm, professional, and helpful

CORE INSTRUCTIONS:
1. Use ONLY the knowledge base information provided below to answer questions - this is your PRIMARY source of truth
2. If the knowledge base contains the answer, use it confidently and accurately
3. If information is NOT in the knowledge base, say: "I don't have that specific information in my records. Would you like me to help connect you with someone who can assist?"
4. NEVER make up or hallucinate information - accuracy is critical

ENDING CALLS:
When the user says goodbye, thanks, that's all, nothing else, or similar:
- Say a brief friendly goodbye like "Thanks for calling! Have a great day. Goodbye."
- Include the word "goodbye" to signal call end

EMAIL/CONTACT CAPTURE:
If a user wants to lodge a request or complaint:
1. Ask for their name and contact details
2. Confirm the address related to the issue
3. The system will automatically capture and email the request

Remember: You're speaking on a phone call - be brief, clear, and helpful.`;

// Aspire outbound demo prompt - THIS IS AN OUTBOUND CALL (AI calling customer)
const ASPIRE_OUTBOUND_DEMO_PROMPT = `You are an AI assistant making an OUTBOUND call on behalf of Aspire Executive Solutions.

CRITICAL - THIS IS AN OUTBOUND CALL:
- YOU called THEM because they requested a demo callback from the Aspire website
- NEVER ask "how can I help you" - YOU are calling to help THEM learn about Aspire
- Your opening greeting already introduced you - now answer their questions and educate them

YOUR GOALS (in priority order):
1. Answer any questions they have about Aspire's AI services
2. Educate them on how Aspire can help their business or council
3. If they want to speak to Scott directly, transfer the call immediately
4. If they prefer a callback, capture their name and preferred callback time

RESPONSE STYLE:
- Brief and conversational (under 40 words per response)
- Warm, professional, enthusiastic
- Australian English
- This call is DEMONSTRATING what Aspire's AI can do - be impressive!

WHAT ASPIRE OFFERS:
- AI voice agents that answer calls 24/7 (exactly like this demo call!)
- AI chat assistants for websites
- Handles enquiries, complaints, service requests automatically
- SMS and email follow-ups
- CRM integrations (TechnologyOne, Civica, Salesforce)
- Analytics dashboard

KEY SELLING POINTS:
- Over 50% cheaper than hiring a customer service officer
- 24/7 operation - never misses a call, no sick days, no breaks
- Up to 5,000 interactions per month included
- Go live in 7-14 days
- Australian-hosted, privacy compliant
- Custom knowledge base trained on YOUR business

PRICING:
- Fixed monthly fee, no surprises, no per-call charges
- Everything included: setup, training, after-hours, analytics

FOR COUNCILS:
- After-hours ratepayer support
- Handles complaints, bin enquiries, rates questions
- Reduces frontline staff workload

FOR BUSINESSES:
- Never miss a lead
- Instant callbacks on missed calls
- Reactivate dormant customers

TRANSFER TO SCOTT:
If they ask to speak to Scott or a real person, say "Sure, let me transfer you to Scott now" and use the transfer function.

CALLBACK SCHEDULING:
If Scott isn't available or they prefer a callback, ask: "No problem! Can I get your name and a good time for Scott to call you back?"

ENDING THE CALL:
When done, say something like "Thanks so much for your time today. Goodbye!" - always include "goodbye".`;

/**
 * Format KB results like moretonbaypilot for better context
 */
function formatKBContext(matches) {
  if (!Array.isArray(matches) || matches.length === 0) return '';

  const lines = [];
  lines.push('\n\nKNOWLEDGE BASE INFORMATION (use this as your source of truth):');
  lines.push('-----------------------------------------------------------');

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i] || {};
    const source = m.source || 'Knowledge Base';
    const section = m.section || m.heading || '';
    const content = m.content || '';
    const similarity = typeof m.similarity === 'number' ? m.similarity.toFixed(3) : '';

    lines.push(`\n[${i + 1}] Source: ${source}`);
    if (section) lines.push(`[${i + 1}] Section: ${section}`);
    if (similarity) lines.push(`[${i + 1}] Relevance: ${similarity}`);
    lines.push(`[${i + 1}] Content:\n${content}`);
  }

  lines.push('\n-----------------------------------------------------------');
  return lines.join('\n');
}

class VoiceHandler {
  constructor(callSid, assistantId, callerNumber = null) {
    this.callSid = callSid;
    this.assistantId = assistantId;
    this.callerNumber = callerNumber; // Customer phone number
    this.sessionId = callSid; // Use callSid as session ID
    this.conversation = null;
    this.assistant = null;
    this.audioBuffer = new BufferManager();
    this.isProcessing = false;
    this.startTime = Date.now();
    this.turnCount = 0;
    this.costs = {
      whisper: 0,
      gpt: 0,
      elevenlabs: 0,
      twilio: 0,
      total: 0
    };

    // Streaming transcription (Deepgram WebSocket)
    this.streamingTranscriber = null;
    this.pendingTranscript = null; // Stores transcript ready for processing
    this.onStreamingSpeechEnd = null; // Callback when streaming transcription ready

    // Transfer and notification state
    this.transferRequested = false;
    this.transferNumber = null;

    // Prevent duplicate endCall processing
    this.isEnded = false;

    // KB usage tracking for scoring
    this.kbUsed = false;
    this.kbResultsCount = 0;
  }

  /**
   * Get the list of voice functions based on assistant configuration
   * Returns base functions plus optional transfer/SMS functions
   */
  getVoiceFunctions() {
    const functions = [...VOICE_FUNCTIONS];

    // Add call transfer function if enabled
    if (this.assistant?.call_transfer_enabled && this.assistant?.call_transfer_number) {
      functions.push(TRANSFER_CALL_FUNCTION);
      this.transferNumber = this.assistant.call_transfer_number;
    }

    // Add SMS to customer function if enabled
    if (this.assistant?.sms_enabled) {
      functions.push(SEND_SMS_FUNCTION);
    }

    return functions;
  }

  /**
   * Get additional prompt instructions based on assistant configuration
   */
  getFeatureInstructions() {
    let instructions = '';

    if (this.assistant?.call_transfer_enabled && this.assistant?.call_transfer_number) {
      instructions += TRANSFER_INSTRUCTIONS;
    }

    if (this.assistant?.sms_enabled) {
      instructions += SMS_INSTRUCTIONS;
    }

    return instructions;
  }

  async initialize() {
    try {
      // SPECIAL CASE: Marketing demo - can use portal assistant or fallback to hardcoded
      if (this.assistantId === 'outbound-demo') {
        // Check if a portal assistant is configured for outbound demo
        const portalAssistantId = process.env.OUTBOUND_DEMO_ASSISTANT_ID;

        if (portalAssistantId) {
          // Use portal assistant - full KB, tracking, editable prompt
          logger.info('Outbound demo using portal assistant', { portalAssistantId });
          const [assistant, universalPrompt] = await Promise.all([
            supabaseService.getAssistant(portalAssistantId),
            supabaseService.getUniversalPrompt()
          ]);

          if (assistant) {
            this.assistant = assistant;
            this.universalPrompt = universalPrompt;
            // Override the ID for conversation tracking
            this.assistantId = portalAssistantId;
            logger.info('Loaded portal assistant for outbound demo', {
              assistantId: portalAssistantId,
              name: assistant.friendly_name,
              hasKB: assistant.kb_enabled
            });
          } else {
            logger.warn('Portal assistant not found, falling back to hardcoded', { portalAssistantId });
            this._useHardcodedOutboundConfig();
          }
        } else {
          // No portal assistant configured - use hardcoded fallback
          logger.info('No OUTBOUND_DEMO_ASSISTANT_ID set, using hardcoded config');
          this._useHardcodedOutboundConfig();
        }
      } else {
        // Regular assistant - query database
        const [assistant, universalPrompt] = await Promise.all([
          supabaseService.getAssistant(this.assistantId),
          supabaseService.getUniversalPrompt()
        ]);

        this.assistant = assistant;
        this.universalPrompt = universalPrompt;

        if (!this.assistant) {
          // Create a minimal fallback assistant config so call can still work
          logger.warn(`Assistant not found: ${this.assistantId}, using defaults`);
          this.assistant = {
            id: this.assistantId,
            org_id: null,
            friendly_name: 'Default Assistant',
            prompt: DEFAULT_SYSTEM_PROMPT,
            model: 'gpt-4o-mini',
            temperature: 0.7,
            max_tokens: 150,
            kb_enabled: false,
            elevenlabs_voice_id: process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL'
          };
        }
      }

      // Try to create conversation - but don't fail if it errors
      try {
        this.conversation = await supabaseService.createConversation({
          orgId: this.assistant.org_id,
          assistantId: this.assistant.id,
          sessionId: this.sessionId,
          channel: 'voice',
          customerPhoneNumber: this.callerNumber
        });

        // Add system message
        if (this.conversation?.id) {
          await supabaseService.addMessage({
            conversationId: this.conversation.id,
            role: 'system',
            content: this.assistant.prompt || DEFAULT_SYSTEM_PROMPT
          });
        }
      } catch (convError) {
        // Log but don't fail - call can work without DB storage
        logger.warn('Could not create conversation (call will continue):', convError.message);
        this.conversation = { id: null }; // Dummy so code doesn't break
      }

      logger.info('Voice handler initialized', {
        callSid: this.callSid,
        assistantId: this.assistantId,
        conversationId: this.conversation?.id || 'none',
        assistantName: this.assistant.friendly_name
      });

      // NOTE: Filler phrase generation moved to startFillerGeneration()
      // Call it AFTER greeting is sent to avoid API contention on shared CPU

      // Initialize streaming transcriber if Deepgram API key is set
      if (process.env.DEEPGRAM_API_KEY) {
        try {
          await this.initStreamingTranscriber();
        } catch (e) {
          logger.warn('Streaming transcriber failed to initialize (will use fallback):', e.message);
        }
      }

      return true;
    } catch (error) {
      logger.error('Voice handler initialization failed:', error);
      throw error;
    }
  }

  /**
   * Start pre-generating filler phrases in background
   * Call this AFTER greeting is sent to avoid API contention
   */
  startFillerGeneration() {
    const voiceId = this.assistant.elevenlabs_voice_id || process.env.ELEVENLABS_VOICE_DEFAULT;
    const backgroundSound = 'none'; // Synthetic noise disabled
    const backgroundVolume = 0.40;

    if (voiceId && !hasFillerPhrasesReady(voiceId, backgroundSound)) {
      logger.info('Starting filler phrase generation (after greeting)', { voiceId });
      preGenerateFillerPhrases(voiceId, { backgroundSound, backgroundVolume })
        .then(() => logger.info('Filler phrases ready for instant playback'))
        .catch(e => logger.warn('Filler pre-generation failed:', e.message));
    } else {
      logger.info('Filler phrases already cached', { voiceId });
    }
  }

  /**
   * Fallback hardcoded config for outbound demo (when no portal assistant configured)
   */
  async _useHardcodedOutboundConfig() {
    const outboundVoiceId = process.env.ELEVENLABS_OUTBOUND_VOICE_ID || 'UQVsQrmNGOENbsLCAH2g';
    logger.info('Using hardcoded Aspire outbound demo configuration', {
      voiceId: outboundVoiceId,
      hasApiKey: !!process.env.ELEVENLABS_API_KEY
    });
    this.assistant = {
      id: 'outbound-demo',
      org_id: null,
      friendly_name: 'Aspire AI Demo',
      first_message: "Hi there! I'm calling from Aspire Executive Solutions. You requested a demo of our AI services, so I wanted to give you a quick call back. What questions can I answer for you about our AI voice and chat solutions?",
      prompt: ASPIRE_OUTBOUND_DEMO_PROMPT,
      model: 'gpt-4o-mini',
      temperature: 0.7,
      max_tokens: 200,
      kb_enabled: false,
      elevenlabs_voice_id: outboundVoiceId,
      call_transfer_enabled: true,
      call_transfer_number: '+61408062129',
      capture_contact_enabled: true
      // Note: filler audio enabled by default for portal assistants
    };
    this.universalPrompt = await supabaseService.getUniversalPrompt();
  }

  /**
   * Initialize Deepgram streaming transcriber for real-time STT
   * Transcribes audio AS it arrives, so transcription is ready when user stops speaking
   */
  async initStreamingTranscriber() {
    this.streamingTranscriber = createStreamingTranscriber({
      language: 'en-AU',
      model: 'nova-2',
      silenceTimeout: 1500, // 1.5s silence for speech end (allow pauses when dictating numbers)

      onTranscript: (segment, accumulated) => {
        logger.debug('Streaming transcript segment', { segment, accumulated: accumulated.substring(0, 50) });
      },

      onSpeechEnd: (transcript) => {
        logger.info('🎤 Streaming speech end detected', {
          transcript,
          length: transcript.length
        });

        // Store transcript for processing
        this.pendingTranscript = transcript;

        // Trigger callback if set
        if (this.onStreamingSpeechEnd) {
          this.onStreamingSpeechEnd(transcript);
        }
      }
    });

    await this.streamingTranscriber.connect();
    logger.info('Deepgram streaming transcriber connected');
  }

  /**
   * Process audio chunk - sends to streaming transcriber OR VAD buffer (not both)
   * When streaming is active, Deepgram handles all VAD - no need for our buffer
   */
  async processAudioChunk(audioBase64) {
    if (this.streamingTranscriber) {
      // Streaming mode: Deepgram handles VAD, don't add to local buffer
      // This prevents duplicate speech detection events and log spam
      this.streamingTranscriber.sendAudioBase64(audioBase64);
    } else {
      // Fallback mode: Use local VAD buffer when streaming isn't available
      this.audioBuffer.add(audioBase64);
    }
  }

  /**
   * Process with streaming transcription - uses real-time transcript
   * Much faster than waiting for audio to accumulate then transcribe!
   */
  async onSpeechEndWithStreaming(onAudioChunk) {
    if (this.isProcessing) {
      logger.debug('Already processing, ignoring speech end');
      return null;
    }

    // Check if we have a pending transcript from streaming
    const transcript = this.pendingTranscript ||
      (this.streamingTranscriber ? this.streamingTranscriber.flushTranscript() : null);

    if (!transcript || transcript.trim().length === 0) {
      // No streaming transcript - fall back to regular processing
      logger.debug('No streaming transcript, using fallback');
      return this.onSpeechEndStreaming(onAudioChunk);
    }

    this.isProcessing = true;
    this.pendingTranscript = null;
    const turnStartTime = Date.now();

    // Clear the VAD buffer since we're using streaming transcript
    this.audioBuffer.clear();

    try {
      logger.info('Processing with streaming transcript (FAST PATH)', {
        callSid: this.callSid,
        transcriptLength: transcript.length,
        transcript: transcript.substring(0, 50)
      });

      // NOTE: Filler audio is now sent IMMEDIATELY from server.js before this function is called
      // This ensures the filler plays instantly without being buffered with the response

      // Voice settings for TTS
      const voiceId = this.assistant.elevenlabs_voice_id || process.env.ELEVENLABS_VOICE_DEFAULT;
      const backgroundSound = 'none'; // Synthetic noise disabled
      const backgroundVolume = 0.40;

      // Transcription already done! Log time saved
      const transcriptionLatency = 0; // Already had it from streaming!
      logger.info('🚀 Transcription INSTANT (streaming)', { transcript });

      // Save user message (don't await)
      if (this.conversation?.id) {
        supabaseService.addMessage({
          conversationId: this.conversation.id,
          role: 'user',
          content: transcript,
          latencyMs: transcriptionLatency
        }).catch(e => logger.warn('Failed to save user message:', e.message));
      }

      // Step 2: Get full GPT response
      const gptStart = Date.now();
      const gptResponse = await this.generateResponse(transcript);
      const gptLatency = Date.now() - gptStart;

      logger.info('GPT response ready', {
        text: gptResponse.text.substring(0, 50) + '...',
        latencyMs: gptLatency
      });

      // Step 3: Stream TTS for FULL response
      const ttsStart = Date.now();
      let firstChunkSent = false;
      let totalAudioBytes = 0;

      await streamElevenLabsTTS(gptResponse.text, voiceId, (chunk) => {
        if (!firstChunkSent) {
          firstChunkSent = true;
          logger.info('🚀 First TTS chunk!', {
            timeFromGptMs: Date.now() - ttsStart,
            totalLatencyMs: Date.now() - turnStartTime,
            chunkSize: chunk.length
          });
        }
        totalAudioBytes += chunk.length;
        onAudioChunk(chunk);
      }, {
        backgroundSound,
        backgroundVolume
      });

      const ttsLatency = Date.now() - ttsStart;
      const totalLatency = Date.now() - turnStartTime;
      this.turnCount++;

      // Save assistant message (don't await)
      if (this.conversation?.id) {
        supabaseService.addMessage({
          conversationId: this.conversation.id,
          role: 'assistant',
          content: gptResponse.text,
          latencyMs: gptLatency
        }).catch(e => logger.warn('Failed to save assistant message:', e.message));
      }

      // Update costs
      this.costs.gpt += gptResponse.cost;
      this.costs.total += gptResponse.cost;
      const elevenLabsCost = gptResponse.text.length * 0.00003;
      this.costs.elevenlabs += elevenLabsCost;
      this.costs.total += elevenLabsCost;

      // Check if we should end the call
      const userWantsToEnd = shouldEndCall(transcript, true);
      const aiSaidGoodbye = shouldEndCall(gptResponse.text, false);
      const endCallRequested = userWantsToEnd || aiSaidGoodbye;

      logger.info('🏎️ STREAMING turn complete (FAST!)', {
        turnNumber: this.turnCount,
        transcriptionMs: transcriptionLatency,
        gptMs: gptLatency,
        ttsMs: ttsLatency,
        totalMs: totalLatency,
        audioBytes: totalAudioBytes,
        endCallRequested
      });

      this.isProcessing = false;

      return {
        transcription: transcript,
        responseText: gptResponse.text,
        shouldEndCall: endCallRequested,
        latency: {
          transcription: transcriptionLatency,
          gpt: gptLatency,
          tts: ttsLatency,
          total: totalLatency
        }
      };

    } catch (error) {
      logger.error('Error processing speech (streaming path):', error);
      this.isProcessing = false;
      throw error;
    }
  }

  async onSpeechEnd() {
    if (this.isProcessing) {
      logger.debug('Already processing, ignoring speech end');
      return null;
    }

    this.isProcessing = true;
    const turnStartTime = Date.now();

    try {
      // Get accumulated audio
      const audioBuffer = this.audioBuffer.flush();
      if (audioBuffer.length === 0) {
        this.isProcessing = false;
        return null;
      }

      logger.info('Processing speech', {
        callSid: this.callSid,
        audioSizeKB: (audioBuffer.length / 1024).toFixed(2)
      });

      // Step 1: Transcribe with Whisper
      const transcriptionStart = Date.now();
      const transcription = await this.transcribeAudio(audioBuffer);
      const transcriptionLatency = Date.now() - transcriptionStart;

      if (!transcription || transcription.trim().length === 0) {
        logger.warn('Empty transcription, skipping turn');
        this.isProcessing = false;
        return null;
      }

      logger.info('Transcription complete', {
        text: transcription,
        latencyMs: transcriptionLatency
      });

      // Save user message (if we have a conversation)
      if (this.conversation?.id) {
        await supabaseService.addMessage({
          conversationId: this.conversation.id,
          role: 'user',
          content: transcription,
          latencyMs: transcriptionLatency
        });
      }

      // Step 2: Generate GPT response
      const gptStart = Date.now();
      const gptResponse = await this.generateResponse(transcription);
      const gptLatency = Date.now() - gptStart;

      logger.info('GPT response generated', {
        text: gptResponse.text.substring(0, 100) + '...',
        tokensIn: gptResponse.tokensIn,
        tokensOut: gptResponse.tokensOut,
        cost: gptResponse.cost,
        latencyMs: gptLatency
      });

      // Save assistant message (if we have a conversation)
      if (this.conversation?.id) {
        await supabaseService.addMessage({
          conversationId: this.conversation.id,
          role: 'assistant',
          content: gptResponse.text,
          latencyMs: gptLatency
        });
      }

      // Update costs
      this.costs.gpt += gptResponse.cost;
      this.costs.total += gptResponse.cost;

      // Step 3: Generate TTS audio with ElevenLabs
      const ttsStart = Date.now();
      const audioStream = await this.generateSpeech(gptResponse.text);
      const ttsLatency = Date.now() - ttsStart;

      const totalLatency = Date.now() - turnStartTime;
      this.turnCount++;

      logger.info('Turn complete', {
        turnNumber: this.turnCount,
        transcriptionMs: transcriptionLatency,
        gptMs: gptLatency,
        ttsMs: ttsLatency,
        totalMs: totalLatency
      });

      this.isProcessing = false;

      return {
        transcription,
        responseText: gptResponse.text,
        audioStream,
        latency: {
          transcription: transcriptionLatency,
          gpt: gptLatency,
          tts: ttsLatency,
          total: totalLatency
        }
      };

    } catch (error) {
      logger.error('Error processing speech:', error);
      this.isProcessing = false;
      throw error;
    }
  }

  async transcribeAudio(audioBuffer) {
    const durationSeconds = audioBuffer.length / 8000; // 8kHz sample rate

    // Try Deepgram first if configured (much faster: ~100-300ms vs 500-1500ms)
    if (process.env.DEEPGRAM_API_KEY) {
      try {
        const startTime = Date.now();
        const wavBuffer = ulawToWav(audioBuffer);

        const response = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&language=en', {
          method: 'POST',
          headers: {
            'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
            'Content-Type': 'audio/wav'
          },
          body: wavBuffer
        });

        if (response.ok) {
          const result = await response.json();
          const text = result.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
          const latency = Date.now() - startTime;

          logger.info('Deepgram transcription complete', {
            text,
            latencyMs: latency,
            durationSec: durationSeconds.toFixed(2)
          });

          // Deepgram cost: ~$0.0043/min for Nova-2
          const cost = (durationSeconds / 60) * 0.0043;
          this.costs.whisper += cost; // Using whisper key for all STT costs
          this.costs.total += cost;

          return text;
        } else {
          logger.warn('Deepgram failed, falling back to Whisper:', response.status);
        }
      } catch (dgError) {
        logger.warn('Deepgram error, falling back to Whisper:', dgError.message);
      }
    }

    // Fall back to Whisper
    const tempFile = path.join(os.tmpdir(), `whisper-${this.callSid}-${Date.now()}.wav`);

    try {
      const wavBuffer = ulawToWav(audioBuffer);

      logger.info('Using Whisper for transcription', {
        inputSizeKB: (audioBuffer.length / 1024).toFixed(2),
        durationSec: durationSeconds.toFixed(2)
      });

      fs.writeFileSync(tempFile, wavBuffer);

      const transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(tempFile),
        model: 'whisper-1',
        language: 'en',
        response_format: 'json'
      });

      logger.info('Whisper transcription complete', {
        text: transcription.text,
        textLength: transcription.text?.length
      });

      // Whisper cost: $0.006 per minute
      const whisperCost = (durationSeconds / 60) * 0.006;
      this.costs.whisper += whisperCost;
      this.costs.total += whisperCost;

      return transcription.text;
    } catch (error) {
      logger.error('Whisper transcription failed:', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    } finally {
      try {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      } catch (cleanupError) {
        logger.warn('Failed to clean up temp file:', tempFile);
      }
    }
  }

  async generateResponse(userMessage) {
    try {
      // ============================================
      // OPTIMIZATION 4: Check cache first
      // ============================================
      const cachedResponse = getCachedResponse(this.assistant.org_id, userMessage);
      if (cachedResponse) {
        logger.info('🚀 Using CACHED response', {
          query: userMessage.substring(0, 30),
          responsePreview: cachedResponse.text.substring(0, 30)
        });
        return cachedResponse;
      }

      // ============================================
      // OPTIMIZATION 1: Skip KB for simple queries
      // ============================================
      const skipKB = isSimpleQuery(userMessage);
      if (skipKB) {
        logger.info('⚡ Skipping KB search for simple query', { query: userMessage });
      }

      // ============================================
      // OPTIMIZATION 2: Parallelize KB search with conversation history fetch
      // ============================================
      const historyPromise = supabaseService.getConversationHistory(this.sessionId);

      // Start embedding creation early (in parallel with history fetch)
      let embeddingPromise = null;
      if (this.assistant.kb_enabled && !skipKB) {
        // We'll enhance the query after history loads, but start with basic query for now
        embeddingPromise = openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: userMessage // Start with user message, may enhance later
        });
      }

      // Wait for history (needed for context)
      const history = await historyPromise;

      // Build context-enriched query for KB search if we have history
      let kbQueryText = userMessage;
      if (history && history.length > 0 && !skipKB) {
        // Get last 2-3 exchanges for context (up to 500 chars)
        const recentContext = history
          .slice(-4) // Last 4 messages (2 exchanges)
          .map(m => `${m.role}: ${m.content}`)
          .join(' ')
          .slice(-500);

        // Combine recent context with current message for better KB matching
        kbQueryText = `${recentContext} ${userMessage}`.trim();

        logger.info('KB query enriched with conversation context', {
          originalQuery: userMessage.substring(0, 50),
          enrichedQueryLength: kbQueryText.length
        });

        // If context changed significantly, create new embedding with context
        if (kbQueryText.length > userMessage.length + 50) {
          embeddingPromise = openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: kbQueryText
          });
        }
      }

      // Wait for embedding if we started one
      const embeddingResult = embeddingPromise ? await embeddingPromise : null;

      // Search knowledge base if enabled (RAG) - skip for simple queries
      let kbContext = '';
      if (this.assistant.kb_enabled && embeddingResult && !skipKB) {
        try {
          const embedding = embeddingResult.data[0].embedding;

          // Search knowledge base - fetch 5 for voice with very low threshold for better recall
          const kbResults = await supabaseService.searchKnowledgeBase(
            this.assistant.org_id,
            embedding,
            5, // Fetch more results
            0.1 // Very low threshold - voice needs better recall
          );

          if (kbResults && kbResults.length > 0) {
            kbContext = formatKBContext(kbResults);

            // Track KB usage for scoring
            this.kbUsed = true;
            this.kbResultsCount = Math.max(this.kbResultsCount, kbResults.length);

            logger.info('Knowledge base context added', {
              matchCount: kbResults.length,
              contextLength: kbContext.length,
              topSimilarity: kbResults[0]?.similarity
            });
          } else {
            // No KB results - tell GPT explicitly
            kbContext = `

---
IMPORTANT: No relevant information found in knowledge base for this query.
You MUST say "I don't have that specific information" and offer to connect them with someone who can help.
DO NOT make up or guess information like names, contact details, or specific facts.
---`;
            logger.info('No KB results found for query', { query: userMessage.substring(0, 50) });
          }
        } catch (kbError) {
          logger.error('Knowledge base search failed:', kbError);
          // Continue without KB context
        }
      }

      // Determine which prompt to use:
      // 1. If use_default_prompt=true (or not set), use universal prompt from system_settings
      // 2. If use_default_prompt=false, use assistant's custom prompt
      // 3. Fall back to hardcoded DEFAULT_SYSTEM_PROMPT if nothing else available
      let basePrompt;

      if (this.assistant.use_default_prompt !== false) {
        // Use universal prompt from system_settings (fetched during initialize)
        basePrompt = this.universalPrompt || DEFAULT_SYSTEM_PROMPT;
      } else {
        // Use assistant's custom prompt
        basePrompt = this.assistant.prompt && this.assistant.prompt.trim()
          ? this.assistant.prompt
          : DEFAULT_SYSTEM_PROMPT;
      }

      // Always append function calling instructions + feature-specific instructions
      const featureInstructions = this.getFeatureInstructions();
      const systemPrompt = basePrompt + VOICE_RULES + FUNCTION_INSTRUCTIONS + featureInstructions + kbContext;

      // Build messages with knowledge base context
      // Limit history to last 8 messages (4 exchanges) to reduce GPT latency
      const messages = [
        {
          role: 'system',
          content: systemPrompt
        },
        ...history.slice(-8),
        {
          role: 'user',
          content: userMessage
        }
      ];

      // Get functions based on assistant configuration (includes transfer/SMS if enabled)
      const voiceFunctions = this.getVoiceFunctions();

      // Call GPT with function calling - use gpt-4o-mini for speed
      const completion = await openai.chat.completions.create({
        model: this.assistant.model || 'gpt-4o-mini',
        messages,
        temperature: this.assistant.temperature || 0.7,
        max_tokens: this.assistant.max_tokens || 150,
        tools: voiceFunctions.map(fn => ({ type: 'function', function: fn })),
        tool_choice: 'auto'
      });

      let responseText = completion.choices[0].message.content || '';
      const tokensIn = completion.usage.prompt_tokens;
      const tokensOut = completion.usage.completion_tokens;

      // Handle function calls (contact capture)
      const toolCalls = completion.choices[0].message.tool_calls;
      if (toolCalls && toolCalls.length > 0) {
        for (const toolCall of toolCalls) {
          if (toolCall.function.name === 'capture_contact_request') {
            try {
              const args = JSON.parse(toolCall.function.arguments);
              logger.info('Voice: Capturing contact request', args);

              // Store in database
              await supabaseService.client.from('contact_requests').insert({
                conversation_id: this.conversation?.id || null,
                org_id: this.assistant.org_id,
                assistant_id: this.assistant.id,
                name: args.name || null,
                email: args.email || null,
                phone: args.phone || this.callerNumber || null,
                address: args.address || null,
                request_type: args.request_type,
                request_details: args.request_details,
                urgency: args.urgency || 'medium',
                status: 'pending',
                created_at: new Date().toISOString()
              });

              // Send email notification
              let referenceId = null;
              try {
                const emailResult = await sendContactRequestNotification(args, {
                  assistantName: this.assistant.friendly_name || 'Voice Assistant',
                  conversationId: this.conversation?.id,
                  channel: 'voice',
                  notificationEmail: this.assistant.email_notification_address
                });
                referenceId = emailResult?.referenceId;
                logger.info('Voice: Contact request email sent', { referenceId });

                // Send confirmation email to customer (if they provided email)
                if (args.email && referenceId) {
                  await sendCustomerConfirmationEmail(args, referenceId, {
                    assistantName: this.assistant.friendly_name || 'Voice Assistant',
                    companyName: this.assistant.friendly_name || 'our team'
                  });
                  logger.info('Voice: Customer confirmation email sent', { to: args.email, referenceId });
                }
              } catch (emailErr) {
                logger.error('Voice: Failed to send contact request email:', emailErr);
              }

              // Generate confirmation response if AI didn't provide one
              if (!responseText) {
                const requestTypeLabel = args.request_type.replace('_', ' ');
                responseText = `Thank you${args.name ? ` ${args.name}` : ''}! I've logged your ${requestTypeLabel}`;
                if (args.address) {
                  responseText += ` regarding ${args.address}`;
                }
                responseText += '.';
                if (referenceId) {
                  responseText += ` Your reference number is ${referenceId}.`;
                }
                responseText += ` Our team will follow up shortly. Is there anything else I can help you with?`;
              }
            } catch (fnError) {
              logger.error('Voice: Error processing function call:', fnError);
            }
          }

          // Handle call transfer function
          if (toolCall.function.name === 'transfer_call') {
            try {
              const args = JSON.parse(toolCall.function.arguments);
              logger.info('Voice: Transfer call requested', {
                reason: args.reason,
                callSid: this.callSid,
                transferTo: this.transferNumber
              });

              if (this.transferNumber) {
                // Mark transfer as requested - actual transfer happens after TTS
                this.transferRequested = true;

                // Initiate the transfer
                const transferResult = await transferCall(this.callSid, this.transferNumber, {
                  timeout: 30
                });

                if (transferResult.success) {
                  logger.info('Voice: Call transfer initiated', transferResult);
                  if (!responseText) {
                    responseText = "I'm transferring you now. Please hold.";
                  }
                } else {
                  logger.error('Voice: Call transfer failed', transferResult);
                  responseText = "I apologize, but I'm unable to transfer your call at the moment. Is there something else I can help you with?";
                }
              } else {
                logger.warn('Voice: Transfer requested but no transfer number configured');
                responseText = "I apologize, but call transfer is not available at the moment. Is there something else I can help you with?";
              }
            } catch (fnError) {
              logger.error('Voice: Error processing transfer call:', fnError);
              responseText = "I apologize, but I encountered an error trying to transfer your call. Is there something else I can help you with?";
            }
          }

          // Handle SMS to customer function
          if (toolCall.function.name === 'send_sms_to_customer') {
            try {
              const args = JSON.parse(toolCall.function.arguments);
              const customerNumber = args.phone_number;

              logger.info('Voice: SMS to customer requested', {
                message: args.message,
                customerNumber
              });

              if (customerNumber) {
                // Send the message directly to the customer
                const smsResult = await sendSMS(customerNumber, args.message, {
                  fromNumber: this.assistant.phone_number || process.env.TWILIO_PHONE_NUMBER
                });

                if (smsResult.success) {
                  logger.info('Voice: SMS sent to customer', { sid: smsResult.sid, to: customerNumber });

                  // Log SMS interaction for billing tracking
                  if (this.assistant?.org_id) {
                    try {
                      await supabaseService.logInteraction({
                        orgId: this.assistant.org_id,
                        assistantId: this.assistantId,
                        interactionType: 'sms_outbound',
                        conversationId: this.conversation?.id || null,
                        sessionId: this.sessionId,
                        contactNumber: customerNumber,
                        cost: 0 // SMS cost is typically flat rate
                      });
                    } catch (logError) {
                      logger.warn('Could not log SMS interaction:', logError.message);
                    }
                  }

                  if (!responseText) {
                    responseText = "I've sent that SMS to your phone. You should receive it shortly.";
                  }
                } else {
                  logger.error('Voice: SMS to customer failed', smsResult);
                  if (!responseText) {
                    responseText = "I'm sorry, I wasn't able to send that SMS. Could you please double-check the phone number?";
                  }
                }
              } else {
                logger.warn('Voice: SMS requested but no phone number provided');
                if (!responseText) {
                  responseText = "I need your mobile phone number to send you an SMS. What's the best number to reach you?";
                }
              }
            } catch (fnError) {
              logger.error('Voice: Error processing SMS to customer:', fnError);
            }
          }
        }
      }

      // Calculate cost (GPT-4o-mini pricing)
      const GPT_INPUT_COST = 0.15 / 1000000;
      const GPT_OUTPUT_COST = 0.60 / 1000000;
      const gptCost = (tokensIn * GPT_INPUT_COST) + (tokensOut * GPT_OUTPUT_COST);

      const response = {
        text: responseText,
        tokensIn,
        tokensOut,
        cost: gptCost
      };

      // ============================================
      // OPTIMIZATION 4: Cache response for reuse
      // Only cache if no function calls were made (those are context-dependent)
      // ============================================
      const hadFunctionCalls = toolCalls && toolCalls.length > 0;
      if (!hadFunctionCalls && !isSimpleQuery(userMessage) && responseText.length > 20) {
        setCachedResponse(this.assistant.org_id, userMessage, response);
      }

      return response;
    } catch (error) {
      logger.error('GPT generation failed:', error);
      throw error;
    }
  }

  async generateSpeech(text) {
    try {
      // Use assistant's configured ElevenLabs voice
      const voiceId = this.assistant.elevenlabs_voice_id || process.env.ELEVENLABS_VOICE_DEFAULT;

      if (!voiceId) {
        throw new Error('No ElevenLabs voice configured');
      }

      // Get background sound setting from assistant config (default: office for natural sound)
      // Enforce minimum 0.40 volume - lower values are inaudible on phone
      const backgroundSound = this.assistant.background_sound || 'none';
      const backgroundVolume = Math.max(this.assistant.background_volume || 0.40, 0.40);

      // Get audio from ElevenLabs (non-streaming for backward compatibility)
      const audioStream = await streamElevenLabsAudio(text, voiceId, {
        backgroundSound,
        backgroundVolume
      });

      // Calculate cost (ElevenLabs: $0.00003 per character for Turbo v2.5)
      const elevenLabsCost = text.length * 0.00003;
      this.costs.elevenlabs += elevenLabsCost;
      this.costs.total += elevenLabsCost;

      return audioStream;
    } catch (error) {
      logger.error('ElevenLabs TTS failed:', error);
      throw error;
    }
  }

  /**
   * Generate GPT response with streaming - for pipelining with TTS
   * Calls onSentence callback for each complete sentence as GPT generates them
   */
  async generateResponseStreaming(userMessage, onSentence) {
    try {
      // Get conversation history first - we need it for context-aware KB search
      const history = await supabaseService.getConversationHistory(this.sessionId);

      // Build context-enriched query for KB search
      // Include recent conversation context so "Yes" or "What about Griffin?" works
      let kbQueryText = userMessage;
      if (history && history.length > 0) {
        // Get last 2-3 exchanges for context (up to 500 chars)
        const recentContext = history
          .slice(-4) // Last 4 messages (2 exchanges)
          .map(m => `${m.role}: ${m.content}`)
          .join(' ')
          .slice(-500);

        // Combine recent context with current message for better KB matching
        kbQueryText = `${recentContext} ${userMessage}`.trim();

        logger.info('KB query enriched with conversation context (streaming)', {
          originalQuery: userMessage.substring(0, 50),
          enrichedQueryLength: kbQueryText.length
        });
      }

      // Create embedding with context-enriched query
      const embeddingResult = this.assistant.kb_enabled
        ? await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: kbQueryText
          })
        : null;

      // Search knowledge base if enabled (RAG)
      let kbContext = '';
      if (this.assistant.kb_enabled && embeddingResult) {
        try {
          const embedding = embeddingResult.data[0].embedding;
          const kbResults = await supabaseService.searchKnowledgeBase(
            this.assistant.org_id,
            embedding,
            this.assistant.kb_match_count || 5,
            0.1 // Very low threshold for voice - better recall
          );
          if (kbResults && kbResults.length > 0) {
            kbContext = formatKBContext(kbResults);

            // Track KB usage for scoring
            this.kbUsed = true;
            this.kbResultsCount = Math.max(this.kbResultsCount, kbResults.length);
          } else {
            // No KB results - tell GPT explicitly
            kbContext = `

---
IMPORTANT: No relevant information found in knowledge base for this query.
You MUST say "I don't have that specific information" and offer to connect them with someone who can help.
DO NOT make up or guess information like names, contact details, or specific facts.
---`;
            logger.info('No KB results found for query (streaming)', { query: userMessage.substring(0, 50) });
          }
        } catch (kbError) {
          logger.error('Knowledge base search failed:', kbError);
        }
      }

      // Determine which prompt to use (same logic as generateResponse)
      let basePrompt;

      if (this.assistant.use_default_prompt !== false) {
        basePrompt = this.universalPrompt || DEFAULT_SYSTEM_PROMPT;
      } else {
        basePrompt = this.assistant.prompt && this.assistant.prompt.trim()
          ? this.assistant.prompt
          : DEFAULT_SYSTEM_PROMPT;
      }

      // Add function calling instructions + feature-specific instructions
      const featureInstructions = this.getFeatureInstructions();
      const systemPrompt = basePrompt + VOICE_RULES + FUNCTION_INSTRUCTIONS + featureInstructions + kbContext;

      // Limit history to last 8 messages (4 exchanges) to reduce GPT latency
      const messages = [
        { role: 'system', content: systemPrompt },
        ...history.slice(-8),
        { role: 'user', content: userMessage }
      ];

      // Get functions based on assistant configuration (includes transfer/SMS if enabled)
      const voiceFunctions = this.getVoiceFunctions();

      // Stream GPT response with function calling
      const stream = await openai.chat.completions.create({
        model: this.assistant.model || 'gpt-4o-mini',
        messages,
        temperature: this.assistant.temperature || 0.7,
        max_tokens: this.assistant.max_tokens || 150,
        tools: voiceFunctions.map(fn => ({ type: 'function', function: fn })),
        tool_choice: 'auto',
        stream: true
      });

      let fullText = '';
      let sentenceBuffer = '';
      let tokensOut = 0;
      let toolCallsData = {}; // Accumulate tool call data

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        const content = delta?.content || '';

        // Handle tool calls in streaming
        if (delta?.tool_calls) {
          for (const toolCall of delta.tool_calls) {
            const idx = toolCall.index;
            if (!toolCallsData[idx]) {
              toolCallsData[idx] = { name: '', arguments: '' };
            }
            if (toolCall.function?.name) {
              toolCallsData[idx].name = toolCall.function.name;
            }
            if (toolCall.function?.arguments) {
              toolCallsData[idx].arguments += toolCall.function.arguments;
            }
          }
        }

        if (content) {
          fullText += content;
          sentenceBuffer += content;
          tokensOut++;

          // Check for sentence boundaries (. ! ? followed by space or end)
          const sentenceMatch = sentenceBuffer.match(/^(.+?[.!?])(\s|$)/);
          if (sentenceMatch) {
            const sentence = sentenceMatch[1].trim();
            if (sentence.length > 0) {
              onSentence(sentence);
            }
            sentenceBuffer = sentenceBuffer.slice(sentenceMatch[0].length);
          }
        }
      }

      // Send any remaining text
      if (sentenceBuffer.trim().length > 0) {
        onSentence(sentenceBuffer.trim());
      }

      // Process any tool calls that were made
      const toolCalls = Object.values(toolCallsData).filter(tc => tc.name);
      if (toolCalls.length > 0) {
        for (const toolCall of toolCalls) {
          if (toolCall.name === 'capture_contact_request') {
            try {
              const args = JSON.parse(toolCall.arguments);
              logger.info('Voice streaming: Capturing contact request', args);

              // Store in database
              await supabaseService.client.from('contact_requests').insert({
                conversation_id: this.conversation?.id || null,
                org_id: this.assistant.org_id,
                assistant_id: this.assistant.id,
                name: args.name || null,
                email: args.email || null,
                phone: args.phone || this.callerNumber || null,
                address: args.address || null,
                request_type: args.request_type,
                request_details: args.request_details,
                urgency: args.urgency || 'medium',
                status: 'pending',
                created_at: new Date().toISOString()
              });

              // Send email notification
              let referenceId = null;
              try {
                const emailResult = await sendContactRequestNotification(args, {
                  assistantName: this.assistant.friendly_name || 'Voice Assistant',
                  conversationId: this.conversation?.id,
                  channel: 'voice',
                  notificationEmail: this.assistant.email_notification_address
                });
                referenceId = emailResult?.referenceId;
                logger.info('Voice streaming: Contact request email sent', { referenceId });

                // Send confirmation email to customer (if they provided email)
                if (args.email && referenceId) {
                  await sendCustomerConfirmationEmail(args, referenceId, {
                    assistantName: this.assistant.friendly_name || 'Voice Assistant',
                    companyName: this.assistant.friendly_name || 'our team'
                  });
                  logger.info('Voice streaming: Customer confirmation email sent', { to: args.email, referenceId });
                }
              } catch (emailErr) {
                logger.error('Voice streaming: Failed to send contact request email:', emailErr);
              }

              // If no text was generated, create confirmation
              if (!fullText.trim()) {
                const requestTypeLabel = args.request_type.replace('_', ' ');
                fullText = `Thank you${args.name ? ` ${args.name}` : ''}! I've logged your ${requestTypeLabel}`;
                if (args.address) {
                  fullText += ` regarding ${args.address}`;
                }
                fullText += '.';
                if (referenceId) {
                  fullText += ` Your reference number is ${referenceId}.`;
                }
                fullText += ` Our team will follow up shortly. Is there anything else I can help you with?`;

                // Send the confirmation as a sentence
                onSentence(fullText);
              }
            } catch (fnError) {
              logger.error('Voice streaming: Error processing function call:', fnError);
            }
          }

          // Handle call transfer function
          if (toolCall.name === 'transfer_call') {
            try {
              const args = JSON.parse(toolCall.arguments);
              logger.info('Voice streaming: Transfer call requested', {
                reason: args.reason,
                callSid: this.callSid,
                transferTo: this.transferNumber
              });

              if (this.transferNumber) {
                this.transferRequested = true;

                const transferResult = await transferCall(this.callSid, this.transferNumber, {
                  timeout: 30
                });

                if (transferResult.success) {
                  logger.info('Voice streaming: Call transfer initiated', transferResult);
                  if (!fullText.trim()) {
                    fullText = "I'm transferring you now. Please hold.";
                    onSentence(fullText);
                  }
                } else {
                  logger.error('Voice streaming: Call transfer failed', transferResult);
                  fullText = "I apologize, but I'm unable to transfer your call at the moment. Is there something else I can help you with?";
                  onSentence(fullText);
                }
              } else {
                logger.warn('Voice streaming: Transfer requested but no transfer number configured');
                fullText = "I apologize, but call transfer is not available at the moment. Is there something else I can help you with?";
                onSentence(fullText);
              }
            } catch (fnError) {
              logger.error('Voice streaming: Error processing transfer call:', fnError);
            }
          }

          // Handle SMS to customer function
          if (toolCall.name === 'send_sms_to_customer') {
            try {
              const args = JSON.parse(toolCall.arguments);
              const customerNumber = args.phone_number;

              logger.info('Voice streaming: SMS to customer requested', {
                message: args.message,
                customerNumber
              });

              if (customerNumber) {
                // Send the message directly to the customer
                const smsResult = await sendSMS(customerNumber, args.message, {
                  fromNumber: this.assistant.phone_number || process.env.TWILIO_PHONE_NUMBER
                });

                if (smsResult.success) {
                  logger.info('Voice streaming: SMS sent to customer', { sid: smsResult.sid, to: customerNumber });

                  // Log SMS interaction for billing tracking
                  if (this.assistant?.org_id) {
                    try {
                      await supabaseService.logInteraction({
                        orgId: this.assistant.org_id,
                        assistantId: this.assistantId,
                        interactionType: 'sms_outbound',
                        conversationId: this.conversation?.id || null,
                        sessionId: this.sessionId,
                        contactNumber: customerNumber,
                        cost: 0 // SMS cost is typically flat rate
                      });
                    } catch (logError) {
                      logger.warn('Could not log SMS interaction:', logError.message);
                    }
                  }

                  if (!fullText.trim()) {
                    fullText = "I've sent that SMS to your phone. You should receive it shortly.";
                    onSentence(fullText);
                  }
                } else {
                  logger.error('Voice streaming: SMS to customer failed', smsResult);
                  if (!fullText.trim()) {
                    fullText = "I'm sorry, I wasn't able to send that SMS. Could you please double-check the phone number?";
                    onSentence(fullText);
                  }
                }
              } else {
                logger.warn('Voice streaming: SMS requested but no phone number provided');
                if (!fullText.trim()) {
                  fullText = "I need your mobile phone number to send you an SMS. What's the best number to reach you?";
                  onSentence(fullText);
                }
              }
            } catch (fnError) {
              logger.error('Voice streaming: Error processing SMS to customer:', fnError);
            }
          }
        }
      }

      // Estimate tokens (rough)
      const tokensIn = Math.ceil((systemPrompt.length + kbContext.length + userMessage.length) / 4);

      const GPT_INPUT_COST = 0.15 / 1000000;
      const GPT_OUTPUT_COST = 0.60 / 1000000;
      const gptCost = (tokensIn * GPT_INPUT_COST) + (tokensOut * GPT_OUTPUT_COST);

      return {
        text: fullText,
        tokensIn,
        tokensOut,
        cost: gptCost
      };
    } catch (error) {
      logger.error('GPT streaming failed:', error);
      throw error;
    }
  }

  /**
   * Generate speech with streaming - sends audio chunks immediately as they arrive
   * This is MUCH faster than waiting for full audio
   * @param {string} text - Text to speak
   * @param {function} onAudioChunk - Callback for each chunk: (chunk: Buffer) => void
   */
  async generateSpeechStreaming(text, onAudioChunk) {
    try {
      const voiceId = this.assistant.elevenlabs_voice_id || process.env.ELEVENLABS_VOICE_DEFAULT;

      if (!voiceId) {
        throw new Error('No ElevenLabs voice configured');
      }

      // HARDCODED: Synthetic noise disabled for ALL assistants (causes crackling on phone)
      const backgroundSound = 'none';
      const backgroundVolume = 0.40;

      // Stream audio from ElevenLabs - chunks go directly to callback
      await streamElevenLabsTTS(text, voiceId, onAudioChunk, {
        backgroundSound,
        backgroundVolume
      });

      // Calculate cost
      const elevenLabsCost = text.length * 0.00003;
      this.costs.elevenlabs += elevenLabsCost;
      this.costs.total += elevenLabsCost;

    } catch (error) {
      logger.error('ElevenLabs streaming TTS failed:', error);
      throw error;
    }
  }

  /**
   * Process speech end with STREAMING TTS - smooth audio without sentence gaps!
   * Gets full GPT response then streams TTS as one continuous audio flow.
   * This avoids the audio gaps/clicks between per-sentence TTS calls.
   * @param {function} onAudioChunk - Callback for each audio chunk: (chunk: Buffer) => void
   * @returns {Promise<{transcription, responseText, latency}>}
   */
  async onSpeechEndStreaming(onAudioChunk) {
    if (this.isProcessing) {
      logger.debug('Already processing, ignoring speech end');
      return null;
    }

    this.isProcessing = true;
    const turnStartTime = Date.now();

    try {
      // Get accumulated audio
      const audioBuffer = this.audioBuffer.flush();
      if (audioBuffer.length === 0) {
        this.isProcessing = false;
        return null;
      }

      logger.info('Processing speech (streaming TTS)', {
        callSid: this.callSid,
        audioSizeKB: (audioBuffer.length / 1024).toFixed(2)
      });

      // INSTANT FEEDBACK: Send pre-generated filler audio IMMEDIATELY (if enabled)
      // This plays while transcription and GPT process (eliminates perceived silence)
      const voiceId = this.assistant.elevenlabs_voice_id || process.env.ELEVENLABS_VOICE_DEFAULT;
      const backgroundSound = this.assistant.background_sound || 'none';
      // Enforce minimum 0.40 volume - lower values are inaudible on phone
      const backgroundVolume = Math.max(this.assistant.background_volume || 0.40, 0.40);

      // Check if filler audio is enabled (default true for backwards compatibility)
      if (this.assistant.use_filler_audio !== false) {
        const fillerAudio = getInstantFillerAudio(voiceId, backgroundSound);
        if (fillerAudio) {
          logger.info('Sending instant filler audio', {
            bytes: fillerAudio.length,
            durationMs: Math.round(fillerAudio.length / 8), // 8 bytes per ms at 8kHz
            voiceId,
            backgroundSound
          });
          // Send as one chunk - Twilio handles buffering
          onAudioChunk(fillerAudio);
        } else {
          logger.warn('No filler audio available', { voiceId, backgroundSound });
        }
      } else {
        logger.info('Filler audio disabled for this assistant');
      }

      // Step 1: Transcribe (filler audio plays during this)
      const transcriptionStart = Date.now();
      const transcription = await this.transcribeAudio(audioBuffer);
      const transcriptionLatency = Date.now() - transcriptionStart;

      if (!transcription || transcription.trim().length === 0) {
        logger.warn('Empty transcription, skipping turn');
        this.isProcessing = false;
        return null;
      }

      logger.info('Transcription complete', {
        text: transcription,
        latencyMs: transcriptionLatency
      });

      // Save user message (don't await - do in background)
      if (this.conversation?.id) {
        supabaseService.addMessage({
          conversationId: this.conversation.id,
          role: 'user',
          content: transcription,
          latencyMs: transcriptionLatency
        }).catch(e => logger.warn('Failed to save user message:', e.message));
      }

      // Step 2: Get full GPT response (faster overall than streaming + per-sentence TTS)
      const gptStart = Date.now();
      const gptResponse = await this.generateResponse(transcription);
      const gptLatency = Date.now() - gptStart;

      logger.info('GPT response ready', {
        text: gptResponse.text.substring(0, 50) + '...',
        latencyMs: gptLatency
      });

      // Step 3: Stream TTS for FULL response - continuous audio, no sentence gaps!
      const ttsStart = Date.now();
      let firstChunkSent = false;
      let totalAudioBytes = 0;

      await streamElevenLabsTTS(gptResponse.text, voiceId, (chunk) => {
        if (!firstChunkSent) {
          firstChunkSent = true;
          logger.info('🚀 First TTS chunk!', {
            timeFromGptMs: Date.now() - ttsStart,
            totalLatencyMs: Date.now() - turnStartTime,
            chunkSize: chunk.length
          });
        }
        totalAudioBytes += chunk.length;
        onAudioChunk(chunk);
      }, {
        backgroundSound,
        backgroundVolume
      });

      const ttsLatency = Date.now() - ttsStart;
      const totalLatency = Date.now() - turnStartTime;
      this.turnCount++;

      // Save assistant message (don't await)
      if (this.conversation?.id) {
        supabaseService.addMessage({
          conversationId: this.conversation.id,
          role: 'assistant',
          content: gptResponse.text,
          latencyMs: gptLatency
        }).catch(e => logger.warn('Failed to save assistant message:', e.message));
      }

      // Update costs
      this.costs.gpt += gptResponse.cost;
      this.costs.total += gptResponse.cost;
      // TTS cost
      const elevenLabsCost = gptResponse.text.length * 0.00003;
      this.costs.elevenlabs += elevenLabsCost;
      this.costs.total += elevenLabsCost;

      // Check if we should end the call based on user input or AI response
      const userWantsToEnd = shouldEndCall(transcription, true);
      const aiSaidGoodbye = shouldEndCall(gptResponse.text, false);
      const endCallRequested = userWantsToEnd || aiSaidGoodbye;

      logger.info('Streaming turn complete', {
        turnNumber: this.turnCount,
        transcriptionMs: transcriptionLatency,
        gptMs: gptLatency,
        ttsMs: ttsLatency,
        totalMs: totalLatency,
        audioBytes: totalAudioBytes,
        userWantsToEnd,
        aiSaidGoodbye,
        endCallRequested
      });

      this.isProcessing = false;

      return {
        transcription,
        responseText: gptResponse.text,
        shouldEndCall: endCallRequested,
        latency: {
          transcription: transcriptionLatency,
          gpt: gptLatency,
          tts: ttsLatency,
          total: totalLatency
        }
      };

    } catch (error) {
      logger.error('Error processing speech (streaming):', error);
      this.isProcessing = false;
      throw error;
    }
  }

  async endCall(endReason = 'completed') {
    // Prevent duplicate processing (both 'stop' event and WebSocket 'close' can trigger this)
    if (this.isEnded) {
      logger.debug('endCall already processed, skipping duplicate', { callSid: this.callSid });
      return;
    }
    this.isEnded = true;

    try {
      // Close streaming transcriber if active
      if (this.streamingTranscriber) {
        await this.streamingTranscriber.close().catch(() => {});
        this.streamingTranscriber = null;
      }

      const duration = Math.floor((Date.now() - this.startTime) / 1000);

      // Calculate Twilio costs (approximate: $0.0085/min for voice)
      const twilioMinutes = duration / 60;
      this.costs.twilio = twilioMinutes * 0.0085;
      this.costs.total += this.costs.twilio;

      // End conversation (only if we have a valid session)
      if (this.sessionId) {
        try {
          await supabaseService.endConversation(this.sessionId, {
            endReason,
            duration,
            costs: {
              whisper_cost: this.costs.whisper,
              gpt_cost: this.costs.gpt,
              elevenlabs_cost: this.costs.elevenlabs,
              twilio_cost: this.costs.twilio,
              total_cost: this.costs.total
            }
          });
        } catch (endError) {
          logger.warn('Could not end conversation:', endError.message);
        }
      }

      // Log interaction for billing tracking (only if we have org_id)
      if (this.assistant?.org_id) {
        try {
          await supabaseService.logInteraction({
            orgId: this.assistant.org_id,
            assistantId: this.assistantId,
            interactionType: 'call_inbound',
            conversationId: this.conversation?.id || null,
            sessionId: this.sessionId,
            contactNumber: null,
            durationSeconds: duration,
            cost: this.costs.total,
            campaignId: null
          });
        } catch (logError) {
          logger.warn('Could not log interaction:', logError.message);
        }
      }

      // Auto-score conversation if enabled (optimized for government compliance)
      // Only score if we have a valid conversation ID (not the dummy object)
      if (this.assistant.auto_score !== false && this.conversation?.id) {
        await this.scoreConversation();
      }

      logger.info('Call ended', {
        callSid: this.callSid,
        duration: `${duration}s`,
        turns: this.turnCount,
        costs: this.costs
      });

    } catch (error) {
      logger.error('Error ending call:', error);
    }
  }

  async scoreConversation() {
    try {
      // Get full conversation transcript
      const history = await supabaseService.getConversationHistory(this.sessionId);

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
        .select('name, settings')
        .eq('id', this.assistant.org_id)
        .single();

      // Use assistant-specific rubric, or fallback to org default (stored in settings.default_rubric)
      const rubric = this.assistant.rubric || organization.data?.settings?.default_rubric || null;

      logger.info('Scoring voice conversation:', {
        conversationId: this.conversation.id,
        assistantId: this.assistantId,
        hasCustomRubric: !!rubric
      });

      // Score using optimized GPT-4o-mini scorer (96% cost savings)
      const scoringResult = await scoreConversation({
        transcript,
        rubric,
        conversationType: 'voice',
        organizationName: organization.data?.name || 'Unknown',
        assistantName: this.assistant.friendly_name
      });

      // Add scoring cost to total
      this.costs.scoring = scoringResult.metadata.cost.total;
      this.costs.total += scoringResult.metadata.cost.total;

      // Extract key fields from scoring result
      const overallScore = Math.round(scoringResult.weighted_total_score || scoringResult.confidence_score || 0);
      const successEvaluation = scoringResult.success_evaluation?.overall_success === true;
      const sentiment = scoringResult.sentiments?.overall_sentiment || 'neutral';

      // Update conversation with comprehensive scoring data
      await supabaseService.client
        .from('conversations')
        .update({
          overall_score: overallScore,
          scored: true,
          success_evaluation: successEvaluation,
          sentiment: sentiment,
          kb_used: this.kbUsed,
          kb_results_count: this.kbResultsCount,
          score_details: {
            scores: scoringResult.scores,
            grade: scoringResult.grade,
            sentiments: scoringResult.sentiments,
            flags: scoringResult.flags,
            resident_intents: scoringResult.resident_intents,
            success_evaluation: scoringResult.success_evaluation,
            summary: scoringResult.summary,
            strengths: scoringResult.strengths,
            improvements: scoringResult.improvements,
            confidence_score: scoringResult.confidence_score,
            model_used: 'gpt-4o-mini',
            scoring_type: 'voice',
            cost: scoringResult.metadata?.cost?.total || 0
          }
        })
        .eq('id', this.conversation.id);

      logger.info('Voice conversation scored:', {
        conversationId: this.conversation.id,
        overallScore,
        successEvaluation,
        sentiment,
        kbUsed: this.kbUsed,
        grade: scoringResult.grade,
        scoringCost: scoringResult.metadata?.cost?.total || 0
      });

    } catch (error) {
      logger.error('Conversation scoring failed:', error);
      // Don't throw - scoring failure shouldn't break call end
    }
  }
}

export default VoiceHandler;
