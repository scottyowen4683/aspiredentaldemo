// services/deepgram-streaming.js - Real-time Deepgram WebSocket transcription
// Transcribes audio in real-time as user speaks - when they stop, transcription is ready!
import WebSocket from 'ws';
import logger from './logger.js';

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
const DEEPGRAM_WS_URL = 'wss://api.deepgram.com/v1/listen';

/**
 * Real-time streaming transcriber using Deepgram WebSocket
 * Opens connection at call start, sends audio chunks in real-time,
 * receives transcription as user speaks (not after!)
 */
export class DeepgramStreamingTranscriber {
  constructor(options = {}) {
    this.ws = null;
    this.isConnected = false;
    this.isClosing = false;

    // Transcription state
    this.currentTranscript = '';      // Accumulates final transcripts
    this.interimTranscript = '';      // Latest interim (non-final) result
    this.lastSpeechTime = 0;          // Track when we last heard speech

    // Callbacks
    this.onTranscript = options.onTranscript || null;     // Called on each final transcript
    this.onInterim = options.onInterim || null;           // Called on interim results (optional)
    this.onSpeechEnd = options.onSpeechEnd || null;       // Called when speech ends with full transcript

    // Configuration
    this.language = options.language || 'en-AU';
    this.model = options.model || 'nova-2';
    this.silenceTimeout = options.silenceTimeout || 1000; // ms of silence to trigger speech end
    this.silenceTimer = null;

    // Stats
    this.audioBytesSent = 0;
    this.startTime = null;
  }

  /**
   * Connect to Deepgram WebSocket
   * Call this when the phone call starts
   */
  async connect() {
    if (!DEEPGRAM_API_KEY) {
      throw new Error('DEEPGRAM_API_KEY not configured');
    }

    return new Promise((resolve, reject) => {
      // Build URL with query params for configuration
      const params = new URLSearchParams({
        model: this.model,
        language: this.language,
        encoding: 'mulaw',       // Twilio sends μ-law
        sample_rate: '8000',     // Twilio uses 8kHz
        channels: '1',           // Mono
        punctuate: 'true',
        interim_results: 'true', // Get results while speaking
        endpointing: '300',      // Detect speech end after 300ms silence
        utterance_end_ms: '1000', // Finalize utterance after 1s silence
        vad_events: 'true'       // Voice activity detection events
      });

      const url = `${DEEPGRAM_WS_URL}?${params.toString()}`;

      this.ws = new WebSocket(url, {
        headers: {
          'Authorization': `Token ${DEEPGRAM_API_KEY}`
        }
      });

      this.ws.on('open', () => {
        this.isConnected = true;
        this.startTime = Date.now();
        logger.info('Deepgram WebSocket connected', {
          model: this.model,
          language: this.language
        });
        resolve();
      });

      this.ws.on('message', (data) => {
        this.handleMessage(data);
      });

      this.ws.on('error', (error) => {
        logger.error('Deepgram WebSocket error:', error.message);
        if (!this.isConnected) {
          reject(error);
        }
      });

      this.ws.on('close', (code, reason) => {
        this.isConnected = false;
        logger.info('Deepgram WebSocket closed', {
          code,
          reason: reason?.toString(),
          audioBytesSent: this.audioBytesSent,
          durationMs: this.startTime ? Date.now() - this.startTime : 0
        });
      });

      // Timeout connection attempt
      setTimeout(() => {
        if (!this.isConnected) {
          this.ws?.close();
          reject(new Error('Deepgram connection timeout'));
        }
      }, 5000);
    });
  }

