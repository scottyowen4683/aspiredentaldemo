// audio/buffer-manager.js - Audio buffering and Voice Activity Detection (VAD)
import logger from '../services/logger.js';

/**
 * Manages audio buffering from Twilio Media Streams with proper VAD
 * Uses energy-based voice activity detection since Twilio sends continuous audio
 */
export class BufferManager {
  constructor() {
    this.chunks = [];
    this.onSpeechEndCallback = null;

    // VAD configuration - tuned for μ-law telephone audio
    this.silenceThreshold = 5; // Lower threshold - μ-law silence is very low energy
    this.speechStarted = false;
    this.silentChunksCount = 0;
    this.silentChunksRequired = 25; // ~500ms of silence (was 800ms - saves 300ms latency)
    this.minSpeechChunks = 5; // Minimum chunks to consider valid speech (~100ms)
    this.speechChunksCount = 0;
    this.totalChunksReceived = 0;

    // Debounce for processing
    this.processingTimeout = null;
    this.processDelay = 50; // Small delay to batch final silence detection
  }

  /**
   * Calculate energy of μ-law audio chunk
   * For μ-law: 0xFF and 0x7F are silence (bias points)
   * Deviation from these values indicates audio energy
   * @param {string} audioBase64 - Base64 encoded μ-law audio
   * @returns {number} Energy level (0-127 scale)
   */
  calculateEnergy(audioBase64) {
    const buffer = Buffer.from(audioBase64, 'base64');
    if (buffer.length === 0) return 0;

    let totalDeviation = 0;

    for (let i = 0; i < buffer.length; i++) {
      const sample = buffer[i];
      // μ-law silence is around 0x7F (127) or 0xFF (255)
      // Calculate deviation from silence points
      const devFrom7F = Math.abs(sample - 0x7F);
      const devFromFF = Math.abs(sample - 0xFF);
      // Use the smaller deviation (closer to a silence point = lower energy)
      const deviation = Math.min(devFrom7F, devFromFF);
      totalDeviation += deviation;
    }

    // Return average deviation (0-127 scale)
    return totalDeviation / buffer.length;
  }

  /**
   * Add audio chunk to buffer with VAD
   * @param {string} audioBase64 - Base64 encoded audio from Twilio (μ-law, 8kHz)
   */
  add(audioBase64) {
    this.totalChunksReceived++;
    const energy = this.calculateEnergy(audioBase64);
    const isSpeech = energy > this.silenceThreshold;

    // Log every 50 chunks to monitor
    if (this.totalChunksReceived % 50 === 0) {
      logger.info('VAD status', {
        totalChunks: this.totalChunksReceived,
        currentEnergy: energy.toFixed(2),
        threshold: this.silenceThreshold,
        speechStarted: this.speechStarted,
        speechChunks: this.speechChunksCount,
        silentChunks: this.silentChunksCount,
        bufferedChunks: this.chunks.length
      });
    }

    // Always add chunks once speech has started
    if (this.speechStarted || isSpeech) {
      this.chunks.push(audioBase64);
    }

    if (isSpeech) {
      // Speech detected
      if (!this.speechStarted) {
        this.speechStarted = true;
        this.speechChunksCount = 0;
        logger.info('🎤 Speech STARTED', { energy: energy.toFixed(2), threshold: this.silenceThreshold });
      }
      this.speechChunksCount++;
      this.silentChunksCount = 0;

      // Clear any pending processing
      if (this.processingTimeout) {
        clearTimeout(this.processingTimeout);
        this.processingTimeout = null;
      }
    } else if (this.speechStarted) {
      // Silence during speech - count consecutive silent chunks
      this.silentChunksCount++;

      if (this.silentChunksCount >= this.silentChunksRequired) {
        // Enough silence detected - trigger speech end
        if (!this.processingTimeout) {
          logger.info('🔇 Silence detected, scheduling speech end', {
            silentChunks: this.silentChunksCount,
            speechChunks: this.speechChunksCount
          });
          this.processingTimeout = setTimeout(() => {
            this.detectSpeechEnd();
          }, this.processDelay);
        }
      }
    }
  }

