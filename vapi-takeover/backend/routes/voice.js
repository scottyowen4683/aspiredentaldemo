// routes/voice.js - Voice API endpoints (Twilio integration)
import express from 'express';
import twilio from 'twilio';
import logger from '../services/logger.js';

const router = express.Router();

const VoiceResponse = twilio.twiml.VoiceResponse;

// POST /api/voice/incoming
// Twilio webhook for incoming calls
router.post('/incoming', async (req, res) => {
  try {
    const { From, To, CallSid } = req.body;

    logger.info('Incoming voice call', { From, To, CallSid });

    const response = new VoiceResponse();

    // Greeting
    response.say({
      voice: 'Polly.Nicole-Neural'
    }, 'Thank you for calling. The voice assistant is being set up. Please check back soon.');

    // TODO: Connect to WebSocket stream
    // const connect = response.connect();
    // connect.stream({
    //   url: `wss://${req.headers.host}/voice/stream`,
    //   parameters: {
    //     callSid: CallSid,
    //     phoneNumber: To
    //   }
    // });

    res.type('text/xml');
    res.send(response.toString());

  } catch (error) {
    logger.error('Voice incoming error:', error);
    res.status(500).send('Error handling call');
  }
});

// TODO: Implement voice stream handler
// TODO: Implement TTS endpoint
// TODO: Implement STT endpoint

export default router;
