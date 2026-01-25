// netlify/functions/voice-handler.js
//
// Main Twilio webhook handler for incoming voice calls
// Replaces VAPI Voice platform orchestration
//
// Flow:
// 1. Receive call from Twilio
// 2. Identify council (tenant) from phone number called
// 3. Start voice conversation loop
// 4. Return TwiML to establish call

const twilio = require('twilio');
const VoiceResponse = twilio.twiml.VoiceResponse;

// Map phone numbers to councils (will use env vars)
function getTenantFromPhoneNumber(phoneNumber) {
  const phoneMap = {
    [process.env.TWILIO_PHONE_NUMBER_MORETON]: 'moreton',
    [process.env.TWILIO_PHONE_NUMBER_GOLDCOAST]: 'goldcoast',
  };

  return phoneMap[phoneNumber] || 'moreton'; // Default to moreton
}

// Council-specific greetings
const GREETINGS = {
  moreton: "Thank you for calling Moreton Bay Regional Council. I'm the AI assistant. How can I help you today?",
  goldcoast: "Thank you for calling Gold Coast City Council. I'm the AI assistant. How can I help you today?",
};

// Main handler
exports.handler = async (event) => {
  console.log('[voice-handler] Incoming call:', {
    from: event.queryStringParameters?.From,
    to: event.queryStringParameters?.To,
    callSid: event.queryStringParameters?.CallSid,
  });

  // Get tenant from called number
  const tenantId = getTenantFromPhoneNumber(event.queryStringParameters?.To);

  // Create TwiML response
  const twiml = new VoiceResponse();

  // Initial greeting
  twiml.say({
    voice: 'Polly.Nicole-Neural',  // Australian English voice (fallback)
  }, GREETINGS[tenantId]);

  // Start conversation gather loop
  const gather = twiml.gather({
    input: ['speech'],
    timeout: 5,  // Wait 5 seconds for speech
    speechTimeout: 'auto',  // Auto-detect when user stops speaking
    action: `/.netlify/functions/voice-process?tenant=${tenantId}`,
    method: 'POST',
  });

  // If no input, prompt again
  twiml.say('Are you still there?');
  twiml.redirect(`/.netlify/functions/voice-handler?To=${event.queryStringParameters?.To}`);

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/xml',
    },
    body: twiml.toString(),
  };
};
