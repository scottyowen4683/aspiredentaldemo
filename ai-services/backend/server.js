// server.js - Aspire AI Services Backend
// Self-hosted voice AI platform without VAPI dependency

import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import twilio from 'twilio';

dotenv.config();

// Scott's cloned ElevenLabs voice ID (default for outbound calls)
const CLONED_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'UQVsQrmNGOENbsLCAH2g';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// Initialize Twilio client
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV
  });
});

// ============================================
// ELEVENLABS TTS API
// ============================================

// Generate TTS audio from ElevenLabs and return as audio stream
async function generateElevenLabsAudio(text, voiceId = CLONED_VOICE_ID) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY not configured');
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': apiKey
      },
      body: JSON.stringify({
        text: text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      })
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs API error: ${error}`);
  }

  return response;
}

// Endpoint to serve ElevenLabs TTS audio (Twilio <Play> will call this)
app.get('/api/tts/:message', async (req, res) => {
  try {
    const message = decodeURIComponent(req.params.message);
    const voiceId = req.query.voice || CLONED_VOICE_ID;

    console.log('Generating TTS audio:', { message: message.substring(0, 50) + '...', voiceId });

    const audioResponse = await generateElevenLabsAudio(message, voiceId);
    const audioBuffer = await audioResponse.arrayBuffer();

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.byteLength,
      'Cache-Control': 'public, max-age=3600'
    });
    res.send(Buffer.from(audioBuffer));

  } catch (error) {
    console.error('TTS generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// OUTBOUND CALL API
// ============================================

// Simple per-IP 24-hour limiter
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DAILY_CALLS = 3;
let ipLog = {}; // { ip: { count, ts } }

function limitedToday(ip) {
  const now = Date.now();
  const record = ipLog[ip];
  if (!record || now - record.ts > DAY_MS) {
    ipLog[ip] = { count: 1, ts: now };
    return false;
  }
  if (record.count >= MAX_DAILY_CALLS) return true;
  record.count++;
  ipLog[ip] = record;
  return false;
}

// Outbound call endpoint using Twilio + ElevenLabs
app.post('/api/outbound-call', async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

  // Rate limiting
  if (limitedToday(ip)) {
    return res.status(429).json({
      message: 'Daily call limit reached. Try again tomorrow.'
    });
  }

  try {
    const { to, context } = req.body;

    if (!to) {
      return res.status(400).json({ message: 'Missing phone number (to)' });
    }

    // Validate Australian number format
    if (!/^\+61\d{9}$/.test(to)) {
      return res.status(400).json({
        message: 'Enter a valid Australian number (e.g. 0412 345 678)'
      });
    }

    const fromNumber = process.env.TWILIO_OUTBOUND_NUMBER || '+61731322220';
    const voiceWebhookUrl = process.env.VOICE_WEBHOOK_URL ||
      `${process.env.BASE_URL || 'https://aspire-ai-platform.fly.dev'}/api/voice/outbound`;

    console.log('Initiating outbound call:', {
      to,
      from: fromNumber,
      webhookUrl: voiceWebhookUrl,
      context
    });

    // Create outbound call via Twilio
    const call = await twilioClient.calls.create({
      to: to,
      from: fromNumber,
      url: voiceWebhookUrl,
      method: 'POST',
      statusCallback: `${process.env.BASE_URL || 'https://aspire-ai-platform.fly.dev'}/api/voice/status`,
      statusCallbackMethod: 'POST',
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      record: true,
      recordingChannels: 'dual'
    });

    console.log('Outbound call created:', { callSid: call.sid, status: call.status });

    res.status(201).json({
      success: true,
      callSid: call.sid,
      status: call.status,
      to: to,
      from: fromNumber
    });

  } catch (error) {
    console.error('Outbound call error:', error);
    res.status(500).json({
      message: 'Failed to initiate call',
      error: error.message
    });
  }
});

// Voice webhook for outbound calls (Twilio calls this when call connects)
app.post('/api/voice/outbound', (req, res) => {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const response = new VoiceResponse();

  const baseUrl = process.env.BASE_URL || 'https://aspire-ai-platform.fly.dev';

  // Initial greeting using ElevenLabs cloned voice
  const greetingText = "Hi! This is Scott from Aspire. I'm calling to demonstrate our voice AI capabilities. How can I help you today?";
  const greetingUrl = `${baseUrl}/api/tts/${encodeURIComponent(greetingText)}`;

  // Play ElevenLabs audio for greeting
  response.play(greetingUrl);

  // Gather speech input
  response.gather({
    input: 'speech',
    timeout: 5,
    speechTimeout: 'auto',
    action: '/api/voice/respond',
    method: 'POST'
  });

  // Fallback if no input (use ElevenLabs)
  const fallbackText = "I didn't catch that. Please let me know if you have any questions about our AI services.";
  const fallbackUrl = `${baseUrl}/api/tts/${encodeURIComponent(fallbackText)}`;
  response.play(fallbackUrl);

  response.hangup();

  res.type('text/xml');
  res.send(response.toString());
});

// Handle voice responses
app.post('/api/voice/respond', (req, res) => {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const response = new VoiceResponse();

  const baseUrl = process.env.BASE_URL || 'https://aspire-ai-platform.fly.dev';
  const speechResult = req.body.SpeechResult;
  console.log('Speech received:', speechResult);

  // Simple response using ElevenLabs cloned voice (in production, this would go to GPT-4/Claude)
  const responseText = "Thanks for your interest! Our AI services include voice agents, chat bots, and outbound calling. For a full demonstration, please visit aspireexecutive.ai or speak with one of our team members. Is there anything specific you'd like to know?";
  const responseUrl = `${baseUrl}/api/tts/${encodeURIComponent(responseText)}`;

  response.play(responseUrl);

  response.gather({
    input: 'speech',
    timeout: 5,
    speechTimeout: 'auto',
    action: '/api/voice/respond',
    method: 'POST'
  });

  // Goodbye using ElevenLabs cloned voice
  const goodbyeText = "Thank you for your time. Have a great day!";
  const goodbyeUrl = `${baseUrl}/api/tts/${encodeURIComponent(goodbyeText)}`;
  response.play(goodbyeUrl);

  response.hangup();

  res.type('text/xml');
  res.send(response.toString());
});

// Call status callback
app.post('/api/voice/status', (req, res) => {
  console.log('Call status update:', {
    callSid: req.body.CallSid,
    status: req.body.CallStatus,
    duration: req.body.CallDuration
  });
  res.sendStatus(200);
});

// ============================================
// STATIC FILES (React Frontend)
// ============================================

const publicPath = join(__dirname, 'public');
app.use(express.static(publicPath));

// SPA catch-all - serve index.html for React Router
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/health')) {
    return next();
  }
  res.sendFile(join(publicPath, 'index.html'));
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Aspire AI Services running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
