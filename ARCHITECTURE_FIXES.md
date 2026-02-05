# Architecture Fixes — Applied 2025-07-25

Five critical issues from the Architecture Review have been resolved.

---

## Fix 1: Startup Race Condition ✅

**File:** `server/src/index.ts`

**Problem:** `app.listen()` callback ran `initializeDatabase()` async — server was accepting HTTP before the DB was ready. Requests during the ~500ms window would fail.

**Changes:**
- Extracted startup logic into `async function main()`
- All critical init (`initializeLicensing`, `initializeDatabase`, `initializeMCPHub`, `initializeCapabilities`) now runs BEFORE `app.listen()`
- `proactiveEngine.start()` and `initializeChannels()` run AFTER listen (they depend on DB but don't need to block HTTP)
- Unhandled startup errors now call `process.exit(1)` via `main().catch()`
- Graceful shutdown handlers preserved unchanged

---

## Fix 2: License Bypass via NODE_ENV ✅

**Files:** `server/src/licensing/index.ts`, `server/.env.example`

**Problem:** `NODE_ENV !== 'production'` allowed env var overrides. Since Node.js defaults `NODE_ENV` to `undefined`, any deployment that didn't explicitly set it got dev mode = free features.

**Changes:**
- Replaced `NODE_ENV` check with explicit `AGENTICLEDGER_DEV_MODE=true` check
- Env var overrides (`FEATURE_*`) are now ONLY active when `AGENTICLEDGER_DEV_MODE` is explicitly set to `"true"`
- If the flag is missing or any other value, overrides are disabled regardless of NODE_ENV
- Updated `getLicensingStatus()` to use the same check
- Clear console logging: `⚠️ DEV MODE ACTIVE` when enabled, explanation of how to enable when disabled
- Updated `.env.example` with the new `AGENTICLEDGER_DEV_MODE=true` variable and documentation

**Migration note:** Existing `.env` files with `FEATURE_*` vars will stop working until `AGENTICLEDGER_DEV_MODE=true` is added. This is intentional — the old behavior was a security hole.

---

## Fix 3: Missing Database Indexes ✅

**File:** `server/src/db/init.ts`

**Problem:** 16 tables with no explicit indexes beyond PKs. Performance collapses at ~10K messages/agent.

**Changes:** Added 18 new indexes at the end of `createTablesIfNotExist()`:

| Index | Table | Purpose |
|-------|-------|---------|
| `idx_messages_conversation_id` | `ai_messages` | Chat message retrieval by conversation |
| `idx_conversations_agent_id` | `ai_conversations` | Session lookups by agent |
| `idx_conversations_agent_last_msg` | `ai_conversations` | Sorted conversation listing |
| `idx_cron_jobs_enabled_next` | `ai_agent_cron_jobs` | Partial index for cron polling |
| `idx_task_runs_agent_started` | `ai_agent_task_runs` | Task audit log queries |
| `idx_agent_channels_agent_enabled` | `ai_agent_channels` | Channel initialization query |
| `idx_documents_agent_id` | `ai_documents` | KB document listing by agent |
| `idx_documents_folder_id` | `ai_documents` | KB folder browsing |
| `idx_document_chunks_document_id` | `ai_document_chunks` | RAG chunk retrieval |
| `idx_document_chunks_agent_id` | `ai_document_chunks` | RAG per-agent queries |
| `idx_agent_capabilities_agent` | `ai_agent_capabilities` | Capability lookups |
| `idx_capability_tokens_agent` | `ai_capability_tokens` | Token lookups |
| `idx_agent_api_keys_agent` | `ai_agent_api_keys` | API key lookups |
| `idx_document_tags_document` | `ai_document_tags` | Tag junction queries |
| `idx_document_tags_tag` | `ai_document_tags` | Tag junction queries |
| `idx_gitlab_refreshes_agent_started` | `ai_gitlab_refreshes` | Refresh history |
| `idx_agent_memory_embeddings_hash` | `ai_agent_memory_embeddings` | Hash-based chunk lookup (Fix 5) |

Also added `content_hash VARCHAR(64)` column to `ai_agent_memory_embeddings` (for Fix 5).

**Note:** Several indexes already existed from the original init code (folders, tags, memory embeddings agent/doc, cron agent, etc.). The new indexes fill the gaps the review identified. All use `CREATE INDEX IF NOT EXISTS` so they're safe for re-runs.

---

## Fix 4: Channel Secrets Encryption ✅

**Files:**
- **NEW:** `server/src/utils/encryption.ts` — shared encryption module
- **Modified:** `server/src/http/channelRoutes.ts` — CRUD routes
- **Modified:** `server/src/channels/channelRouter.ts` — adapter initialization

**Problem:** Channel configs (Slack bot tokens, Teams passwords, webhook secrets) stored as plaintext JSONB. API keys already used AES-256-GCM.

**Changes:**

### New utility (`src/utils/encryption.ts`):
- Extracted `encrypt()` / `decrypt()` from `capabilityService.ts` (shared module, same key)
- Added `encryptChannelConfig(config)` — encrypts known sensitive keys in a config object
- Added `decryptChannelConfig(config)` — decrypts them back for adapter use
- Added `maskChannelConfig(config)` — replaces secrets with `"••••configured"` for API responses
- Encrypted values prefixed with `enc:` to distinguish from plaintext (backward compatible)
- Sensitive keys: `bot_token`, `signing_secret`, `app_token`, `app_password`, `client_secret`, `secret`, `auth_token`, `access_token`, `api_key`, `api_secret`, `token`, `password`
- IV stored in config object as `__iv` field (stripped on decrypt/mask)

### Channel CRUD routes (`channelRoutes.ts`):
- **Create:** Config encrypted before DB insert; plaintext config passed to adapter
- **Update:** Config encrypted before DB update; plaintext config passed to adapter
- **List:** Config masked via `maskChannelConfig()` (secrets show as `"••••configured"`)
- **Webhook inbound:** Config decrypted before re-initializing adapter for signature verification

### Channel router (`channelRouter.ts`):
- `initializeChannel()` now calls `decryptChannelConfig()` before passing to adapter

**Backward compatibility:** Existing plaintext configs will continue to work — `decryptChannelConfig` only decrypts values with the `enc:` prefix. New configs will be encrypted. Over time, all configs migrate automatically on next update.

---

## Fix 5: Embedding Pipeline Optimization ✅

**File:** `server/src/memory/memoryEmbedder.ts`, `server/src/db/init.ts` (schema addition)

**Problem:** Every document upsert re-chunked and re-embedded the ENTIRE document. Daily logs that grow with every chat caused 100+ redundant embedding calls per day.

**Changes:**

### Schema addition (`init.ts`):
- Added `content_hash VARCHAR(64)` column to `ai_agent_memory_embeddings`
- Added `idx_agent_memory_embeddings_hash` index on `(doc_id, content_hash)`

### Hash-based incremental embedding (`memoryEmbedder.ts`):
- Added `hashChunk()` — SHA-256 hash of chunk text
- Rewrote `embedDocument()`:
  1. Chunks the new content
  2. Hashes each chunk (SHA-256)
  3. Loads existing embeddings and their hashes (uses `content_hash` column if available, falls back to on-the-fly hashing for legacy rows)
  4. **Skips** chunks whose hash matches an existing embedding
  5. Only calls OpenAI embedding API for NEW or CHANGED chunks
  6. Deletes embeddings for chunks no longer in the document
  7. Stores `content_hash` with new embeddings
- Return type now includes `chunksSkipped` count
- Logs incremental stats when chunks are skipped

**Impact:** For a daily log that gets one paragraph appended per conversation:
- **Before:** Re-embed ALL chunks (grows linearly — 50 conversations = 50+ full re-embeds)
- **After:** Only embed the 1 new chunk (constant — O(1) embedding calls per append)

---

## Follow-up Items (Not Addressed)

These were identified in the review but outside the scope of the 5 critical fixes:

1. **`any` cast epidemic** — Systemic `as any[]` casts on all DB queries defeats TypeScript's type safety. Needs a dedicated pass to remove.
2. **No automated tests** — `package.json` has `"test": "echo \"No tests yet\""`. Integration tests for licensing logic and API contracts needed.
3. **No database migration framework** — Schema changes rely on `CREATE IF NOT EXISTS` / `ALTER TABLE ADD COLUMN IF NOT EXISTS`. Should adopt Drizzle Kit migrations.
4. **No observability** — No health check endpoint, no metrics, no request tracing (correlation IDs).
5. **No connection draining** — `process.exit(0)` on shutdown doesn't wait for in-flight requests.
6. **Refactor capabilityService** — The `encrypt`/`decrypt` functions in `capabilityService.ts` are now duplicated in `utils/encryption.ts`. A follow-up should make `capabilityService` import from the shared utility instead.
7. **JWT license signing** — Should migrate from HS256 (symmetric) to RS256 (asymmetric) to prevent license forgery from leaked secrets.
8. **Existing channel configs** — Plaintext configs in the DB will work but aren't retroactively encrypted. Consider a one-time migration script.

---

*Fixes applied 2025-07-25. Architecture review: ARCHITECTURE_REVIEW.md*
