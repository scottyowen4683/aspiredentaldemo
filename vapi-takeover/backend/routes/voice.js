// routes/voice.js - Voice API endpoints (Twilio integration)
import express from 'express';
import twilio from 'twilio';
import logger from '../services/logger.js';
import supabaseService from '../services/supabase-service.js';

const router = express.Router();
const VoiceResponse = twilio.twiml.VoiceResponse;

// Debug: echo what we receive
router.post('/echo', (req, res) => {
  logger.info('Echo endpoint hit:', {
    body: req.body,
    headers: req.headers,
    contentType: req.get('content-type')
  });
  res.json({ received: req.body });
});

// Debug: Test TwiML generation without a real call
router.get('/test-twiml', async (req, res) => {
  try {
    const response = new VoiceResponse();
    response.say({ voice: 'Polly.Joanna' }, 'Hi, how can I help you?');
    const connect = response.connect();
    const stream = connect.stream({
      url: `wss://${req.headers.host}/voice/stream`
    });
    stream.parameter({ name: 'assistantId', value: 'test-123' });
    stream.parameter({ name: 'callerNumber', value: '+1234567890' });

    res.type('text/xml');
    res.send(response.toString());
  } catch (error) {
    logger.error('TwiML test error:', error);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

// POST /api/voice/incoming
// Twilio webhook for incoming calls
router.post('/incoming', async (req, res) => {
  try {
    // Extract and normalize phone numbers (trim whitespace, handle URL encoding)
    const From = (req.body.From || '').trim();
    const To = (req.body.To || '').trim();
    const CallSid = req.body.CallSid;

    // Ensure + prefix is present (URL encoding can turn + into space)
    const normalizedTo = To.startsWith('+') ? To : (To ? `+${To}` : '');
    const normalizedFrom = From.startsWith('+') ? From : (From ? `+${From}` : '');

    // Detect call direction (outbound-api for outbound calls)
    const direction = req.body.Direction || 'inbound';
    const isOutbound = direction.includes('outbound');

    logger.info('Voice call received', {
      from: From,
      to: To,
      normalizedTo,
      normalizedFrom,
      callSid: CallSid,
      direction
    });

    // For inbound calls: look up by To (the Twilio number being called)
    // For outbound calls: look up by From (the Twilio number making the call)
    const lookupNumber = isOutbound ? normalizedFrom : normalizedTo;

    if (!lookupNumber) {
      logger.error('No phone number to look up!', { body: req.body });
      const response = new VoiceResponse();
      response.say({ voice: 'Polly.Joanna' }, 'Error: No phone number provided.');
      response.hangup();
      res.type('text/xml');
      return res.send(response.toString());
    }

    // Look up assistant by the appropriate phone number
    logger.info('Looking up assistant by:', { lookupNumber, isOutbound });
    let assistant = await supabaseService.getAssistantByPhoneNumber(lookupNumber);

    // Fallback: if not found, try the other number
    if (!assistant) {
      const fallbackNumber = isOutbound ? normalizedTo : normalizedFrom;
      logger.info('Not found, trying fallback:', fallbackNumber);
      assistant = await supabaseService.getAssistantByPhoneNumber(fallbackNumber);
    }

    if (!assistant) {
      logger.warn('No assistant found for phone numbers:', { To, From });

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

    // Create TwiML response - optimized for low latency voice AI
    // NO Polly greeting - the AI will greet with ElevenLabs voice through WebSocket
    const response = new VoiceResponse();

    // Connect to WebSocket Media Stream IMMEDIATELY for real-time bidirectional voice AI
    // The AI greeting will be sent through ElevenLabs via WebSocket, not Twilio TTS
    // Use explicit host or fall back to request host header
    const wsHost = process.env.BASE_URL
      ? process.env.BASE_URL.replace('https://', '').replace('http://', '')
      : req.headers.host;

    const connect = response.connect();
    const stream = connect.stream({
      url: `wss://${wsHost}/voice/stream`
    });

    logger.info('WebSocket URL configured', { wsUrl: `wss://${wsHost}/voice/stream` });

    // Pass assistant ID and caller number as custom parameters
    stream.parameter({
      name: 'assistantId',
      value: assistant.id
    });

    stream.parameter({
      name: 'callerNumber',
      value: From
    });

    // Note: Status callbacks are configured in Twilio console or when making outbound calls
    // The /api/voice/status endpoint receives status updates via Twilio's configured webhook

    res.type('text/xml');
    res.send(response.toString());

    logger.info('TwiML response sent', {
      assistantId: assistant.id,
      streamUrl: `wss://${req.headers.host}/voice/stream`
    });

  } catch (error) {
    logger.error('Voice incoming error:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });

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
      // Save recording URL to conversation
      // Schema uses duration_seconds (not call_duration) and recording_url
      const updateData = {
        recording_url: RecordingUrl,
        duration_seconds: parseInt(RecordingDuration) || 0,
        updated_at: new Date().toISOString()
      };

      logger.info('Attempting to save recording URL', {
        callSid: CallSid,
        recordingUrl: RecordingUrl,
        updateData
      });

      const { data, error } = await supabaseService.client
        .from('conversations')
        .update(updateData)
        .eq('session_id', CallSid)
        .select();

      if (error) {
        // If recording_url column doesn't exist, try without it
        logger.warn('Failed to save recording (trying without recording_url):', error.message);
        const { data: retryData, error: retryError } = await supabaseService.client
          .from('conversations')
          .update({
            duration_seconds: parseInt(RecordingDuration) || 0,
            updated_at: new Date().toISOString()
          })
          .eq('session_id', CallSid)
          .select();

        if (retryError) {
          logger.error('Failed to save recording duration:', retryError);
        } else {
          logger.info('Recording duration saved (recording_url column may not exist)', {
            callSid: CallSid,
            duration: RecordingDuration,
            rowsUpdated: retryData?.length || 0
          });
        }
      } else {
        logger.info('Recording saved to conversation', {
          callSid: CallSid,
          recordingUrl: RecordingUrl,
          duration: RecordingDuration,
          rowsUpdated: data?.length || 0
        });

        if (!data || data.length === 0) {
          logger.warn('No conversation found with session_id', { callSid: CallSid });
        }
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

// =============================================================================
// CAMPAIGN OUTBOUND CALL ENDPOINTS
// =============================================================================

// POST /api/voice/campaign-twiml
// TwiML for campaign outbound calls - uses campaign-specific prompt/first_message
router.post('/campaign-twiml', async (req, res) => {
  try {
    const { campaignId, contactId, voiceId, prompt, firstMessage } = req.query;

    logger.info('Campaign TwiML requested:', {
      campaignId,
      contactId,
      voiceId,
      hasPrompt: !!prompt,
      hasFirstMessage: !!firstMessage
    });

    // Create TwiML response
    const response = new VoiceResponse();

    // Connect to WebSocket Media Stream for AI conversation
    const wsHost = process.env.BASE_URL
      ? process.env.BASE_URL.replace('https://', '').replace('http://', '')
      : req.headers.host;

    const connect = response.connect();
    const stream = connect.stream({
      url: `wss://${wsHost}/voice/stream`
    });

    // Pass campaign context as parameters
    stream.parameter({ name: 'campaignId', value: campaignId || '' });
    stream.parameter({ name: 'contactId', value: contactId || '' });
    stream.parameter({ name: 'voiceId', value: voiceId || '' });
    stream.parameter({ name: 'outboundPrompt', value: prompt || '' });
    stream.parameter({ name: 'firstMessage', value: firstMessage || '' });
    stream.parameter({ name: 'isCampaignCall', value: 'true' });

    res.type('text/xml');
    res.send(response.toString());

    logger.info('Campaign TwiML sent:', {
      campaignId,
      contactId,
      wsUrl: `wss://${wsHost}/voice/stream`
    });

  } catch (error) {
    logger.error('Campaign TwiML error:', error);
    const response = new VoiceResponse();
    response.say({ voice: 'Polly.Joanna' }, 'Sorry, there was an error. Goodbye.');
    response.hangup();
    res.type('text/xml');
    res.send(response.toString());
  }
});

// POST /api/voice/campaign-status
// Status callback for campaign calls - updates contact status
router.post('/campaign-status', async (req, res) => {
  try {
    const { campaignId, contactId } = req.query;
    const { CallSid, CallStatus, CallDuration, AnsweredBy } = req.body;

    logger.info('Campaign call status:', {
      campaignId,
      contactId,
      callSid: CallSid,
      status: CallStatus,
      duration: CallDuration,
      answeredBy: AnsweredBy
    });

    if (!contactId) {
      return res.sendStatus(200);
    }

    // Map Twilio status to our contact status
    let contactStatus = 'in_progress';
    let isSuccessful = false;

    switch (CallStatus) {
      case 'completed':
        // Call was answered and completed
        contactStatus = 'completed';
        isSuccessful = true;
        break;
      case 'busy':
        contactStatus = 'busy';
        break;
      case 'no-answer':
        contactStatus = 'no_answer';
        break;
      case 'failed':
      case 'canceled':
        contactStatus = 'failed';
        break;
      case 'initiated':
      case 'ringing':
      case 'in-progress':
        // Still in progress, don't update final status yet
        return res.sendStatus(200);
    }

    // Update contact status
    await supabaseService.client
      .from('campaign_contacts')
      .update({
        status: contactStatus,
        call_duration: parseInt(CallDuration) || 0,
        updated_at: new Date().toISOString()
      })
      .eq('id', contactId);

    // Update campaign stats if call is finished
    if (campaignId && (isSuccessful || ['busy', 'no_answer', 'failed'].includes(contactStatus))) {
      const { data: campaign } = await supabaseService.client
        .from('outbound_campaigns')
        .select('successful, failed')
        .eq('id', campaignId)
        .single();

      if (campaign) {
        const updates = {
          updated_at: new Date().toISOString()
        };

        if (isSuccessful) {
          updates.successful = (campaign.successful || 0) + 1;
        } else {
          updates.failed = (campaign.failed || 0) + 1;
        }

        await supabaseService.client
          .from('outbound_campaigns')
          .update(updates)
          .eq('id', campaignId);
      }

      // Log interaction for billing
      const { data: campaignData } = await supabaseService.client
        .from('outbound_campaigns')
        .select('org_id, assistant_id')
        .eq('id', campaignId)
        .single();

      if (campaignData?.org_id && isSuccessful) {
        try {
          await supabaseService.logInteraction({
            orgId: campaignData.org_id,
            assistantId: campaignData.assistant_id,
            interactionType: 'call_outbound',
            conversationId: null,
            sessionId: CallSid,
            contactNumber: null,
            durationSeconds: parseInt(CallDuration) || 0,
            cost: 0,
            campaignId: campaignId
          });
        } catch (logError) {
          logger.warn('Could not log campaign interaction:', logError.message);
        }
      }
    }

    res.sendStatus(200);

  } catch (error) {
    logger.error('Campaign status callback error:', error);
    res.sendStatus(500);
  }
});

export default router;
