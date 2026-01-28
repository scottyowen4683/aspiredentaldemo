// server.js - Main Express + WebSocket server for VAPI Takeover
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import twilio from 'twilio';
import logger from './services/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import supabaseService from './services/supabase-service.js';
import VoiceHandler from './ai/voice-handler.js';
import { streamElevenLabsAudio, preGenerateFillerPhrases, getInstantFillerAudio } from './ai/elevenlabs.js';

// Routes
import chatRouter, { cleanupStaleSessions } from './routes/chat.js';
import voiceRouter from './routes/voice.js';
import adminRouter from './routes/admin.js';
import campaignsRouter from './routes/campaigns.js';
import invitationsRouter from './routes/invitations.js';
import usersRouter from './routes/users.js';

dotenv.config();

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/voice/stream' });

// Initialize Twilio client for recording
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
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
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

// Debug: Check if public folder exists and list files
import { existsSync, readdirSync } from 'fs';
const publicPath = join(__dirname, 'public');
logger.info(`Public folder path: ${publicPath}`);
logger.info(`Public folder exists: ${existsSync(publicPath)}`);
if (existsSync(publicPath)) {
  logger.info(`Public folder contents: ${readdirSync(publicPath).join(', ')}`);
}

// Serve static files from public folder
app.use(express.static(publicPath));

// API Routes
app.use('/api/chat', chatRouter);
app.use('/api/voice', voiceRouter);
app.use('/api/admin', adminRouter);
app.use('/api/campaigns', campaignsRouter);
app.use('/api/invitations', invitationsRouter);
app.use('/api/users', usersRouter);

// ============================================
// MARKETING SITE API ENDPOINTS
// ============================================

// Import email service for contact form
import { sendContactRequestNotification } from './services/email-service.js';

// Contact form endpoint
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, phone, message, org } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({ status: 'error', message: 'Name, email and message are required' });
    }

    // Send notification via Brevo
    await sendContactRequestNotification({
      name,
      email,
      phone: phone || 'Not provided',
      request_type: 'Contact Form',
      request_details: org ? `Organisation: ${org}\n\n${message}` : message
    });

    logger.info('Contact form submission received', { name, email });
    res.json({ status: 'success' });
  } catch (error) {
    logger.error('Contact form error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to send message' });
  }
});

// Outbound call endpoint (self-hosted Twilio + ElevenLabs)
// Uses phone +61731322220 and voice ID UQVsQrmNGOENbsLCAH2g
const OUTBOUND_FROM_NUMBER = process.env.TWILIO_OUTBOUND_NUMBER || '+61731322220';
const OUTBOUND_VOICE_ID = process.env.ELEVENLABS_OUTBOUND_VOICE_ID || 'UQVsQrmNGOENbsLCAH2g';

// Simple rate limiter for outbound calls
const callLimiter = {};
const MAX_DAILY_CALLS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

app.post('/api/outbound-call', async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const now = Date.now();

  // Rate limiting
  if (!callLimiter[ip] || now - callLimiter[ip].ts > DAY_MS) {
    callLimiter[ip] = { count: 1, ts: now };
  } else if (callLimiter[ip].count >= MAX_DAILY_CALLS) {
    return res.status(429).json({ message: 'Daily call limit reached. Try again tomorrow.' });
  } else {
    callLimiter[ip].count++;
  }

  try {
    const { to, context } = req.body;

    if (!to) {
      return res.status(400).json({ message: 'Missing phone number (to)' });
    }

    // Validate Australian number format
    if (!/^\+61\d{9}$/.test(to)) {
      return res.status(400).json({ message: 'Enter a valid Australian number (e.g. 0412 345 678)' });
    }

    const baseUrl = process.env.BASE_URL || `https://${process.env.FLY_APP_NAME}.fly.dev`;

    logger.info('Initiating outbound call', { to, from: OUTBOUND_FROM_NUMBER, voiceId: OUTBOUND_VOICE_ID });

    // Create outbound call via Twilio - connects to our voice WebSocket
    // IMPORTANT: Uses dedicated demo TwiML endpoint, separate from portal campaigns
    const call = await twilioClient.calls.create({
      to: to,
      from: OUTBOUND_FROM_NUMBER,
      url: `${baseUrl}/api/marketing/demo-twiml`,
      method: 'POST',
      statusCallback: `${baseUrl}/api/voice/status`,
      statusCallbackMethod: 'POST',
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      record: true,
      recordingChannels: 'dual'
    });

    logger.info('Outbound call created', { callSid: call.sid, status: call.status });

    res.status(201).json({
      success: true,
      callSid: call.sid,
      status: call.status
    });

  } catch (error) {
    logger.error('Outbound call error:', error);
    res.status(500).json({ message: 'Failed to initiate call', error: error.message });
  }
});

