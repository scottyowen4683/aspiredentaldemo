/**
 * KB INDEXING SCRIPT (v2 - Heading Blocks + Derived Lookups)
 * ---------------------------------------------------------
 * - Reads one big TXT knowledge base file
 * - Splits into ALL CAPS heading blocks (divider + heading + divider)
 * - Maps headings to canonical section buckets
 * - Chunks each block for RAG
 * - ALSO derives lookup rows for certain blocks (e.g., BIN COLLECTION DAYS)
 * - Embeds in batches
 * - Upserts into Supabase using content_hash (idempotent)
 *
 * Filename drives tenant/source:
 * - moreton_kb.txt => tenant_id: "moreton", source: "moreton_kb.txt"
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

/* =========================
   ENVIRONMENT VALIDATION
   ========================= */

const requiredEnv = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "OPENAI_API_KEY"];
for (const key of requiredEnv) {
  if (!process.env[key]) throw new Error(`Missing required environment variable: ${key}`);
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

function tenantFromFilename(filePath) {
  const base = path.basename(filePath).toLowerCase();
  const noExt = base.replace(/\.txt$/i, "");
  return noExt.replace(/_kb$/i, "");
}

function estimateTokens(text) {
  return Math.ceil(String(text || "").length / 4);
}

function sha256Hex(str) {
  return crypto.createHash("sha256").update(str, "utf8").digest("hex");
}

/**
 * Canonical section buckets — keep these consistent across councils.
 * Store the literal heading in metadata.heading (not in section).
 */
function mapHeadingToSection(headingRaw) {
  const h = String(headingRaw || "").toUpperCase();

  if (h.includes("BIN") || h.includes("WASTE") || h.includes("RECYCL")) return "waste_bins";
  if (h.includes("RATES") || h.includes("WATER")) return "rates_payments";
  if (h.includes("FEES") || h.includes("CHARGES")) return "fees_charges";
  if (h.includes("OPENING HOURS") || h.endsWith("HOURS") || h.includes("LIBRARY") || h.includes("POOL"))
    return "facilities_hours";
  if (h.includes("COUNCILLOR")) return "councillors";
  if (h.includes("PARKING") || h.includes("PERMIT") || h.includes("INFRINGEMENT")) return "parking_permits";
  if (h.includes("PLANNING") || h.includes("DEVELOPMENT")) return "planning_development";
  if (h.includes("SERVICE TIMEFRAME")) return "service_timeframes";
  if (h.includes("REPORT") || h.includes("REQUEST") || h.includes("COMPLAINT")) return "service_requests";

  return "general";
}

/**
 * Priority: lower number = higher priority (your table default was 5).
 * Make derived lookup rows outrank general RAG chunks.
 */
function inferPriority({ section, isDerived }) {
  if (isDerived) return 2; // strong
  const s = (section || "").toLowerCase();
  if (s.includes("emergency") || s.includes("after hours")) return 1;
  if (s.includes("waste") || s.includes("fees") || s.includes("rates")) return 4;
  return 6;
}

/* =========================
   HEADING BLOCK PARSER
   ========================= */

/**
 * Detect blocks like:
 * ------------------------------------------------------------
 * BIN COLLECTION DAYS
 * ------------------------------------------------------------
 * <body...>
 */
function parseHeadingBlocks(fullText) {
  const lines = normaliseText(fullText).split("\n");

  const blocks = [];
  let current = null;

  const isDivider = (l) => /^-{10,}\s*$/.test(l.trim());
  const isAllCapsHeading = (l) => /^[A-Z0-9][A-Z0-9 \-–:()\/&]+$/.test(l.trim());

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (
      isDivider(line) &&
      i + 2 < lines.length &&
      isAllCapsHeading(lines[i + 1]) &&
      isDivider(lines[i + 2])
    ) {
      // close previous
      if (current) {
        current.body = current.body.join("\n").trim();
        blocks.push(current);
      }
      // start new
      current = { heading: lines[i + 1].trim(), body: [] };
      i = i + 2; // skip heading + next divider
      continue;
    }

    if (current) current.body.push(line);
  }

  if (current) {
    current.body = current.body.join("\n").trim();
    blocks.push(current);
  }

  return blocks;
}

/* =========================
   RAG CHUNKING (within a block)
   ========================= */

function chunkBlockText(bodyText) {
  const text = normaliseText(bodyText);
  if (!text) return [];

  const MIN_CHARS = 700;
  const MAX_CHARS = 2200;

  const paras = text.split("\n\n");
  const chunks = [];
  let buf = "";

  const flush = (force = false) => {
    const c = buf.trim();
    if (!c) {
      buf = "";
      return;
    }
    if (!force && c.length < MIN_CHARS) return;
    chunks.push(c);
    buf = "";
  };

  for (const p of paras) {
    const para = p.trim();
    if (!para) continue;

    if ((buf + "\n\n" + para).length > MAX_CHARS) {
      flush(true);
    }
    buf += (buf ? "\n\n" : "") + para;

    if (buf.length >= MAX_CHARS) flush(true);
  }

  flush(true);
  return chunks;
}

/* =========================
   DERIVED LOOKUPS: BIN COLLECTION DAYS
   ========================= */

