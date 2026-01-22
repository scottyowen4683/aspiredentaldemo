/**
 * KB INDEXING SCRIPT
 * ------------------
 * Purpose:
 * - Read a TXT knowledge base file
 * - Chunk it intelligently
 * - Create embeddings
 * - Store chunks in Supabase (pgvector)
 *
 * Run via GitHub Actions.
 *
 * Tenant/source are derived from filename:
 * - moreton_kb.txt => tenant_id: "moreton", source: "moreton_kb.txt"
 */

import fs from "fs";
import path from "path";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

/* =========================
   ENVIRONMENT VALIDATION
   ========================= */

const requiredEnv = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "OPENAI_API_KEY"];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const EMBEDDING_MODEL = process.env.EMBED_MODEL || "text-embedding-3-small";

/* =========================
   CLIENTS
   ========================= */

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

/* =========================
   UTILITIES
   ========================= */

function normaliseText(text) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isHeading(line) {
  const l = line.trim();
  if (!l) return false;
  if (/^[-=]{4,}$/.test(l)) return true;
  if (/^[A-Z0-9 \/\-&(),.]{6,}$/.test(l) && /[A-Z]/.test(l)) return true;
  if (/^.{3,80}:\s*$/.test(l)) return true;
  return false;
}

function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

function inferPriority(section) {
  const s = (section || "").toLowerCase();
  if (s.includes("emergency") || s.includes("after hours")) return 1;
  if (s.includes("bin") || s.includes("waste") || s.includes("fees")) return 3;
  if (s.includes("appendix") || s.includes("glossary")) return 10;
  return 5;
}

// Tenant from filename: "moreton_kb.txt" -> "moreton"
function tenantFromFilename(filePath) {
  const base = path.basename(filePath).toLowerCase();
  const noExt = base.replace(/\.txt$/i, "");
  return noExt.replace(/_kb$/i, "");
}

/* =========================
   CHUNKING LOGIC
   ========================= */

function chunkText(rawText) {
  const text = normaliseText(rawText);
  if (!text) return [];

  const lines = text.split("\n");
  const chunks = [];

  let buffer = "";
  let currentSection = "General";

  const MIN_CHARS = 900;
  const MAX_CHARS = 2600;

  function flush(force = false) {
    const content = buffer.trim();
    if (!content) {
      buffer = "";
      return;
    }
    if (!force && content.length < MIN_CHARS) return;

    chunks.push({ section: currentSection, content });
    buffer = "";
  }

  for (const line of lines) {
    if (isHeading(line)) {
      flush(true);

      if (!/^[-=]{4,}$/.test(line.trim())) {
        currentSection = line.replace(/:\s*$/, "").trim();
      }

      buffer += line + "\n";
      continue;
    }

    buffer += line + "\n";
    if (buffer.length >= MAX_CHARS) flush(true);
  }

  flush(true);
  return chunks;
}

/* =========================
   EMBEDDING + INSERT
   ========================= */

async function embed(text) {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text
  });
  return response.data[0].embedding;
}

async function insertChunks({ tenant_id, source, chunks }) {
  if (!chunks.length) {
    console.log("No chunks to insert (chunks.length = 0).");
    return;
  }

  const rows = [];

  for (let i = 0; i < chunks.length; i++) {
    const { section, content } = chunks[i];
    const embedding = await embed(content);

    rows.push({
      tenant_id,
      source,
      section,
      content,
      embedding,
      embedding_model: EMBEDDING_MODEL,
      priority: inferPriority(section),
      tokens_est: estimateTokens(content)
    });

    if (rows.length >= 25) {
      const { error } = await supabase.from("knowledge_chunks").insert(rows);
      if (error) throw error;
      rows.length = 0;
    }
  }

  if (rows.length) {
    const { error } = await supabase.from("knowledge_chunks").insert(rows);
    if (error) throw error;
  }
}

/* =========================
   MAIN
   ========================= */

async function main() {
  const inputFile = process.argv[2];

  if (!inputFile) throw new Error("TXT file path argument is required");

  const absolutePath = path.resolve(inputFile);
  const rawText = fs.readFileSync(absolutePath, "utf8");

  console.log("Loaded file:", absolutePath);
  console.log("Raw text length:", rawText.length);
  console.log("Preview (first 400 chars):", JSON.stringify(rawText.slice(0, 400)));

  const tenant_id = tenantFromFilename(absolutePath);
  const source = path.basename(absolutePath);

  const chunks = chunkText(rawText);
  console.log(`Prepared ${chunks.length} chunks`);
  await insertChunks({ tenant_id, source, chunks });

  console.log("KB indexing complete");
}

main().catch((err) => {
  console.error("Indexing failed:", err);
  process.exit(1);
});
