// ai/elevenlabs.js - ElevenLabs Text-to-Speech integration with streaming
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../services/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';

// Background audio cache - cleared on deploy to regenerate with updated settings
let backgroundAudioCache = {};

// Clear cache on module load to ensure fresh generation with current settings
backgroundAudioCache = {};

/**
 * Generate synthetic background noise (μ-law 8kHz format)
 * Creates 10 seconds of loopable ambient noise
 * @param {string} type - Type: 'office' (soft murmur), 'cafe' (busier), 'white'
 * @returns {Buffer}
 */
function generateBackgroundNoise(type) {
  const sampleRate = 8000;
  const duration = 10; // 10 seconds of loopable audio
  const samples = sampleRate * duration;
  const buffer = Buffer.alloc(samples);

  // Parameters based on type - INCREASED for audibility
  let noiseLevel = 0.15; // Base noise level (was 0.03)
  let lowPassFreq = 500;

  switch (type) {
    case 'office':
      noiseLevel = 0.12; // Noticeable office ambience (was 0.025)
      lowPassFreq = 600;
      break;
    case 'cafe':
      noiseLevel = 0.18; // Busier cafe sound (was 0.04)
      lowPassFreq = 800;
      break;
    case 'white':
    default:
      noiseLevel = 0.10;
      lowPassFreq = 400;
  }

  // Generate pink-ish noise with low-pass filtering
  let lastSample = 127; // μ-law silence
  for (let i = 0; i < samples; i++) {
    // Generate noise - stronger amplitude
    const noise = (Math.random() - 0.5) * 2 * noiseLevel * 128;

    // Simple low-pass filter (smoothing)
    const alpha = lowPassFreq / (lowPassFreq + sampleRate);
    const filtered = lastSample + alpha * (127 + noise - lastSample);
    lastSample = filtered;

    // Convert to μ-law range (0-255, 127 = silence)
    buffer[i] = Math.max(0, Math.min(255, Math.round(filtered)));
  }

  logger.info(`Generated ${type} background noise`, { samples, duration: `${duration}s`, noiseLevel });
  return buffer;
}

/**
 * Load background audio file (μ-law 8kHz format)
 * Falls back to generated noise if file doesn't exist
 * @param {string} type - Type of background: 'office', 'cafe', 'none'
 * @returns {Buffer|null}
 */
function loadBackgroundAudio(type) {
  if (type === 'none' || !type) return null;
  if (backgroundAudioCache[type]) return backgroundAudioCache[type];

  // Try to load from file first
  try {
    const audioDir = path.join(__dirname, '..', 'audio');
    const audioPath = path.join(audioDir, `background-${type}.ulaw`);

    if (fs.existsSync(audioPath)) {
      backgroundAudioCache[type] = fs.readFileSync(audioPath);
      logger.info(`Loaded background audio from file: ${type}`, { size: backgroundAudioCache[type].length });
      return backgroundAudioCache[type];
    }
  } catch (error) {
    logger.warn(`Failed to load background audio file ${type}:`, error.message);
  }

  // Generate synthetic noise as fallback
  logger.info(`Generating synthetic background audio: ${type}`);
  backgroundAudioCache[type] = generateBackgroundNoise(type);
  return backgroundAudioCache[type];
}

/**
 * Mix TTS audio with background noise (both μ-law 8kHz)
 * Uses additive mixing for more natural sound
 * @param {Buffer} ttsAudio - Main TTS audio
 * @param {Buffer} backgroundAudio - Background audio loop
 * @param {number} backgroundVolume - 0.0 to 1.0 (default 0.15 = 15%)
 * @returns {Buffer}
 */
