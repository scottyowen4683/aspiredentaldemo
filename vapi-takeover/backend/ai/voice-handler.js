// ai/voice-handler.js - Complete voice pipeline (VAPI replacement)
import OpenAI from 'openai';
import fs from 'fs';
import os from 'os';
import path from 'path';
import logger from '../services/logger.js';
import supabaseService from '../services/supabase-service.js';
import { streamElevenLabsAudio, streamElevenLabsTTS } from './elevenlabs.js';
import { BufferManager, ulawToWav } from '../audio/buffer-manager.js';
import { scoreConversation } from './rubric-scorer.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Default system prompt - used when assistant has no custom prompt
// This matches the moretonbaypilot chatbot behavior
const DEFAULT_SYSTEM_PROMPT = `You are a helpful, friendly assistant for Aspire AI.

IMPORTANT INSTRUCTIONS:
1. Answer questions using the knowledge base information provided below as your PRIMARY source of truth
2. Be conversational and natural - this is a voice call, so keep responses concise (2-3 sentences max)
3. If the knowledge base contains the answer, use it confidently
4. If the knowledge base does NOT contain the answer, say "I don't have that specific information, but I can help you find the right person to speak with"
5. Never make up information that isn't in the knowledge base
6. Be warm and professional

Remember: You're speaking on a phone call, so be brief and clear.`;

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
  constructor(callSid, assistantId) {
    this.callSid = callSid;
    this.assistantId = assistantId;
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
  }

  async initialize() {
    try {
      // Get assistant configuration
      this.assistant = await supabaseService.getAssistant(this.assistantId);
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

      // Try to create conversation - but don't fail if it errors
      try {
        this.conversation = await supabaseService.createConversation({
          orgId: this.assistant.org_id,
          assistantId: this.assistant.id,
          sessionId: this.sessionId,
          channel: 'voice'
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

      return true;
    } catch (error) {
      logger.error('Voice handler initialization failed:', error);
      throw error;
    }
  }

  async processAudioChunk(audioBase64) {
    // Add to buffer
    this.audioBuffer.add(audioBase64);
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
      // Run embedding and history fetch in parallel for speed
      const [embeddingResult, history] = await Promise.all([
        this.assistant.kb_enabled
          ? openai.embeddings.create({
              model: 'text-embedding-3-small',
              input: userMessage
            })
          : Promise.resolve(null),
        supabaseService.getConversationHistory(this.sessionId)
      ]);

      // Search knowledge base if enabled (RAG)
      let kbContext = '';
      if (this.assistant.kb_enabled && embeddingResult) {
        try {
          const embedding = embeddingResult.data[0].embedding;

          // Search knowledge base using tenant_id (org_id as string)
          const kbResults = await supabaseService.searchKnowledgeBase(
            this.assistant.org_id,
            embedding,
            this.assistant.kb_match_count || 5 // Match moretonbaypilot default
          );

          if (kbResults && kbResults.length > 0) {
            // Format KB context like moretonbaypilot
            kbContext = formatKBContext(kbResults);

            logger.info('Knowledge base context added', {
              matchCount: kbResults.length,
              contextLength: kbContext.length,
              topSimilarity: kbResults[0]?.similarity
            });
          } else {
            logger.info('No KB results found for query', { query: userMessage.substring(0, 50) });
          }
        } catch (kbError) {
          logger.error('Knowledge base search failed:', kbError);
          // Continue without KB context
        }
      }

      // Use assistant's custom prompt, or fall back to default
      const systemPrompt = this.assistant.prompt && this.assistant.prompt.trim()
        ? this.assistant.prompt
        : DEFAULT_SYSTEM_PROMPT;

      // Build messages with knowledge base context
      const messages = [
        {
          role: 'system',
          content: systemPrompt + kbContext
        },
        ...history,
        {
          role: 'user',
          content: userMessage
        }
      ];

      // Call GPT - use gpt-4o-mini for speed
      const completion = await openai.chat.completions.create({
        model: this.assistant.model || 'gpt-4o-mini',
        messages,
        temperature: this.assistant.temperature || 0.7,
        max_tokens: this.assistant.max_tokens || 150,
      });

      const responseText = completion.choices[0].message.content;
      const tokensIn = completion.usage.prompt_tokens;
      const tokensOut = completion.usage.completion_tokens;

      // Calculate cost (GPT-4o-mini pricing)
      const GPT_INPUT_COST = 0.15 / 1000000;
      const GPT_OUTPUT_COST = 0.60 / 1000000;
      const gptCost = (tokensIn * GPT_INPUT_COST) + (tokensOut * GPT_OUTPUT_COST);

      return {
        text: responseText,
        tokensIn,
        tokensOut,
        cost: gptCost
      };
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

      // Get background sound setting from assistant config (default: none)
      const backgroundSound = this.assistant.background_sound || 'none';
      const backgroundVolume = this.assistant.background_volume || 0.15;

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
      // Run embedding and history fetch in parallel for speed
      const [embeddingResult, history] = await Promise.all([
        this.assistant.kb_enabled
          ? openai.embeddings.create({
              model: 'text-embedding-3-small',
              input: userMessage
            })
          : Promise.resolve(null),
        supabaseService.getConversationHistory(this.sessionId)
      ]);

      // Search knowledge base if enabled (RAG)
      let kbContext = '';
      if (this.assistant.kb_enabled && embeddingResult) {
        try {
          const embedding = embeddingResult.data[0].embedding;
          const kbResults = await supabaseService.searchKnowledgeBase(
            this.assistant.org_id,
            embedding,
            this.assistant.kb_match_count || 5
          );
          if (kbResults && kbResults.length > 0) {
            kbContext = formatKBContext(kbResults);
          }
        } catch (kbError) {
          logger.error('Knowledge base search failed:', kbError);
        }
      }

      const systemPrompt = this.assistant.prompt && this.assistant.prompt.trim()
        ? this.assistant.prompt
        : DEFAULT_SYSTEM_PROMPT;

      const messages = [
        { role: 'system', content: systemPrompt + kbContext },
        ...history,
        { role: 'user', content: userMessage }
      ];

      // Stream GPT response
      const stream = await openai.chat.completions.create({
        model: this.assistant.model || 'gpt-4o-mini',
        messages,
        temperature: this.assistant.temperature || 0.7,
        max_tokens: this.assistant.max_tokens || 150,
        stream: true
      });

      let fullText = '';
      let sentenceBuffer = '';
      let tokensOut = 0;

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
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

      // Get background sound setting from assistant config
      const backgroundSound = this.assistant.background_sound || 'none';
      const backgroundVolume = this.assistant.background_volume || 0.15;

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
   * Process speech end with FULL PIPELINE STREAMING - VAPI-like latency!
   * GPT streams tokens → buffer by sentence → stream to ElevenLabs → Twilio
   * Audio starts playing while GPT is still generating!
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

      logger.info('Processing speech (pipelined streaming)', {
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

      // Save user message (don't await - do in background)
      if (this.conversation?.id) {
        supabaseService.addMessage({
          conversationId: this.conversation.id,
          role: 'user',
          content: transcription,
          latencyMs: transcriptionLatency
        }).catch(e => logger.warn('Failed to save user message:', e.message));
      }

      // Step 2 + 3: PIPELINE GPT streaming → ElevenLabs streaming
      // Each sentence from GPT immediately goes to TTS
      const gptStart = Date.now();
      let firstAudioSent = false;
      let totalAudioBytes = 0;
      let sentenceCount = 0;

      // Queue for serializing TTS calls (sentences must play in order)
      const ttsQueue = [];
      let ttsRunning = false;

      const processTTSQueue = async () => {
        if (ttsRunning || ttsQueue.length === 0) return;
        ttsRunning = true;

        while (ttsQueue.length > 0) {
          const sentence = ttsQueue.shift();
          try {
            await this.generateSpeechStreaming(sentence, (chunk) => {
              if (!firstAudioSent) {
                firstAudioSent = true;
                logger.info('🚀 First audio chunk (pipelined)!', {
                  timeToFirstAudioMs: Date.now() - gptStart,
                  totalLatencyMs: Date.now() - turnStartTime,
                  sentence: sentence.substring(0, 30) + '...'
                });
              }
              totalAudioBytes += chunk.length;
              onAudioChunk(chunk);
            });
          } catch (ttsError) {
            logger.error('TTS error for sentence:', ttsError.message);
          }
        }

        ttsRunning = false;
      };

      // Stream GPT and queue sentences for TTS
      const gptResponse = await this.generateResponseStreaming(transcription, (sentence) => {
        sentenceCount++;
        logger.debug('Sentence ready for TTS:', { sentenceCount, sentence: sentence.substring(0, 50) });
        ttsQueue.push(sentence);
        processTTSQueue(); // Start TTS if not already running
      });

      // Wait for all TTS to complete
      while (ttsQueue.length > 0 || ttsRunning) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      const gptLatency = Date.now() - gptStart;
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

      logger.info('Pipelined turn complete', {
        turnNumber: this.turnCount,
        transcriptionMs: transcriptionLatency,
        gptPlusTtsMs: gptLatency,
        totalMs: totalLatency,
        sentences: sentenceCount,
        audioBytes: totalAudioBytes
      });

      this.isProcessing = false;

      return {
        transcription,
        responseText: gptResponse.text,
        latency: {
          transcription: transcriptionLatency,
          gpt: gptLatency,
          tts: 0, // Pipelined with GPT
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
    try {
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
        .select('name, default_rubric')
        .eq('id', this.assistant.org_id)
        .single();

      // Use assistant-specific rubric, or fallback to org default
      const rubric = this.assistant.rubric || organization.data?.default_rubric || null;

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

      // Update conversation with score (using correct schema field names)
      // Schema has: overall_score (integer), scored (boolean), score_details (jsonb)
      const overallScore = Math.round(scoringResult.weighted_total_score || scoringResult.confidence_score || 0);

      await supabaseService.client
        .from('conversations')
        .update({
          overall_score: overallScore,
          scored: true,
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
            model_used: 'gpt-4o-mini',
            scoring_type: 'voice',
            cost: scoringResult.metadata?.cost?.total || 0
          }
        })
        .eq('id', this.conversation.id);

      logger.info('Voice conversation scored:', {
        conversationId: this.conversation.id,
        score: overallScore,
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
