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

// Audio caches
let backgroundAudioCache = {};
let fillerAudioCache = {}; // Pre-generated filler phrases for instant playback

// Filler phrases - VERY short acknowledgments for instant feedback
// Keep these minimal - they play while STT/GPT processes (500-1500ms)
const FILLER_PHRASES = [
  'Sure.',
  'Okay.',
  'Mm-hmm.',
  'One sec.'
];

/**
 * Generate synthetic background noise (μ-law 8kHz format)
 * Creates 10 seconds of loopable ambient noise
 * μ-law encoding requires LARGE deviation from 127 to be audible on phone
 * @param {string} type - Type: 'office' (soft murmur), 'cafe' (busier), 'white'
 * @returns {Buffer}
 */
function generateBackgroundNoise(type) {
  const sampleRate = 8000;
  const duration = 10; // 10 seconds of loopable audio
  const samples = sampleRate * duration;
  const buffer = Buffer.alloc(samples);

  // Lower amplitude for subtle background - high values cause crackling
  // Combined with 0.40 volume mix, this gives audible but not harsh background
  let amplitude, smoothing;

  switch (type) {
    case 'office':
      amplitude = 35; // Subtle office ambience (high volume mix compensates)
      smoothing = 0.998; // Very smooth brown noise to avoid clicks
      break;
    case 'cafe':
      amplitude = 45; // Slightly more noticeable ambient noise
      smoothing = 0.997;
      break;
    case 'white':
    default:
      amplitude = 30;
      smoothing = 0.999; // Very smooth
  }

  // Generate brown noise with high amplitude for phone audio
  let value = 0;
  for (let i = 0; i < samples; i++) {
    // White noise input
    const white = (Math.random() * 2 - 1);

    // Integrate for brown noise (low frequency rumble)
    value = value * smoothing + white * (1 - smoothing);

    // Soft limiting to prevent clipping, scale to large amplitude
    const normalized = Math.tanh(value * 5) * amplitude;

    // μ-law: 127 is silence center point
    const sample = 127 + Math.round(normalized);
    buffer[i] = Math.max(0, Math.min(255, sample));
  }

  // Verify we actually have audible signal
  const minVal = Math.min(...buffer);
  const maxVal = Math.max(...buffer);
  logger.info(`Generated ${type} background noise`, {
    samples,
    duration: `${duration}s`,
    amplitude,
    smoothing,
    sampleRange: `${minVal}-${maxVal}`,
    deviation: `±${Math.max(maxVal - 127, 127 - minVal)}`
  });
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
  const { backgroundSound = 'office', backgroundVolume = 0.40 } = options; // Default to office, higher volume
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
      textLength: text.length,
      backgroundSound,
      backgroundVolume,
      hasBgAudio: !!bgAudio,
      bgAudioSize: bgAudio?.length || 0
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
  const { backgroundSound = 'office', backgroundVolume = 0.40 } = options; // Default office, higher volume
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

/**
 * Pre-generate filler phrases for a voice (call on startup for instant playback)
 * @param {string} voiceId - ElevenLabs voice ID
 * @param {Object} options - Background sound options
 * @returns {Promise<void>}
 */
export async function preGenerateFillerPhrases(voiceId, options = {}) {
  // Use 0.40 minimum for audible background on phone
  const { backgroundSound = 'office', backgroundVolume = 0.40 } = options;

  if (!ELEVENLABS_API_KEY) {
    logger.warn('Cannot pre-generate fillers: ELEVENLABS_API_KEY not set');
    return;
  }

  const cacheKey = `${voiceId}-${backgroundSound}`;
  if (fillerAudioCache[cacheKey]) {
    logger.info('Filler phrases already cached', { voiceId, count: fillerAudioCache[cacheKey].length });
    return;
  }

  logger.info('Pre-generating filler phrases', { voiceId, count: FILLER_PHRASES.length });
  fillerAudioCache[cacheKey] = [];

  for (const phrase of FILLER_PHRASES) {
    try {
      const audio = await streamElevenLabsAudio(phrase, voiceId, { backgroundSound, backgroundVolume });
      fillerAudioCache[cacheKey].push(audio);
      logger.debug('Filler phrase generated', { phrase, bytes: audio.length });
    } catch (error) {
      logger.warn('Failed to generate filler phrase:', phrase, error.message);
    }
  }

  logger.info('Filler phrases ready', { voiceId, cached: fillerAudioCache[cacheKey].length });
}

/**
 * Get a random pre-generated filler phrase audio (instant, no TTS delay)
 * @param {string} voiceId - ElevenLabs voice ID
 * @param {string} backgroundSound - Background sound type used during generation
 * @returns {Buffer|null} Pre-generated audio or null if not available
 */
export function getInstantFillerAudio(voiceId, backgroundSound = 'office') {
  const cacheKey = `${voiceId}-${backgroundSound}`;
  const cached = fillerAudioCache[cacheKey];

  if (!cached || cached.length === 0) {
    return null;
  }

  // Return random filler to add variety
  const index = Math.floor(Math.random() * cached.length);
  return cached[index];
}

/**
 * Check if filler phrases are ready for a voice
 */
export function hasFillerPhrasesReady(voiceId, backgroundSound = 'office') {
  const cacheKey = `${voiceId}-${backgroundSound}`;
  return fillerAudioCache[cacheKey]?.length > 0;
}
