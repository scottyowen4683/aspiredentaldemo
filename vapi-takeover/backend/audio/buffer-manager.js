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

    // VAD configuration
    this.silenceThreshold = 10; // μ-law energy threshold (adjust as needed)
    this.speechStarted = false;
    this.silentChunksCount = 0;
    this.silentChunksRequired = 25; // ~500ms of silence at 20ms chunks (8000 Hz / 160 samples)
    this.minSpeechChunks = 10; // Minimum chunks to consider valid speech
    this.speechChunksCount = 0;

    // Debounce for processing
    this.processingTimeout = null;
    this.processDelay = 100; // Small delay to batch final silence detection
  }

  /**
   * Calculate energy (RMS-like) of μ-law audio chunk
   * @param {string} audioBase64 - Base64 encoded μ-law audio
   * @returns {number} Energy level
   */
  calculateEnergy(audioBase64) {
    const buffer = Buffer.from(audioBase64, 'base64');
    let energy = 0;

    for (let i = 0; i < buffer.length; i++) {
      // μ-law decode to get approximate amplitude
      // In μ-law, 0x7F and 0xFF are near-silence
      const sample = buffer[i];
      // Convert μ-law sample to approximate linear value
      const sign = sample & 0x80;
      const magnitude = ~sample & 0x7F;
      const exponent = (magnitude >> 4) & 0x07;
      const mantissa = magnitude & 0x0F;
      let linear = (mantissa << (exponent + 3)) + (1 << (exponent + 3)) - 132;
      if (linear < 0) linear = 0;
      energy += linear;
    }

    return buffer.length > 0 ? energy / buffer.length : 0;
  }

  /**
   * Add audio chunk to buffer with VAD
   * @param {string} audioBase64 - Base64 encoded audio from Twilio (μ-law, 8kHz)
   */
  add(audioBase64) {
    const energy = this.calculateEnergy(audioBase64);
    const isSpeech = energy > this.silenceThreshold;

    // Always add chunks during speech
    if (this.speechStarted || isSpeech) {
      this.chunks.push(audioBase64);
    }

    if (isSpeech) {
      // Speech detected
      if (!this.speechStarted) {
        this.speechStarted = true;
        this.speechChunksCount = 0;
        logger.debug('Speech started', { energy });
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
        // Use small delay to ensure we don't cut off mid-word
        if (!this.processingTimeout) {
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
      logger.debug('Ignoring short audio', {
        speechChunks: this.speechChunksCount,
        minRequired: this.minSpeechChunks
      });
      this.reset();
      return;
    }

    logger.info('Speech end detected', {
      totalChunks: this.chunks.length,
      speechChunks: this.speechChunksCount,
      silentChunks: this.silentChunksCount
    });

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
   * @returns {string} Concatenated base64 audio
   */
  flush() {
    const audio = this.chunks.join('');
    this.reset();
    return audio;
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
 * @param {string} ulawBase64 - Base64 encoded μ-law audio
 * @returns {Buffer} WAV file buffer
 */
export function ulawToWav(ulawBase64) {
  // Decode base64
  const ulawBuffer = Buffer.from(ulawBase64, 'base64');

  // μ-law to PCM conversion table
  const mulaw2pcm = (mulaw) => {
    const MULAW_BIAS = 0x84;
    const MULAW_MAX = 0x1FFF;

    mulaw = ~mulaw;
    const sign = mulaw & 0x80;
    const exponent = (mulaw >> 4) & 0x07;
    const mantissa = mulaw & 0x0F;

    let sample = mantissa << (exponent + 3);
    sample += MULAW_BIAS;

    if (exponent === 0) sample += 0x84;
    if (sample > MULAW_MAX) sample = MULAW_MAX;

    return sign ? -sample : sample;
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
