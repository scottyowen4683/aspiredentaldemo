// services/kb-processor.js - Knowledge Base Processing Service
// Smart heading-based chunking with semantic sections (based on moretonbaypilot approach)

import OpenAI from 'openai';
import crypto from 'crypto';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import supabaseService from './supabase-service.js';
import logger from './logger.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const EMBEDDING_MODEL = 'text-embedding-3-small';

/**
 * Normalize text - clean up whitespace and line endings
 */
function normalizeText(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Generate SHA256 hash for content deduplication
 */
function sha256(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

/**
 * Map heading text to canonical section buckets
 * This allows semantic grouping across different KB sources
 */
function mapHeadingToSection(headingRaw) {
  const h = String(headingRaw || '').toUpperCase();

  // Waste & Bins
  if (h.includes('BIN') || h.includes('WASTE') || h.includes('RECYCL') || h.includes('RUBBISH')) {
    return 'waste_bins';
  }

  // Rates & Payments
  if (h.includes('RATES') || h.includes('WATER') || h.includes('PAYMENT')) {
    return 'rates_payments';
  }

  // Fees & Charges
  if (h.includes('FEES') || h.includes('CHARGES') || h.includes('COST') || h.includes('PRICE')) {
    return 'fees_charges';
  }

  // Facilities & Hours
  if (h.includes('OPENING HOURS') || h.endsWith('HOURS') || h.includes('LIBRARY') ||
      h.includes('POOL') || h.includes('FACILITY') || h.includes('CENTRE')) {
    return 'facilities_hours';
  }

  // Councillors & Representatives
  if (h.includes('COUNCILLOR') || h.includes('MAYOR') || h.includes('DIVISION') ||
      h.includes('WARD') || h.includes('REPRESENTATIVE')) {
    return 'councillors';
  }

  // Parking & Permits
  if (h.includes('PARKING') || h.includes('PERMIT') || h.includes('INFRINGEMENT')) {
    return 'parking_permits';
  }

  // Planning & Development
  if (h.includes('PLANNING') || h.includes('DEVELOPMENT') || h.includes('DA ') ||
      h.includes('BUILDING') || h.includes('APPROVAL')) {
    return 'planning_development';
  }

  // Service Timeframes
  if (h.includes('SERVICE TIMEFRAME') || h.includes('RESPONSE TIME') || h.includes('SLA')) {
    return 'service_timeframes';
  }

  // Reports & Complaints
  if (h.includes('REPORT') || h.includes('REQUEST') || h.includes('COMPLAINT') ||
      h.includes('BARKING') || h.includes('NOISE') || h.includes('ISSUE')) {
    return 'service_requests';
  }

  // Contact & Support
  if (h.includes('CONTACT') || h.includes('PHONE') || h.includes('EMAIL') ||
      h.includes('SUPPORT') || h.includes('HELP')) {
    return 'contact_support';
  }

  // Animals & Pets
  if (h.includes('DOG') || h.includes('CAT') || h.includes('PET') || h.includes('ANIMAL')) {
    return 'animals_pets';
  }

  return 'general';
}

/**
 * Calculate priority (lower = higher priority)
 */
function inferPriority({ section, isDerived }) {
  if (isDerived) return 2; // Derived lookup rows are highest priority

  const s = (section || '').toLowerCase();

  // Emergency/urgent info highest priority
  if (s.includes('emergency') || s.includes('after hours')) return 1;

  // Common queries - medium-high priority
  if (s.includes('waste') || s.includes('councillor') || s.includes('contact')) return 3;

  // Fees and rates - medium priority
  if (s.includes('fees') || s.includes('rates')) return 4;

  // Default
  return 5;
}

/**
 * Check if line is a divider (---------)
 */
function isDivider(line) {
  return /^-{5,}\s*$/.test(line.trim());
}

/**
 * Check if line is an ALL CAPS heading
 */
function isAllCapsHeading(line) {
  const trimmed = line.trim();
  return trimmed.length > 0 && /^[A-Z0-9][A-Z0-9 \-–:()\/&,.]+$/.test(trimmed);
}

/**
 * Parse text into heading blocks
 * Detects patterns like:
 * ------------------------------------------------------------
 * BIN COLLECTION DAYS
 * ------------------------------------------------------------
 * <content...>
 */
function parseHeadingBlocks(fullText) {
  const lines = normalizeText(fullText).split('\n');
  const blocks = [];
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for heading pattern: divider + heading + divider
    if (
      isDivider(line) &&
      i + 2 < lines.length &&
      isAllCapsHeading(lines[i + 1]) &&
      isDivider(lines[i + 2])
    ) {
      // Close previous block
      if (current) {
        current.body = current.body.join('\n').trim();
        blocks.push(current);
      }

      // Start new block
      current = { heading: lines[i + 1].trim(), body: [] };
      i = i + 2; // Skip heading + next divider
      continue;
    }

    // Add line to current block body
    if (current) {
      current.body.push(line);
    }
  }

  // Don't forget the last block
  if (current) {
    current.body = current.body.join('\n').trim();
    blocks.push(current);
  }

  return blocks;
}

/**
 * Smart paragraph-based chunking within a block
 */
function chunkBlockText(bodyText, maxChars = 2200) {
  const text = normalizeText(bodyText);
  if (!text) return [];

  const paras = text.split('\n\n');
  const chunks = [];
  let buffer = '';

  const flush = () => {
    const c = buffer.trim();
    if (c) chunks.push(c);
    buffer = '';
  };

  for (const p of paras) {
    const para = (p || '').trim();
    if (!para) continue;

    // If adding this paragraph would overflow, flush first
    if ((buffer + '\n\n' + para).length > maxChars) {
      flush();
    }

    // If a single paragraph is bigger than maxChars, hard-split it
    if (para.length > maxChars) {
      flush();
      for (let i = 0; i < para.length; i += maxChars) {
        chunks.push(para.slice(i, i + maxChars));
      }
      continue;
    }

    buffer = buffer ? `${buffer}\n\n${para}` : para;
  }

  flush();
  return chunks;
}

/**
 * Simple fallback chunking for unstructured text
 */
function simpleChunkText(text, chunkSize = 1500, overlap = 200) {
  const normalized = normalizeText(text);
  const chunks = [];
  let start = 0;

  while (start < normalized.length) {
    const end = Math.min(start + chunkSize, normalized.length);
    const chunk = normalized.substring(start, end).trim();

    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    start = end - overlap;
    if (start >= normalized.length - overlap) break;
  }

  return chunks;
}

/**
 * Extract text from different file types
 */
async function extractText(fileBuffer, mimeType) {
  try {
    if (mimeType === 'text/plain') {
      return fileBuffer.toString('utf-8');
    }

    if (mimeType === 'application/pdf') {
      const data = await pdf(fileBuffer);
      return data.text;
    }

    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      return result.value;
    }

    throw new Error(`Unsupported file type: ${mimeType}`);
  } catch (error) {
    logger.error('Text extraction error:', error);
    throw new Error(`Failed to extract text: ${error.message}`);
  }
}