// ============================================
// MARKETING DEMO TwiML ENDPOINT
// Completely separate from portal voice routes
// Only used by /api/outbound-call for website demos
// ============================================
app.post('/api/marketing/demo-twiml', (req, res) => {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const response = new VoiceResponse();
  const baseUrl = process.env.BASE_URL || `https://${process.env.FLY_APP_NAME}.fly.dev`;

  // Connect to our WebSocket for AI voice handling
  const connect = response.connect();
  const stream = connect.stream({
    url: `wss://${new URL(baseUrl).host}/voice/stream`
  });

  // MARKETING DEMO ONLY: Hardcode 'outbound-demo' assistant ID
  // This is completely separate from portal campaigns which use /api/voice/incoming
  stream.parameter({ name: 'assistantId', value: 'outbound-demo' });
  stream.parameter({ name: 'callerNumber', value: req.body.To || 'unknown' });
  stream.parameter({ name: 'isOutbound', value: 'true' });
  stream.parameter({ name: 'isMarketingDemo', value: 'true' });

  logger.info('Marketing demo TwiML generated', {
    wsUrl: `wss://${new URL(baseUrl).host}/voice/stream`,
    to: req.body.To,
    assistantId: 'outbound-demo'
  });

  res.type('text/xml');
  res.send(response.toString());
});