function mixAudioWithBackground(ttsAudio, backgroundAudio, backgroundVolume = 0.15) {
  if (!backgroundAudio) return ttsAudio;

  const mixed = Buffer.alloc(ttsAudio.length);

  for (let i = 0; i < ttsAudio.length; i++) {
    // Get background sample (loop if needed)
    const bgIndex = i % backgroundAudio.length;

    // μ-law values are 0-255, with 127 being silence
    // Convert to signed for mixing: -128 to +127
    const ttsSignedValue = ttsAudio[i] - 127;
    const bgSignedValue = backgroundAudio[bgIndex] - 127;

    // Additive mixing: TTS at full volume + background at specified volume
    // This preserves the TTS audio while adding background ambience
    const mixedSigned = ttsSignedValue + (bgSignedValue * backgroundVolume);

    // Soft clip to prevent harsh distortion
    const clipped = Math.tanh(mixedSigned / 100) * 100;

    // Convert back to unsigned μ-law range
    mixed[i] = Math.max(0, Math.min(255, Math.round(clipped + 127)));
  }

  return mixed;
}

/**
 * Stream audio from ElevenLabs TTS - returns chunks as they're generated
 * This is MUCH faster for first-byte latency
 * @param {string} text - Text to convert to speech
 * @param {string} voiceId - ElevenLabs voice ID
 * @param {function} onChunk - Callback for each audio chunk: (chunk: Buffer) => void
 * @param {Object} options - Optional settings
 * @param {string} options.backgroundSound - Background sound type: 'office', 'cafe', 'none'
 * @param {number} options.backgroundVolume - Background volume 0.0-1.0 (default 0.15)
 * @returns {Promise<void>}
 */
export async function streamElevenLabsTTS(text, voiceId, onChunk, options = {}) {
  const { backgroundSound = 'none', backgroundVolume = 0.15 } = options;
  const bgAudio = backgroundSound !== 'none' ? loadBackgroundAudio(backgroundSound) : null;
  let bgOffset = 0; // Track position in background audio loop
  try {
    if (!ELEVENLABS_API_KEY) {
      throw new Error('ELEVENLABS_API_KEY not configured');
    }

    const startTime = Date.now();
    let firstChunkTime = null;
    let totalBytes = 0;

    logger.info('Starting ElevenLabs streaming TTS', {
      voiceId,
      textLength: text.length
    });

    // Use streaming endpoint for low latency
    const response = await axios({
      method: 'POST',
      url: `${ELEVENLABS_API_URL}/text-to-speech/${voiceId}/stream`,
      data: {
        text,
        model_id: 'eleven_turbo_v2_5', // Turbo model for lowest latency
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.8,
          style: 0.0,
          use_speaker_boost: true
        }
      },
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      },
      params: {
        output_format: 'ulaw_8000', // μ-law 8kHz for Twilio
        optimize_streaming_latency: 4 // Maximum optimization (0-4)
      },
      responseType: 'stream',
      timeout: 30000
    });

    return new Promise((resolve, reject) => {
      response.data.on('data', (chunk) => {
        if (!firstChunkTime) {
          firstChunkTime = Date.now();
          logger.info('ElevenLabs first chunk received', {
            latencyMs: firstChunkTime - startTime,
            chunkSize: chunk.length,
            backgroundSound: backgroundSound || 'none'
          });
        }
        totalBytes += chunk.length;

        // Mix with background audio if available (additive mixing)
        let outputChunk = chunk;
        if (bgAudio) {
          outputChunk = Buffer.alloc(chunk.length);
          for (let i = 0; i < chunk.length; i++) {
            const bgIndex = (bgOffset + i) % bgAudio.length;
            // Convert to signed for mixing
            const ttsSignedValue = chunk[i] - 127;
            const bgSignedValue = bgAudio[bgIndex] - 127;
            // Additive mix with soft clipping
            const mixedSigned = ttsSignedValue + (bgSignedValue * backgroundVolume);
            const clipped = Math.tanh(mixedSigned / 100) * 100;
            outputChunk[i] = Math.max(0, Math.min(255, Math.round(clipped + 127)));
          }
          bgOffset = (bgOffset + chunk.length) % bgAudio.length;
        }

        onChunk(outputChunk);
      });

      response.data.on('end', () => {
        const totalTime = Date.now() - startTime;
        logger.info('ElevenLabs streaming complete', {
          totalBytes,
          totalTimeMs: totalTime,
          firstChunkLatencyMs: firstChunkTime ? firstChunkTime - startTime : null
        });
        resolve();
      });

      response.data.on('error', (error) => {
        logger.error('ElevenLabs stream error:', error);
        reject(error);
      });
    });

  } catch (error) {
    if (error.response) {
      logger.error('ElevenLabs streaming API error:', {
        status: error.response.status,
        statusText: error.response.statusText
      });
    } else {
      logger.error('ElevenLabs streaming request failed:', error.message);
    }
    throw error;
  }
}

