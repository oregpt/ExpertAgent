# Agent-in-a-Box v2 Changelog

## 2.0.0-alpha.2 (2026-01-30)

### Phase 1: Soul & Memory System ✅

The core differentiator — agents that remember and evolve.

#### 1A: Database Schema
- Created `ai_agent_documents` table — stores soul.md, memory.md, context.md, daily/*.md per agent
- Created `ai_agent_memory_embeddings` table — chunked vector embeddings for semantic search
- Added indexes: agent_id+doc_type, unique agent_id+doc_key, HNSW vector similarity
- SQL migration files: `server/src/db/migrations/001_agent_documents.sql`, `002_agent_memory_embeddings.sql`
- Updated `server/src/db/schema.ts` with Drizzle table definitions
- Updated `server/src/db/init.ts` to auto-create tables on startup

#### 1B: Document Service
- `server/src/memory/documentService.ts` — getDocument, upsertDocument, listDocuments, deleteDocument, searchMemory (pgvector semantic search)
- `server/src/memory/memoryEmbedder.ts` — auto-chunk documents by paragraph/heading, generate OpenAI embeddings, incremental re-embedding (only changed chunks updated)
- `server/src/memory/defaults.ts` — default templates for soul.md, memory.md, context.md

#### 1C: Agent Integration
- On agent creation → auto-creates default soul.md, memory.md, context.md (when soulMemory enabled)
- Modified `chatService.ts` — injects soul.md + context.md as system prompt when soulMemory is enabled; falls back to v1 static instructions when disabled
- Added memory recall step — before responding, searches agent memory for relevant context and includes top results
- Registered 4 memory tools the LLM can call:
  - `memory__read(doc_key)` — read a document
  - `memory__write(doc_key, content)` — update a document
  - `memory__search(query)` — semantic search across memory
  - `memory__append(doc_key, text)` — append to daily log
- Tools integrated into tool executor alongside MCP Hub tools

#### 1D: API Routes
- `GET /api/agents/:id/documents` — list documents
- `GET /api/agents/:id/documents/:key` — read document
- `PUT /api/agents/:id/documents/:key` — create/update document
- `DELETE /api/agents/:id/documents/:key` — delete document
- `POST /api/agents/:id/memory/search` — semantic search (body: { query, topK })
- All routes gated by soulMemory feature flag (403 if disabled)

#### 1E: Feature Flag
- Added `soulMemory` flag to FeatureFlags interface
- Updated BASE_FEATURES (default: false), FULL_FEATURES (default: true)
- Updated license validation to include soulMemory
- Updated env var loader for `FEATURE_SOUL_MEMORY`
- All new code checks soulMemory flag — app works exactly as v1 when disabled

### Design Principles
- **Modularity:** soulMemory=false → pure v1 behavior. No code paths break.
- **Incremental embedding:** Only changed document chunks are re-embedded on update.
- **Background processing:** Embedding runs fire-and-forget to not block API responses.
- **Existing patterns:** Follows codebase conventions (Drizzle ORM, Express Router, pgvector, OpenAI embeddings).

---

## 2.0.0-alpha.1 (2026-01-30)

### Vision
Agent-in-a-Box v2 adds soul/memory, proactive behavior, deep tools, and multi-channel delivery
to the existing enterprise chatbot platform. Every new capability is independently toggleable.

### Phase 0: Foundation
- Cloned from Agent-in-a-Box v1
- Fresh git repo initialized
- Updated package.json (name, version, description)
- Added v2 feature flags to .env.example
- Cleaned temp files
- Created architecture doc and build plan

### Planned Phases
- **Phase 1:** Soul & Memory System — self-evolving agent personality and memory ✅
- **Phase 2:** Deep Tool Ecosystem — web search, fetch, memory tools
- **Phase 3:** Proactive Engine — heartbeats, cron jobs, background agents
- **Phase 4:** Multi-Channel Delivery — Slack, Teams, webhooks
- **Phase 5:** Session Continuity — cross-session learning, context management
- **Phase 6:** Security & Hardening
- **Phase 7:** Licensing v2 & Modularity

See `../AGENTINABOX_V2_BUILD_PLAN.md` for full checklist.
