// netlify/functions/voice-process.js
//
// Processes user speech and generates AI response
// This is the conversation loop
//
// Flow:
// 1. Receive transcribed speech from Twilio
// 2. Send to AI chat (reuse existing ai-chat.js)
// 3. Get AI response
// 4. Convert to speech via ElevenLabs
// 5. Return TwiML to play audio
// 6. Continue conversation loop

const twilio = require('twilio');
const VoiceResponse = twilio.twiml.VoiceResponse;
const axios = require('axios');

// Get assistant ID for tenant (same mapping as ai-chat.js)
const ASSISTANT_MAP = {
  moreton: "a2c1de9b-b358-486b-b9e6-a8b4f9e4385d",
  goldcoast: "goldcoast-assistant-id",
};

// Voice IDs for ElevenLabs (per council)
const VOICE_IDS = {
  moreton: process.env.ELEVENLABS_VOICE_ID_MORETON || '21m00Tcm4TlvDq8ikWAM',  // Default: Rachel
  goldcoast: process.env.ELEVENLABS_VOICE_ID_GOLDCOAST || '21m00Tcm4TlvDq8ikWAM',
};

// Call existing AI chat function
async function getAIResponse(transcript, tenantId, callSid) {
  try {
    // Call our existing ai-chat.js function
    const response = await axios.post(
      `${process.env.URL}/.netlify/functions/ai-chat`,
      {
        assistantId: ASSISTANT_MAP[tenantId],
        tenantId,
        input: transcript,
        sessionId: callSid,  // Use Call SID as session ID
      }
    );

    return response.data;
  } catch (error) {
    console.error('[voice-process] AI chat error:', error);
    throw error;
  }
}

// Convert text to speech via ElevenLabs
async function textToSpeech(text, voiceId) {
  try {
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        text,
        model_id: "eleven_monolingual_v1",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      },
      {
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
        },
        responseType: 'arraybuffer',
      }
    );

    return Buffer.from(response.data);
  } catch (error) {
    console.error('[voice-process] TTS error:', error);
    throw error;
  }
}

// Upload audio to Twilio Assets for playback
async function uploadAudioToTwilio(audioBuffer, callSid) {
  // For now, we'll use Twilio's <Say> instead of <Play>
  // This is simpler and doesn't require asset uploads
  // Later we can optimize with ElevenLabs audio streaming
  return null;
}

// Main handler
exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const body = new URLSearchParams(event.body);

  const tenantId = params.tenant || 'moreton';
  const callSid = body.get('CallSid');
  const speechResult = body.get('SpeechResult');  // Transcribed by Twilio

  console.log('[voice-process] Processing speech:', {
    tenantId,
    callSid,
    transcript: speechResult,
  });

  const twiml = new VoiceResponse();

  try {
    // If no speech detected, ask again
    if (!speechResult) {
      twiml.say("I didn't catch that. Could you please repeat?");
      const gather = twiml.gather({
        input: ['speech'],
        timeout: 5,
        speechTimeout: 'auto',
        action: `/.netlify/functions/voice-process?tenant=${tenantId}`,
        method: 'POST',
      });
      twiml.redirect(`/.netlify/functions/voice-handler`);

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/xml' },
        body: twiml.toString(),
      };
    }

    // Get AI response (reuse existing ai-chat logic!)
    const aiResponse = await getAIResponse(speechResult, tenantId, callSid);

    console.log('[voice-process] AI response:', {
      response: aiResponse.response.substring(0, 100),
      hasToolCalls: aiResponse.hasToolCalls,
    });

    // OPTION 1: Use Twilio's built-in TTS (simple, lower quality)
    // This is faster to implement and test
    twiml.say({
      voice: 'Polly.Nicole-Neural',  // Australian English
    }, aiResponse.response);

    // OPTION 2: Use ElevenLabs (better quality, more complex)
    // Uncomment when ready to implement
    /*
    const voiceId = VOICE_IDS[tenantId];
    const audioBuffer = await textToSpeech(aiResponse.response, voiceId);
    const audioUrl = await uploadAudioToTwilio(audioBuffer, callSid);
    twiml.play(audioUrl);
    */

    // Check if conversation should end
    const shouldEnd = checkIfConversationEnds(aiResponse.response);

    if (shouldEnd) {
      twiml.say("Thank you for calling. Goodbye!");
      twiml.hangup();
    } else {
      // Continue conversation loop
      const gather = twiml.gather({
        input: ['speech'],
        timeout: 5,
        speechTimeout: 'auto',
        action: `/.netlify/functions/voice-process?tenant=${tenantId}`,
        method: 'POST',
      });

      twiml.say("Is there anything else I can help you with?");
      twiml.redirect(`/.netlify/functions/voice-handler`);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/xml' },
      body: twiml.toString(),
    };

  } catch (error) {
    console.error('[voice-process] Error:', error);

    // Graceful error handling
    twiml.say("I'm having trouble processing your request. Let me transfer you to a staff member.");
    // Could add transfer logic here
    twiml.hangup();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/xml' },
      body: twiml.toString(),
    };
  }
};

// Helper: Check if AI wants to end conversation
function checkIfConversationEnds(response) {
  const endPhrases = [
    'goodbye',
    'have a great day',
    'thank you for calling',
    'is there anything else',  // If AI asks this, we'll prompt user
  ];

  const lowerResponse = response.toLowerCase();
  return endPhrases.some(phrase => lowerResponse.includes(phrase));
}