/**
 * Generate audio from ElevenLabs TTS (non-streaming, for greeting)
 * @param {string} text - Text to convert to speech
 * @param {string} voiceId - ElevenLabs voice ID
 * @param {Object} options - Optional settings
 * @param {string} options.backgroundSound - Background sound type: 'office', 'cafe', 'none'
 * @param {number} options.backgroundVolume - Background volume 0.0-1.0 (default 0.15)
 * @returns {Promise<Buffer>} Audio buffer (μ-law, 8kHz for Twilio Media Streams)
 */
export async function streamElevenLabsAudio(text, voiceId, options = {}) {
  const { backgroundSound = 'none', backgroundVolume = 0.15 } = options;
  try {
    if (!ELEVENLABS_API_KEY) {
      throw new Error('ELEVENLABS_API_KEY not configured');
    }

    logger.info('Generating ElevenLabs TTS', {
      voiceId,
      textLength: text.length,
      text: text.substring(0, 100)
    });

    // Use turbo model for speed
    const response = await axios.post(
      `${ELEVENLABS_API_URL}/text-to-speech/${voiceId}`,
      {
        text,
        model_id: 'eleven_turbo_v2_5', // Fastest model
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.8,
          style: 0.0,
          use_speaker_boost: true
        }
      },
      {
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json'
        },
        params: {
          output_format: 'ulaw_8000' // μ-law 8kHz for Twilio
        },
        responseType: 'arraybuffer',
        timeout: 30000
      }
    );

    let audioBuffer = Buffer.from(response.data);

    // Mix with background audio if requested
    if (backgroundSound && backgroundSound !== 'none') {
      const bgAudio = loadBackgroundAudio(backgroundSound);
      if (bgAudio) {
        audioBuffer = mixAudioWithBackground(audioBuffer, bgAudio, backgroundVolume);
        logger.info('Mixed TTS with background audio', { type: backgroundSound, volume: backgroundVolume });
      }
    }

    logger.info('ElevenLabs TTS generated', {
      audioSizeBytes: audioBuffer.length,
      audioSizeKB: (audioBuffer.length / 1024).toFixed(2),
      durationEstimate: `${(audioBuffer.length / 8000).toFixed(1)}s`,
      backgroundSound: backgroundSound || 'none'
    });

    return audioBuffer;

  } catch (error) {
    if (error.response) {
      logger.error('ElevenLabs API error:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data ? Buffer.from(error.response.data).toString() : null
      });
    } else {
      logger.error('ElevenLabs request failed:', error.message);
    }
    throw error;
  }
}

/**
 * Get list of available voices from ElevenLabs
 */
export async function getAvailableVoices() {
  try {
    const response = await axios.get(`${ELEVENLABS_API_URL}/voices`, {
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY
      }
    });

    return response.data.voices;
  } catch (error) {
    logger.error('Failed to fetch ElevenLabs voices:', error);
    throw error;
  }
}

/**
 * Check ElevenLabs subscription and usage
 */
export async function getSubscriptionInfo() {
  try {
    const response = await axios.get(`${ELEVENLABS_API_URL}/user/subscription`, {
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY
      }
    });

    return response.data;
  } catch (error) {
    logger.error('Failed to fetch ElevenLabs subscription:', error);
    throw error;
  }
}
