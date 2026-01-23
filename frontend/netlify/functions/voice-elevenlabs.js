// netlify/functions/voice-elevenlabs.js
//
// ElevenLabs text-to-speech integration
// Standalone function for testing and optimization
//
// This can be called from voice-process.js when ready to use
// high-quality voice instead of Twilio's built-in TTS

const axios = require('axios');
const twilio = require('twilio');

// Voice configurations per council
const VOICE_CONFIGS = {
  moreton: {
    voiceId: process.env.ELEVENLABS_VOICE_ID_MORETON || '21m00Tcm4TlvDq8ikWAM',
    voiceName: 'Rachel',  // Professional Australian female
    description: 'Warm, professional, helpful',
  },
  goldcoast: {
    voiceId: process.env.ELEVENLABS_VOICE_ID_GOLDCOAST || 'pNInz6obpgDQGcFmaJgB',
    voiceName: 'Adam',  // Professional Australian male
    description: 'Clear, authoritative, friendly',
  },
};

// Generate speech from text
async function generateSpeech(text, voiceId, optimize_streaming_latency = 0) {
  console.log('[elevenlabs] Generating speech:', {
    textLength: text.length,
    voiceId,
  });

  try {
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        text,
        model_id: "eleven_monolingual_v1",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,  // No exaggeration
          use_speaker_boost: true,
        },
      },
      {
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
        },
        responseType: 'arraybuffer',
        timeout: 10000,  // 10 second timeout
      }
    );

    console.log('[elevenlabs] Speech generated:', {
      size: response.data.byteLength,
      status: response.status,
    });

    return Buffer.from(response.data);

  } catch (error) {
    console.error('[elevenlabs] Error:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
    });
    throw error;
  }
}

// Upload audio to Twilio and get playback URL
async function uploadToTwilio(audioBuffer, fileName) {
  const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );

  // Create asset via Twilio Assets API
  // Note: This requires Twilio Serverless API setup
  // For now, we'll return a data URL (works but not optimal)

  const base64Audio = audioBuffer.toString('base64');
  return `data:audio/mpeg;base64,${base64Audio}`;
}

// Main handler
exports.handler = async (event) => {
  // Allow CORS for testing
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }

  try {
    const { text, tenantId } = JSON.parse(event.body);

    if (!text) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing text parameter' }),
      };
    }

    // Get voice config for tenant
    const voiceConfig = VOICE_CONFIGS[tenantId] || VOICE_CONFIGS.moreton;

    console.log('[elevenlabs] Request:', {
      tenantId,
      voiceConfig: voiceConfig.voiceName,
      textLength: text.length,
    });

    // Generate speech
    const audioBuffer = await generateSpeech(text, voiceConfig.voiceId);

    // Option 1: Return audio as base64 (for testing)
    const base64Audio = audioBuffer.toString('base64');

    // Option 2: Upload to Twilio and return URL (for production)
    // const audioUrl = await uploadToTwilio(audioBuffer, `speech-${Date.now()}.mp3`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: true,
        audio: base64Audio,
        voiceUsed: voiceConfig.voiceName,
        audioSize: audioBuffer.byteLength,
        // audioUrl: audioUrl,  // For production
      }),
    };

  } catch (error) {
    console.error('[elevenlabs] Handler error:', error);

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: error.message,
        details: error.response?.data || 'No additional details',
      }),
    };
  }
};
