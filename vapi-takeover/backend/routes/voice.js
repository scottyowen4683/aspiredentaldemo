// routes/voice.js - Voice API endpoints (Twilio integration)
import express from 'express';
import twilio from 'twilio';
import logger from '../services/logger.js';
import supabaseService from '../services/supabase-service.js';

const router = express.Router();
const VoiceResponse = twilio.twiml.VoiceResponse;

// POST /api/voice/incoming
// Twilio webhook for incoming calls
router.post('/incoming', async (req, res) => {
  try {
    const { From, To, CallSid } = req.body;

    logger.info('Incoming voice call', {
      from: From,
      to: To,
      callSid: CallSid
    });

    // Look up assistant by phone number
    const assistant = await supabaseService.getAssistantByPhoneNumber(To);

    if (!assistant) {
      logger.warn('No assistant found for phone number:', To);

      const response = new VoiceResponse();
      response.say({
        voice: 'Polly.Joanna'
      }, 'Sorry, this number is not configured. Please contact support.');
      response.hangup();

      res.type('text/xml');
      res.send(response.toString());
      return;
    }

    logger.info('Assistant found', {
      assistantId: assistant.id,
      assistantName: assistant.friendly_name
    });

    // Create TwiML response
    const response = new VoiceResponse();

    // Optional: Play greeting (first_message from assistant)
    if (assistant.first_message) {
      response.say({
        voice: 'Polly.Joanna'
      }, assistant.first_message);
    }

    // Enable call recording
    response.record({
      recordingStatusCallback: `https://${req.headers.host}/api/voice/recording`,
      recordingStatusCallbackMethod: 'POST',
      recordingStatusCallbackEvent: ['completed'],
      transcribe: false, // We use Whisper instead
      trim: 'trim-silence'
    });

    // Connect to WebSocket Media Stream
    const connect = response.connect();
    const stream = connect.stream({
      url: `wss://${req.headers.host}/voice/stream`
    });

    // Pass assistant ID and caller number as custom parameters
    stream.parameter({
      name: 'assistantId',
      value: assistant.id
    });

    stream.parameter({
      name: 'callerNumber',
      value: From
    });

    // Set status callback for call completion
    response.on('callCompleted', {
      url: `https://${req.headers.host}/api/voice/status`,
      method: 'POST'
    });

    res.type('text/xml');
    res.send(response.toString());

    logger.info('TwiML response sent', {
      assistantId: assistant.id,
      streamUrl: `wss://${req.headers.host}/voice/stream`
    });

  } catch (error) {
    logger.error('Voice incoming error:', error);

    const response = new VoiceResponse();
    response.say({
      voice: 'Polly.Joanna'
    }, 'Sorry, there was an error processing your call. Please try again later.');
    response.hangup();

    res.type('text/xml');
    res.send(response.toString());
  }
});

// POST /api/voice/status
// Twilio status callback
router.post('/status', async (req, res) => {
  try {
    const { CallSid, CallStatus, CallDuration } = req.body;

    logger.info('Call status update', {
      callSid: CallSid,
      status: CallStatus,
      duration: CallDuration
    });

    // Additional status tracking can be added here
    res.sendStatus(200);

  } catch (error) {
    logger.error('Voice status callback error:', error);
    res.sendStatus(500);
  }
});

// POST /api/voice/recording
// Twilio recording callback
router.post('/recording', async (req, res) => {
  try {
    const {
      CallSid,
      RecordingSid,
      RecordingUrl,
      RecordingStatus,
      RecordingDuration
    } = req.body;

    logger.info('Recording callback', {
      callSid: CallSid,
      recordingSid: RecordingSid,
      status: RecordingStatus,
      duration: RecordingDuration
    });

    if (RecordingStatus === 'completed' && RecordingUrl) {
      // Save recording URL to conversation (using conversations table, not chat_conversations)
      const { error } = await supabaseService.client
        .from('conversations')
        .update({
          recording_url: RecordingUrl,
          call_duration: parseInt(RecordingDuration) || 0
        })
        .eq('session_id', CallSid);

      if (error) {
        logger.error('Failed to save recording URL:', error);
      } else {
        logger.info('Recording URL saved to conversation', {
          callSid: CallSid,
          recordingUrl: RecordingUrl,
          duration: RecordingDuration
        });
      }
    }

    res.sendStatus(200);

  } catch (error) {
    logger.error('Recording callback error:', error);
    res.sendStatus(500);
  }
});

// POST /api/voice/outbound
// Make outbound call
router.post('/outbound', async (req, res) => {
  try {
    const { assistantId, toNumber, fromNumber } = req.body;

    if (!assistantId || !toNumber) {
      return res.status(400).json({
        error: 'Missing required fields: assistantId, toNumber'
      });
    }

    // Get assistant
    const assistant = await supabaseService.getAssistant(assistantId);
    if (!assistant) {
      return res.status(404).json({ error: 'Assistant not found' });
    }

    // Use assistant's phone number or provided fromNumber
    const callFromNumber = fromNumber || assistant.phone_number;

    if (!callFromNumber) {
      return res.status(400).json({
        error: 'No phone number configured for assistant'
      });
    }

    // Initialize Twilio client
    const twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    // Make call with recording enabled
    const call = await twilioClient.calls.create({
      from: callFromNumber,
      to: toNumber,
      url: `https://${req.headers.host}/api/voice/incoming`,
      method: 'POST',
      statusCallback: `https://${req.headers.host}/api/voice/status`,
      statusCallbackMethod: 'POST',
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      record: true,
      recordingStatusCallback: `https://${req.headers.host}/api/voice/recording`,
      recordingStatusCallbackMethod: 'POST'
    });

    logger.info('Outbound call initiated', {
      callSid: call.sid,
      assistantId,
      to: toNumber,
      from: callFromNumber
    });

    res.json({
      success: true,
      callSid: call.sid,
      status: call.status
    });

  } catch (error) {
    logger.error('Outbound call error:', error);
    res.status(500).json({
      error: 'Failed to initiate call',
      message: error.message
    });
  }
});

export default router;