function parseBinCollectionDays(blockBody) {
  const lines = normaliseText(blockBody)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const results = [];
  let currentDivision = "";
  let currentSuburbs = [];

  const divRe = /^Division\s+\d+\s*[–-]\s*(.+):$/i;
  const typicalRe = /^Typical day:\s*(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/i;

  for (const line of lines) {
    if (/^Collect suburb/i.test(line)) continue;

    const divMatch = line.match(divRe);
    if (divMatch) {
      // Keep original division line format (as-is) for metadata clarity
      currentDivision = line.replace(/:\s*$/, "").trim();
      currentSuburbs = [];
      continue;
    }

    const tMatch = line.match(typicalRe);
    if (tMatch) {
      const typical_day =
        tMatch[1][0].toUpperCase() + tMatch[1].slice(1).toLowerCase();

      for (const suburb of currentSuburbs) {
        results.push({ suburb, typical_day, division: currentDivision });
      }

      currentSuburbs = [];
      continue;
    }

    // Suburb list lines (comma-separated)
    if (line.includes(",")) {
      const subs = line
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      currentSuburbs.push(...subs);
    }
  }

  return results;
}

/* =========================
   EMBEDDINGS (batch)
   ========================= */

async function embedBatch(texts) {
  const resp = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts
  });
  return resp.data.map((d) => d.embedding);
}

/* =========================
   UPSERT ROWS (idempotent)
   ========================= */

async function upsertRows(rows) {
  if (!rows.length) return;

  // Your unique index is:
  // (tenant_id, source, COALESCE(section,''), content_hash)
  // Upsert conflict target uses real cols: tenant_id,source,section,content_hash
  const { error } = await supabase
    .from("knowledge_chunks")
    .upsert(rows, {
      onConflict: "tenant_id,source,section,content_hash",
      ignoreDuplicates: true
    });

  if (error) throw error;
}

/* =========================
   MAIN INGESTION
   ========================= */

async function main() {
  const inputFile = process.argv[2];
  if (!inputFile) throw new Error("TXT file path argument is required");

  const absolutePath = path.resolve(inputFile);
  const rawText = fs.readFileSync(absolutePath, "utf8");
  const text = normaliseText(rawText);

  const tenant_id = tenantFromFilename(absolutePath);
  const sourceFile = path.basename(absolutePath);

  console.log("Loaded file:", absolutePath);
  console.log("Tenant:", tenant_id);
  console.log("Source:", sourceFile);

  const blocks = parseHeadingBlocks(text);
  if (!blocks.length) {
    throw new Error(
      "No heading blocks detected. Ensure the file uses divider + ALL CAPS heading + divider format."
    );
  }

  console.log(`Detected ${blocks.length} heading blocks`);

  // Collect rows to embed + upsert in batches
  const pending = [];

  // 1) RAG chunks for every block
  for (const b of blocks) {
    const heading = b.heading;
    const section = mapHeadingToSection(heading);

    const ragChunks = chunkBlockText(b.body);
    ragChunks.forEach((chunkText, idx) => {
      const content = `HEADING: ${heading}\n\n${chunkText}`.trim();

      const content_hash = sha256Hex(
        `${tenant_id}|${sourceFile}|${section}|rag|${heading}|${idx}|${content}`
      );

      pending.push({
        tenant_id,
        source: sourceFile,
        section,
        content,
        // embedding set later
        embedding: null,
        embedding_model: EMBEDDING_MODEL,
        priority: inferPriority({ section, isDerived: false }),
        tokens_est: estimateTokens(content),
        chunk_index: idx,
        content_hash,
        metadata: {
          heading,
          kind: "rag_block"
        },
        active: true
      });
    });
  }

  // 2) Derived lookup rows for BIN COLLECTION DAYS
  const binBlock = blocks.find((b) => b.heading.trim().toUpperCase() === "BIN COLLECTION DAYS");
  if (binBlock) {
    const derived = parseBinCollectionDays(binBlock.body);
    console.log(`Derived bin lookup rows: ${derived.length}`);

    derived.forEach((r, idx) => {
      const content = `Bin collection typical day for ${r.suburb}: ${r.typical_day}. Place bins out by 6:00 am on collection day.`;

      const derivedSource = `${sourceFile}#derived_bin_collection_days`;

      const content_hash = sha256Hex(
        `${tenant_id}|${derivedSource}|waste_bins|derived|${r.suburb}|${r.typical_day}|${r.division}|${content}`
      );

      pending.push({
        tenant_id,
        source: derivedSource,
        section: "waste_bins",
        content,
        embedding: null,
        embedding_model: EMBEDDING_MODEL,
        priority: inferPriority({ section: "waste_bins", isDerived: true }),
        tokens_est: estimateTokens(content),
        chunk_index: idx,
        content_hash,
        metadata: {
          type: "bin_collection",
          suburb: r.suburb,
          typical_day: r.typical_day,
          division: r.division,
          heading: "BIN COLLECTION DAYS",
          kind: "derived_lookup"
        },
        active: true
      });
    });
  } else {
    console.log("No BIN COLLECTION DAYS block found (no derived bin rows created).");
  }

  if (!pending.length) {
    console.log("Nothing to insert.");
    return;
  }

  // Batch embed + upsert in chunks
  const BATCH = 80; // safe batch size
  console.log(`Preparing to embed+upsert ${pending.length} rows...`);

  for (let i = 0; i < pending.length; i += BATCH) {
    const slice = pending.slice(i, i + BATCH);
    const texts = slice.map((r) => r.content);

    const embeddings = await embedBatch(texts);

    const rows = slice.map((r, j) => ({
      ...r,
      embedding: embeddings[j]
    }));

    await upsertRows(rows);
    console.log(`Upserted rows ${i + 1}-${Math.min(i + BATCH, pending.length)}`);
  }

  console.log("KB indexing complete (v2)");
}

main().catch((err) => {
  console.error("Indexing failed:", err);
  process.exit(1);
});
