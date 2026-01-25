// ai/elevenlabs.js - ElevenLabs Text-to-Speech integration
import axios from 'axios';
import logger from '../services/logger.js';

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';

/**
 * Stream audio from ElevenLabs TTS
 * @param {string} text - Text to convert to speech
 * @param {string} voiceId - ElevenLabs voice ID
 * @returns {Promise<Buffer>} Audio buffer (PCM μ-law, 8kHz for Twilio)
 */
export async function streamElevenLabsAudio(text, voiceId) {
  try {
    if (!ELEVENLABS_API_KEY) {
      throw new Error('ELEVENLABS_API_KEY not configured');
    }

    logger.debug('Generating TTS', {
      voiceId,
      textLength: text.length,
      textPreview: text.substring(0, 50) + '...'
    });

    const response = await axios.post(
      `${ELEVENLABS_API_URL}/text-to-speech/${voiceId}/stream`,
      {
        text,
        model_id: 'eleven_turbo_v2_5', // Fastest model for low latency
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0,
          use_speaker_boost: true
        },
        output_format: 'ulaw_8000' // Twilio-compatible format
      },
      {
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'audio/basic'
        },
        responseType: 'arraybuffer'
      }
    );

    logger.debug('TTS audio generated', {
      audioSizeKB: (response.data.length / 1024).toFixed(2)
    });

    return Buffer.from(response.data);

  } catch (error) {
    if (error.response) {
      logger.error('ElevenLabs API error:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data?.toString()
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
