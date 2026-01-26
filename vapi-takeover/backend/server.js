// server.js - Main Express + WebSocket server for VAPI Takeover
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
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
  // Skip API routes and static files
  if (req.path.startsWith('/api/') || req.path.startsWith('/voice/')) {
    return next();
  }
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

// WebSocket handler for Twilio Media Streams
wss.on('connection', async (ws, req) => {
  logger.info('WebSocket connection established');

  let voiceHandler = null;

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);

      switch (data.event) {
        case 'start':
          logger.info('Twilio Media Stream started', {
            streamSid: data.streamSid,
            callSid: data.start.callSid
          });

          // Get assistant ID from custom parameters (set by Twilio webhook)
          const assistantId = data.start.customParameters?.assistantId;

          if (!assistantId) {
            logger.error('No assistantId in call parameters');
            ws.close();
            return;
          }

          // Initialize voice handler
          voiceHandler = new VoiceHandler(data.start.callSid, assistantId);
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
              const greetingAudio = await streamElevenLabsAudio(greeting, voiceId);

              logger.info('ElevenLabs greeting received', {
                audioSizeKB: (greetingAudio.length / 1024).toFixed(2),
                audioBytes: greetingAudio.length,
                firstBytes: greetingAudio.slice(0, 20).toString('hex')
              });

              // Send audio in chunks up to 8KB (Twilio max is 16KB after base64 decode)
              // Twilio handles buffering internally, no need for artificial delays
              const MAX_CHUNK_SIZE = 8000; // 8KB chunks = 1 second of audio at 8kHz

              for (let offset = 0; offset < greetingAudio.length; offset += MAX_CHUNK_SIZE) {
                const chunk = greetingAudio.slice(offset, Math.min(offset + MAX_CHUNK_SIZE, greetingAudio.length));
                const chunkBase64 = chunk.toString('base64');

                if (ws.readyState === 1) { // WebSocket.OPEN
                  ws.send(JSON.stringify({
                    event: 'media',
                    streamSid: streamSid,
                    media: {
                      payload: chunkBase64
                    }
                  }));
                  logger.debug('Sent audio chunk', { offset, chunkSize: chunk.length });
                } else {
                  logger.warn('WebSocket not open, cannot send audio', { readyState: ws.readyState });
                  break;
                }
              }

              logger.info('ElevenLabs greeting fully sent');

            } catch (greetingError) {
              logger.error('Failed to send ElevenLabs greeting:', greetingError);
              // Continue anyway - conversation can still work
            }

            // Set speech end callback for ongoing conversation
            voiceHandler.audioBuffer.onSpeechEnd(async () => {
              try {
                const result = await voiceHandler.onSpeechEnd();

                if (result && result.audioStream) {
                  logger.info('AI response ready', {
                    transcription: result.transcription,
                    responsePreview: result.responseText?.substring(0, 50) + '...',
                    latencyMs: result.latency?.total,
                    audioSizeKB: (result.audioStream.length / 1024).toFixed(2)
                  });

                  // Send audio in chunks up to 8KB
                  const MAX_CHUNK_SIZE = 8000;

                  for (let offset = 0; offset < result.audioStream.length; offset += MAX_CHUNK_SIZE) {
                    const chunk = result.audioStream.slice(offset, Math.min(offset + MAX_CHUNK_SIZE, result.audioStream.length));
                    const chunkBase64 = chunk.toString('base64');

                    if (ws.readyState === 1) {
                      ws.send(JSON.stringify({
                        event: 'media',
                        streamSid: streamSid,
                        media: {
                          payload: chunkBase64
                        }
                      }));
                    }
                  }

                  logger.info('AI response audio fully sent');
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
