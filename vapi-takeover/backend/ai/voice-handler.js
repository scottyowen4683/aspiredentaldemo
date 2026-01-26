// ai/voice-handler.js - Complete voice pipeline (VAPI replacement)
import OpenAI from 'openai';
import fs from 'fs';
import os from 'os';
import path from 'path';
import logger from '../services/logger.js';
import supabaseService from '../services/supabase-service.js';
import { streamElevenLabsAudio } from './elevenlabs.js';
import { BufferManager, ulawToWav } from '../audio/buffer-manager.js';
import { scoreConversation } from './rubric-scorer.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

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
        throw new Error(`Assistant not found: ${this.assistantId}`);
      }

      // Create conversation
      this.conversation = await supabaseService.createConversation({
        orgId: this.assistant.org_id,
        assistantId: this.assistant.id,
        sessionId: this.sessionId,
        channel: 'voice'
      });

      // Add system message
      await supabaseService.addMessage({
        conversationId: this.conversation.id,
        role: 'system',
        content: this.assistant.prompt
      });

      logger.info('Voice handler initialized', {
        callSid: this.callSid,
        assistantId: this.assistantId,
        conversationId: this.conversation.id
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

      // Save user message
      await supabaseService.addMessage({
        conversationId: this.conversation.id,
        role: 'user',
        content: transcription,
        latencyMs: transcriptionLatency
      });

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

      // Save assistant message
      await supabaseService.addMessage({
        conversationId: this.conversation.id,
        role: 'assistant',
        content: gptResponse.text,
        latencyMs: gptLatency
      });

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
    // Write to temp file - most reliable method for OpenAI SDK
    const tempFile = path.join(os.tmpdir(), `whisper-${this.callSid}-${Date.now()}.wav`);

    try {
      // Convert μ-law base64 audio from Twilio to WAV format for Whisper
      const wavBuffer = ulawToWav(audioBuffer);

      logger.info('Audio converted to WAV', {
        inputSizeKB: (audioBuffer.length / 1024).toFixed(2),
        outputSizeKB: (wavBuffer.length / 1024).toFixed(2),
        tempFile
      });

      // Write WAV to temp file
      fs.writeFileSync(tempFile, wavBuffer);

      // Call Whisper API using fs.createReadStream (most reliable)
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

      // Calculate cost (Whisper: $0.006 per minute)
      const ulawBytes = Buffer.from(audioBuffer, 'base64').length;
      const durationSeconds = ulawBytes / 8000; // 8kHz sample rate
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
      // Clean up temp file
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
      // Get conversation history
      const history = await supabaseService.getConversationHistory(this.sessionId);

      // Search knowledge base if enabled (RAG)
      let kbContext = '';
      if (this.assistant.kb_enabled) {
        try {
          // Create embedding for the user's message
          const embeddingResponse = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: userMessage
          });

          const embedding = embeddingResponse.data[0].embedding;

          // Search knowledge base
          const kbResults = await supabaseService.searchKnowledgeBase(
            this.assistant.org_id,
            embedding,
            this.assistant.kb_match_count || 3 // Fewer results for voice (shorter context)
          );

          if (kbResults && kbResults.length > 0) {
            kbContext = '\n\nRelevant information from knowledge base:\n' +
              kbResults.map(r => `${r.heading ? r.heading + ':\n' : ''}${r.content}`).join('\n\n');

            logger.info('Knowledge base context added', {
              matchCount: kbResults.length,
              contextLength: kbContext.length
            });
          }
        } catch (kbError) {
          logger.error('Knowledge base search failed:', kbError);
          // Continue without KB context
        }
      }

      // Build messages with knowledge base context
      const messages = [
        {
          role: 'system',
          content: this.assistant.prompt + kbContext
        },
        ...history,
        {
          role: 'user',
          content: userMessage
        }
      ];

      // Call GPT
      const completion = await openai.chat.completions.create({
        model: this.assistant.model || 'gpt-4o-mini',
        messages,
        temperature: this.assistant.temperature || 0.7,
        max_tokens: this.assistant.max_tokens || 150, // Keep responses short for voice
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

      // Stream audio from ElevenLabs
      const audioStream = await streamElevenLabsAudio(text, voiceId);

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

  async endCall(endReason = 'completed') {
    try {
      const duration = Math.floor((Date.now() - this.startTime) / 1000);

      // Calculate Twilio costs (approximate: $0.0085/min for voice)
      const twilioMinutes = duration / 60;
      this.costs.twilio = twilioMinutes * 0.0085;
      this.costs.total += this.costs.twilio;

      // End conversation
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

      // Log interaction for billing tracking
      await supabaseService.logInteraction({
        orgId: this.assistant.org_id,
        assistantId: this.assistantId,
        interactionType: 'call_inbound', // TODO: Detect if outbound from campaign
        conversationId: this.conversation.id,
        sessionId: this.sessionId,
        contactNumber: null, // TODO: Pass caller number from stream params
        durationSeconds: duration,
        cost: this.costs.total,
        campaignId: null // TODO: Pass campaign ID if outbound campaign call
      });

      // Auto-score conversation if enabled (optimized for government compliance)
      if (this.assistant.auto_score !== false && this.conversation) {
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

      // Save score to database
      await supabaseService.client
        .from('conversation_scores')
        .insert({
          conversation_id: this.conversation.id,
          overall_score: scoringResult.overallScore,
          dimension_scores: scoringResult.dimensions,
          flags: scoringResult.flags,
          feedback: scoringResult.feedback,
          cost: scoringResult.metadata.cost.total,
          model_used: 'gpt-4o-mini',
          scoring_type: 'voice'
        });

      // Update conversation with score
      await supabaseService.client
        .from('conversations')
        .update({
          confidence_score: scoringResult.weighted_total_score || scoringResult.overallScore,
          scored_at: new Date().toISOString()
        })
        .eq('id', this.conversation.id);

      logger.info('Voice conversation scored:', {
        conversationId: this.conversation.id,
        score: scoringResult.overallScore,
        flags: scoringResult.flags.length,
        scoringCost: scoringResult.metadata.cost.total
      });

    } catch (error) {
      logger.error('Conversation scoring failed:', error);
      // Don't throw - scoring failure shouldn't break call end
    }
  }
}

export default VoiceHandler;