// SPA catch-all: serve index.html for all non-API routes (React Router handles client-side routing)
app.get('*', (req, res, next) => {
  // Skip API routes, voice routes, and static widget files
  if (req.path.startsWith('/api/') || req.path.startsWith('/voice/') || req.path.startsWith('/widget/')) {
    return next();
  }
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

// WebSocket handler for Twilio Media Streams
wss.on('connection', async (ws, req) => {
  logger.info('WebSocket connection established');

  let voiceHandler = null;
  let mediaChunkCount = 0;

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);

      switch (data.event) {
        case 'start':
          logger.info('Twilio Media Stream started', {
            streamSid: data.streamSid,
            callSid: data.start.callSid
          });

          // Get assistant ID and caller number from custom parameters (set by Twilio webhook)
          const assistantId = data.start.customParameters?.assistantId;
          const callerNumber = data.start.customParameters?.callerNumber;
          const callSid = data.start.callSid;

          if (!assistantId) {
            logger.error('No assistantId in call parameters');
            ws.close();
            return;
          }

          // Start recording for this call via Twilio REST API
          // This records both sides of the conversation (dual-channel)
          try {
            const baseUrl = process.env.BASE_URL || `https://${process.env.FLY_APP_NAME}.fly.dev`;
            const recordingCallbackUrl = `${baseUrl}/api/voice/recording`;
            logger.info('Starting recording with callback URL', { callSid, recordingCallbackUrl });

            const recording = await twilioClient.calls(callSid).recordings.create({
              recordingChannels: 'dual',
              recordingStatusCallback: recordingCallbackUrl,
              recordingStatusCallbackMethod: 'POST'
            });
            logger.info('Recording started successfully', { callSid, recordingSid: recording.sid });
          } catch (recordError) {
            // Don't fail the call if recording fails
            logger.error('Failed to start recording:', {
              error: recordError.message,
              code: recordError.code,
              callSid
            });
          }

          // Initialize voice handler with caller number
          voiceHandler = new VoiceHandler(callSid, assistantId, callerNumber);
          const streamSid = data.streamSid; // Capture for use in callbacks

          try {
            await voiceHandler.initialize();

            const voiceId = voiceHandler.assistant.elevenlabs_voice_id ||
              process.env.ELEVENLABS_VOICE_ID ||
              'EXAVITQu4vr4xnSDxMaL'; // Default: "Sarah" voice

            // Only send greeting if first_message is configured
            // If null/empty, wait for caller to speak first (smoother for outbound)
            const greeting = voiceHandler.assistant.first_message;

            if (greeting) {
              logger.info('Sending ElevenLabs greeting', { greeting, voiceId });

              try {
                // DISABLED: Synthetic background noise causes crackling on phone audio
                const backgroundSound = 'none';
                const backgroundVolume = 0.40;

                // Debug logging for background sound
                logger.info('Background sound settings', {
                  assistantId: voiceHandler.assistant.id,
                  background_sound_raw: voiceHandler.assistant.background_sound,
                  background_volume_raw: voiceHandler.assistant.background_volume,
                  effectiveSound: backgroundSound,
                  effectiveVolume: backgroundVolume,
                  note: 'Synthetic noise disabled - causes crackling'
                });

                const greetingAudio = await streamElevenLabsAudio(greeting, voiceId, {
                  backgroundSound,
                  backgroundVolume
                });

              logger.info('ElevenLabs greeting received', {
                audioSizeKB: (greetingAudio.length / 1024).toFixed(2),
                audioBytes: greetingAudio.length,
                durationMs: Math.round(greetingAudio.length / 8) // 8 samples per ms at 8kHz
              });

              // Send entire greeting as one large chunk for smooth playback
              // Twilio buffers internally and this prevents stuttering from chunk boundaries
              // For very long greetings (>16KB), split into larger chunks
              const MAX_CHUNK_SIZE = 16000; // 16KB = 2 seconds of smooth audio

              if (greetingAudio.length <= MAX_CHUNK_SIZE) {
                // Send as single chunk for best quality
                if (ws.readyState === 1) {
                  ws.send(JSON.stringify({
                    event: 'media',
                    streamSid: streamSid,
                    media: {
                      payload: greetingAudio.toString('base64')
                    }
                  }));
                }
              } else {
                // For longer greetings, use larger chunks with small delays
                for (let offset = 0; offset < greetingAudio.length; offset += MAX_CHUNK_SIZE) {
                  const chunk = greetingAudio.slice(offset, Math.min(offset + MAX_CHUNK_SIZE, greetingAudio.length));

                  if (ws.readyState === 1) {
                    ws.send(JSON.stringify({
                      event: 'media',
                      streamSid: streamSid,
                      media: {
                        payload: chunk.toString('base64')
                      }
                    }));

                    // Small delay between large chunks to prevent buffer overflow
                    if (offset + MAX_CHUNK_SIZE < greetingAudio.length) {
                      await new Promise(resolve => setTimeout(resolve, 50));
                    }
                  } else {
                    logger.warn('WebSocket not open, cannot send audio', { readyState: ws.readyState });
                    break;
                  }
                }
              }

              logger.info('ElevenLabs greeting fully sent');

              // Start filler generation AFTER greeting to avoid API contention
              voiceHandler.startFillerGeneration();

              } catch (greetingError) {
                logger.error('Failed to send ElevenLabs greeting:', greetingError);
                // Still start filler generation even if greeting failed
                voiceHandler.startFillerGeneration();
              }
            } else {
              // No greeting - wait for caller to speak first (outbound demo mode)
              logger.info('No first_message configured, waiting for caller to speak first', {
                assistantId: voiceHandler.assistant.id,
                voiceId
              });
              // Start filler generation immediately for outbound (no greeting to wait for)
              voiceHandler.startFillerGeneration();
            }

            // Helper function to process speech and send audio
            const processSpeechAndRespond = async (useStreamingTranscript = false) => {
              try {
                logger.info('Speech end detected, starting response', { useStreamingTranscript });

                const fillerVoiceId = voiceHandler.assistant?.elevenlabs_voice_id || process.env.ELEVENLABS_VOICE_DEFAULT;
                let fillersSent = 0;
                let fillerInterval = null;

                // Helper to send a filler audio
                const sendFiller = () => {
                  if (ws.readyState !== 1) return false;
                  const fillerAudio = getInstantFillerAudio(fillerVoiceId, 'none');
                  if (fillerAudio) {
                    fillersSent++;
                    logger.info(`Sending filler audio #${fillersSent}`, {
                      bytes: fillerAudio.length,
                      durationMs: Math.round(fillerAudio.length / 8)
                    });
                    ws.send(JSON.stringify({
                      event: 'media',
                      streamSid: streamSid,
                      media: {
                        payload: fillerAudio.toString('base64')
                      }
                    }));
                    return true;
                  }
                  return false;
                };

                // INSTANT FILLER: Send filler audio IMMEDIATELY before any processing
                // This plays while GPT is thinking (not buffered with response)
                if (voiceHandler.assistant?.use_filler_audio !== false) {
                  sendFiller();

                  // ============================================
                  // OPTIMIZATION 3: Chain multiple fillers if GPT takes >3.5s
                  // Send additional fillers every 3.5s to mask long processing
                  // Only trigger on genuinely slow responses (GPT typically 2-2.5s)
                  // ============================================
                  fillerInterval = setInterval(() => {
                    if (fillersSent < 2) { // Max 2 fillers total (initial + 1 more)
                      logger.info('GPT taking long, sending additional filler', { fillersSent });
                      sendFiller();
                    } else {
                      clearInterval(fillerInterval);
                      fillerInterval = null;
                    }
                  }, 3500); // Every 3.5 seconds (gives GPT time to finish)
                }

                // Buffer response audio chunks (filler already sent above)
                const audioChunks = [];

                // Use streaming transcription if available (MUCH faster!)
                // Note: filler in voice-handler is now skipped since we sent it above
                const result = useStreamingTranscript && voiceHandler.streamingTranscriber
                  ? await voiceHandler.onSpeechEndWithStreaming((audioChunk) => {
                      audioChunks.push(audioChunk);
                    })
                  : await voiceHandler.onSpeechEndStreaming((audioChunk) => {
                      audioChunks.push(audioChunk);
                    });

                // Stop filler interval now that GPT response is ready
                if (fillerInterval) {
                  clearInterval(fillerInterval);
                  fillerInterval = null;
                  logger.info('Filler interval stopped (GPT ready)', { totalFillersSent: fillersSent });
                }

                // Now send buffered audio as large smooth chunks (like greeting)
                if (audioChunks.length > 0 && ws.readyState === 1) {
                  const fullAudio = Buffer.concat(audioChunks);
                  const MAX_CHUNK_SIZE = 16000; // 16KB = 2 seconds of smooth audio

                  logger.info('Sending buffered audio', {
                    totalBytes: fullAudio.length,
                    chunks: Math.ceil(fullAudio.length / MAX_CHUNK_SIZE)
                  });

                  for (let offset = 0; offset < fullAudio.length; offset += MAX_CHUNK_SIZE) {
                    const chunk = fullAudio.slice(offset, Math.min(offset + MAX_CHUNK_SIZE, fullAudio.length));

                    if (ws.readyState === 1) {
                      ws.send(JSON.stringify({
                        event: 'media',
                        streamSid: streamSid,
                        media: {
                          payload: chunk.toString('base64')
                        }
                      }));

                      // Small delay between chunks to prevent buffer issues
                      if (offset + MAX_CHUNK_SIZE < fullAudio.length) {
                        await new Promise(resolve => setTimeout(resolve, 20));
                      }
                    }
                  }
                }

                if (result) {
                  logger.info('Streaming response complete', {
                    transcription: result.transcription,
                    responsePreview: result.responseText?.substring(0, 50) + '...',
                    latencyMs: result.latency,
                    shouldEndCall: result.shouldEndCall
                  });

                  // If AI said goodbye or user ended conversation, hang up after audio plays
                  if (result.shouldEndCall) {
                    logger.info('End call detected, hanging up after audio completes', {
                      callSid,
                      transcription: result.transcription
                    });

                    // Wait for audio to finish playing (estimate based on response length)
                    // ~150 chars per second at normal speaking pace
                    const audioPlaybackMs = Math.max(2000, (result.responseText?.length || 0) * 7);

                    setTimeout(async () => {
                      try {
                        // End the call gracefully via Twilio REST API
                        await twilioClient.calls(callSid).update({ status: 'completed' });
                        logger.info('Call ended successfully via Twilio API', { callSid });
                      } catch (hangupError) {
                        // Twilio REST API may fail for Media Stream calls - that's OK
                        // Closing the WebSocket will end the stream and call
                        logger.warn('Twilio API hangup failed (expected for Media Streams), closing WebSocket', {
                          error: hangupError.message,
                          callSid
                        });
                      }

                      // Clean up voice handler
                      if (voiceHandler) {
                        await voiceHandler.endCall('completed');
                        voiceHandler = null;
                      }

                      // Close WebSocket to end the media stream (this will end the call)
                      if (ws.readyState === ws.OPEN) {
                        ws.close(1000, 'Call ended gracefully');
                        logger.info('WebSocket closed to end call', { callSid });
                      }
                    }, audioPlaybackMs);
                  }
                }
              } catch (error) {
                logger.error('Error processing speech:', error);
              }
            };

            // Set up speech end callbacks
            // When streaming is available, use it exclusively (no VAD race condition)
            // VAD is only used as fallback when streaming is NOT available

            if (voiceHandler.streamingTranscriber) {
              // Use Deepgram streaming ONLY - it has built-in VAD
              // This avoids race condition between VAD and streaming
              voiceHandler.onStreamingSpeechEnd = async (transcript) => {
                logger.info('🚀 Using STREAMING transcription', { transcript: transcript.substring(0, 30) });
                await processSpeechAndRespond(true);
              };

              // Don't set up VAD callback - streaming handles everything
              logger.info('Using Deepgram streaming exclusively (VAD disabled)');
            } else {
              // No streaming transcriber - use VAD only
              voiceHandler.audioBuffer.onSpeechEnd(async () => {
                await processSpeechAndRespond(false);
              });
            }

            logger.info('Voice handler initialized with ElevenLabs', {
              streamingTranscriber: !!voiceHandler.streamingTranscriber
            });
          } catch (error) {
            logger.error('Failed to initialize voice handler:', error);
            ws.close();
          }
          break;

        case 'media':
          // Incoming audio from user
          mediaChunkCount++;
          if (mediaChunkCount === 1 || mediaChunkCount % 100 === 0) {
            logger.info('Receiving audio', {
              chunkNumber: mediaChunkCount,
              payloadLength: data.media?.payload?.length || 0
            });
          }
          if (voiceHandler && data.media?.payload) {
            await voiceHandler.processAudioChunk(data.media.payload);
          }
          break;

        case 'stop':
          logger.info('Twilio Media Stream stopped', {
            streamSid: data.streamSid
          });

          if (voiceHandler) {
            await voiceHandler.endCall('completed');
            voiceHandler = null;
          }
          break;

        default:
          logger.debug('Unknown event type:', data.event);
      }
    } catch (error) {
      logger.error('WebSocket message error:', error);
    }
  });

  ws.on('close', async () => {
    logger.info('WebSocket connection closed');

    if (voiceHandler) {
      await voiceHandler.endCall('disconnected');
      voiceHandler = null;
    }
  });

  ws.on('error', (error) => {
    logger.error('WebSocket error:', error);
  });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
  logger.info(`🚀 VAPI Takeover server running on port ${PORT}`);
  logger.info(`   Environment: ${process.env.NODE_ENV}`);
  logger.info(`   WebSocket endpoint: ws://localhost:${PORT}/voice/stream`);
  logger.info(`   API endpoint: http://localhost:${PORT}/api`);

  // Pre-generate filler phrases at startup for commonly used voices
  // This ensures instant filler playback from the very first call
  try {
    const voicesToPreload = new Set();

    // Add default voice if configured
    if (process.env.ELEVENLABS_VOICE_DEFAULT) {
      voicesToPreload.add(process.env.ELEVENLABS_VOICE_DEFAULT);
    }
    if (process.env.ELEVENLABS_OUTBOUND_VOICE_ID) {
      voicesToPreload.add(process.env.ELEVENLABS_OUTBOUND_VOICE_ID);
    }

    // Fetch active assistants and pre-generate for their voices
    const { data: assistants } = await supabaseService.client
      .from('assistants')
      .select('elevenlabs_voice_id')
      .eq('active', true)
      .not('elevenlabs_voice_id', 'is', null)
      .limit(10);

    if (assistants) {
      assistants.forEach(a => {
        if (a.elevenlabs_voice_id) voicesToPreload.add(a.elevenlabs_voice_id);
      });
    }

    logger.info(`Pre-generating filler phrases for ${voicesToPreload.size} voices at startup`);

    // Generate in parallel for speed
    await Promise.all(
      Array.from(voicesToPreload).map(voiceId =>
        preGenerateFillerPhrases(voiceId, { backgroundSound: 'none' })
          .then(() => logger.info(`Fillers ready for voice: ${voiceId}`))
          .catch(e => logger.warn(`Failed to pre-generate fillers for ${voiceId}:`, e.message))
      )
    );

    logger.info('✅ Filler phrases pre-loaded and ready for instant playback');
  } catch (e) {
    logger.warn('Could not pre-generate fillers at startup:', e.message);
  }

  // ============================================
  // STALE SESSION CLEANUP JOB
  // Runs every 5 minutes to close chat sessions that survived server restarts
  // ============================================
  const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  // Run cleanup once at startup (after 30 second delay to let server warm up)
  setTimeout(async () => {
    logger.info('Running initial stale session cleanup...');
    const result = await cleanupStaleSessions();
    logger.info('Initial cleanup complete', result);
  }, 30000);

  // Then run every 5 minutes
  setInterval(async () => {
    try {
      await cleanupStaleSessions();
    } catch (e) {
      logger.error('Periodic cleanup failed:', e.message);
    }
  }, CLEANUP_INTERVAL_MS);

  logger.info(`✅ Stale session cleanup job scheduled (every ${CLEANUP_INTERVAL_MS / 60000} minutes)`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, closing server...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, closing server...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

export default server;