/**
 * Generate embeddings in batches
 */
async function generateEmbeddings(texts) {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
    encoding_format: 'float'
  });
  return response.data.map(d => d.embedding);
}

/**
 * Main KB processing function
 */
export async function processKnowledgeBase(options) {
  const {
    fileBuffer,
    text,
    fileName,
    mimeType,
    org_id,
    assistant_id
  } = options;

  const startTime = Date.now();
  const tenant_id = org_id?.toString() || '';
  const source = fileName || 'Text Input';

  try {
    // Step 1: Extract text
    let fullText;
    if (text) {
      fullText = text;
    } else if (fileBuffer) {
      fullText = await extractText(fileBuffer, mimeType);
    } else {
      throw new Error('Either fileBuffer or text must be provided');
    }

    logger.info('Text extracted:', { length: fullText.length, fileName });

    // Step 2: Try heading-based parsing first
    const blocks = parseHeadingBlocks(fullText);
    const pending = [];

    if (blocks.length > 0) {
      // Structured document with headings
      logger.info(`Detected ${blocks.length} heading blocks`);

      for (const block of blocks) {
        const heading = block.heading;
        const section = mapHeadingToSection(heading);
        const ragChunks = chunkBlockText(block.body);

        ragChunks.forEach((chunkText, idx) => {
          // Prepend heading for context
          const content = `HEADING: ${heading}\n\n${chunkText}`.trim();
          const content_hash = sha256(`${tenant_id}|${source}|${section}|${heading}|${idx}|${content}`);

          pending.push({
            tenant_id,
            org_id,
            assistant_id: assistant_id || null,
            source,
            section,
            content,
            content_hash,
            chunk_index: idx,
            priority: inferPriority({ section, isDerived: false }),
            tokens_est: Math.ceil(content.length / 4),
            metadata: {
              heading,
              kind: 'rag_block',
              total_blocks: blocks.length
            },
            active: true
          });
        });
      }
    } else {
      // Fallback to simple chunking for unstructured text
      logger.info('No heading blocks detected, using simple chunking');

      const chunks = simpleChunkText(fullText);
      chunks.forEach((chunk, idx) => {
        const content_hash = sha256(`${tenant_id}|${source}|general|${idx}|${chunk}`);

        pending.push({
          tenant_id,
          org_id,
          assistant_id: assistant_id || null,
          source,
          section: 'general',
          content: chunk,
          content_hash,
          chunk_index: idx,
          priority: 5,
          tokens_est: Math.ceil(chunk.length / 4),
          metadata: {
            kind: 'simple_chunk',
            total_chunks: chunks.length
          },
          active: true
        });
      });
    }

    if (pending.length === 0) {
      return {
        success: false,
        error: 'No content to process'
      };
    }

    logger.info(`Preparing to embed+upsert ${pending.length} chunks`);

    // Step 3: Batch embed and upsert
    const BATCH_SIZE = 50;
    let totalEmbeddingCost = 0;
    let savedCount = 0;

    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      const slice = pending.slice(i, i + BATCH_SIZE);
      const texts = slice.map(r => r.content);

      // Generate embeddings for batch
      const embeddings = await generateEmbeddings(texts);

      // Calculate cost ($0.02 per 1M tokens)
      const batchTokens = texts.reduce((sum, t) => sum + Math.ceil(t.length / 4), 0);
      totalEmbeddingCost += (batchTokens / 1_000_000) * 0.02;

      // Prepare rows with embeddings
      const rows = slice.map((r, j) => ({
        ...r,
        embedding: embeddings[j],
        embedding_model: EMBEDDING_MODEL
      }));

      // Upsert to Supabase (idempotent via content_hash)
      const { error } = await supabaseService.client
        .from('knowledge_chunks')
        .upsert(rows, {
          onConflict: 'tenant_id,source,content_hash',
          ignoreDuplicates: false // Update if exists
        });

      if (error) {
        logger.error('Chunk upsert error:', error);
        throw new Error(`Failed to save chunks: ${error.message}`);
      }

      savedCount += rows.length;
      logger.info(`Processed ${savedCount}/${pending.length} chunks`);
    }

    const processingTime = Date.now() - startTime;

    logger.info('Knowledge base processing complete:', {
      chunks: savedCount,
      blocks: blocks.length,
      processingTimeMs: processingTime,
      totalCost: totalEmbeddingCost.toFixed(6)
    });

    return {
      success: true,
      chunksCreated: savedCount,
      metadata: {
        originalLength: fullText.length,
        chunksCreated: savedCount,
        blocksDetected: blocks.length,
        processingTimeMs: processingTime,
        totalCost: parseFloat(totalEmbeddingCost.toFixed(6)),
        fileName
      }
    };

  } catch (error) {
    logger.error('Knowledge base processing error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Search knowledge base using vector similarity
 */
export async function searchKnowledgeBase(query, org_id, assistant_id, limit = 5) {
  try {
    // Generate embedding for query
    const [queryEmbedding] = await generateEmbeddings([query]);

    // Call RPC for vector search
    const { data, error } = await supabaseService.client.rpc('match_knowledge_chunks', {
      p_tenant_id: org_id?.toString() || '',
      p_query_embedding: queryEmbedding,
      p_match_count: limit
    });

    if (error) {
      logger.error('Knowledge search error:', error);
      throw error;
    }

    logger.info('Knowledge search complete:', {
      query: query.substring(0, 100),
      results: data?.length || 0
    });

    return {
      success: true,
      results: data || []
    };

  } catch (error) {
    logger.error('Knowledge search error:', error);
    return {
      success: false,
      error: error.message,
      results: []
    };
  }
}

export default {
  processKnowledgeBase,
  searchKnowledgeBase
};
