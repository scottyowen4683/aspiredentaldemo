// services/kb-processor.js - Knowledge Base Processing Service
// Handles file upload → text extraction → chunking → embedding → Supabase storage

import OpenAI from 'openai';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import supabaseService from './supabase-service.js';
import logger from './logger.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

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
 * Split text into chunks (max 1000 characters with overlap)
 */
function chunkText(text, chunkSize = 1000, overlap = 200) {
  const chunks = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.substring(start, end).trim();

    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    start = end - overlap;
    if (start >= text.length - overlap) break;
  }

  return chunks;
}

/**
 * Generate embedding for a text chunk using OpenAI
 */
async function generateEmbedding(text) {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small', // $0.02 per 1M tokens
      input: text,
      encoding_format: 'float'
    });

    return response.data[0].embedding;
  } catch (error) {
    logger.error('Embedding generation error:', error);
    throw new Error(`Failed to generate embedding: ${error.message}`);
  }
}

/**
 * Process knowledge base: extract → chunk → embed → save
 */
export async function processKnowledgeBase(options) {
  const {
    fileBuffer,   // Buffer (if file upload)
    text,         // String (if direct text input)
    fileName,
    mimeType,
    org_id,
    assistant_id
  } = options;

  const startTime = Date.now();

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

    logger.info('Text extracted:', {
      length: fullText.length,
      fileName
    });

    // Step 2: Split into chunks
    const chunks = chunkText(fullText);

    logger.info('Text chunked:', {
      chunks: chunks.length,
      avgSize: Math.round(fullText.length / chunks.length)
    });

    // Step 3: Generate embeddings and save to Supabase
    const savedChunks = [];
    let totalEmbeddingCost = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      // Generate embedding
      const embedding = await generateEmbedding(chunk);

      // Calculate cost (text-embedding-3-small: $0.02 per 1M tokens)
      // Rough estimate: ~1 token per 4 characters
      const tokens = Math.ceil(chunk.length / 4);
      const cost = (tokens / 1_000_000) * 0.02;
      totalEmbeddingCost += cost;

      // Save to Supabase
      // Uses existing schema columns: content, source_file, tenant_id
      const { data, error } = await supabaseService.client
        .from('knowledge_chunks')
        .insert({
          org_id,
          tenant_id: org_id, // Use org_id as tenant_id for backward compatibility
          content: chunk,
          source_file: fileName,
          chunk_index: i,
          embedding
        })
        .select()
        .single();

      if (error) {
        logger.error('Chunk save error:', error);
        throw new Error(`Failed to save chunk ${i + 1}: ${error.message}`);
      }

      savedChunks.push(data);

      // Log progress every 10 chunks
      if ((i + 1) % 10 === 0 || i === chunks.length - 1) {
        logger.info(`Processed ${i + 1}/${chunks.length} chunks`);
      }
    }

    const processingTime = Date.now() - startTime;

    logger.info('Knowledge base processing complete:', {
      chunks: savedChunks.length,
      processingTimeMs: processingTime,
      totalCost: totalEmbeddingCost.toFixed(6),
      org_id
    });

    return {
      success: true,
      chunksCreated: savedChunks.length,
      metadata: {
        originalLength: fullText.length,
        chunksCreated: savedChunks.length,
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
    const queryEmbedding = await generateEmbedding(query);

    // Build RPC call for vector search
    let rpcCall = supabaseService.client.rpc('match_knowledge_chunks', {
      query_embedding: queryEmbedding,
      match_threshold: 0.7,
      match_count: limit
    });

    // Filter by org_id and/or assistant_id if provided
    if (assistant_id) {
      rpcCall = rpcCall.eq('assistant_id', assistant_id);
    } else if (org_id) {
      rpcCall = rpcCall.eq('org_id', org_id);
    }

    const { data, error } = await rpcCall;

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
