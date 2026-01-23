// netlify/functions/ai-chat-cached.js
//
// Optional: Wrapper around ai-chat with caching for common queries
// Deploy this as a separate function if you want caching
//
// Benefits:
// - Faster responses for repeated questions
// - Lower OpenAI costs
// - Better user experience
//
// Only caches:
// - Simple information queries (not service requests)
// - Questions without personal information
//
// Cache key: hash(tenantId + user question + KB version)
// Cache TTL: 1 hour (configurable)

const crypto = require('crypto');
const aiChat = require('./ai-chat');

// Simple in-memory cache (resets on cold start, but that's fine)
const cache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function shouldCache(input, conversationHistory) {
  const lowerInput = input.toLowerCase();

  // Don't cache if conversation has history (might be contextual)
  if (conversationHistory && conversationHistory.length > 0) return false;

  // Don't cache service requests (they need to send emails)
  const serviceKeywords = ['report', 'complaint', 'issue', 'problem', 'missed', 'broken', 'fallen'];
  if (serviceKeywords.some(kw => lowerInput.includes(kw))) return false;

  // Don't cache if contains phone numbers or emails
  if (/\d{4}/.test(input) || /@/.test(input)) return false;

  // Cache simple questions
  const infoKeywords = ['hours', 'when', 'where', 'what day', 'how much', 'cost', 'fee', 'contact'];
  return infoKeywords.some(kw => lowerInput.includes(kw));
}

function getCacheKey(tenantId, input) {
  const normalized = input.toLowerCase().trim().replace(/\s+/g, ' ');
  return crypto.createHash('md5').update(`${tenantId}:${normalized}`).digest('hex');
}

function cleanExpiredCache() {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (now - entry.timestamp > CACHE_TTL) {
      cache.delete(key);
    }
  }
}

exports.handler = async (event) => {
  // Parse body to check if we should cache
  const body = event.body ? JSON.parse(event.body) : {};
  const { tenantId, input, sessionId } = body;

  // Clean expired entries periodically
  if (Math.random() < 0.1) cleanExpiredCache(); // 10% of requests

  // Check if this should be cached
  const canCache = shouldCache(input, []);

  if (canCache) {
    const cacheKey = getCacheKey(tenantId, input);
    const cached = cache.get(cacheKey);

    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      console.log(`[cache] HIT for key: ${cacheKey}`);

      // Return cached response with new session ID
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'X-Cache': 'HIT',
        },
        body: JSON.stringify({
          ...cached.response,
          sessionId: sessionId || cached.response.sessionId,
          cached: true,
        }),
      };
    }
  }

  // Not cached or can't cache - call original function
  const response = await aiChat.handler(event);

  // Cache successful responses
  if (canCache && response.statusCode === 200) {
    const cacheKey = getCacheKey(tenantId, input);
    const responseBody = JSON.parse(response.body);

    cache.set(cacheKey, {
      response: responseBody,
      timestamp: Date.now(),
    });

    console.log(`[cache] MISS - stored key: ${cacheKey}`);

    response.headers = {
      ...response.headers,
      'X-Cache': 'MISS',
    };
  }

  return response;
};
