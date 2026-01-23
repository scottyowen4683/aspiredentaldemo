# Knowledge Base File Format

## Overview

Knowledge base files are stored as `.txt` files in `/frontend/netlify/functions/kb/` and automatically processed by a GitHub workflow.

## Naming Convention

**Format:** `{tenant}_kb.txt`

**Examples:**
- `moreton_kb.txt` → tenant_id: "moreton"
- `goldcoast_kb.txt` → tenant_id: "goldcoast"
- `brisbane_kb.txt` → tenant_id: "brisbane"

The filename automatically determines the tenant_id in Supabase.

---

## File Structure

### Header (Optional but Recommended)
```txt
============================================================
ORGANIZATION NAME – KNOWLEDGE BASE
Brief description of contents
Effective: Date
============================================================
```

### Sections (Required)

Each section must use this format:

```txt
------------------------------------------------------------
SECTION HEADING IN ALL CAPS
------------------------------------------------------------

Section content goes here.
Can include multiple paragraphs.

And lists:
- Item 1
- Item 2
```

**Important:**
- Section headings must be ALL CAPS
- Must have divider line (60 dashes) above and below the heading
- Content starts after the bottom divider

---

## Section Naming

Headings are automatically mapped to canonical section types:

| Heading Keywords | Section Type | Priority |
|-----------------|--------------|----------|
| BIN, WASTE, RECYCL | waste_bins | 4 |
| RATES, WATER | rates_payments | 4 |
| FEES, CHARGES | fees_charges | 4 |
| OPENING HOURS, LIBRARY, POOL | facilities_hours | 6 |
| COUNCILLOR | councillors | 6 |
| PARKING, PERMIT, INFRINGEMENT | parking_permits | 6 |
| PLANNING, DEVELOPMENT | planning_development | 6 |
| SERVICE TIMEFRAME | service_timeframes | 6 |
| REPORT, REQUEST, COMPLAINT | service_requests | 6 |
| Everything else | general | 6 |

Lower priority number = higher importance in search results.

---

## Special Features

### Derived Lookups (Bin Collection Days)

If you include a section named exactly **"BIN COLLECTION DAYS"** with this format:

```txt
------------------------------------------------------------
BIN COLLECTION DAYS
------------------------------------------------------------

Division 1 – Bribie Island and Coastal North:
Bongaree, Bellara, Woorim, Banksia Beach
Typical day: Wednesday

Division 2 – Caboolture and Morayfield:
Caboolture, Morayfield, Caboolture South
Typical day: Thursday
```

The system will automatically create individual lookup rows for each suburb:
- "Bin collection typical day for Bongaree: Wednesday. Place bins out by 6:00 am on collection day."
- "Bin collection typical day for Bellara: Wednesday. Place bins out by 6:00 am on collection day."

These get **higher priority (2)** in search results for suburb-specific queries.

---

## Content Guidelines

### DO:
✅ Use clear, factual language
✅ Include specific details (phone numbers, addresses, hours)
✅ Break long content into logical sections
✅ Use bullet points for lists
✅ Include "say as" for phone numbers (e.g., "07 5433 4555" → "zero seven five four three three four five five five")
✅ Include emergency/escalation information

### DON'T:
❌ Include sensitive personal information
❌ Use markdown formatting (it's plain text)
❌ Create sections without proper dividers
❌ Use inconsistent heading formats
❌ Include outdated information without dating it

---

## Processing Pipeline

When you push a KB file to GitHub:

1. **Workflow Triggers** (`.github/workflows/index_kb.yml`)
   - Detects changes to `frontend/netlify/functions/kb/*.txt`

2. **Parsing** (`frontend/scripts/index_kb_txt.js`)
   - Extracts heading blocks
   - Maps headings to canonical sections
   - Chunks content (max 2200 characters)

3. **Embedding**
   - Creates OpenAI embeddings (text-embedding-3-small)
   - Batches of 80 rows at a time

4. **Storage**
   - Upserts to Supabase `knowledge_chunks` table
   - Uses content_hash for idempotency (safe to re-run)

---

## Supabase Schema

Each chunk is stored with:

```sql
CREATE TABLE knowledge_chunks (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  source TEXT NOT NULL,          -- e.g., "moreton_kb.txt"
  section TEXT NOT NULL,          -- e.g., "waste_bins"
  content TEXT NOT NULL,          -- The actual text chunk
  embedding VECTOR(1536),         -- OpenAI embedding
  embedding_model TEXT,           -- e.g., "text-embedding-3-small"
  priority INT DEFAULT 5,         -- Lower = higher priority
  tokens_est INT,                 -- Estimated token count
  chunk_index INT,                -- Chunk number within section
  content_hash TEXT NOT NULL,     -- SHA256 for idempotency
  metadata JSONB,                 -- { heading, kind, etc. }
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, source, section, content_hash)
);
```

---

## Example KB File

See `/frontend/netlify/functions/kb/moreton_kb.txt` for a complete example.

Key sections in that file:
- General Contact & Emergency Information
- Mayor and Councillors
- Bin Collection Days (with derived lookups)
- Service Timeframes
- Fees and Charges
- Opening Hours
- etc.

---

## Testing

After pushing your KB file:

1. Check GitHub Actions for workflow success
2. Query Supabase `knowledge_chunks` table:
   ```sql
   SELECT * FROM knowledge_chunks
   WHERE tenant_id = 'yourtenantid'
   ORDER BY created_at DESC
   LIMIT 10;
   ```
3. Test the chat widget with questions from your KB

---

## Updating Content

To update existing KB content:
1. Edit the `.txt` file
2. Commit and push
3. Workflow automatically re-processes
4. Content is upserted (duplicates are ignored based on content_hash)

---

## Multiple Tenants

You can have multiple KB files:
```
/frontend/netlify/functions/kb/
  ├── moreton_kb.txt
  ├── goldcoast_kb.txt
  ├── brisbane_kb.txt
  └── logan_kb.txt
```

Each is processed independently with its own tenant_id.

---

## Troubleshooting

### Workflow fails
- Check that headings are ALL CAPS
- Verify divider lines are at least 60 dashes
- Check GitHub Actions logs for specific error

### Content not appearing in search
- Verify tenant_id matches your assistant configuration
- Check Supabase for actual rows: `SELECT COUNT(*) FROM knowledge_chunks WHERE tenant_id = 'xxx'`
- Verify embeddings were created (embedding column not null)

### Old content still showing
- Content is upserted based on content_hash
- If you changed the content, it should update automatically
- To force fresh start: Delete rows from Supabase for that tenant_id

---

## Performance

- **Embedding cost**: ~$0.00002 per 1K tokens (very cheap)
- **Processing time**: ~30-60 seconds for 100KB file
- **Storage**: Unlimited (Supabase handles it)
- **Query speed**: <100ms with proper indexes

---

That's everything you need to know about the KB file format!