  /**
   * Called when silence is detected after speech
   */
  detectSpeechEnd() {
    this.processingTimeout = null;

    // Only process if we had meaningful speech
    if (this.speechChunksCount < this.minSpeechChunks) {
      logger.info('Ignoring short audio', {
        speechChunks: this.speechChunksCount,
        minRequired: this.minSpeechChunks
      });
      this.reset();
      return;
    }

    logger.info('🎙️ Speech END - triggering processing', {
      totalChunks: this.chunks.length,
      speechChunks: this.speechChunksCount,
      silentChunks: this.silentChunksCount,
      estimatedDurationMs: this.chunks.length * 20 // ~20ms per chunk
    });

    // IMPORTANT: Mark as not started BEFORE callback to prevent re-triggering
    // The callback will call flush() which does full reset, but we need to
    // prevent new silence chunks from triggering detectSpeechEnd again
    this.speechStarted = false;

    // Trigger callback if set
    if (this.onSpeechEndCallback) {
      this.onSpeechEndCallback();
    }
  }

  /**
   * Reset state for next utterance
   */
  reset() {
    this.speechStarted = false;
    this.silentChunksCount = 0;
    this.speechChunksCount = 0;
    this.chunks = [];

    if (this.processingTimeout) {
      clearTimeout(this.processingTimeout);
      this.processingTimeout = null;
    }
  }

  /**
   * Set callback for speech end detection
   */
  onSpeechEnd(callback) {
    this.onSpeechEndCallback = callback;
  }

  /**
   * Get all accumulated audio and clear buffer
   * @returns {Buffer} Concatenated raw audio buffer (NOT base64)
   */
  flush() {
    // Decode each base64 chunk and concatenate into single buffer
    const buffers = this.chunks.map(chunk => Buffer.from(chunk, 'base64'));
    const totalBuffer = Buffer.concat(buffers);

    logger.info('Flushing audio buffer', {
      chunks: this.chunks.length,
      totalBytes: totalBuffer.length,
      estimatedDurationSec: (totalBuffer.length / 8000).toFixed(2)
    });

    this.reset();
    return totalBuffer;
  }

  /**
   * Clear all audio without processing
   */
  clear() {
    this.reset();
  }

  /**
   * Get current buffer size in chunks
   */
  size() {
    return this.chunks.length;
  }

  /**
   * Check if buffer is empty
   */
  isEmpty() {
    return this.chunks.length === 0;
  }
}

/**
 * Convert Twilio μ-law audio to PCM WAV for Whisper
 * @param {Buffer} ulawBuffer - Raw μ-law audio buffer (already decoded from base64)
 * @returns {Buffer} WAV file buffer
 */
export function ulawToWav(ulawBuffer) {
  // Ensure we have a buffer
  if (!Buffer.isBuffer(ulawBuffer)) {
    throw new Error('ulawToWav expects a Buffer, not a string');
  }

  logger.info('Converting μ-law to WAV', {
    inputBytes: ulawBuffer.length,
    estimatedDurationSec: (ulawBuffer.length / 8000).toFixed(2)
  });

  // μ-law to PCM conversion (ITU-T G.711)
  const mulaw2pcm = (mulaw) => {
    // Invert all bits
    mulaw = ~mulaw & 0xFF;

    // Extract sign, exponent, and mantissa
    const sign = (mulaw & 0x80) ? -1 : 1;
    const exponent = (mulaw >> 4) & 0x07;
    const mantissa = mulaw & 0x0F;

    // Compute linear value
    let linear = ((mantissa << 3) + 0x84) << exponent;
    linear -= 0x84;

    return sign * linear;
  };

  // Convert μ-law to 16-bit PCM
  const pcmSamples = new Int16Array(ulawBuffer.length);
  for (let i = 0; i < ulawBuffer.length; i++) {
    pcmSamples[i] = mulaw2pcm(ulawBuffer[i]);
  }

  // Create WAV header
  const sampleRate = 8000; // Twilio uses 8kHz
  const numChannels = 1; // Mono
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const dataSize = pcmSamples.length * 2;

  const header = Buffer.alloc(44);

  // RIFF header
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);

  // fmt chunk
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);

  // data chunk
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  // Combine header and PCM data
  const pcmBuffer = Buffer.from(pcmSamples.buffer);
  return Buffer.concat([header, pcmBuffer]);
}
