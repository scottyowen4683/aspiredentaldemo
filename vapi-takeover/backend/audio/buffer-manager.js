// audio/buffer-manager.js - Audio buffering and Voice Activity Detection
import logger from '../services/logger.js';

/**
 * Manages audio buffering from Twilio Media Streams
 * Accumulates base64 audio chunks and detects silence
 */
export class BufferManager {
  constructor() {
    this.chunks = [];
    this.lastAudioTime = null;
    this.silenceThreshold = 1500; // 1.5 seconds of silence = speech end
    this.silenceTimer = null;
    this.onSpeechEndCallback = null;
  }

  /**
   * Add audio chunk to buffer
   * @param {string} audioBase64 - Base64 encoded audio from Twilio (μ-law, 8kHz)
   */
  add(audioBase64) {
    this.chunks.push(audioBase64);
    this.lastAudioTime = Date.now();

    // Reset silence timer
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
    }

    // Start new silence timer
    this.silenceTimer = setTimeout(() => {
      this.detectSpeechEnd();
    }, this.silenceThreshold);
  }

  /**
   * Called when silence is detected (user stopped speaking)
   */
  detectSpeechEnd() {
    if (this.chunks.length === 0) {
      return;
    }

    logger.debug('Speech end detected', {
      chunks: this.chunks.length,
      silenceDuration: this.silenceThreshold
    });

    // Trigger callback if set
    if (this.onSpeechEndCallback) {
      this.onSpeechEndCallback();
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
    this.chunks = [];

    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }

    return audio;
  }

  /**
   * Clear all audio without processing
   */
  clear() {
    this.chunks = [];

    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
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