  /**
   * Handle incoming Deepgram messages
   */
  handleMessage(data) {
    try {
      const response = JSON.parse(data.toString());

      // Handle different message types
      if (response.type === 'Results') {
        const transcript = response.channel?.alternatives?.[0]?.transcript || '';
        const isFinal = response.is_final;
        const speechFinal = response.speech_final;

        if (transcript) {
          this.lastSpeechTime = Date.now();

          if (isFinal) {
            // Final transcript for this segment - accumulate
            this.currentTranscript += (this.currentTranscript ? ' ' : '') + transcript;
            this.interimTranscript = '';

            logger.debug('Deepgram final transcript', {
              segment: transcript,
              accumulated: this.currentTranscript.substring(0, 50)
            });

            if (this.onTranscript) {
              this.onTranscript(transcript, this.currentTranscript);
            }
          } else {
            // Interim result - show what's being said
            this.interimTranscript = transcript;

            if (this.onInterim) {
              this.onInterim(transcript);
            }
          }

          // Reset silence timer on any speech
          this.resetSilenceTimer();
        }

        // Speech final means Deepgram detected end of utterance
        if (speechFinal && this.currentTranscript) {
          logger.info('Deepgram speech_final detected', {
            transcript: this.currentTranscript
          });
          this.triggerSpeechEnd();
        }
      } else if (response.type === 'UtteranceEnd') {
        // Deepgram detected end of utterance
        if (this.currentTranscript) {
          logger.info('Deepgram UtteranceEnd', {
            transcript: this.currentTranscript
          });
          this.triggerSpeechEnd();
        }
      } else if (response.type === 'SpeechStarted') {
        logger.debug('Deepgram speech started');
        this.clearSilenceTimer();
      } else if (response.type === 'Metadata') {
        logger.debug('Deepgram metadata', response);
      } else if (response.type === 'Error') {
        logger.error('Deepgram error:', response);
      }
    } catch (error) {
      logger.error('Error parsing Deepgram message:', error);
    }
  }

  /**
   * Reset silence detection timer
   */
  resetSilenceTimer() {
    this.clearSilenceTimer();

    this.silenceTimer = setTimeout(() => {
      // If we have accumulated transcript and silence, trigger speech end
      if (this.currentTranscript) {
        logger.info('Silence timeout - triggering speech end', {
          transcript: this.currentTranscript,
          silenceMs: this.silenceTimeout
        });
        this.triggerSpeechEnd();
      }
    }, this.silenceTimeout);
  }

  /**
   * Clear silence timer
   */
  clearSilenceTimer() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  /**
   * Trigger speech end callback with accumulated transcript
   */
  triggerSpeechEnd() {
    this.clearSilenceTimer();

    const transcript = this.currentTranscript.trim();
    if (transcript && this.onSpeechEnd) {
      // Reset state BEFORE callback to prevent re-triggering
      this.currentTranscript = '';
      this.interimTranscript = '';

      this.onSpeechEnd(transcript);
    }
  }

  /**
   * Send audio chunk to Deepgram
   * Call this for each audio chunk from Twilio (already base64 decoded)
   * @param {Buffer} audioBuffer - Raw μ-law audio bytes
   */
  sendAudio(audioBuffer) {
    if (!this.isConnected || this.isClosing || !this.ws) {
      return false;
    }

    try {
      this.ws.send(audioBuffer);
      this.audioBytesSent += audioBuffer.length;
      return true;
    } catch (error) {
      logger.error('Error sending audio to Deepgram:', error);
      return false;
    }
  }

  /**
   * Send base64 encoded audio (direct from Twilio)
   * @param {string} audioBase64 - Base64 encoded μ-law audio
   */
  sendAudioBase64(audioBase64) {
    const buffer = Buffer.from(audioBase64, 'base64');
    return this.sendAudio(buffer);
  }

  /**
   * Get current accumulated transcript (for checking mid-speech)
   */
  getCurrentTranscript() {
    return this.currentTranscript + (this.interimTranscript ? ' ' + this.interimTranscript : '');
  }

  /**
   * Flush any pending transcript and get result
   * Use this when you need to force-get the transcript (e.g., before processing)
   */
  flushTranscript() {
    const transcript = this.getCurrentTranscript().trim();
    this.currentTranscript = '';
    this.interimTranscript = '';
    this.clearSilenceTimer();
    return transcript;
  }

  /**
   * Close the WebSocket connection
   * Call this when the phone call ends
   */
  async close() {
    if (this.isClosing || !this.ws) {
      return;
    }

    this.isClosing = true;
    this.clearSilenceTimer();

    return new Promise((resolve) => {
      // Send close message to Deepgram
      if (this.isConnected) {
        try {
          // Send empty buffer to signal end
          this.ws.send(JSON.stringify({ type: 'CloseStream' }));
        } catch (e) {
          // Ignore errors during close
        }
      }

      // Close WebSocket
      this.ws.close();

      // Resolve after a short delay
      setTimeout(resolve, 100);
    });
  }
}

/**
 * Create a streaming transcriber for a call
 * @param {Object} options - Configuration options
 * @returns {DeepgramStreamingTranscriber}
 */
export function createStreamingTranscriber(options = {}) {
  return new DeepgramStreamingTranscriber(options);
}

export default DeepgramStreamingTranscriber;
