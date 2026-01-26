// ai/elevenlabs.js - ElevenLabs Text-to-Speech integration
import axios from 'axios';
import logger from '../services/logger.js';

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';

/**
 * Generate audio from ElevenLabs TTS in μ-law format for Twilio
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

    // Use the standard TTS endpoint (not streaming) for reliability
    // Request ulaw_8000 format which is directly compatible with Twilio
    const response = await axios.post(
      `${ELEVENLABS_API_URL}/text-to-speech/${voiceId}`,
      {
        text,
        model_id: 'eleven_multilingual_v2', // Most reliable model
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
        timeout: 30000 // 30 second timeout
      }
    );

    const audioBuffer = Buffer.from(response.data);

    logger.info('ElevenLabs TTS generated', {
      audioSizeBytes: audioBuffer.length,
      audioSizeKB: (audioBuffer.length / 1024).toFixed(2),
      durationEstimate: `${(audioBuffer.length / 8000).toFixed(1)}s`, // 8000 bytes/sec for 8kHz μ-law
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
