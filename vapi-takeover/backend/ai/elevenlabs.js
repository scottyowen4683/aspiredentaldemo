// ai/elevenlabs.js - ElevenLabs Text-to-Speech integration with streaming
import axios from 'axios';
import logger from '../services/logger.js';

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';

/**
 * Stream audio from ElevenLabs TTS - returns chunks as they're generated
 * This is MUCH faster for first-byte latency
 * @param {string} text - Text to convert to speech
 * @param {string} voiceId - ElevenLabs voice ID
 * @param {function} onChunk - Callback for each audio chunk: (chunk: Buffer) => void
 * @returns {Promise<void>}
 */
export async function streamElevenLabsTTS(text, voiceId, onChunk) {
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
            chunkSize: chunk.length
          });
        }
        totalBytes += chunk.length;
        onChunk(chunk);
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
 * @returns {Promise<Buffer>} Audio buffer (μ-law, 8kHz for Twilio Media Streams)
 */
export async function streamElevenLabsAudio(text, voiceId) {
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

    const audioBuffer = Buffer.from(response.data);

    logger.info('ElevenLabs TTS generated', {
      audioSizeBytes: audioBuffer.length,
      audioSizeKB: (audioBuffer.length / 1024).toFixed(2),
      durationEstimate: `${(audioBuffer.length / 8000).toFixed(1)}s`,
      firstBytesHex: audioBuffer.slice(0, 16).toString('hex')
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
