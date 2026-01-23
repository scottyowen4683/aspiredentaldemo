// ai/voice-handler.js - Complete voice pipeline (VAPI replacement)
import OpenAI from 'openai';
import logger from '../services/logger.js';
import supabaseService from '../services/supabase-service.js';
import { streamElevenLabsAudio } from './elevenlabs.js';
import { BufferManager } from '../audio/buffer-manager.js';

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
    try {
      // Convert base64 to buffer
      const buffer = Buffer.from(audioBuffer, 'base64');

      // Create file-like object for Whisper
      const file = new File([buffer], 'audio.wav', { type: 'audio/wav' });

      // Call Whisper API
      const transcription = await openai.audio.transcriptions.create({
        file: file,
        model: 'whisper-1',
        language: 'en',
        response_format: 'json'
      });

      // Calculate cost (Whisper: $0.006 per minute)
      // Assuming 16kHz, 16-bit mono audio
      const durationSeconds = buffer.length / (16000 * 2);
      const whisperCost = (durationSeconds / 60) * 0.006;

      this.costs.whisper += whisperCost;
      this.costs.total += whisperCost;

      return transcription.text;
    } catch (error) {
      logger.error('Whisper transcription failed:', error);
      throw error;
    }
  }

  async generateResponse(userMessage) {
    try {
      // Get conversation history
      const history = await supabaseService.getConversationHistory(this.sessionId);

      // Build messages
      const messages = [
        {
          role: 'system',
          content: this.assistant.prompt
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

      // Increment assistant interaction count
      await supabaseService.incrementInteractions(this.assistantId);

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
}

export default VoiceHandler;
