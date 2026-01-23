// server.js - Main Express + WebSocket server for VAPI Takeover
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import logger from './services/logger.js';
import supabaseService from './services/supabase-service.js';

// Routes
import chatRouter from './routes/chat.js';
import voiceRouter from './routes/voice.js';
import adminRouter from './routes/admin.js';

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

// API Routes
app.use('/api/chat', chatRouter);
app.use('/api/voice', voiceRouter);
app.use('/api/admin', adminRouter);

// WebSocket handler for Twilio Media Streams
wss.on('connection', async (ws, req) => {
  logger.info('WebSocket connection established');

  let callState = null;

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);

      switch (data.event) {
        case 'start':
          logger.info('Twilio Media Stream started', {
            streamSid: data.streamSid,
            callSid: data.start.callSid
          });

          callState = {
            streamSid: data.streamSid,
            callSid: data.start.callSid,
            customParameters: data.start.customParameters
          };

          // TODO: Initialize voice handler
          break;

        case 'media':
          // TODO: Handle incoming audio
          break;

        case 'stop':
          logger.info('Twilio Media Stream stopped', {
            streamSid: data.streamSid
          });

          // TODO: Cleanup
          break;

        default:
          logger.debug('Unknown event type:', data.event);
      }
    } catch (error) {
      logger.error('WebSocket message error:', error);
    }
  });

  ws.on('close', () => {
    logger.info('WebSocket connection closed');
    // TODO: Cleanup
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
