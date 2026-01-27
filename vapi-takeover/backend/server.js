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
import { streamElevenLabsAudio } from './ai/elevenlabs.js';

// Routes
import chatRouter from './routes/chat.js';
import voiceRouter from './routes/voice.js';
import adminRouter from './routes/admin.js';
import campaignsRouter from './routes/campaigns.js';

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

            // Send initial greeting with ElevenLabs voice IMMEDIATELY
            // This is what makes it feel like VAPI - instant AI voice response
            const greeting = voiceHandler.assistant.first_message ||
              `Hi! How can I help you today?`;

            logger.info('Sending ElevenLabs greeting', { greeting });

            const voiceId = voiceHandler.assistant.elevenlabs_voice_id ||
              process.env.ELEVENLABS_VOICE_ID ||
              'EXAVITQu4vr4xnSDxMaL'; // Default: "Sarah" voice

            try {
              // Get background sound setting from assistant
              const backgroundSound = voiceHandler.assistant.background_sound || 'none';
              const backgroundVolume = voiceHandler.assistant.background_volume || 0.15;

              // Debug logging for background sound
              logger.info('Background sound settings', {
                assistantId: voiceHandler.assistant.id,
                background_sound_raw: voiceHandler.assistant.background_sound,
                background_volume_raw: voiceHandler.assistant.background_volume,
                effectiveSound: backgroundSound,
                effectiveVolume: backgroundVolume
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

            } catch (greetingError) {
              logger.error('Failed to send ElevenLabs greeting:', greetingError);
              // Continue anyway - conversation can still work
            }

            // Set speech end callback for ongoing conversation - STREAMING for low latency!
            voiceHandler.audioBuffer.onSpeechEnd(async () => {
              try {
                logger.info('Speech end detected, starting streaming response');

                // Use streaming method - sends audio chunks to Twilio IMMEDIATELY
                const result = await voiceHandler.onSpeechEndStreaming((audioChunk) => {
                  // This callback fires for each chunk from ElevenLabs
                  // Send directly to Twilio for lowest latency
                  if (ws.readyState === 1) {
                    const chunkBase64 = audioChunk.toString('base64');
                    ws.send(JSON.stringify({
                      event: 'media',
                      streamSid: streamSid,
                      media: {
                        payload: chunkBase64
                      }
                    }));
                  }
                });

                if (result) {
                  logger.info('Streaming response complete', {
                    transcription: result.transcription,
                    responsePreview: result.responseText?.substring(0, 50) + '...',
                    latencyMs: result.latency
                  });
                }
              } catch (error) {
                logger.error('Error processing speech:', error);
              }
            });

            logger.info('Voice handler initialized with ElevenLabs');
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
server.listen(PORT, () => {
  logger.info(`🚀 VAPI Takeover server running on port ${PORT}`);
  logger.info(`   Environment: ${process.env.NODE_ENV}`);
  logger.info(`   WebSocket endpoint: ws://localhost:${PORT}/voice/stream`);
  logger.info(`   API endpoint: http://localhost:${PORT}/api`);
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
